//! Compression engine. OWNER: delegated (see task brief). Interface is fixed; lib.rs depends on it.
use crate::ffmpeg::{self, Ctx};
use once_cell::sync::Lazy;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompressOpts {
    pub input: String,
    /// Full output path; None → "<input stem> (compressed).<ext>" beside input (or in out_dir).
    pub output: Option<String>,
    pub out_dir: Option<String>,
    /// "preset" | "target"
    pub mode: String,
    /// "near-lossless" | "high" | "balanced" | "small"
    pub preset: String,
    /// Target size in MB (1 MB = 1_000_000 bytes) when mode == "target".
    pub target_mb: Option<f64>,
    /// "h264" | "hevc" | "av1"
    pub codec: String,
    /// "auto" | "cpu" | "nvenc" | "amf" | "qsv"
    pub encoder: String,
    /// "fast" | "balanced" | "slow"
    pub speed: String,
    /// Max output height (downscale only, keep aspect, even dims). None = source.
    pub max_height: Option<u32>,
    /// Max fps (only reduce). None = source.
    pub max_fps: Option<f64>,
    /// "copy" | "aac-96" | "aac-128" | "aac-192" | "opus-96" | "opus-128" | "none"
    pub audio: String,
    /// Run libvmaf against the source afterwards and report the score.
    pub vmaf: bool,
    /// Optional trim window applied while compressing.
    pub start: Option<f64>,
    pub end: Option<f64>,
}

/// Which encoders actually work on this machine. Shape:
/// { "h264": ["libx264","h264_nvenc",...], "hevc": [...], "av1": [...] }
pub fn detect_encoders() -> Value {
    WORKING_ENCODERS.clone()
}

/// Run the compression. Report progress through ctx.progress(fraction, detail).
/// Ok → { "output": path, "size": bytes, "inputSize": bytes, "vmaf": Option<f64>, "encoder": name }
pub fn run(opts: CompressOpts, ctx: &Ctx) -> Result<Value, String> {
    check_cancel(ctx)?;
    validate(&opts)?;
    let source = ffmpeg::probe(&opts.input)?;
    let media = Media::new(&source, &opts)?;
    let encoder = choose_encoder(&opts, &detect_encoders())?;
    check_cancel(ctx)?;
    let audio = audio_plan(&source, &opts.audio)?;
    let mut bitrate = if opts.mode == "target" {
        Some(bitrate_budget(
            opts.target_mb.unwrap(),
            media.duration,
            audio.bitrate,
        )?)
    } else {
        None
    };
    let output = output_path(&opts)?;
    let mut partial = PartialOutput {
        path: output.clone(),
        keep: false,
    };
    let scratch = Scratch::new()?;
    let stats = scratch.0.join("pass");
    let mut reporter = Reporter { ctx, last: 0.0 };
    let encode_end = if opts.vmaf { 0.85 } else { 0.99 };
    let two_pass = bitrate.is_some()
        && (encoder == "libx264"
            || encoder == "libx265"
            || (encoder == "libsvtav1" && *SVT_TWO_PASS));
    // Leave room for one correction without ever moving progress backwards.
    let first_end = if bitrate.is_some() {
        encode_end * 0.9
    } else {
        encode_end
    };
    encode(
        &opts,
        &media,
        &audio,
        &encoder,
        bitrate,
        two_pass,
        &stats,
        &output,
        (0.0, first_end),
        &mut reporter,
    )?;
    check_cancel(ctx)?;
    let mut size = file_size(&output)?;
    if let Some(old_rate) = bitrate {
        let target = opts.target_mb.unwrap() * 1_000_000.0;
        // Correct >2% overshoot too, so the normal result stays inside the size promise.
        if size as f64 > target * 1.02 {
            let corrected =
                correction_bitrate(old_rate, target, size as f64, media.duration, audio.bitrate);
            #[cfg(test)]
            println!(
                "Size correction {encoder}: {size} bytes, video bitrate {old_rate} → {corrected}"
            );
            if corrected < MIN_VIDEO_BITRATE {
                return Err(format!("Audio and container overhead leave too little room for video. Try at least {:.2} MB.",
                    minimum_mb(media.duration, audio.bitrate)));
            }
            bitrate = Some(corrected);
            encode(
                &opts,
                &media,
                &audio,
                &encoder,
                bitrate,
                two_pass,
                &stats,
                &output,
                (first_end, encode_end),
                &mut reporter,
            )?;
            size = file_size(&output)?;
            if size as f64 > target * 1.02 {
                return Err(format!(
                    "{encoder} could not meet the {:.2} MB target ({:.2} MB after bitrate correction). Choose CPU, reduce maximum height/frame rate, or increase the target size.",
                    opts.target_mb.unwrap(), size as f64 / 1e6
                ));
            }
        }
    }
    check_cancel(ctx)?;
    reporter.emit(encode_end, "Checking output");
    let output_probe = ffmpeg::probe(&output.to_string_lossy()).ok();
    let score = if opts.vmaf {
        // A failed metric must not turn an otherwise usable encode into a failed job.
        measure_vmaf(
            &opts,
            &media,
            &output,
            output_probe.as_ref(),
            (encode_end, 0.999),
            &mut reporter,
        )
        .unwrap_or_else(|_error| {
            #[cfg(test)]
            eprintln!("VMAF unavailable: {_error}");
            None
        })
    } else {
        None
    };
    check_cancel(ctx)?;
    let actual_rate = output_probe
        .as_ref()
        .and_then(|p| p["streams"].as_array())
        .and_then(|ss| ss.iter().find(|s| s["codec_type"] == "video"))
        .map(|s| number(&s["bit_rate"]))
        .filter(|b| *b > 0.0)
        .unwrap_or_else(|| (size as f64 * 8.0 / media.duration - audio.bitrate).max(0.0));
    let input_size = std::fs::metadata(&opts.input)
        .map_err(|e| e.to_string())?
        .len();
    partial.keep = true;
    reporter.emit(1.0, "Complete");
    Ok(
        json!({ "output": output.to_string_lossy(), "size": size, "inputSize": input_size,
        "vmaf": score, "encoder": encoder, "bitrateKbps": actual_rate / 1000.0 }),
    )
}

const FAMILIES: [(&str, &str); 3] = [
    ("h264", "libx264"),
    ("hevc", "libx265"),
    ("av1", "libsvtav1"),
];
const VENDORS: [&str; 3] = ["nvenc", "amf", "qsv"];
const MIN_VIDEO_BITRATE: u64 = 60_000;

static WORKING_ENCODERS: Lazy<Value> = Lazy::new(|| {
    let built = ffmpeg::encoders();
    let mut workers = Vec::new();
    for (family, _) in FAMILIES {
        for vendor in VENDORS {
            let name = format!("{family}_{vendor}");
            if built.contains(&name) {
                workers.push(std::thread::spawn(move || {
                    let mut cmd = ffmpeg::ffmpeg_cmd();
                    cmd.args([
                        "-hide_banner",
                        "-v",
                        "error",
                        "-nostdin",
                        "-f",
                        "lavfi",
                        "-i",
                        "color=size=256x256:rate=1",
                        "-frames:v",
                        "1",
                        "-an",
                        "-c:v",
                        &name,
                        "-pix_fmt",
                        "yuv420p",
                        "-f",
                        "null",
                        "-",
                    ]);
                    let works = ffmpeg::output(cmd).is_ok();
                    (name, works)
                }));
            }
        }
    }
    let working: std::collections::HashSet<String> = workers
        .into_iter()
        .filter_map(|w| w.join().ok())
        .filter(|(_, ok)| *ok)
        .map(|(n, _)| n)
        .collect();
    let mut result = serde_json::Map::new();
    for (family, cpu) in FAMILIES {
        let mut list: Vec<String> = VENDORS
            .iter()
            .map(|v| format!("{family}_{v}"))
            .filter(|n| working.contains(n))
            .collect();
        if built.contains(cpu) {
            list.push(cpu.into());
        }
        result.insert(family.into(), json!(list));
    }
    Value::Object(result)
});

fn choose_encoder(opts: &CompressOpts, available: &Value) -> Result<String, String> {
    let cpu = FAMILIES
        .iter()
        .find(|(f, _)| *f == opts.codec)
        .map(|(_, c)| *c)
        .ok_or("Unsupported video codec")?;
    let list: Vec<&str> = available[&opts.codec]
        .as_array()
        .map(|a| a.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let wanted = match opts.encoder.as_str() {
        "cpu" => cpu.to_string(),
        // Quality presets that care most about fidelity, and target-size mode (true 2-pass is what
        // makes the size land), use the CPU encoder. Hardware only speeds up the lighter presets.
        "auto"
            if opts.mode == "target"
                || matches!(opts.preset.as_str(), "near-lossless" | "high") =>
        {
            cpu.to_string()
        }
        "auto" => list
            .iter()
            .copied()
            .find(|s| !s.starts_with("lib"))
            .unwrap_or(cpu)
            .to_string(),
        vendor if VENDORS.contains(&vendor) => format!("{}_{vendor}", opts.codec),
        _ => return Err("Encoder must be auto, cpu, nvenc, amf or qsv".into()),
    };
    if !list.contains(&wanted.as_str()) {
        return Err(format!("Encoder {wanted} is unavailable: it is missing from FFmpeg or failed a real test encode. Choose Auto or CPU."));
    }
    Ok(wanted)
}

fn validate(o: &CompressOpts) -> Result<(), String> {
    if !matches!(o.mode.as_str(), "preset" | "target") {
        return Err("Mode must be preset or target".into());
    }
    if !matches!(
        o.preset.as_str(),
        "near-lossless" | "high" | "balanced" | "small"
    ) {
        return Err("Unknown quality preset".into());
    }
    if !matches!(o.speed.as_str(), "fast" | "balanced" | "slow") {
        return Err("Speed must be fast, balanced or slow".into());
    }
    if o.mode == "target"
        && !o
            .target_mb
            .is_some_and(|m| m.is_finite() && m > 0.0 && m * 1e6 < u64::MAX as f64)
    {
        return Err("Target size must be a positive, finite number of MB".into());
    }
    if o.max_height.is_some_and(|h| h < 2) {
        return Err("Maximum height must be at least 2 pixels".into());
    }
    if o.max_fps.is_some_and(|f| !f.is_finite() || f <= 0.0) {
        return Err("Maximum frame rate must be positive and finite".into());
    }
    Ok(())
}

struct Media {
    start: f64,
    end: f64,
    duration: f64,
    fps: f64,
    ten_bit: bool,
}
impl Media {
    fn new(probe: &Value, opts: &CompressOpts) -> Result<Self, String> {
        let video = probe["streams"]
            .as_array()
            .and_then(|ss| ss.iter().find(|s| s["codec_type"] == "video"))
            .ok_or("The input has no video stream")?;
        let full = ffmpeg::duration_of(probe);
        if !full.is_finite() || full <= 0.0 {
            return Err("Could not determine video duration".into());
        }
        let start = opts.start.unwrap_or(0.0);
        let requested_end = opts.end.unwrap_or(full);
        if !start.is_finite()
            || start < 0.0
            || !requested_end.is_finite()
            || requested_end <= start
            || start >= full
        {
            return Err("Trim window must have 0 ≤ start < end, within the input duration".into());
        }
        let end = requested_end.min(full);
        let mut fps = rational(video["avg_frame_rate"].as_str().unwrap_or("0"));
        if fps <= 0.0 {
            fps = rational(video["r_frame_rate"].as_str().unwrap_or("0"));
        }
        let pix = video["pix_fmt"].as_str().unwrap_or("");
        let ten_bit = number(&video["bits_per_raw_sample"]) > 8.0
            || ["10", "12", "14", "16", "p010", "p012", "p016"]
                .iter()
                .any(|b| pix.contains(b));
        Ok(Self {
            start,
            end,
            duration: end - start,
            fps,
            ten_bit,
        })
    }
}

fn number(v: &Value) -> f64 {
    v.as_f64()
        .or_else(|| v.as_str()?.parse().ok())
        .filter(|x| x.is_finite())
        .unwrap_or(0.0)
}
fn rational(s: &str) -> f64 {
    let (a, b) = s.split_once('/').unwrap_or((s, "1"));
    let n = a.parse::<f64>().unwrap_or(0.0) / b.parse::<f64>().unwrap_or(0.0);
    if n.is_finite() && n > 0.0 {
        n
    } else {
        0.0
    }
}

struct AudioPlan {
    args: Vec<String>,
    bitrate: f64,
}
fn audio_plan(probe: &Value, mode: &str) -> Result<AudioPlan, String> {
    let streams: Vec<&Value> = probe["streams"]
        .as_array()
        .map(|ss| ss.iter().filter(|s| s["codec_type"] == "audio").collect())
        .unwrap_or_default();
    let mut args = Vec::new();
    let mut bitrate = 0.0;
    if mode == "none" {
        return Ok(AudioPlan {
            args: vec!["-an".into()],
            bitrate,
        });
    }
    let encode = match mode {
        "copy" => None,
        "aac-96" => Some(("aac", 96_000)),
        "aac-128" => Some(("aac", 128_000)),
        "aac-192" => Some(("aac", 192_000)),
        "opus-96" => Some(("libopus", 96_000)),
        "opus-128" => Some(("libopus", 128_000)),
        _ => return Err("Unknown audio mode".into()),
    };
    add(&mut args, &["-map", "0:a?"]);
    if let Some((codec, rate)) = encode {
        add(&mut args, &["-c:a", codec, "-b:a", &rate.to_string()]);
        bitrate = rate as f64 * streams.len() as f64;
    } else {
        add(&mut args, &["-c:a", "copy"]);
        for (i, s) in streams.iter().enumerate() {
            // Conservative MP4 whitelist: PCM, TrueHD, DTS, FLAC, Vorbis, etc. become AAC.
            let compatible = matches!(
                s["codec_name"].as_str().unwrap_or(""),
                "aac" | "mp3" | "alac" | "ac3" | "eac3" | "opus"
            );
            if compatible {
                let rate = number(&s["bit_rate"]);
                bitrate += if rate > 0.0 { rate } else { 128_000.0 };
            } else {
                add(
                    &mut args,
                    &[&format!("-c:a:{i}"), "aac", &format!("-b:a:{i}"), "160k"],
                );
                bitrate += 160_000.0;
            }
        }
    }
    Ok(AudioPlan { args, bitrate })
}

fn minimum_mb(duration: f64, audio: f64) -> f64 {
    // Round up so the displayed minimum is actually usable.
    (((MIN_VIDEO_BITRATE as f64 + audio) * duration / (8e6 * 0.985)) * 100.0).ceil() / 100.0
}
fn bitrate_budget(mb: f64, duration: f64, audio: f64) -> Result<u64, String> {
    let rate = mb * 8e6 * 0.985 / duration - audio;
    if !rate.is_finite() || rate < MIN_VIDEO_BITRATE as f64 {
        return Err(format!("Target is too small for this duration and audio. Minimum feasible size is {:.2} MB (at least 60 kbps video).", minimum_mb(duration, audio)));
    }
    Ok(rate.floor() as u64)
}
fn correction_bitrate(rate: u64, target: f64, actual: f64, duration: f64, audio: f64) -> u64 {
    // Scale the video budget, accounting for audio that cannot shrink with it.
    let fixed = audio * duration / 8.0;
    // Hardware VBR is not perfectly linear. Aim 3% below the cap on the one retry.
    let scale = ((target * 0.97 - fixed) / (actual - fixed).max(1.0)).clamp(0.01, 0.99);
    (rate as f64 * scale).floor() as u64
}

fn filters(opts: &CompressOpts, media: &Media) -> String {
    let mut fs = vec![match opts.max_height {
        Some(h) => format!("scale=-2:'trunc(min(ih,{h})/2)*2':flags=lanczos"),
        None => "scale='trunc(iw/2)*2':'trunc(ih/2)*2':flags=lanczos".into(),
    }];
    if let Some(fps) = opts.max_fps {
        if media.fps > fps {
            fs.push(format!("fps={fps}"));
        } else if media.fps <= 0.0 {
            // Unknown/VFR source: discard frames without synthesising any.
            fs.push(format!(
                "select='isnan(prev_selected_t)+gte(t-prev_selected_t,{})'",
                1.0 / fps
            ));
        }
    }
    fs.join(",")
}
fn quality(codec: &str, preset: &str) -> u32 {
    let base = match codec {
        "h264" => 16,
        "hevc" => 18,
        _ => 23,
    };
    base + match preset {
        "high" => 3,
        "balanced" => 6,
        "small" => 10,
        _ => 0,
    }
}
fn add(args: &mut Vec<String>, values: &[&str]) {
    args.extend(values.iter().map(|s| s.to_string()));
}
fn speed<'a>(opts: &CompressOpts, fast: &'a str, balanced: &'a str, slow: &'a str) -> &'a str {
    match opts.speed.as_str() {
        "fast" => fast,
        "slow" => slow,
        _ => balanced,
    }
}
fn codec_args(
    opts: &CompressOpts,
    encoder: &str,
    rate: Option<u64>,
    pass: Option<u8>,
    stats: &Path,
) -> Vec<String> {
    let mut args = vec!["-c:v".into(), encoder.into()];
    let cpu = encoder.starts_with("lib");
    let q = quality(&opts.codec, &opts.preset).to_string();
    if encoder == "libsvtav1" {
        add(&mut args, &["-preset", speed(opts, "8", "6", "4")]);
    } else if encoder.ends_with("_nvenc") {
        add(
            &mut args,
            &[
                "-preset",
                speed(opts, "p4", "p5", "p7"),
                "-tune",
                "hq",
                "-rc",
                "vbr",
                "-multipass",
                "fullres",
            ],
        );
    } else if encoder.ends_with("_amf") {
        // Quality is deliberately retained for all speeds in quality-targeted mode.
        let preset = if rate.is_none() {
            "quality"
        } else {
            speed(opts, "speed", "balanced", "quality")
        };
        add(&mut args, &["-quality", preset]);
    } else {
        add(
            &mut args,
            &["-preset", speed(opts, "fast", "medium", "slow")],
        );
    }
    if let Some(rate) = rate {
        add(&mut args, &["-b:v", &rate.to_string()]);
        if !cpu {
            add(
                &mut args,
                &[
                    "-maxrate",
                    &(rate.saturating_mul(3) / 2).to_string(),
                    "-bufsize",
                    &rate.saturating_mul(2).to_string(),
                ],
            );
            if encoder.ends_with("_amf") {
                add(&mut args, &["-rc", "vbr_peak"]);
            }
        }
        if encoder == "libsvtav1" {
            add(&mut args, &["-svtav1-params", "rc=1"]);
        }
        if let Some(pass) = pass {
            add(
                &mut args,
                &[
                    "-pass",
                    &pass.to_string(),
                    "-passlogfile",
                    &stats.to_string_lossy(),
                ],
            );
            if encoder == "libx265" {
                // libx265 ignores FFmpeg's generic pass flags; its own stats are essential.
                add(
                    &mut args,
                    &[
                        "-x265-params",
                        &format!("pass={pass}:stats={}", dictionary_path(stats)),
                    ],
                );
            }
        }
    } else if cpu {
        add(&mut args, &["-crf", &q]);
    } else if encoder.ends_with("_nvenc") {
        add(&mut args, &["-cq", &q, "-b:v", "0"]);
    } else if encoder.ends_with("_amf") {
        // AMF's AV1 API takes the 0..255 quantizer index, rather than a 0..63 CRF/CQ.
        let qp = if opts.codec == "av1" {
            (quality(&opts.codec, &opts.preset) * 4).to_string()
        } else {
            q
        };
        add(&mut args, &["-rc", "cqp", "-qp_i", &qp, "-qp_p", &qp]);
        // HEVC AMF exposes only I/P quantizers; H.264 and AV1 also expose qp_b.
        if opts.codec != "hevc" {
            add(&mut args, &["-qp_b", &qp]);
        }
    } else {
        add(&mut args, &["-global_quality", &q]);
    }
    args
}

fn dictionary_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .replace(':', "\\:")
        .replace('\'', "\\'")
}
fn input_args(opts: &CompressOpts, media: &Media) -> Vec<String> {
    let mut args = Vec::new();
    if media.start > 0.0 {
        add(&mut args, &["-ss", &media.start.to_string()]);
    }
    add(
        &mut args,
        &["-to", &media.end.to_string(), "-i", &opts.input],
    );
    args
}
fn encode_args(
    opts: &CompressOpts,
    media: &Media,
    audio: &AudioPlan,
    encoder: &str,
    rate: Option<u64>,
    pass: Option<u8>,
    stats: &Path,
    output: &Path,
) -> Vec<String> {
    let mut args = input_args(opts, media);
    add(
        &mut args,
        &[
            "-t",
            &media.duration.to_string(),
            "-map",
            "0:v:0",
            "-sn",
            "-dn",
            "-vf",
            &filters(opts, media),
            "-fps_mode",
            "vfr",
        ],
    );
    args.extend(codec_args(opts, encoder, rate, pass, stats));
    let pix = if opts.codec != "h264" && media.ten_bit {
        if encoder.starts_with("lib") {
            "yuv420p10le"
        } else {
            "p010le"
        }
    } else if encoder.ends_with("_qsv") {
        "nv12"
    } else {
        "yuv420p"
    };
    add(&mut args, &["-pix_fmt", pix]);
    if pass == Some(1) {
        add(
            &mut args,
            &[
                "-an",
                "-map_metadata",
                "-1",
                "-map_chapters",
                "-1",
                "-f",
                "null",
                if cfg!(windows) { "NUL" } else { "/dev/null" },
            ],
        );
    } else {
        args.extend(audio.args.clone());
        add(
            &mut args,
            &[
                "-map_metadata",
                "0",
                "-map_chapters",
                "0",
                "-movflags",
                "+faststart",
            ],
        );
        if opts.codec == "hevc" {
            add(&mut args, &["-tag:v", "hvc1"]);
        }
        add(&mut args, &["-f", "mp4", &output.to_string_lossy()]);
    }
    args
}

struct Reporter<'a> {
    ctx: &'a Ctx,
    last: f64,
}
impl Reporter<'_> {
    fn emit(&mut self, f: f64, detail: &str) {
        self.last = self.last.max(f.clamp(0.0, 1.0));
        self.ctx.progress(self.last, detail);
    }
}
fn stage(
    args: &[String],
    duration: f64,
    range: (f64, f64),
    label: &str,
    later_seconds: f64,
    reporter: &mut Reporter<'_>,
) -> Result<String, String> {
    check_cancel(reporter.ctx)?;
    reporter.emit(range.0, label);
    ffmpeg::run(args, duration, reporter.ctx, |f, p| {
        let detail = if p.speed > 0.0 && p.speed.is_finite() {
            let left = ((duration - p.time).max(0.0) + later_seconds) / p.speed;
            let secs = left.ceil() as u64;
            format!(
                "{label} · {:.1}× · {:02}:{:02} left",
                p.speed,
                secs / 60,
                secs % 60
            )
        } else {
            label.to_string()
        };
        reporter.emit(range.0 + (range.1 - range.0) * f, &detail);
    })
}
fn encode(
    opts: &CompressOpts,
    media: &Media,
    audio: &AudioPlan,
    encoder: &str,
    rate: Option<u64>,
    two_pass: bool,
    stats: &Path,
    output: &Path,
    range: (f64, f64),
    reporter: &mut Reporter<'_>,
) -> Result<(), String> {
    if two_pass {
        let mid = (range.0 + range.1) * 0.5;
        let args = encode_args(opts, media, audio, encoder, rate, Some(1), stats, output);
        stage(
            &args,
            media.duration,
            (range.0, mid),
            "Pass 1/2",
            media.duration,
            reporter,
        )?;
        let args = encode_args(opts, media, audio, encoder, rate, Some(2), stats, output);
        stage(
            &args,
            media.duration,
            (mid, range.1),
            "Pass 2/2",
            0.0,
            reporter,
        )?;
    } else {
        let args = encode_args(opts, media, audio, encoder, rate, None, stats, output);
        stage(&args, media.duration, range, "Encoding", 0.0, reporter)?;
    }
    Ok(())
}

fn measure_vmaf(
    opts: &CompressOpts,
    media: &Media,
    output: &Path,
    probe: Option<&Value>,
    range: (f64, f64),
    reporter: &mut Reporter<'_>,
) -> Result<Option<f64>, String> {
    let video = probe
        .and_then(|p| p["streams"].as_array())
        .and_then(|ss| ss.iter().find(|s| s["codec_type"] == "video"))
        .ok_or("No output dimensions")?;
    let w = video["width"].as_u64().ok_or("No output width")?;
    let h = video["height"].as_u64().ok_or("No output height")?;
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let mut reference_filters = filters(opts, media);
    reference_filters.push_str(&format!(
        ",scale={w}:{h}:flags=lanczos,settb=AVTB,setpts=PTS-STARTPTS"
    ));
    // Read libvmaf's summary from stderr; this avoids filtergraph path escaping on Windows.
    let graph = format!("[0:v:0]settb=AVTB,setpts=PTS-STARTPTS[dist];[1:v:0]{reference_filters}[ref];[dist][ref]libvmaf=n_subsample=4:n_threads={cores}:shortest=1");
    let mut args = vec!["-i".into(), output.to_string_lossy().into_owned()];
    args.extend(input_args(opts, media));
    add(
        &mut args,
        &[
            "-filter_complex",
            &graph,
            "-t",
            &media.duration.to_string(),
            "-an",
            "-sn",
            "-dn",
            "-f",
            "null",
            "-",
        ],
    );
    let stderr = stage(
        &args,
        media.duration,
        range,
        "Measuring VMAF",
        0.0,
        reporter,
    )?;
    Ok(parse_vmaf(&stderr))
}
fn parse_vmaf(stderr: &str) -> Option<f64> {
    stderr.lines().rev().find_map(|line| {
        let (_, tail) = line.split_once("VMAF score:")?;
        tail.split_whitespace()
            .next()?
            .parse::<f64>()
            .ok()
            .filter(|v| v.is_finite())
    })
}

fn output_path(opts: &CompressOpts) -> Result<PathBuf, String> {
    let input = Path::new(&opts.input);
    let path = if let Some(explicit) = &opts.output {
        if explicit.trim().is_empty() {
            return Err("Output path is empty".into());
        }
        PathBuf::from(explicit).with_extension("mp4")
    } else {
        let parent = opts
            .out_dir
            .as_deref()
            .map(Path::new)
            .or_else(|| input.parent())
            .unwrap_or(Path::new("."));
        let stem = input.file_stem().unwrap_or_default().to_string_lossy();
        let suffix = if opts.mode == "target" {
            format!("{}MB", opts.target_mb.unwrap())
        } else {
            "compressed".into()
        };
        parent.join(format!("{stem} ({suffix}).mp4"))
    };
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Could not create output directory: {e}"))?;
    }
    Ok(ffmpeg::unique_path(path))
}
fn check_cancel(ctx: &Ctx) -> Result<(), String> {
    if ctx.cancelled() {
        Err(ffmpeg::CANCELLED.into())
    } else {
        Ok(())
    }
}
fn file_size(path: &Path) -> Result<u64, String> {
    std::fs::metadata(path)
        .map(|m| m.len())
        .map_err(|e| format!("Could not read encoded output: {e}"))
}
struct PartialOutput {
    path: PathBuf,
    keep: bool,
}
impl Drop for PartialOutput {
    fn drop(&mut self) {
        if !self.keep {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}
struct Scratch(PathBuf);
static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);
impl Scratch {
    fn new() -> Result<Self, String> {
        for _ in 0..100 {
            let id = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let path = std::env::temp_dir()
                .join(format!("svp-compress-{}-{stamp}-{id}", std::process::id()));
            match std::fs::create_dir(&path) {
                Ok(()) => return Ok(Self(path)),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(format!("Could not create encoding scratch directory: {e}")),
            }
        }
        Err("Could not allocate encoding scratch directory".into())
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

// FFmpeg/SVT builds differ in two-pass support. Check actual stats generation and consumption once.
static SVT_TWO_PASS: Lazy<bool> = Lazy::new(|| {
    let Ok(scratch) = Scratch::new() else {
        return false;
    };
    let stats = scratch.0.join("svt");
    for pass in ["1", "2"] {
        let mut cmd = ffmpeg::ffmpeg_cmd();
        cmd.args([
            "-hide_banner",
            "-v",
            "error",
            "-nostdin",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=256x256:rate=24",
            "-t",
            "1",
            "-c:v",
            "libsvtav1",
            "-preset",
            "8",
            "-b:v",
            "200k",
            "-svtav1-params",
            "rc=1",
            "-pass",
            pass,
            "-passlogfile",
            &stats.to_string_lossy(),
            "-f",
            "null",
            "-",
        ]);
        if ffmpeg::output(cmd).is_err() {
            return false;
        }
        if pass == "1" && !std::fs::metadata(scratch.0.join("svt-0.log")).is_ok_and(|m| m.len() > 0)
        {
            return false;
        }
    }
    true
});

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{atomic::AtomicBool, Arc};

    fn opts() -> CompressOpts {
        CompressOpts {
            input: "source.mkv".into(),
            output: None,
            out_dir: None,
            mode: "preset".into(),
            preset: "near-lossless".into(),
            target_mb: None,
            codec: "hevc".into(),
            encoder: "cpu".into(),
            speed: "balanced".into(),
            max_height: None,
            max_fps: None,
            audio: "copy".into(),
            vmaf: false,
            start: None,
            end: None,
        }
    }
    fn probe() -> Value {
        json!({"format":{"duration":"20"}, "streams":[
            {"codec_type":"video", "width":1920,"height":1080,"pix_fmt":"yuv420p10le","avg_frame_rate":"30000/1001"},
            {"codec_type":"audio", "codec_name":"aac", "bit_rate":"128000"},
            {"codec_type":"audio", "codec_name":"pcm_s16le", "bit_rate":"1536000"}
        ]})
    }
    fn value_after<'a>(args: &'a [String], key: &str) -> &'a str {
        let i = args
            .iter()
            .position(|a| a == key)
            .unwrap_or_else(|| panic!("Missing {key} in {args:?}"));
        &args[i + 1]
    }

    #[test]
    fn compress_budget_includes_audio_overhead_and_decimal_mb() {
        assert_eq!(bitrate_budget(2.0, 20.0, 128_000.0).unwrap(), 660_000);
        assert_eq!(bitrate_budget(5.0, 20.0, 0.0).unwrap(), 1_970_000);
        let e = bitrate_budget(0.1, 20.0, 128_000.0).unwrap_err();
        assert!(e.contains("0.48 MB"), "{e}");
        assert_eq!(
            bitrate_budget(minimum_mb(20.0, 128_000.0), 20.0, 128_000.0).unwrap(),
            61_120
        );
        assert!(correction_bitrate(660_000, 2e6, 2.2e6, 20.0, 128_000.0) < 600_000);
    }

    #[test]
    fn compress_selection_respects_quality_and_explicit_vendor() {
        let available = json!({"h264":["h264_nvenc","libx264"],"hevc":["hevc_nvenc","libx265"],"av1":["libsvtav1"]});
        let mut o = opts();
        o.encoder = "auto".into();
        assert_eq!(choose_encoder(&o, &available).unwrap(), "libx265");
        o.preset = "high".into();
        assert_eq!(choose_encoder(&o, &available).unwrap(), "libx265");
        o.preset = "balanced".into();
        assert_eq!(choose_encoder(&o, &available).unwrap(), "hevc_nvenc");
        o.encoder = "amf".into();
        assert!(choose_encoder(&o, &available)
            .unwrap_err()
            .contains("unavailable"));
        o.codec = "av1".into();
        o.encoder = "auto".into();
        assert_eq!(choose_encoder(&o, &available).unwrap(), "libsvtav1");
        o.codec = "hevc".into();
        o.mode = "target".into();
        assert_eq!(choose_encoder(&o, &available).unwrap(), "libx265");
    }

    #[test]
    fn compress_audio_maps_every_track_and_falls_back_per_stream() {
        let plan = audio_plan(&probe(), "copy").unwrap();
        assert_eq!(plan.bitrate, 288_000.0);
        assert_eq!(value_after(&plan.args, "-map"), "0:a?");
        assert_eq!(value_after(&plan.args, "-c:a:1"), "aac");
        assert_eq!(audio_plan(&probe(), "aac-96").unwrap().bitrate, 192_000.0);
        assert_eq!(audio_plan(&probe(), "opus-128").unwrap().bitrate, 256_000.0);
        assert_eq!(audio_plan(&probe(), "none").unwrap().args, ["-an"]);
        let unknown = json!({"streams":[{"codec_type":"audio","codec_name":"aac"}]});
        assert_eq!(audio_plan(&unknown, "copy").unwrap().bitrate, 128_000.0);
        assert!(audio_plan(&probe(), "bogus").is_err());
    }

    #[test]
    fn compress_arguments_trim_even_scale_bit_depth_and_true_passes() {
        let mut o = opts();
        o.start = Some(2.0);
        o.end = Some(12.0);
        o.max_height = Some(721);
        o.max_fps = Some(24.0);
        let m = Media::new(&probe(), &o).unwrap();
        assert_eq!(m.duration, 10.0);
        let a = audio_plan(&probe(), "copy").unwrap();
        let args = encode_args(
            &o,
            &m,
            &a,
            "libx265",
            Some(500_000),
            Some(2),
            Path::new("C:/temp/stats"),
            Path::new("out.mp4"),
        );
        assert_eq!(value_after(&args, "-ss"), "2");
        assert_eq!(value_after(&args, "-to"), "12");
        assert!(args.iter().position(|s| s == "-to") < args.iter().position(|s| s == "-i"));
        assert_eq!(value_after(&args, "-t"), "10");
        assert_eq!(value_after(&args, "-pix_fmt"), "yuv420p10le");
        assert_eq!(value_after(&args, "-tag:v"), "hvc1");
        assert_eq!(
            value_after(&args, "-x265-params"),
            "pass=2:stats=C\\:/temp/stats"
        );
        assert!(value_after(&args, "-vf").contains("trunc(min(ih,721)/2)*2"));
        assert!(value_after(&args, "-vf").contains("fps=24"));
        o.codec = "h264".into();
        let args = encode_args(
            &o,
            &m,
            &a,
            "libx264",
            Some(500_000),
            Some(1),
            Path::new("stats"),
            Path::new("out.mp4"),
        );
        assert_eq!(value_after(&args, "-pix_fmt"), "yuv420p");
        assert_eq!(value_after(&args, "-f"), "null");
        assert!(args.contains(&"-an".into()));
        assert!(!args.contains(&"0:a?".into()));
        o.max_fps = Some(60.0);
        assert!(!filters(&o, &m).contains("fps="));
    }

    #[test]
    fn compress_rate_control_arguments_for_all_vendors() {
        let mut o = opts();
        let stats = Path::new("stats");
        assert_eq!(
            value_after(&codec_args(&o, "libx265", None, None, stats), "-crf"),
            "18"
        );
        o.codec = "h264".into();
        o.preset = "small".into();
        let args = codec_args(&o, "h264_nvenc", None, None, stats);
        assert_eq!(value_after(&args, "-cq"), "26");
        assert_eq!(value_after(&args, "-b:v"), "0");
        assert_eq!(value_after(&args, "-multipass"), "fullres");
        let args = codec_args(&o, "h264_amf", None, None, stats);
        assert_eq!(value_after(&args, "-qp_b"), "26");
        assert_eq!(value_after(&args, "-quality"), "quality");
        o.codec = "av1".into();
        let av1 = codec_args(&o, "av1_amf", None, None, stats);
        assert_eq!(value_after(&av1, "-qp_b"), "132");
        o.codec = "h264".into();
        let args = codec_args(&o, "h264_qsv", Some(600_000), None, stats);
        assert_eq!(value_after(&args, "-maxrate"), "900000");
        assert!(!args.contains(&"-global_quality".into()));
        let args = codec_args(&o, "libsvtav1", Some(600_000), Some(2), stats);
        assert_eq!(value_after(&args, "-svtav1-params"), "rc=1");
        assert_eq!(value_after(&args, "-pass"), "2");
    }

    #[test]
    fn compress_validation_metric_parsing_and_monotonic_progress() {
        let mut o = opts();
        o.start = Some(30.0);
        assert!(Media::new(&probe(), &o).is_err());
        o.start = None;
        o.end = Some(f64::NAN);
        assert!(Media::new(&probe(), &o).is_err());
        o = opts();
        o.mode = "target".into();
        o.target_mb = Some(-1.0);
        assert!(validate(&o).is_err());
        assert_eq!(parse_vmaf("[libvmaf] VMAF score: 97.246\n"), Some(97.246));
        assert_eq!(parse_vmaf("VMAF score: NaN"), None);
        let samples = Arc::new(parking_lot::Mutex::new(Vec::new()));
        let s = samples.clone();
        let ctx = Ctx {
            cancel: Arc::new(AtomicBool::new(false)),
            on_progress: Arc::new(move |f, _| s.lock().push(f)),
        };
        let mut reporter = Reporter {
            ctx: &ctx,
            last: 0.0,
        };
        for f in [0.4, 0.2, 0.9, 0.0, 1.1] {
            reporter.emit(f, "test");
        }
        assert_eq!(*samples.lock(), vec![0.4, 0.4, 0.9, 0.9, 1.0]);
    }

    /// Real encodes, metrics and cancellation. Requires FFmpeg/ffprobe on PATH.
    #[test]
    #[ignore = "20s 1080p encoder accuracy and VMAF integration; uses real CPU/GPU encoders"]
    fn compress_integration_accuracy_vmaf_and_cancellation() {
        let scratch = Scratch::new().unwrap();
        let input = scratch.0.join("test clip.mp4");
        let input_name = input.to_string_lossy().into_owned();
        let mut cmd = ffmpeg::ffmpeg_cmd();
        cmd.args([
            "-hide_banner",
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=1920x1080:rate=30",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=48000",
            "-t",
            "20",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            &input_name,
        ]);
        ffmpeg::output(cmd).expect("Generate integration source");
        let detected = detect_encoders();
        println!("Working encoders: {detected}");
        println!("SVT actual two-pass support: {}", *SVT_TWO_PASS);
        let mut targets = vec![
            ("h264".to_string(), "cpu".to_string(), "libx264".to_string()),
            ("hevc".to_string(), "cpu".to_string(), "libx265".to_string()),
        ];
        // Prefer the most compression-efficient working hardware codec for this check.
        'hardware: for family in ["av1", "hevc", "h264"] {
            for vendor in VENDORS {
                let name = format!("{family}_{vendor}");
                if detected[family]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|v| v == &name)
                {
                    targets.push((family.into(), vendor.into(), name));
                    break 'hardware;
                }
            }
        }
        for (codec, vendor, name) in targets {
            for mb in [2.0, 5.0] {
                let mut o = opts();
                o.input = input_name.clone();
                o.mode = "target".into();
                o.target_mb = Some(mb);
                o.codec = codec.clone();
                o.encoder = vendor.clone();
                o.speed = "fast".into();
                let samples = Arc::new(parking_lot::Mutex::new(Vec::new()));
                let s = samples.clone();
                let ctx = Ctx {
                    cancel: Arc::new(AtomicBool::new(false)),
                    on_progress: Arc::new(move |f, _| s.lock().push(f)),
                };
                let result = run(o, &ctx).unwrap_or_else(|e| panic!("{name} {mb} MB: {e}"));
                let bytes = result["size"].as_u64().unwrap();
                let ratio = bytes as f64 / (mb * 1e6);
                println!(
                    "Target {name} {mb:.0} MB: {bytes} bytes ({:+.3}%), {} kbps",
                    (ratio - 1.0) * 100.0,
                    result["bitrateKbps"]
                );
                assert!(
                    (0.92..=1.02).contains(&ratio),
                    "{name} {mb} MB outside -8/+2%: {ratio}"
                );
                let samples = samples.lock();
                assert!(samples.windows(2).all(|w| w[0] <= w[1]));
                assert_eq!(samples.last().copied(), Some(1.0));
            }
        }
        let mut o = opts();
        o.input = input_name.clone();
        o.vmaf = true;
        o.speed = "fast".into();
        let result = run(o, &Ctx::noop()).expect("near-lossless libx265 with VMAF");
        println!("Near-lossless libx265 VMAF: {}", result["vmaf"]);
        assert!(
            result["vmaf"]
                .as_f64()
                .is_some_and(|v| v > 0.0 && v <= 100.0),
            "{result}"
        );

        // Cancel only after a real partial file exists; run() must kill and reap its child.
        let cancelled_path = scratch.0.join("cancel.mp4");
        let mut o = opts();
        o.input = input_name;
        o.output = Some(cancelled_path.to_string_lossy().into_owned());
        o.speed = "slow".into();
        let ctx = Ctx::noop();
        let flag = ctx.cancel.clone();
        let path = cancelled_path.clone();
        let canceller = std::thread::spawn(move || {
            let start = std::time::Instant::now();
            while start.elapsed() < std::time::Duration::from_secs(30) {
                if std::fs::metadata(&path).is_ok_and(|m| m.len() > 0) {
                    flag.store(true, Ordering::Relaxed);
                    return true;
                }
                std::thread::sleep(std::time::Duration::from_millis(25));
            }
            flag.store(true, Ordering::Relaxed);
            false
        });
        let started = std::time::Instant::now();
        let result = run(o, &ctx);
        assert!(
            canceller.join().unwrap(),
            "No partial output created within 30 seconds"
        );
        assert_eq!(result.unwrap_err(), ffmpeg::CANCELLED);
        assert!(
            !cancelled_path.exists(),
            "Cancelled partial output must be removed"
        );
        assert!(
            started.elapsed().as_secs() < 35,
            "FFmpeg cancellation did not finish promptly"
        );
        println!(
            "Cancellation: FFmpeg stopped and partial output removed in {:?}",
            started.elapsed()
        );
    }
}
