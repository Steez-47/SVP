//! Desktop integration: "Open with" registration and the default video player.
//! - Windows: the NSIS installer registers SVP (windows/hooks.nsh); we only read that and open
//!   Settings › Default apps, because Windows doesn't let apps set themselves as default.
//! - Linux: the .rpm/.deb install `SVP.desktop` with every video MIME type. AppImages and dev builds
//!   write their own `com.steez.svp.desktop` to ~/.local/share/applications on demand. "Set as default"
//!   assigns SVP to every video type through `xdg-mime` (~/.config/mimeapps.list), which KDE, GNOME and
//!   file managers all read.
use serde_json::{json, Value};

/// { os, registered, isDefault } for Settings › Updates & system.
#[tauri::command]
pub fn desktop_status() -> Value {
    json!({ "os": std::env::consts::OS, "registered": registered(), "isDefault": is_default() })
}

/// Windows: open Settings on SVP's Default apps page. Linux: make SVP the default for every video type.
#[tauri::command]
pub fn set_default_player() -> Result<Value, String> {
    set_default()?;
    Ok(desktop_status())
}

#[cfg(windows)]
fn registered() -> bool {
    // Reads the registry directly: spawning a hidden `reg.exe` is a pattern antivirus heuristics flag.
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\RegisteredApplications")
        .and_then(|k| k.get_value::<String, _>("SVP"))
        .is_ok()
}
#[cfg(windows)]
fn is_default() -> Option<bool> { None } // Windows hides per-type defaults from apps
#[cfg(windows)]
fn set_default() -> Result<(), String> {
    // ShellExecute: `explorer.exe <uri>` treats the query string as a path and shows a file picker.
    let url = if registered() { "ms-settings:defaultapps?registeredAppUser=SVP" } else { "ms-settings:defaultapps" };
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(target_os = "linux")]
use linux::{is_default, registered, set_default};

#[cfg(not(any(windows, target_os = "linux")))]
fn registered() -> bool { false }
#[cfg(not(any(windows, target_os = "linux")))]
fn is_default() -> Option<bool> { None }
#[cfg(not(any(windows, target_os = "linux")))]
fn set_default() -> Result<(), String> { Err("Not supported on this system.".into()) }

#[cfg(target_os = "linux")]
pub mod linux {
    use std::path::{Path, PathBuf};
    use std::process::{Command, Stdio};

    /// Shared MIME types for the 38 extensions the Windows installer registers (see windows/hooks.nsh),
    /// plus the legacy aliases older desktops still use. Keep in sync with tauri.linux.conf.json.
    pub const MIME_TYPES: &[&str] = &[
        "video/mp4", "video/x-m4v", "video/matroska", "video/x-matroska", "video/quicktime", "video/webm",
        "video/vnd.avi", "video/x-msvideo", "video/avi", "video/x-ms-wmv", "application/vnd.ms-asf", "video/x-ms-asf",
        "video/x-flv", "video/mp2t", "video/mpeg", "video/ogg", "video/x-ogm+ogg", "video/3gpp", "video/3gpp2",
        "application/mxf", "video/dv", "application/vnd.rn-realmedia", "application/vnd.rn-realmedia-vbr",
    ];
    /// Desktop entry installed by the .rpm/.deb (named after productName).
    const PACKAGED_ID: &str = "SVP.desktop";
    /// Desktop entry SVP writes for itself when it isn't installed from a package (AppImage, dev builds).
    const OWN_ID: &str = "com.steez.svp.desktop";
    const ICON: &[u8] = include_bytes!("../icons/128x128.png");

    fn data_home() -> PathBuf {
        dirs::data_dir().unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join(".local/share"))
    }
    fn app_dirs() -> Vec<PathBuf> {
        let sys = std::env::var("XDG_DATA_DIRS").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "/usr/local/share:/usr/share".into());
        // An AppImage adds its own mount ($APPDIR/usr/share) to XDG_DATA_DIRS; its bundled entry isn't installed.
        let appdir = crate::ffmpeg::own_appimage().map(|(_, dir)| dir);
        std::iter::once(data_home())
            .chain(std::env::split_paths(&sys).filter(|d| !appdir.as_ref().is_some_and(|a| d.starts_with(a))))
            .map(|d| d.join("applications"))
            .collect()
    }
    fn find(id: &str) -> Option<PathBuf> { app_dirs().into_iter().map(|d| d.join(id)).find(|p| p.is_file()) }

    /// The desktop entry to use: the packaged one if SVP was installed from a package, else our own.
    fn current_id() -> Option<&'static str> {
        if find(PACKAGED_ID).is_some() { Some(PACKAGED_ID) } else if find(OWN_ID).is_some() { Some(OWN_ID) } else { None }
    }

    pub fn registered() -> bool { current_id().is_some() }

    pub fn is_default() -> Option<bool> {
        let id = current_id()?;
        let out = tool("xdg-mime").args(["query", "default", "video/mp4"]).stderr(Stdio::null()).output().ok()?;
        Some(String::from_utf8_lossy(&out.stdout).trim() == id)
    }

    pub fn set_default() -> Result<(), String> {
        let id = match find(PACKAGED_ID) { Some(_) => PACKAGED_ID, None => write_own_entry()? };
        let out = tool("xdg-mime").arg("default").arg(id).args(MIME_TYPES).output()
            .map_err(|e| format!("Couldn't run xdg-mime ({e}). Install xdg-utils."))?;
        if !out.status.success() {
            return Err(format!("xdg-mime failed: {}", String::from_utf8_lossy(&out.stderr).trim()));
        }
        Ok(())
    }

    /// Writes ~/.local/share/applications/com.steez.svp.desktop pointing at this executable (or AppImage).
    /// Rewritten on every call so a moved AppImage gets fixed by pressing "Set as default" again.
    fn write_own_entry() -> Result<&'static str, String> {
        let exe = crate::ffmpeg::own_appimage().map(|(image, _)| image)
            .or_else(|| std::env::current_exe().ok())
            .ok_or("Couldn't locate the SVP executable")?;
        let icon_dir = data_home().join("icons/hicolor/128x128/apps");
        let apps = data_home().join("applications");
        std::fs::create_dir_all(&icon_dir).and_then(|_| std::fs::create_dir_all(&apps)).map_err(|e| e.to_string())?;
        std::fs::write(icon_dir.join("com.steez.svp.png"), ICON).map_err(|e| e.to_string())?;
        let entry = format!(
            "[Desktop Entry]\nType=Application\nName=SVP\nGenericName=Video Player\nComment=Steez Video Player\n\
             Exec={} %F\nIcon=com.steez.svp\nTerminal=false\nCategories=AudioVideo;Video;Player;\n\
             MimeType={};\nStartupWMClass=svp\n",
            exec_arg(&exe), MIME_TYPES.join(";")
        );
        std::fs::write(apps.join(OWN_ID), entry).map_err(|e| e.to_string())?;
        refresh_caches(&apps);
        Ok(OWN_ID)
    }

    /// Quote a path for a desktop entry's Exec key (Desktop Entry spec, "The Exec key").
    pub fn exec_arg(p: &Path) -> String {
        let s = p.to_string_lossy();
        if s.chars().all(|c| c.is_ascii_alphanumeric() || "/._+-".contains(c)) {
            return s.into_owned();
        }
        let mut q = String::from("\"");
        for c in s.chars() {
            match c {
                // escaped for the Exec quoting rules, then backslashes doubled again for the string value
                '"' | '`' | '$' => { q.push_str("\\\\"); q.push(c); }
                '\\' => q.push_str("\\\\\\\\"),
                '%' => q.push_str("%%"),
                _ => q.push(c),
            }
        }
        q.push('"');
        q
    }

    /// Let menus and "Open with" pick up the new entry now instead of after the next login.
    fn refresh_caches(apps: &Path) {
        let _ = tool("update-desktop-database").arg(apps).stderr(Stdio::null()).status();
        if std::env::var("XDG_CURRENT_DESKTOP").is_ok_and(|d| d.to_uppercase().contains("KDE")) {
            let _ = tool("kbuildsycoca6").stdout(Stdio::null()).stderr(Stdio::null()).status();
        }
    }

    /// A system tool, run without the AppImage's library overrides so it loads the system's own libraries.
    fn tool(bin: &str) -> Command { crate::ffmpeg::command(bin) }

    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn exec_quoting() {
            assert_eq!(exec_arg(Path::new("/usr/bin/svp")), "/usr/bin/svp");
            assert_eq!(exec_arg(Path::new("/home/a b/SVP.AppImage")), "\"/home/a b/SVP.AppImage\"");
            assert_eq!(exec_arg(Path::new("/x/$y\"z")), "\"/x/\\\\$y\\\\\"z\"");
            assert_eq!(exec_arg(Path::new("/x/100%")), "\"/x/100%%\"");
        }
    }
}
