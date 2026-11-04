<img src="assets/icon.svg" width="64" height="64" alt="">

# SVP · Steez Video Player

A compact, liquid-glass video player for Windows built on Tauri v2 (Rust + WebView2) and FFmpeg.

- **Plays everything.** WebView2 decodes H.264, HEVC (8/10-bit), AV1, VP9 and VP8 natively and starts them instantly. MKV/AVI/TS files with odd audio are remuxed live and then swapped to a cached, fully seekable copy. ProRes, DNxHR, MPEG-2, MPEG-4 Part 2, WMV and other codecs are converted on the fly (NVENC/AMF/QSV when available).
- **Instant frame stepping.** `,` and `.` step backward and forward with no loading: recently played frames are kept, and FFmpeg decodes a window around the playhead whenever you pause.
- **Lossless trim.** Multiple segments, keyframe-accurate stream copy or frame-exact re-encode, joined or one file per segment.
- **Compression.** Quality presets (Near-lossless → Small) or an exact target size (2-pass), H.264 / H.265 / AV1, optional VMAF score.
- **Compare.** Two videos scaled to the same rect with a draggable split line, synced playback, frame stepping and pixel zoom.

## Run

Requires Node 20+, Rust (stable) and FFmpeg 6+ (`ffmpeg`/`ffprobe` on PATH, or set the paths in Settings → Engine).

```sh
npm install
npm run dev      # development
npm run build    # NSIS installer in src-tauri/target/release/bundle
```

## Releases and updates

Installed copies check `https://github.com/Steez-47/SVP/releases/latest/download/latest.json` on startup (Settings › Updates), verify the minisign signature and install in place.

```sh
npm run release -- 0.2.0                       # bumps package.json, tauri.conf.json, Cargo.toml
git commit -am "SVP 0.2.0" && git tag v0.2.0
git push origin master v0.2.0                  # .github/workflows/release.yml builds, signs and publishes
```

The workflow needs the repo secret `TAURI_SIGNING_PRIVATE_KEY` (the contents of `~/.tauri/svp.key`). Keep that key private and backed up: without it, existing installs can't verify future updates.

## Windows integration

The installer (`src-tauri/windows/hooks.nsh`) registers SVP for 38 video types under *Open with* and in **Settings › Apps › Default apps › SVP**, without overriding existing defaults. Settings › Updates › *Set as default…* opens that page.

## Layout

| Path | What |
|---|---|
| `src-tauri/src/server.rs` | Local media server: byte-range files, live remux/transcode, frame windows, thumbnails, subtitles |
| `src-tauri/src/ffmpeg.rs` · `jobs.rs` | FFmpeg runner (progress, cancel) and background job queue |
| `src-tauri/src/trim.rs` · `compress.rs` | Trim and compression engines |
| `ui/js/player.js` | Playback path selection (direct / remux / transcode) |
| `ui/js/framecache.js` | Frame cache behind instant stepping |
| `ui/` | UI built from the Steez design system (`steez/`, synced to `ui/steez` on build) |

Dev helpers: `scripts/make-test-media.mjs` (sample files in every codec), `scripts/cdp.mjs` (drive the running webview over CDP), `scripts/run-test-copy.sh`.
