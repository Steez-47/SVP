// SVP · playback engine.
// Three paths, chosen per file and switched transparently:
//   direct     WebView2 decodes the file itself (served with byte ranges) → instant, fully seekable
//   remux      codec fine, container/audio not (MKV+DTS, AVI, TS…) → live ffmpeg stream-copy to fMP4,
//              while a full background remux builds a cached MP4 we then swap to (seamless)
//   transcode  codec unsupported (ProRes, MPEG-2, VC-1, DNxHR…) → realtime ffmpeg encode (HW if present)
// All public times are SOURCE times (seconds in the original file's timeline).
import { invoke, url } from "./api.js";
import { settings } from "./settings.js";

const probeVideo = document.createElement("video");
const can = (t) => probeVideo.canPlayType(t) !== "" || (window.MediaSource?.isTypeSupported?.(t) ?? false);
export const caps = {
  h264: can('video/mp4; codecs="avc1.640028"'),
  hevc: can('video/mp4; codecs="hvc1.1.6.L120.90"') || can('video/mp4; codecs="hev1.1.6.L120.90"'),
  hevc10: can('video/mp4; codecs="hvc1.2.4.L153.B0"'),
  av1: can('video/mp4; codecs="av01.0.08M.08"') || can('video/webm; codecs="av01.0.08M.08"'),
  av1_10: can('video/mp4; codecs="av01.0.08M.10"'),
  vp9: can('video/webm; codecs="vp9"'),
  vp8: can('video/webm; codecs="vp8"'),
  aac: can('audio/mp4; codecs="mp4a.40.2"'),
  mp3: can("audio/mpeg"),
  opus: can('audio/webm; codecs="opus"'),
  vorbis: can('audio/webm; codecs="vorbis"'),
  flac: can("audio/flac"),
};

const VIDEO_OK = (v) => {
  const bits = /10|12/.test(v.pix_fmt || "") ? 10 : 8;
  const chroma = /444|422/.test(v.pix_fmt || "") ? "hi" : "420";
  switch (v.codec_name) {
    case "h264": return caps.h264 && bits === 8 && chroma === "420";
    case "hevc": return bits === 8 ? caps.hevc : caps.hevc10;
    case "av1": return bits === 8 ? caps.av1 : (caps.av1_10 || caps.av1);
    case "vp9": return caps.vp9;
    case "vp8": return caps.vp8;
    default: return false;
  }
};
const AUDIO_OK = (a) => {
  const c = a.codec_name || "";
  if (c === "aac") return caps.aac;
  if (c === "mp3") return caps.mp3;
  if (c === "opus") return caps.opus;
  if (c === "vorbis") return caps.vorbis;
  if (c === "flac") return caps.flac;
  if (/^pcm_(s16le|s24le|f32le|u8)$/.test(c)) return true;
  return false;
};
const CONTAINER_OK = (fmt, ext) =>
  /mov|mp4/.test(fmt) ? true : /matroska|webm/.test(fmt) ? true : /^ogg$|^wav$|^flac$|^mp3$/.test(fmt);

// WebKitGTK with an older GStreamer (the AppImage bundles Ubuntu 22.04's) can report the metadata of a file it
// plays fine a moment before it knows the picture size. Chromium (WebView2) knows both at once.
const SIZE_LATE = !window.chrome;
const num = (s) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
const rate = (r) => { if (!r || r === "0/0") return 0; const [a, b] = r.split("/").map(Number); return b ? a / b : a; };

/** Normalise ffprobe JSON into what the UI needs. */
export function describe(probe, path) {
  const streams = probe.streams || [];
  const v = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const audio = streams.filter((s) => s.codec_type === "audio");
  const subs = streams.filter((s) => s.codec_type === "subtitle");
  const fps = v ? (rate(v.avg_frame_rate) || rate(v.r_frame_rate) || 30) : 0;
  const rot = v ? (v.side_data_list?.find((d) => d.rotation != null)?.rotation ?? num(v.tags?.rotate)) : 0;
  let [w, h] = v ? [v.width, v.height] : [0, 0];
  if (Math.abs(rot) % 180 === 90) [w, h] = [h, w];
  return {
    path, name: path.split(/[\\/]/).pop(), ext: (path.split(".").pop() || "").toLowerCase(),
    format: probe.format?.format_name || "", formatLong: probe.format?.format_long_name || "",
    duration: num(probe.format?.duration) || Math.max(0, ...streams.map((s) => num(s.duration))),
    start: num(probe.format?.start_time), size: num(probe.format?.size), bitrate: num(probe.format?.bit_rate),
    video: v || null, fps, width: w, height: h, rotation: rot,
    bits: v && /10|12/.test(v.pix_fmt || "") ? (/12/.test(v.pix_fmt) ? 12 : 10) : 8,
    hdr: v ? /smpte2084|arib-std-b67/.test(v.color_transfer || "") : false,
    audio, subs, chapters: (probe.chapters || []).map((c) => ({ start: num(c.start_time), title: c.tags?.title || "" })),
    raw: probe,
  };
}

export class Player extends EventTarget {
  constructor(video) {
    super();
    this.v = video;
    this.mode = "none";
    this.offset = 0;          // live: source time of the stream's t=0
    this.info = null;
    this.path = "";
    this.audioIndex = 0;      // relative audio stream index (0:a:N)
    this.cachePath = "";
    this._token = 0;
    video.addEventListener("error", () => this._onError());
    video.addEventListener("loadedmetadata", () => this._onMeta());
    for (const ev of ["play", "pause", "ratechange", "loadedmetadata"]) video.addEventListener(ev, () => this._pace());
    // Live streams: the muxer may shift t=0 slightly (AAC priming etc.). The first presented frame is
    // by construction the frame at `offset`, so calibrate against it to stay on the exact frame grid.
    // Chromium reports the first frame as 0 but later frames with their true pts (shifted by AAC priming),
    // so derive the shift from frames 2-4: shift = min(mediaTime - (n-1)/fps).
    const calib = (_, m) => {
      if (this._calibOn && this.live) {
        const c = this._calibS || (this._calibS = { first: m.presentedFrames, best: Infinity, n: 0 });
        const k = m.presentedFrames - c.first;
        if (k >= 1) { c.best = Math.min(c.best, m.mediaTime - k / (this.info?.fps || 30)); c.n++; }
        if (c.n >= 3) { this.offset = this._calib - Math.max(0, c.best); this._calibOn = false; this._calibS = null; }
      }
      video.requestVideoFrameCallback(calib);
    };
    video.requestVideoFrameCallback(calib);
  }

  get live() { return this.mode === "remux" || this.mode === "transcode"; }
  /** Tell the server how a live stream is being played, so it only runs a few seconds ahead (Linux; a no-op elsewhere). */
  _pace() { if (this.live && this._liveId) invoke("live_pace", { id: this._liveId, rate: this.v.playbackRate || 1, hold: this.v.paused }).catch(() => {}); }
  get time() { return (this.live ? this.offset : 0) + (this.v.currentTime || 0); }
  get duration() { return this.info?.duration || this.v.duration || 0; }
  get paused() { return this.v.paused; }
  /** Path that frame-accurate tools (frame cache, snapshot) should read. */
  get sourcePath() { return this.path; }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  /** Open a file. Starts playback optimistically before ffprobe answers when the extension is likely native. */
  async open(path, { at = 0, autoplay = true } = {}) {
    const tok = ++this._token;
    this.path = path; this.info = null; this.offset = 0; this.audioIndex = 0; this.cachePath = "";
    this._autoplay = autoplay; this._wantAt = at; this._triedFallback = false;
    invoke("cache_cancel").catch(() => {});
    const ext = (path.split(".").pop() || "").toLowerCase();
    const optimistic = ["mp4", "m4v", "mov", "webm"].includes(ext);
    if (optimistic) this._setDirect(path, at);
    else this.emit("busy", "Analysing…");
    let probe;
    try { probe = await invoke("probe", { path }); }
    catch (e) { if (tok === this._token) this.emit("fail", String(e)); return; }
    if (tok !== this._token) return;
    this.info = describe(probe, path);
    this.emit("info", this.info);
    const plan = this.plan();
    if (plan === "direct") { if (!optimistic) this._setDirect(path, at); }
    else this._goLive(plan, at, autoplay);
  }

  plan() {
    const i = this.info;
    if (!i.video) return i.audio.length && i.audio.every(AUDIO_OK) ? "direct" : "remux";
    const vok = VIDEO_OK(i.video);
    if (!vok) return "transcode";
    const a = i.audio[this.audioIndex];
    const aok = !a || AUDIO_OK(a);
    if (CONTAINER_OK(i.format, i.ext) && aok && this.audioIndex === 0) return "direct";
    return "remux";
  }

  /** `file` = what to play: the opened file or its cached remux. `http` forces the media server. */
  _setDirect(file, at, { http = false } = {}) {
    this.mode = "direct";
    this._calibOn = false; this._calibS = null; // a previous live stream's calibration must not block the frame ring
    this._direct = { file, http };
    this.v.src = url.file(file, { http });
    this._pendingSeek = at > 0 ? at : 0;
    this.emit("mode", this.mode);
  }

  _encoderFor() {
    const want = settings.liveEncoder;
    const enc = this.encoders?.h264 || [];
    if (want === "cpu") return "libx264";
    if (want !== "auto") return enc.find((e) => e.includes(want)) || "libx264";
    return enc.find((e) => /nvenc|amf|qsv/.test(e)) || "libx264";
  }

  _goLive(mode, at, play) {
    this.mode = mode;
    this.emit("mode", mode);
    this._liveAt(at, play);
    if (mode === "remux") this._buildCache();
  }

  _liveAt(t, play) {
    const i = this.info;
    let start = Math.max(0, Math.min(t, (i?.duration || 0) - 0.05));
    if (this.mode === "remux" && this.keyframes?.length) {
      // stream copy starts on the keyframe at/before t
      let k = 0; for (const kf of this.keyframes) { if (kf - (i.start || 0) <= start + 1e-3) k = kf - (i.start || 0); else break; }
      start = Math.max(0, k);
    }
    if (this.mode === "transcode" && i?.fps) start = Math.round(start * i.fps) / i.fps; // frame grid
    this.offset = start;
    this._calib = start; this._calibOn = true; this._calibS = null;
    const enc = this.mode === "transcode" ? this._encoderFor() : "copy";
    let vf = "";
    if (this.mode === "transcode" && enc === "libx264" && i?.height > 1440) vf = "scale=-2:1440";
    this._liveId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    this.v.src = url.live(this.path, start, enc, this.audioIndex, vf, { id: this._liveId, rate: this.v.playbackRate || 1, hold: !play });
    this._pendingSeek = 0;
    this._liveTarget = t; // exact target inside the GOP (copy mode)
    this._autoplay = play;
    this.emit("busy", this.mode === "transcode" ? "Converting on the fly…" : "Preparing stream…");
  }

  async _buildCache() {
    const tok = this._token, path = this.path;
    const a = this.info.audio[this.audioIndex];
    try {
      const out = await invoke("cache_remux", { path, audioIndex: this.audioIndex, copyAudio: !!a && AUDIO_OK(a) });
      if (tok !== this._token || this.mode !== "remux") return;
      // swap to the cached file at the same moment
      const t = this.time, wasPlaying = !this.v.paused || (this.v.readyState < 3 && this._autoplay);
      this.cachePath = out;
      this.offset = 0; this._autoplay = wasPlaying;
      this._setDirect(out, t);
      this.emit("mode", "cached");
    } catch (e) { if (!/cancel/i.test(String(e))) console.warn("cache_remux", e); }
  }

  _onMeta() {
    this.emit("busy", null);
    const i = this.info;
    // HEVC/AV1 in a container WebView2 can't decode sometimes "plays" with no picture → transcode.
    if (this.mode === "direct" && i?.video && this.v.videoWidth === 0 && !this._triedFallback) {
      // Wait for the size before falling back: a needless remux of a big file also starts a full cached copy of it.
      const src = this.v.src;
      if (SIZE_LATE && this._sizeWaited !== src) {
        this._sizeWaited = src;
        const done = () => { clearTimeout(timer); this.v.removeEventListener("resize", done); if (this.v.src === src) this._onMeta(); };
        const timer = setTimeout(done, 1500);
        this.v.addEventListener("resize", done);
        return;
      }
      this._triedFallback = true;
      return this._goLive(VIDEO_OK(i.video) ? "remux" : "transcode", this._pendingSeek || 0, this._autoplay);
    }
    if (this._pendingSeek) { this.v.currentTime = this._pendingSeek; this._pendingSeek = 0; }
    else if (this.live && this._liveTarget > this.offset + 0.02 && this.mode === "remux") {
      this.v.currentTime = this._liveTarget - this.offset;
    }
    if (this._autoplay) this.v.play().catch(() => {});
    this.emit("ready", this.mode);
  }

  async _onError() {
    if (!this.path || this.v.error == null) return;
    const code = this.v.error.code;
    this.emit("mediaerror", `${this.mode} code=${code} ${this.v.error.message || ""}`);
    if (code === 1) return; // aborted by us
    if (!this.info) {
      try { this.info = describe(await invoke("probe", { path: this.path }), this.path); this.emit("info", this.info); } catch (e) { return this.emit("fail", String(e)); }
    }
    const at = this._pendingSeek || this.time; // a load that failed before its metadata never applied the start position
    // a file:// source the webview refused (Linux): the same file through the media server, before any remux
    const d = this._direct;
    if (this.mode === "direct" && d && !d.http && this.v.currentSrc.startsWith("file:")) return this._setDirect(d.file, at, { http: true });
    if (this.mode === "direct") { this._goLive(VIDEO_OK(this.info.video || {}) ? "remux" : "transcode", at, this._autoplay !== false); }
    else if (this.mode === "remux") { this._goLive("transcode", at, true); }
    else this.emit("fail", this.v.error.message || "This file can't be decoded.");
  }

  play() { return this.v.play().catch(() => {}); }
  pause() { this.v.pause(); }
  toggle() { this.v.paused ? this.play() : this.pause(); }

  /** Seek to source time t. Live streams restart ffmpeg unless t is already buffered. */
  seek(t, { fast = false } = {}) {
    const d = this.duration;
    t = Math.max(0, Math.min(d ? d - 0.001 : t, t));
    if (!this.live) {
      if (fast && "fastSeek" in this.v) this.v.fastSeek(t); else this.v.currentTime = t;
      return;
    }
    // in-buffer seek only where the element allows it: a piped live stream has no byte ranges, so Chromium
    // reports seekable [0, 0] and setting currentTime there snaps back to the stream's start
    const rel = t - this.offset;
    const b = this.v.buffered, sk = this.v.seekable;
    const inSeekable = (x) => { for (let k = 0; k < sk.length; k++) if (x >= sk.start(k) && x <= sk.end(k)) return true; return false; };
    for (let k = 0; k < b.length; k++) if (rel >= b.start(k) && rel <= b.end(k) - 0.1 && inSeekable(rel)) { this.v.currentTime = rel; return; }
    this._liveAt(t, !this.v.paused || this._autoplay);
  }

  setAudio(i) {
    if (i === this.audioIndex || !this.info) return;
    const t = this.time, play = !this.v.paused;
    this.audioIndex = i;
    const plan = this.plan();
    if (plan === "direct") { this._autoplay = play; this._setDirect(this.path, t); }
    else { invoke("cache_cancel").catch(() => {}); this._goLive(plan, t, play); }
  }

  close() {
    this._token++;
    invoke("cache_cancel").catch(() => {});
    this.v.removeAttribute("src"); this.v.load();
    this.mode = "none"; this.info = null; this.path = "";
  }
}
