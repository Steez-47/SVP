//! FFmpeg / FFprobe helpers shared by every backend module.
//! - Binary lookup: user override → bundled next to the exe (`ffmpeg/`) → PATH.
//! - `run()`: spawn ffmpeg with `-progress pipe:1`, parse progress, honour cancellation.
//! - `probe()`: ffprobe JSON (format + streams + chapters), cached by path+mtime+size.
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

static OVERRIDES: Lazy<Mutex<(String, String)>> = Lazy::new(|| Mutex::new((String::new(), String::new())));
static PROBE_CACHE: Lazy<Mutex<HashMap<String, Value>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static ENCODERS: Lazy<Mutex<Option<HashSet<String>>>> = Lazy::new(|| Mutex::new(None));

pub fn set_paths(ffmpeg: &str, ffprobe: &str) {
    *OVERRIDES.lock() = (ffmpeg.to_string(), ffprobe.to_string());
    PROBE_CACHE.lock().clear();
    *ENCODERS.lock() = None;
}

fn resolve(name: &str, over: &str) -> String {
    if !over.is_empty() && std::path::Path::new(over).exists() {
        return over.to_string();
    }
    let exe = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    if let Ok(me) = std::env::current_exe() {
        if let Some(dir) = me.parent() {
            for cand in [dir.join("ffmpeg").join(&exe), dir.join(&exe)] {
                if cand.exists() {
                    return cand.to_string_lossy().into_owned();
                }
            }
        }
    }
    exe
}
pub fn ffmpeg_bin() -> String { resolve("ffmpeg", &OVERRIDES.lock().0.clone()) }
pub fn ffprobe_bin() -> String { resolve("ffprobe", &OVERRIDES.lock().1.clone()) }

/// A `Command` with no console window on Windows. Inside an AppImage, the bundle's library and plugin
/// overrides are dropped so system tools (ffmpeg, xdg-mime) load the system's own libraries.
pub fn command(bin: &str) -> Command {
    let mut c = Command::new(bin);
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    #[cfg(target_os = "linux")]
    if own_appimage().is_some() {
        for k in APPIMAGE_ENV {
            c.env_remove(k);
        }
    }
    c
}

/// Linux: (AppImage file, its mount dir) when SVP itself runs from an AppImage. `APPIMAGE`/`APPDIR`
/// leak into child processes, so SVP started by another AppImage app inherits that app's values;
/// only trust them when our own executable lives inside the mount.
#[cfg(target_os = "linux")]
pub fn own_appimage() -> Option<(PathBuf, PathBuf)> {
    static OWN: Lazy<Option<(PathBuf, PathBuf)>> = Lazy::new(|| {
        let image = PathBuf::from(std::env::var_os("APPIMAGE")?);
        let dir = PathBuf::from(std::env::var_os("APPDIR")?);
        std::env::current_exe().ok()?.starts_with(&dir).then_some((image, dir))
    });
    OWN.clone()
}
#[cfg(target_os = "linux")]
const APPIMAGE_ENV: [&str; 12] = [
    "LD_LIBRARY_PATH", "LD_PRELOAD", "GST_PLUGIN_PATH", "GST_PLUGIN_PATH_1_0", "GST_PLUGIN_SYSTEM_PATH",
    "GST_PLUGIN_SYSTEM_PATH_1_0", "GST_PLUGIN_SCANNER", "GST_PLUGIN_SCANNER_1_0", "GIO_MODULE_DIR",
    "GDK_PIXBUF_MODULE_FILE", "GTK_PATH", "GTK_EXE_PREFIX",
];
pub fn ffmpeg_cmd() -> Command { command(&ffmpeg_bin()) }
pub fn ffprobe_cmd() -> Command { command(&ffprobe_bin()) }

/// Progress sample reported by `run`.
#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct Progress {
    pub time: f64,
    pub speed: f64,
    pub fps: f64,
    pub size: u64,
}

/// Cancellation + progress sink handed to long-running work (jobs).
#[derive(Clone)]
pub struct Ctx {
    pub cancel: Arc<AtomicBool>,
    pub on_progress: Arc<dyn Fn(f64, &str) + Send + Sync>,
}
impl Ctx {
    pub fn cancelled(&self) -> bool { self.cancel.load(Ordering::Relaxed) }
    /// fraction 0..1 of the whole job, plus a short human detail ("Pass 1/2 · 3.2x").
    pub fn progress(&self, f: f64, detail: &str) { (self.on_progress)(f.clamp(0.0, 1.0), detail) }
    pub fn noop() -> Ctx { Ctx { cancel: Arc::new(AtomicBool::new(false)), on_progress: Arc::new(|_, _| {}) } }
}

pub const CANCELLED: &str = "Cancelled";

/// Run ffmpeg to completion.
/// Prepends `-hide_banner -nostdin -y -progress pipe:1 -nostats`.
/// `duration` = expected output seconds (for the fraction passed to `on_progress`).
/// Returns stderr tail on success; Err(message) on failure, Err("Cancelled") when cancelled.
pub fn run(args: &[String], duration: f64, ctx: &Ctx, mut on_progress: impl FnMut(f64, &Progress)) -> Result<String, String> {
    let mut cmd = ffmpeg_cmd();
    cmd.args(["-hide_banner", "-nostdin", "-y", "-progress", "pipe:1", "-nostats"])
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("Could not start ffmpeg ({e}). Set its path in Settings → FFmpeg."))?;
    let stderr = child.stderr.take().unwrap();
    let err_buf = Arc::new(Mutex::new(String::new()));
    let eb = err_buf.clone();
    let err_thread = std::thread::spawn(move || {
        let mut r = BufReader::new(stderr);
        let mut line = Vec::new();
        while let Ok(n) = r.read_until(b'\n', &mut line) {
            if n == 0 { break; }
            let mut b = eb.lock();
            b.push_str(&String::from_utf8_lossy(&line));
            if b.len() > 24_000 { let cut = b.len() - 16_000; *b = b[cut..].to_string(); }
            line.clear();
        }
    });
    let stdout = child.stdout.take().unwrap();
    let child = Arc::new(Mutex::new(child));
    let watcher = spawn_cancel_watch(child.clone(), ctx.cancel.clone());
    let mut p = Progress::default();
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        let Some((k, v)) = line.trim().split_once('=') else { continue };
        match k {
            "out_time_us" | "out_time_ms" => if let Ok(us) = v.parse::<f64>() { p.time = us / 1e6 },
            "speed" => p.speed = v.trim_end_matches('x').parse().unwrap_or(0.0),
            "fps" => p.fps = v.parse().unwrap_or(0.0),
            "total_size" => p.size = v.parse().unwrap_or(0),
            "progress" => {
                let f = if v == "end" { 1.0 } else if duration > 0.0 { (p.time / duration).clamp(0.0, 1.0) } else { 0.0 };
                on_progress(f, &p);
            }
            _ => {}
        }
    }
    let status = child.lock().wait().map_err(|e| e.to_string())?;
    watcher.store(true, Ordering::Relaxed);
    let _ = err_thread.join();
    let stderr = err_buf.lock().clone();
    if ctx.cancelled() { return Err(CANCELLED.into()); }
    if status.success() { Ok(stderr) } else { Err(last_error(&stderr).unwrap_or_else(|| format!("ffmpeg failed ({status})"))) }
}

/// Kills the child when `cancel` flips. Returns a flag to stop the watcher.
pub fn spawn_cancel_watch(child: Arc<Mutex<Child>>, cancel: Arc<AtomicBool>) -> Arc<AtomicBool> {
    let done = Arc::new(AtomicBool::new(false));
    let d = done.clone();
    std::thread::spawn(move || loop {
        if d.load(Ordering::Relaxed) { break; }
        if cancel.load(Ordering::Relaxed) {
            let _ = child.lock().kill();
            break;
        }
        std::thread::sleep(Duration::from_millis(80));
    });
    done
}

pub fn last_error(stderr: &str) -> Option<String> {
    let lines: Vec<&str> = stderr.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    lines.iter().rev()
        .find(|l| { let l = l.to_lowercase(); ["error", "invalid", "unknown", "not ", "fail", "no such"].iter().any(|k| l.contains(k)) })
        .or(lines.last())
        .map(|s| s.to_string())
}

/// Run a binary and capture stdout (for ffprobe queries).
pub fn output(mut cmd: Command) -> Result<String, String> {
    let out = cmd.stdin(Stdio::null()).output().map_err(|e| format!("Could not start {e}"))?;
    if !out.status.success() {
        return Err(last_error(&String::from_utf8_lossy(&out.stderr)).unwrap_or_else(|| "ffprobe failed".into()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// ffprobe → raw JSON { format, streams, chapters }. Cached.
pub fn probe(path: &str) -> Result<Value, String> {
    let md = std::fs::metadata(path).map_err(|e| format!("Can't read file: {e}"))?;
    let key = format!("{path}|{:?}|{}", md.modified().ok(), md.len());
    if let Some(v) = PROBE_CACHE.lock().get(&key) { return Ok(v.clone()); }
    let mut c = ffprobe_cmd();
    c.args(["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-show_chapters", path]);
    let v: Value = serde_json::from_str(&output(c)?).map_err(|e| e.to_string())?;
    PROBE_CACHE.lock().insert(key, v.clone());
    Ok(v)
}

/// Duration in seconds from a probe (format.duration, else longest stream).
pub fn duration_of(probe: &Value) -> f64 {
    let f = probe["format"]["duration"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    if f > 0.0 { return f; }
    probe["streams"].as_array().map(|a| a.iter().filter_map(|s| s["duration"].as_str()?.parse::<f64>().ok()).fold(0.0, f64::max)).unwrap_or(0.0)
}

/// First line of `ffmpeg -version`, or None if ffmpeg is missing.
pub fn version() -> Option<String> {
    let mut c = ffmpeg_cmd();
    c.args(["-hide_banner", "-version"]);
    output(c).ok().and_then(|s| s.lines().next().map(String::from))
}

/// Encoder names ffmpeg was built with (cached).
pub fn encoders() -> HashSet<String> {
    if let Some(e) = ENCODERS.lock().as_ref() { return e.clone(); }
    let mut c = ffmpeg_cmd();
    c.args(["-hide_banner", "-encoders"]);
    let set: HashSet<String> = output(c).unwrap_or_default().lines()
        .filter_map(|l| { let l = l.trim(); let mut it = l.split_whitespace(); let flags = it.next()?; if flags.len() == 6 && "VAS".contains(&flags[..1]) { it.next().map(String::from) } else { None } })
        .collect();
    *ENCODERS.lock() = Some(set.clone());
    set
}

/// Next free "name (n).ext" path beside `wanted` so we never overwrite.
pub fn unique_path(wanted: PathBuf) -> PathBuf {
    if !wanted.exists() { return wanted; }
    let stem = wanted.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = wanted.extension().map(|s| s.to_string_lossy().into_owned());
    let dir = wanted.parent().map(PathBuf::from).unwrap_or_default();
    for n in 2.. {
        let name = match &ext { Some(e) => format!("{stem} ({n}).{e}"), None => format!("{stem} ({n})") };
        let p = dir.join(name);
        if !p.exists() { return p; }
    }
    unreachable!()
}

/// Read all of a reader into a String, ignoring invalid UTF-8.
pub fn read_lossy(mut r: impl Read) -> String {
    let mut v = Vec::new();
    let _ = r.read_to_end(&mut v);
    String::from_utf8_lossy(&v).into_owned()
}
