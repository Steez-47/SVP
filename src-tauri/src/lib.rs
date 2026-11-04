mod compress;
mod ffmpeg;
mod jobs;
mod server;
mod trim;
mod updater;

use serde_json::{json, Value};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

static PORT: AtomicU16 = AtomicU16::new(0);

fn file_arg(args: &[String]) -> Option<String> {
    args.iter().skip(1).find(|a| !a.starts_with('-') && std::path::Path::new(a).is_file()).cloned()
}

#[tauri::command]
fn boot() -> Value {
    json!({
        "port": PORT.load(Ordering::Relaxed),
        "token": server::token(),
        "file": file_arg(&std::env::args().collect::<Vec<_>>()),
        "ffmpeg": ffmpeg::version(),
    })
}

#[tauri::command]
fn set_ffmpeg_paths(ffmpeg_path: String, ffprobe_path: String) -> Option<String> {
    ffmpeg::set_paths(&ffmpeg_path, &ffprobe_path);
    ffmpeg::version()
}

#[tauri::command]
async fn probe(path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || ffmpeg::probe(&path)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn keyframes(path: String) -> Result<Vec<f64>, String> {
    tauri::async_runtime::spawn_blocking(move || trim::keyframes(&path)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn encoders() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(compress::detect_encoders).await.map_err(|e| e.to_string())
}

fn base(p: &str) -> String {
    std::path::Path::new(p).file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
}

#[tauri::command]
fn trim_start(app: AppHandle, opts: trim::TrimOpts) -> String {
    let label = format!("Trim · {}", base(&opts.input));
    let input = opts.input.clone();
    jobs::add(&app, "trim", "copy", label, input, Box::new(move |ctx| trim::run(opts, ctx)))
}

#[tauri::command]
fn compress_start(app: AppHandle, opts: compress::CompressOpts) -> String {
    let label = format!("Compress · {}", base(&opts.input));
    let input = opts.input.clone();
    jobs::add(&app, "compress", "encode", label, input, Box::new(move |ctx| compress::run(opts, ctx)))
}

#[tauri::command]
fn job_cancel(app: AppHandle, id: String) { jobs::cancel(&app, &id) }
#[tauri::command]
fn jobs_list() -> Vec<jobs::Job> { jobs::list() }
#[tauri::command]
fn jobs_clear(app: AppHandle) { jobs::clear_finished(&app) }

#[tauri::command]
fn file_info(path: String) -> Result<Value, String> {
    let m = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64);
    Ok(json!({ "size": m.len(), "modified": modified, "name": base(&path) }))
}

// ---------------------------------------------------------------- remux cache
static CACHE_CANCEL: Lazy<Mutex<Arc<AtomicBool>>> = Lazy::new(|| Mutex::new(Arc::new(AtomicBool::new(false))));

fn cache_dir() -> PathBuf {
    let d = std::env::temp_dir().join("svp-cache");
    let _ = std::fs::create_dir_all(&d);
    d
}

/// Drop cache files older than 3 days, then oldest-first until the cache is under 20 GB.
fn prune_cache() {
    let Ok(rd) = std::fs::read_dir(cache_dir()) else { return };
    let mut files: Vec<(PathBuf, std::time::SystemTime, u64)> = rd.flatten()
        .filter_map(|e| { let m = e.metadata().ok()?; Some((e.path(), m.modified().ok()?, m.len())) }).collect();
    files.sort_by_key(|f| f.1);
    let now = std::time::SystemTime::now();
    let mut total: u64 = files.iter().map(|f| f.2).sum();
    for (p, t, len) in files {
        let old = now.duration_since(t).map(|d| d.as_secs() > 3 * 86400).unwrap_or(false);
        if old || total > 20_000_000_000 || p.extension().map(|e| e == "part").unwrap_or(false) {
            if std::fs::remove_file(&p).is_ok() { total = total.saturating_sub(len); }
        }
    }
}

/// Background stream-copy of a file the webview can decode but not demux (MKV+DTS, AVI, TS…)
/// into a cached faststart MP4. Returns the cached path (instantly if already built).
#[tauri::command]
async fn cache_remux(path: String, audio_index: u32, copy_audio: bool) -> Result<String, String> {
    let flag = { let mut g = CACHE_CANCEL.lock(); g.store(true, Ordering::Relaxed); *g = Arc::new(AtomicBool::new(false)); g.clone() };
    tauri::async_runtime::spawn_blocking(move || {
        let md = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        let mut h = std::collections::hash_map::DefaultHasher::new();
        (path.as_str(), md.len(), md.modified().ok(), audio_index, copy_audio).hash(&mut h);
        let out = cache_dir().join(format!("{:016x}.mp4", h.finish()));
        if out.exists() { return Ok(out.to_string_lossy().into_owned()); }
        let part = out.with_extension("part");
        let probe = ffmpeg::probe(&path)?;
        let hevc = probe["streams"].as_array().map(|a| a.iter().any(|s| s["codec_type"] == "video" && s["codec_name"] == "hevc")).unwrap_or(false);
        let mut args: Vec<String> = vec!["-i".into(), path.clone(), "-map".into(), "0:v:0?".into(), "-map".into(), format!("0:a:{audio_index}?"),
            "-sn".into(), "-dn".into(), "-c:v".into(), "copy".into()];
        if hevc { args.extend(["-tag:v".into(), "hvc1".into()]); }
        if copy_audio { args.extend(["-c:a".into(), "copy".into()]); } else { args.extend(["-c:a".into(), "aac".into(), "-b:a".into(), "256k".into()]); }
        args.extend(["-movflags".into(), "+faststart".into(), "-f".into(), "mp4".into(), part.to_string_lossy().into_owned()]);
        let ctx = ffmpeg::Ctx { cancel: flag, on_progress: Arc::new(|_, _| {}) };
        match ffmpeg::run(&args, ffmpeg::duration_of(&probe), &ctx, |_, _| {}) {
            Ok(_) => { std::fs::rename(&part, &out).map_err(|e| e.to_string())?; Ok(out.to_string_lossy().into_owned()) }
            Err(e) => { let _ = std::fs::remove_file(&part); Err(e) }
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn cache_cancel() { CACHE_CANCEL.lock().store(true, Ordering::Relaxed); }

/// Frame-exact still at source resolution. Returns the written path.
#[tauri::command]
async fn snapshot(path: String, time: f64, out_dir: Option<String>, format: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let src = Path::new(&path);
        let dir = out_dir.filter(|d| !d.is_empty()).map(PathBuf::from)
            .unwrap_or_else(|| src.parent().map(PathBuf::from).unwrap_or_default());
        let ext = match format.as_deref() { Some("jpg") => "jpg", Some("webp") => "webp", _ => "png" };
        let stem = src.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "frame".into());
        let t = time.max(0.0);
        let stamp = format!("{:02}-{:02}-{:06.3}", (t / 3600.0) as u64, ((t % 3600.0) / 60.0) as u64, t % 60.0);
        let out = ffmpeg::unique_path(dir.join(format!("{stem} {stamp}.{ext}")));
        let mut args: Vec<String> = vec!["-ss".into(), format!("{t:.4}"), "-i".into(), path.clone(), "-frames:v".into(), "1".into(), "-map".into(), "0:v:0".into()];
        if ext == "jpg" { args.extend(["-q:v".into(), "2".into()]); }
        if ext == "webp" { args.extend(["-lossless".into(), "1".into()]); }
        args.push(out.to_string_lossy().into_owned());
        ffmpeg::run(&args, 0.0, &ffmpeg::Ctx::noop(), |_, _| {})?;
        Ok(out.to_string_lossy().into_owned())
    }).await.map_err(|e| e.to_string())?
}

/// Whether the installer registered SVP with Windows (Default apps / Open with).
/// Reads the registry directly: spawning a hidden `reg.exe` is a pattern antivirus heuristics flag.
#[tauri::command]
fn shell_registered() -> bool {
    #[cfg(windows)]
    {
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        return RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(r"Software\RegisteredApplications")
            .and_then(|k| k.get_value::<String, _>("SVP"))
            .is_ok();
    }
    #[allow(unreachable_code)]
    false
}

/// Open Windows Settings on SVP's Default apps page (falls back to the general page).
/// Goes through ShellExecute: `explorer.exe <uri>` treats the query string as a path and shows a file picker.
#[tauri::command]
fn open_default_apps() -> Result<(), String> {
    let url = if shell_registered() { "ms-settings:defaultapps?registeredAppUser=SVP" } else { "ms-settings:defaultapps" };
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_version(app: AppHandle) -> String { app.package_info().version.to_string() }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    PORT.store(server::start(), Ordering::Relaxed);
    std::thread::spawn(prune_cache);
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            if let Some(f) = file_arg(&args) { let _ = app.emit("open-file", f); }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            boot, set_ffmpeg_paths, probe, keyframes, encoders, trim_start, compress_start,
            job_cancel, jobs_list, jobs_clear, file_info, cache_remux, cache_cancel, snapshot,
            updater::update_check, updater::update_install, app_version,
            shell_registered, open_default_apps
        ])
        .run(tauri::generate_context!())
        .expect("error while running SVP");
}
