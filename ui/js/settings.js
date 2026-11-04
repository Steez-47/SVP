// SVP · settings store (localStorage) + change events.
const KEY = "svp.settings.v1";

export const DEFAULT_KEYS = {
  playPause: ["Space", "KeyK"],
  framePrev: ["Comma"],
  frameNext: ["Period"],
  seekBack: ["ArrowLeft"],
  seekFwd: ["ArrowRight"],
  seekBackLong: ["Shift+ArrowLeft"],
  seekFwdLong: ["Shift+ArrowRight"],
  volUp: ["ArrowUp"],
  volDown: ["ArrowDown"],
  mute: ["KeyM"],
  fullscreen: ["KeyF", "Enter"],
  speedDown: ["BracketLeft"],
  speedUp: ["BracketRight"],
  speedReset: ["Backspace"],
  trim: ["KeyT"],
  setIn: ["KeyI"],
  setOut: ["KeyO"],
  newSegment: ["KeyN"],
  compress: ["KeyP"],
  compare: ["KeyC"],
  snapshot: ["KeyS"],
  loop: ["KeyL"],
  info: ["Tab"],
  open: ["Ctrl+KeyO"],
  settings: ["Ctrl+Comma"],
  close: ["Escape"],
};
export const KEY_LABELS = {
  playPause: "Play / pause", framePrev: "Previous frame", frameNext: "Next frame", seekBack: "Back (short)", seekFwd: "Forward (short)",
  seekBackLong: "Back (long)", seekFwdLong: "Forward (long)", volUp: "Volume up", volDown: "Volume down", mute: "Mute",
  fullscreen: "Fullscreen", speedDown: "Slower", speedUp: "Faster", speedReset: "Normal speed", trim: "Trim mode", setIn: "Set segment start",
  setOut: "Set segment end", newSegment: "New segment", compress: "Compress", compare: "Compare", snapshot: "Save frame",
  loop: "Loop", info: "Media info", open: "Open file", settings: "Settings", close: "Close panel / exit fullscreen",
};

export const DEFAULTS = {
  // playback
  autoplay: true, resume: true, loop: false, volume: 1, muted: false, speed: 1, rememberSpeed: false,
  seekShort: 5, seekLong: 30, wheel: "volume", volumeStep: 5, dblClick: "fullscreen", clickPause: true,
  hwDecode: true, liveEncoder: "auto",
  // frame stepping
  cacheBack: 3, cacheFwd: 2, cacheRes: "display", ringFrames: 45, holdRepeat: 30,
  // interface
  hideDelay: 1800, timeMode: "elapsed", showThumbs: true, showBadges: true, osd: true, pauseOnMinimize: true, alwaysOnTop: false,
  // appearance
  theme: "noir",
  // export
  outDir: "", trimMode: "lossless", trimMerge: true, snapFormat: "png",
  cxCodec: "hevc", cxEncoder: "auto", cxSpeed: "balanced", cxAudio: "copy", cxVmaf: false,
  // engine
  ffmpegPath: "", ffprobePath: "", autoUpdate: true,
  keys: DEFAULT_KEYS,
  recent: [], positions: {},
};

const listeners = new Set();
let data = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || "{}"); return { ...DEFAULTS, ...s, keys: { ...DEFAULT_KEYS, ...(s.keys || {}) } }; }
  catch { return structuredClone(DEFAULTS); }
}
let t;
function persist() { clearTimeout(t); t = setTimeout(() => localStorage.setItem(KEY, JSON.stringify(data)), 120); }

export const settings = new Proxy({}, {
  get: (_, k) => data[k],
  set: (_, k, v) => { const old = data[k]; data[k] = v; persist(); if (old !== v) listeners.forEach((f) => f(k, v, old)); return true; },
});
export const onSetting = (f) => { listeners.add(f); return () => listeners.delete(f); };
export function resetSettings() { const keep = { recent: data.recent, positions: data.positions }; data = { ...structuredClone(DEFAULTS), ...keep }; persist(); listeners.forEach((f) => f("*")); }

export function pushRecent(path) {
  const r = [path, ...data.recent.filter((p) => p !== path)].slice(0, 8);
  settings.recent = r;
}
export function savePosition(path, t, dur) {
  const pos = { ...data.positions };
  if (!dur || t < 5 || t > dur - 8) delete pos[path]; else pos[path] = Math.round(t * 10) / 10;
  const keys = Object.keys(pos); if (keys.length > 200) delete pos[keys[0]];
  settings.positions = pos;
}
