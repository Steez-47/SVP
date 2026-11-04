// SVP · small shared helpers.
export const $ = (id) => document.getElementById(id);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 83.4 → "1:23", with hours when needed. ms=true adds ".40". */
export function fmt(t, hours = false, ms = false) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  const frac = ms ? `.${String(Math.floor((t % 1) * 100)).padStart(2, "0")}` : "";
  return (h || hours ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(s).padStart(2, "0")}${frac}`;
}
/** SMPTE-ish timecode HH:MM:SS:FF */
export function timecode(t, fps) {
  const f = Math.round(t * fps), r = Math.round(fps) || 30;
  const ff = f % r, s = Math.floor(f / r);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
}
export function bytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}
export const kbps = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} Mb/s` : `${Math.round(b / 1e3)} kb/s`);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const base = (p) => String(p).split(/[\\/]/).pop();
export const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

const CODEC_NAMES = { h264: "H.264", hevc: "HEVC", av1: "AV1", vp9: "VP9", vp8: "VP8", prores: "ProRes", mpeg2video: "MPEG-2", mpeg4: "MPEG-4", vc1: "VC-1",
  dnxhd: "DNxHD", wmv3: "WMV9", wmv2: "WMV8", mjpeg: "MJPEG", theora: "Theora", aac: "AAC", ac3: "AC-3", eac3: "E-AC-3", dts: "DTS", truehd: "TrueHD",
  opus: "Opus", vorbis: "Vorbis", flac: "FLAC", mp3: "MP3", mp2: "MP2", wmav2: "WMA", subrip: "SRT", ass: "ASS", mov_text: "Timed text", webvtt: "WebVTT",
  hdmv_pgs_subtitle: "PGS", dvd_subtitle: "VobSub", vvc: "VVC", ffv1: "FFV1" };
export const codecName = (c) => CODEC_NAMES[c] || String(c || "").toUpperCase();
export const resLabel = (w, h) => { const s = Math.min(w, h) || h; return s >= 2000 ? "4K" : s >= 1400 ? "1440p" : s >= 1000 ? "1080p" : s >= 700 ? "720p" : s ? `${s}p` : ""; };
export const LANGS = { eng: "English", jpn: "Japanese", spa: "Spanish", fre: "French", fra: "French", ger: "German", deu: "German", ita: "Italian", por: "Portuguese",
  rus: "Russian", chi: "Chinese", zho: "Chinese", kor: "Korean", ara: "Arabic", hin: "Hindi", dut: "Dutch", nld: "Dutch", swe: "Swedish", pol: "Polish", tur: "Turkish", und: "" };
