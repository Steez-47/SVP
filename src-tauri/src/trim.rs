//! Segment trimming with FFmpeg.
use crate::ffmpeg::{self, Ctx};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Deserialize, Clone, Debug)]
pub struct Segment { pub start: f64, pub end: f64 }

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrimOpts {
    pub input: String,
    pub out_dir: Option<String>,
    pub segments: Vec<Segment>,
    pub mode: String,
    pub merge: bool,
    pub format: Option<String>,
}

/// Read packets incrementally so the memory footprint does not grow with the file.
pub fn keyframes(input: &str) -> Result<Vec<f64>, String> {
    let mut cmd = ffmpeg::ffprobe_cmd();
    cmd.args(["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,dts_time,flags", "-of", "csv=p=0", input])
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("Could not start ffprobe: {e}"))?;
    let stderr = child.stderr.take().ok_or("Could not read ffprobe stderr")?;
    let err_thread = std::thread::spawn(move || ffmpeg::read_lossy(stderr));
    let stdout = child.stdout.take().ok_or("Could not read ffprobe stdout")?;
    let mut frames = Vec::new();
    let mut read_error = None;
    for line in BufReader::new(stdout).lines() {
        match line {
            Ok(line) => {
                let fields: Vec<_> = line.split(',').collect();
                if fields.len() >= 3 && fields[2].contains('K') {
                    if let Some(t) = fields[0].parse::<f64>().ok().or_else(|| fields[1].parse::<f64>().ok()).filter(|t| t.is_finite()) { frames.push(t); }
                }
            }
            Err(e) => { read_error = Some(e.to_string()); break; }
        }
    }
    if read_error.is_some() { let _ = child.kill(); }
    let status = child.wait().map_err(|e| e.to_string())?;
    let stderr = err_thread.join().unwrap_or_default();
    if let Some(e) = read_error { return Err(format!("Could not read ffprobe output: {e}")); }
    if !status.success() { return Err(ffmpeg::last_error(&stderr).unwrap_or_else(|| "ffprobe failed".into())); }
    frames.sort_by(f64::total_cmp);
    frames.dedup_by(|a, b| *a == *b);
    Ok(frames)
}

static TEMP_ID: AtomicU64 = AtomicU64::new(0);
struct TempDir(PathBuf);
impl TempDir {
    fn new() -> Result<Self, String> {
        loop {
            let p = std::env::temp_dir().join(format!("svp-trim-{}-{}", std::process::id(), TEMP_ID.fetch_add(1, Ordering::Relaxed)));
            match std::fs::create_dir(&p) {
                Ok(()) => return Ok(Self(p)),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(format!("Could not create temporary directory: {e}")),
            }
        }
    }
}
impl Drop for TempDir { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }

fn strpath(p: &Path) -> String { p.to_string_lossy().into_owned() }
fn subtitle_allowed(codec: &str, ext: &str) -> bool {
    match ext { "mkv" | "mka" => true, "mp4" | "mov" | "m4v" => codec == "mov_text", "webm" => codec == "webvtt", _ => false }
}
fn args_for_cut(input: &str, output: &Path, start: f64, end: f64, mode: &str, ext: &str, probe: &Value, subtitles: bool) -> Vec<String> {
    // precise re-encodes, so take only the main picture (cover art / thumbnails would become video tracks)
    let vmap = if mode == "lossless" { "0:v?" } else { "0:V:0?" };
    let mut a: Vec<String> = vec!["-ss".into(), start.to_string(), "-i".into(), input.into(), "-t".into(), (end - start).to_string(), "-map".into(), vmap.into(), "-map".into(), "0:a?".into()];
    if subtitles {
        if let Some(streams) = probe["streams"].as_array() {
            for s in streams.iter().filter(|s| s["codec_type"] == "subtitle" && subtitle_allowed(s["codec_name"].as_str().unwrap_or(""), ext)) {
                if let Some(index) = s["index"].as_u64() { a.extend(["-map".into(), format!("0:{index}")]); }
            }
        }
    }
    if matches!(ext, "mp4" | "mov" | "m4v") { a.extend(["-movflags".into(), "+faststart".into()]); }
    if mode == "lossless" { a.extend(["-c".into(), "copy".into(), "-avoid_negative_ts".into(), "make_zero".into()]); }
    else {
        let video = probe["streams"].as_array().and_then(|s| s.iter().find(|s| s["codec_type"] == "video"));
        let codec = video.and_then(|s| s["codec_name"].as_str()).unwrap_or("");
        let pix = video.and_then(|s| s["pix_fmt"].as_str()).unwrap_or("");
        let settings: &[&str] = match codec {
            // WebM only holds VP8/VP9/AV1, so anything else re-encodes to VP9 there
            _ if ext == "webm" && codec != "av1" => &["-c:v", "libvpx-vp9", "-crf", "18", "-b:v", "0", "-row-mt", "1"],
            "hevc" => &["-c:v", "libx265", "-crf", "16", "-preset", "medium"],
            "av1" => &["-c:v", "libsvtav1", "-crf", "20", "-preset", "6"],
            "vp9" => &["-c:v", "libvpx-vp9", "-crf", "18", "-b:v", "0", "-row-mt", "1"],
            _ => &["-c:v", "libx264", "-crf", "14", "-preset", "medium"],
        };
        a.extend(settings.iter().map(|s| s.to_string()));
        let keeps_10bit = matches!(codec, "hevc" | "av1" | "vp9") || ext == "webm";
        if keeps_10bit && (pix.contains("10") || pix.contains("12")) { a.extend(["-pix_fmt".into(), "yuv420p10le".into()]); }
        else { a.extend(["-pix_fmt".into(), "yuv420p".into()]); }
        if codec == "hevc" && matches!(ext, "mp4" | "mov") { a.extend(["-tag:v".into(), "hvc1".into()]); }
        if ext == "webm" { a.extend(["-c:a".into(), "libopus".into(), "-b:a".into(), "192k".into()]); }
        else { a.extend(["-c:a".into(), "aac".into(), "-b:a".into(), "256k".into()]); }
        a.extend(["-c:s".into(), "copy".into()]);
    }
    a.extend(["-map_metadata".into(), "0".into(), strpath(output)]);
    a
}

pub fn run(mut opts: TrimOpts, ctx: &Ctx) -> Result<Value, String> {
    if ctx.cancelled() { return Err(ffmpeg::CANCELLED.into()); }
    if opts.segments.is_empty() { return Err("No segments specified".into()); }
    if !matches!(opts.mode.as_str(), "lossless" | "precise") { return Err("Unknown trim mode".into()); }
    let probe = ffmpeg::probe(&opts.input)?;
    let duration = ffmpeg::duration_of(&probe);
    if !duration.is_finite() || duration <= 0.0 { return Err("Could not determine input duration".into()); }
    for s in &mut opts.segments {
        if !s.start.is_finite() || !s.end.is_finite() || s.start < 0.0 || s.end <= s.start { return Err("Each segment must have a nonnegative start and an end after its start".into()); }
        if s.start >= duration { return Err("Segment start is beyond the input duration".into()); }
        s.end = s.end.min(duration);
    }
    opts.segments.sort_by(|a, b| a.start.total_cmp(&b.start));
    let input = Path::new(&opts.input);
    let ext = opts.format.as_deref().filter(|s| !s.trim().is_empty()).or_else(|| input.extension().and_then(|s| s.to_str())).ok_or("Input has no file extension")?.trim_start_matches('.').to_ascii_lowercase();
    if ext.is_empty() || !ext.chars().all(|c| c.is_ascii_alphanumeric()) { return Err("Invalid output format".into()); }
    let dir = opts.out_dir.as_deref().filter(|s| !s.trim().is_empty()).map(PathBuf::from).unwrap_or_else(|| input.parent().unwrap_or(Path::new(".")).to_path_buf());
    let stem = input.file_stem().and_then(|s| s.to_str()).ok_or("Invalid input filename")?;
    let merge = opts.merge && opts.segments.len() > 1;
    let temp = if merge { Some(TempDir::new()?) } else { None };
    let keys = if opts.mode == "lossless" { keyframes(&opts.input)? } else { Vec::new() };
    let starts: Vec<f64> = opts.segments.iter().map(|s| if opts.mode == "lossless" { keys.iter().copied().take_while(|t| *t <= s.start + 0.000001).last().unwrap_or(s.start) } else { s.start }).collect();
    let weights: Vec<f64> = opts.segments.iter().zip(&starts).map(|(s, start)| s.end - start).collect();
    let total: f64 = weights.iter().sum();
    let cut_share = if merge { 0.95 } else { 1.0 };
    let mut done = 0.0;
    let mut last_progress: f64 = 0.0;
    let mut outputs: Vec<PathBuf> = Vec::new();
    let result = (|| -> Result<(), String> {
        for (i, s) in opts.segments.iter().enumerate() {
            if ctx.cancelled() { return Err(ffmpeg::CANCELLED.into()); }
            let path = if let Some(t) = &temp { t.0.join(format!("part-{i}.{ext}")) } else {
                let name = if opts.segments.len() == 1 { format!("{stem} (trim).{ext}") } else { format!("{stem} (part {}).{ext}", i + 1) };
                let p = ffmpeg::unique_path(dir.join(name)); outputs.push(p.clone()); p
            };
            let mut run_cut = |subtitles| {
                let args = args_for_cut(&opts.input, &path, starts[i], s.end, &opts.mode, &ext, &probe, subtitles);
                ffmpeg::run(&args, weights[i], ctx, |f, _| {
                    last_progress = last_progress.max(cut_share * (done + weights[i] * f) / total);
                    ctx.progress(last_progress, &format!("Part {}/{}", i + 1, opts.segments.len()));
                })
            };
            if let Err(e) = run_cut(true) {
                if e == ffmpeg::CANCELLED || ctx.cancelled() { return Err(ffmpeg::CANCELLED.into()); }
                let _ = std::fs::remove_file(&path);
                run_cut(false)?;
            }
            done += weights[i];
        }
        if let Some(t) = &temp {
            let list = t.0.join("list.txt");
            let lines = (0..opts.segments.len()).map(|i| format!("file '{}'\n", strpath(&t.0.join(format!("part-{i}.{ext}"))).replace('\\', "/").replace('\'', "'\\''"))).collect::<String>();
            std::fs::write(&list, lines).map_err(|e| format!("Could not write concat list: {e}"))?;
            let out = ffmpeg::unique_path(dir.join(format!("{stem} (trim).{ext}")));
            outputs.push(out.clone());
            let args = vec!["-f".into(), "concat".into(), "-safe".into(), "0".into(), "-i".into(), strpath(&list), "-c".into(), "copy".into(), "-map".into(), "0".into(), strpath(&out)];
            ffmpeg::run(&args, total, ctx, |f, _| { last_progress = last_progress.max(0.95 + 0.05 * f); ctx.progress(last_progress, "Joining parts"); })?;
        }
        if ctx.cancelled() { return Err(ffmpeg::CANCELLED.into()); }
        ctx.progress(1.0, "Complete");
        Ok(())
    })();
    if let Err(e) = result { for p in &outputs { let _ = std::fs::remove_file(p); } return Err(e); }
    let paths: Vec<String> = outputs.iter().map(|p| strpath(p)).collect();
    Ok(json!({"output": paths[0], "outputs": paths, "snappedStarts": starts}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;
    use std::time::Duration;

    fn invoke(args: &[String]) {
        let output = ffmpeg::ffmpeg_cmd().args(["-hide_banner", "-loglevel", "error", "-y"]).args(args).output().unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    }
    fn duration(path: &str) -> f64 {
        let mut c = ffmpeg::ffprobe_cmd();
        c.args(["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path]);
        ffmpeg::output(c).unwrap().trim().parse().unwrap()
    }
    fn options(input: &Path, dir: &Path, segments: &[(f64, f64)], mode: &str, merge: bool, format: Option<&str>) -> TrimOpts {
        TrimOpts { input: strpath(input), out_dir: Some(strpath(dir)), segments: segments.iter().map(|&(start, end)| Segment { start, end }).collect(), mode: mode.into(), merge, format: format.map(str::to_string) }
    }
    fn output(v: &Value) -> &str { v["output"].as_str().unwrap() }
    fn close(actual: f64, expected: f64, tolerance: f64) { assert!((actual - expected).abs() <= tolerance, "{actual} not within {tolerance} of {expected}"); }

    #[test]
    #[ignore]
    fn trim_integration() {
        let temp = TempDir::new().unwrap();
        let mp4 = temp.0.join("fixture.mp4");
        let mkv = temp.0.join("fixture.mkv");
        let srt = temp.0.join("subtitle.srt");
        std::fs::write(&srt, "1\n00:00:01,000 --> 00:00:03,000\nHello\n").unwrap();
        for (file, codec) in [(&mp4, "libx264"), (&mkv, "libx265")] {
            let mut args: Vec<String> = ["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=20", "-f", "lavfi", "-i", "sine=frequency=440:duration=20"].iter().map(|s| s.to_string()).collect();
            if codec == "libx265" { args.extend(["-i".into(), strpath(&srt)]); }
            args.extend(["-c:v".into(), codec.into(), "-preset".into(), "ultrafast".into(), "-g".into(), "60".into(), "-keyint_min".into(), "60".into(), "-sc_threshold".into(), "0".into(), "-c:a".into(), "aac".into()]);
            if codec == "libx265" { args.extend(["-c:s".into(), "srt".into()]); }
            args.push(strpath(file)); invoke(&args);
        }
        for file in [&mp4, &mkv] {
            let keys = keyframes(&strpath(file)).unwrap();
            assert_eq!(keys.len(), 10, "{keys:?}");
            for (i, &k) in keys.iter().enumerate() { close(k, (i * 2) as f64, 0.04); }
        }
        let ctx = Ctx::noop();
        let cut = run(options(&mp4, &temp.0, &[(5.0, 11.0)], "lossless", false, None), &ctx).unwrap();
        close(cut["snappedStarts"][0].as_f64().unwrap(), 4.0, 0.04);
        let d = duration(output(&cut)); println!("lossless duration: {d}"); close(d, 7.0, 0.15);
        let merged = run(options(&mp4, &temp.0, &[(2.0, 4.0), (10.0, 13.0)], "lossless", true, None), &ctx).unwrap();
        let d = duration(output(&merged)); println!("merged duration: {d}"); close(d, 5.0, 0.3);
        let precise = run(options(&mp4, &temp.0, &[(5.0, 11.0)], "precise", false, None), &ctx).unwrap();
        let d = duration(output(&precise)); println!("precise duration: {d}"); close(d, 6.0, 1.0 / 30.0 + 0.001);
        let converted = run(options(&mkv, &temp.0, &[(5.0, 11.0)], "lossless", false, Some("mp4")), &ctx).unwrap();
        let p = ffmpeg::probe(output(&converted)).unwrap();
        assert!(!p["streams"].as_array().unwrap().iter().any(|s| s["codec_type"] == "subtitle"));
        let cancel_dir = temp.0.join("cancel"); std::fs::create_dir(&cancel_dir).unwrap();
        let cancel = Ctx::noop(); let flag = cancel.cancel.clone();
        let thread = std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(150)); flag.store(true, Ordering::Relaxed); });
        let result = run(options(&mkv, &cancel_dir, &[(0.0, 20.0)], "precise", false, None), &cancel);
        thread.join().unwrap();
        assert_eq!(result.unwrap_err(), ffmpeg::CANCELLED);
        assert_eq!(std::fs::read_dir(&cancel_dir).unwrap().count(), 0);
    }
}
