//! In-app updates from GitHub Releases (tauri-plugin-updater).
//! The release workflow uploads the signed NSIS installer plus `latest.json`; we check
//! `https://github.com/Steez-47/SVP/releases/latest/download/latest.json` (tauri.conf.json → plugins.updater),
//! verify the minisign signature against the bundled public key, then run the installer in passive
//! mode, which relaunches SVP when it's done.
//! `SVP_UPDATE_ENDPOINT` overrides the endpoint (local testing only; release builds still require https).
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};

static PENDING: Lazy<Mutex<Option<Update>>> = Lazy::new(|| Mutex::new(None));

fn updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let mut b = app.updater_builder();
    if let Ok(ep) = std::env::var("SVP_UPDATE_ENDPOINT") {
        let url = ep.parse().map_err(|e| format!("Bad SVP_UPDATE_ENDPOINT: {e}"))?;
        b = b.endpoints(vec![url]).map_err(|e| e.to_string())?;
    }
    b.build().map_err(|e| e.to_string())
}

fn friendly(e: impl std::fmt::Display) -> String {
    let s = e.to_string();
    if s.contains("404") || s.contains("Could not fetch a valid release JSON") {
        "No published release found yet.".into()
    } else if s.to_lowercase().contains("error sending request") || s.contains("dns") {
        "Couldn't reach GitHub. Check your connection.".into()
    } else { s }
}

/// None when up to date; otherwise the new version, its notes and date.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<Value>, String> {
    let up = updater(&app)?.check().await.map_err(friendly)?;
    let out = up.as_ref().map(|u| json!({
        "version": u.version, "current": u.current_version, "notes": u.body, "date": u.date.map(|d| d.to_string()),
    }));
    *PENDING.lock() = up;
    Ok(out)
}

/// Download (emits `update:progress` {done,total}), verify, then hand over to the installer.
/// On Windows the process exits here and the installer relaunches SVP.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let up = PENDING.lock().take().ok_or("Check for updates first.")?;
    let mut done: u64 = 0;
    let a = app.clone();
    let bytes = up.download(
        move |chunk, total| { done += chunk as u64; let _ = a.emit("update:progress", json!({ "done": done, "total": total })); },
        || {},
    ).await.map_err(friendly)?;
    let _ = app.emit("update:installing", ());
    tokio_sleep(400).await; // let the UI save positions/settings
    up.install(bytes).map_err(|e| e.to_string())?;
    Ok(())
}

async fn tokio_sleep(ms: u64) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(std::time::Duration::from_millis(ms))).await;
}
