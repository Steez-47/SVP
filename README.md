<img src="assets/icon.svg" width="64" height="64" alt="">

# SVP · Steez Video Player

A compact, liquid-glass video player for Windows and Linux built on Tauri v2 (Rust + WebView2 / WebKitGTK) and FFmpeg.

- **Plays everything.** The webview (WebView2 on Windows, WebKitGTK + GStreamer on Linux) decodes H.264, HEVC (8/10-bit), AV1, VP9 and VP8 natively and starts them instantly. MKV/AVI/TS files with odd audio are remuxed live and then swapped to a cached, fully seekable copy. ProRes, DNxHR, MPEG-2, MPEG-4 Part 2, WMV and other codecs are converted on the fly (NVENC/AMF/QSV when available).
- **Instant frame stepping.** `,` and `.` step backward and forward with no loading: recently played frames are kept, and FFmpeg decodes a window around the playhead whenever you pause.
- **Lossless trim.** Multiple segments, keyframe-accurate stream copy or frame-exact re-encode, joined or one file per segment.
- **Compression.** Quality presets (Near-lossless → Small) or an exact target size (2-pass), H.264 / H.265 / AV1, optional VMAF score.
- **Compare.** Two videos scaled to the same rect with a draggable split line, synced playback, frame stepping and pixel zoom.

## Install

Download from [Releases](https://github.com/Steez-47/SVP/releases/latest). Replace `0.1.4` with the version you download:

| System | File | Install |
|---|---|---|
| Windows 10/11 | `SVP_0.1.4_x64-setup.exe` | Run it |
| Fedora, RHEL, openSUSE | `SVP-0.1.4-1.x86_64.rpm` | `sudo dnf install ./SVP-0.1.4-1.x86_64.rpm` (openSUSE: `sudo zypper install ./SVP-0.1.4-1.x86_64.rpm`) |
| Debian, Ubuntu, Mint, Pop!_OS | `SVP_0.1.4_amd64.deb` | `sudo apt install ./SVP_0.1.4_amd64.deb` |
| Other Linux (last resort) | `SVP_0.1.4_amd64.AppImage` | `chmod +x` it and run |

**On Linux, use the .rpm or .deb.** They use your system's WebKitGTK, which renders on the GPU. The AppImage bundles Ubuntu 22.04's WebKitGTK, which falls back to software rendering on current distros. Measured on Fedora 45 with an RTX 4070 SUPER at 2560×1440, a 1080p60 video with the controls showing rendered at about 17 fps from the AppImage and 60 fps from the system WebKit. Environment-variable workarounds (`WEBKIT_DISABLE_DMABUF_RENDERER`, `WEBKIT_DISABLE_COMPOSITING_MODE`, `GDK_BACKEND=x11`) made no difference. When SVP runs from the AppImage, Settings › Updates links the right package for your distro.

## Run

Requires Node 20+, Rust (stable) and FFmpeg 6+ (`ffmpeg`/`ffprobe` on PATH, or set the paths in Settings → Engine).

Rust is pinned in `rust-toolchain.toml` so local and CI builds use the same compiler. Windows release builds (`npm run build`, also used by CI) require active Microsoft Defender and 7-Zip. They scan the finished installer and its extracted `svp.exe` before succeeding or uploading; a detection or scan error fails the build. Scanning the compressed installer alone missed the original v0.1.0 detection. These checks do not establish Microsoft's exact detection cause or guarantee future scan results. Updater signatures are separate from Windows Authenticode signing.

```sh
npm install
npm run dev      # development
npm run build    # Windows: NSIS installer · Linux: AppImage, .deb, .rpm (src-tauri/target/release/bundle)
```

Without `~/.tauri/svp.key`, `npm run build` still produces installers but skips the signed updater artifacts.

### Linux

Build dependencies (Fedora; on Debian/Ubuntu use `libwebkit2gtk-4.1-dev librsvg2-dev patchelf`):

```sh
sudo dnf install webkit2gtk4.1-devel librsvg2-devel patchelf
```

Playback goes through GStreamer, so it needs the codec plugins: `gstreamer1-plugin-libav`, `gstreamer1-plugins-good` and `gstreamer1-plugins-bad-free` on Fedora (RPM Fusion's `ffmpeg` gives trim/compress the full encoder set, including NVENC); `gstreamer1.0-libav` and `ffmpeg` on Debian/Ubuntu. The .rpm and .deb declare these as dependencies/recommendations; the AppImage bundles GStreamer but still uses the system `ffmpeg` (and renders without the GPU, see [Install](#install)).

## Releases and updates

Installed copies (Windows installer, Linux AppImage, .deb or .rpm) check `https://github.com/Steez-47/SVP/releases/latest/download/latest.json` on startup (Settings › Updates), verify the minisign signature and install in place. On Linux the AppImage replaces itself; the .rpm/.deb install through a `pkexec` password prompt.

```sh
npm run release -- 0.2.0                       # bumps package.json, tauri.conf.json, Cargo.toml
git commit -am "SVP 0.2.0" && git tag v0.2.0
git push origin master v0.2.0                  # .github/workflows/release.yml builds, signs and publishes
```

The workflow needs the repo secret `TAURI_SIGNING_PRIVATE_KEY` (the contents of `~/.tauri/svp.key`). Keep that key private and backed up: without it, existing installs can't verify future updates.

## Desktop integration

**Windows.** The installer (`src-tauri/windows/hooks.nsh`) registers SVP for 38 video types under *Open with* and in **Settings › Apps › Default apps › SVP**, without overriding existing defaults. Settings › Updates › *Set as default…* opens that page.

**Linux.** The .rpm/.deb install `SVP.desktop` (`src-tauri/linux/svp.desktop`) listing every video MIME type, so SVP appears under *Open With*. Settings › Updates › *Set as default* (`src-tauri/src/shell.rs`) makes SVP the default for all of them via `xdg-mime`. AppImages and dev builds first write their own `~/.local/share/applications/com.steez.svp.desktop`.

## Layout

| Path | What |
|---|---|
| `src-tauri/src/server.rs` | Local media server: byte-range files, live remux/transcode, frame windows, thumbnails, subtitles |
| `src-tauri/src/ffmpeg.rs` · `jobs.rs` | FFmpeg runner (progress, cancel) and background job queue |
| `src-tauri/src/trim.rs` · `compress.rs` | Trim and compression engines |
| `src-tauri/src/shell.rs` | Open with / default video player (Windows registry, Linux desktop entry + xdg-mime) |
| `src-tauri/tauri.linux.conf.json` | Linux bundles (AppImage, .deb, .rpm), merged over `tauri.conf.json` on Linux |
| `ui/js/player.js` | Playback path selection (direct / remux / transcode) |
| `ui/js/framecache.js` | Frame cache behind instant stepping |
| `ui/` | UI built from the Steez design system (`steez/`, synced to `ui/steez` on build) |

Dev helpers: `scripts/make-test-media.mjs` (sample files in every codec), `scripts/cdp.mjs` (drive the running webview over CDP; WebView2 only), `scripts/run-test-copy.sh` (Windows).
