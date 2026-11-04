// SVP · app shell: wires the player engine, frame cache, timeline and panels to the Steez UI.
import "./icons.js";
import { invoke, listen, win, setServer, url, openDialog, reveal, isTauri, VIDEO_EXT } from "./api.js";
import { settings, onSetting, pushRecent, savePosition } from "./settings.js";
import { Player, caps } from "./player.js";
import { FrameCache } from "./framecache.js";
import { Timeline } from "./timeline.js";
import { $, fmt, timecode, bytes, kbps, esc, base, codecName, resLabel, LANGS, clamp } from "./util.js";
import { initTrim } from "./trim.js";
import { initCompress } from "./compress-ui.js";
import { initCompare } from "./compare.js";
import { initSettings } from "./settings-ui.js";
import { initUpdates } from "./updates.js";

const body = document.body;
const video = $("video");
const player = new Player(video);
const cache = new FrameCache($("frameCanvas"), video);
const tl = new Timeline();
const state = { frameT: 0, stepping: false, stepSeq: 0, scrubbing: false, wasPlaying: false, subs: null, subIndex: -1, encoders: null, keyframes: [], timeMode: settings.timeMode };

export const app = { player, cache, tl, state, settings, osd, openFile, setMode, toast: (...a) => Steez.toast(...a), refreshTime: () => renderTime(), keyframes: () => state.keyframes };

// ---------------------------------------------------------------- boot
(async function boot() {
  if (!isTauri) { body.dataset.mode = "empty"; console.warn("SVP UI running outside Tauri (preview mode)"); }

  try {
    const b = await invoke("boot");
    setServer(b.port, b.token);
    if (settings.ffmpegPath || settings.ffprobePath) await invoke("set_ffmpeg_paths", { ffmpegPath: settings.ffmpegPath, ffprobePath: settings.ffprobePath });
    if (!b.ffmpeg) Steez.toast("err", "FFmpeg wasn't found. Set its location in Settings → Engine.", { ms: 8000 });
    if (b.file) openFile(b.file);
    invoke("encoders").then((e) => { state.encoders = e; player.encoders = e; app.encoders = e; }).catch(() => {});
  } catch (e) { console.warn(e); }
  renderRecent();
  initTrim(app); initCompress(app); initCompare(app); initSettings(app); initUpdates(app);
  listen("open-file", (p) => openFile(p));
  if (window.__TAURI__?.webview) window.__TAURI__.webview.getCurrentWebview().onDragDropEvent((e) => onDrag(e.payload));
  applyPrefs();
})();

function applyPrefs() {
  video.volume = settings.volume; video.muted = settings.muted;
  syncVol();
  $("mLoop").setAttribute("aria-checked", String(!!settings.loop)); video.loop = !!settings.loop;
  $("mTop").setAttribute("aria-checked", String(!!settings.alwaysOnTop)); win()?.setAlwaysOnTop(!!settings.alwaysOnTop).catch(() => {});
}
onSetting((k) => { if (["loop", "alwaysOnTop", "volume", "muted", "*"].includes(k)) applyPrefs(); if (k === "showBadges" || k === "*") renderBadges(); if (k === "timeMode") { state.timeMode = settings.timeMode; renderTime(); } });

// ---------------------------------------------------------------- modes (empty / play / compare)
function setMode(m) { body.dataset.mode = m; if (m !== "play") cache.hide(); poke(); }

// ---------------------------------------------------------------- open
export async function openFile(path, opts = {}) {
  if (!path) return;
  if (body.dataset.mode === "compare") app.exitCompare?.();
  savePos();
  setMode("play");
  state.frameT = 0; state.stepping = false; state.keyframes = []; clearSubs();
  $("title").textContent = base(path);
  win()?.setTitle(`${base(path)} · SVP`).catch(() => {});
  $("badges").innerHTML = "";
  showBusy("Opening…");
  cache.reset(path, null);
  tl.setKeyframes([]);
  const at = opts.at ?? (settings.resume ? settings.positions[path] || 0 : 0);
  if (!settings.rememberSpeed) video.playbackRate = 1;
  speedLabel();
  player.open(path, { at, autoplay: opts.autoplay ?? settings.autoplay });
  pushRecent(path); renderRecent();
  app.onOpen?.(path);
}

player.addEventListener("info", ({ detail: i }) => {
  cache.reset(i.path, i);
  tl.setDuration(i.duration, i.fps, i.chapters);
  tl.loadThumbs(i.path, i);
  renderBadges(); renderTracks(); renderTime();
  if (!$("infoPanel").hidden) renderInfo();
  if (!i.video && !i.audio.length) Steez.toast("err", "No playable video or audio streams in this file.");
  invoke("keyframes", { path: i.path }).then((k) => {
    if (player.path !== i.path) return;
    state.keyframes = k.map((t) => t - (i.start || 0));
    player.keyframes = k;
    tl.setKeyframes(state.keyframes);
    app.onKeyframes?.(state.keyframes);
  }).catch(() => {});
  autoSubs(i);
});
player.addEventListener("mode", ({ detail }) => { renderBadges(); if (detail === "cached") osd("Full seeking ready"); });
player.addEventListener("busy", ({ detail }) => (detail ? showBusy(detail) : hideBusy()));
player.addEventListener("ready", () => { hideBusy(); renderTime(); });
player.addEventListener("fail", ({ detail }) => { hideBusy(); Steez.toast("err", `Can't open this file: ${detail}`, { ms: 7000 }); });

function showBusy(t) { clearTimeout(showBusy._t); showBusy._t = setTimeout(() => { $("busy").hidden = false; $("busyText").textContent = t; }, 180); }
function hideBusy() { clearTimeout(showBusy._t); $("busy").hidden = true; }

function renderBadges() {
  const i = player.info, el = $("badges");
  if (!i || !settings.showBadges) { el.innerHTML = ""; return; }
  const b = [];
  if (i.video) {
    b.push(codecName(i.video.codec_name));
    const r = resLabel(i.width, i.height); if (r) b.push(r);
    if (i.bits > 8) b.push(`${i.bits}-bit`);
    if (i.hdr) b.push("HDR");
    if (i.fps) b.push(`${Math.round(i.fps * 100) / 100} fps`);
  } else if (i.audio[0]) b.push(codecName(i.audio[0].codec_name));
  const mode = player.cachePath ? "" : player.mode === "remux" ? "Remuxing" : player.mode === "transcode" ? "Converting" : "";
  el.innerHTML = b.map((x) => `<span class="badge">${esc(x)}</span>`).join("") + (mode ? `<span class="badge tone-info" data-tip="${player.mode === "transcode" ? "Codec isn't natively supported, so SVP decodes it with FFmpeg in real time" : "Stream copied into a playable container; full seeking unlocks shortly"}">${mode}</span>` : "");
}

// ---------------------------------------------------------------- time + render loop
const cmpOn = () => body.dataset.mode === "compare" && app.cmp?.active;
function renderTime() {
  if (cmpOn()) {
    const c = app.cmp, t = c.time(), d = c.duration(), fps = c.fps?.() || 30;
    $("tCur").textContent = state.timeMode === "frames" ? timecode(t, fps) : fmt(t, d >= 3600);
    $("tDur").textContent = state.timeMode === "frames" ? timecode(d, fps) : fmt(d, d >= 3600);
    if (!state.scrubbing) tl.update(t, 0, 0);
    return;
  }
  const t = state.stepping || video.paused ? state.frameT || player.time : player.time, d = player.duration;
  const i = player.info, hrs = d >= 3600;
  let cur, dur;
  if (state.timeMode === "frames" && i?.fps) { cur = timecode(t, i.fps); dur = timecode(d, i.fps); }
  else if (state.timeMode === "remaining") { cur = `-${fmt(d - t, hrs)}`; dur = fmt(d, hrs); }
  else { cur = fmt(t, hrs); dur = fmt(d, hrs); }
  $("tCur").textContent = cur; $("tDur").textContent = dur;
  let bs = 0, be = 0;
  const b = video.buffered;
  const rel = player.live ? player.time - player.offset : video.currentTime;
  for (let k = 0; k < b.length; k++) if (rel >= b.start(k) - 0.5 && rel <= b.end(k) + 0.5) { bs = b.start(k); be = b.end(k); }
  const off = player.live ? player.offset : 0;
  if (!state.scrubbing) tl.update(t, be + off, bs + off);
}
(function loop() { if ((cmpOn() ? !app.cmp.paused() : !video.paused) && !state.scrubbing) renderTime(); requestAnimationFrame(loop); })();

function onFrame(now, meta) {
  const t = meta.mediaTime + (player.live ? player.offset : 0);
  if (!video.paused) { if (!player._calibOn) cache.capture(t, meta.presentedFrames); state.frameT = t; }
  else if (state.stepping) { if (Math.abs(t - state.frameT) < cache.fd * 0.5) { cache.hide(); state.stepping = false; } }
  else state.frameT = t;
  video.requestVideoFrameCallback(onFrame);
}
video.requestVideoFrameCallback(onFrame);

cache.onchange = () => tl.renderCache([...cache.ranges, ...(cache.ringRange ? [cache.ringRange] : [])]);

video.addEventListener("play", () => { setPlayIcon(); cache.abortAll(); if (state.stepping) { cache.hide(); state.stepping = false; } poke(); });
video.addEventListener("pause", () => {
  setPlayIcon(); cache.breakRing(); renderTime(); poke();
  if (player.info?.video) setTimeout(() => video.paused && cache.around(state.frameT || player.time), 60);
  savePos();
});
video.addEventListener("seeked", () => { renderTime(); if (video.paused && !state.stepping && player.info?.video) cache.around(player.time); });
video.addEventListener("ended", () => { setPlayIcon(); savePosition(player.path, 0, 0); });
video.addEventListener("ratechange", speedLabel);
video.addEventListener("volumechange", syncVol);
video.addEventListener("timeupdate", () => { if (Math.random() < 0.05) savePos(); renderSubs(); });

function savePos() { if (player.path && player.duration) savePosition(player.path, player.time, player.duration); }
window.addEventListener("beforeunload", savePos);

function setPlayIcon() {
  const b = $("btnPlay"), p = video.paused;
  b.querySelector("use").setAttribute("href", p ? "#i-play" : "#i-pause");
  b.setAttribute("aria-label", p ? "Play" : "Pause"); b.dataset.tip = `${p ? "Play" : "Pause"} · Space`;
  b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
}

// ---------------------------------------------------------------- transport
function togglePlay() {
  if (cmpOn()) return app.cmp.toggle();
  if (!player.path) return;
  if (video.paused && state.stepping && !player.live) { player.seek(state.frameT + cache.fd * 0.1); }
  if (video.paused && player.live && state.stepping) { player.seek(state.frameT); }
  player.toggle();
}
function seekBy(d) {
  if (cmpOn()) { app.cmp.seek(app.cmp.time() + d); return osd(`${d > 0 ? "+" : "−"}${Math.abs(d)} s`); }
  if (!player.path) return;
  const t = clamp((state.stepping || video.paused ? state.frameT || player.time : player.time) + d, 0, player.duration);
  cache.hide(); state.stepping = false;
  player.seek(t); state.frameT = t; renderTime();
  osd(`${d > 0 ? "+" : "−"}${Math.abs(d)} s`);
}

let syncTimer = 0;
async function stepFrame(dir) {
  if (cmpOn()) return app.cmp.step(dir);
  if (!player.info?.video) return;
  if (!video.paused) { player.pause(); await new Promise((r) => requestAnimationFrame(r)); }
  const seq = ++state.stepSeq;
  const fd = cache.fd;
  const cur = state.frameT || player.time;
  const f = cache.neighbor(cur, dir);
  if (f) {
    state.frameT = f.t; state.stepping = true;
    renderTime();
    const ok = await cache.show(f);
    if (seq !== state.stepSeq) return;
    if (!ok) state.stepping = false;
    cache.predecode(f.t, dir);
    const r = cache.rangeOf(f.t);
    if (!r || (dir < 0 ? f.t - r[0] : r[1] - f.t) < 0.6) cache.around(f.t, dir);
    // let the real video catch up once stepping pauses (live streams stay on the cached frame)
    clearTimeout(syncTimer);
    if (!player.live) syncTimer = setTimeout(() => { if (state.stepping && video.paused) video.currentTime = state.frameT + fd * 0.1; }, 220);
  } else {
    const target = clamp(cur + dir * fd, 0, player.duration);
    state.frameT = target; cache.hide(); state.stepping = false;
    player.seek(target + fd * 0.1);
    renderTime();
    cache.around(target, dir);
  }
  if (settings.osd && state.timeMode !== "frames" && player.info.fps) osd(`Frame ${Math.round(state.frameT * player.info.fps) + 1}`, 700);
}
app.stepFrame = stepFrame;
app.seek = (t) => { cache.hide(); state.stepping = false; player.seek(t); state.frameT = t; renderTime(); };
app.currentTime = () => (state.stepping || video.paused ? state.frameT || player.time : player.time);

$("btnPlay").onclick = togglePlay;
$("btnPrev").onclick = () => stepFrame(-1);
$("btnNext").onclick = () => stepFrame(1);
$("time").onclick = () => {
  const order = ["elapsed", "remaining", "frames"];
  settings.timeMode = order[(order.indexOf(state.timeMode) + 1) % order.length];
};

tl.addEventListener("scrubstart", () => { if (cmpOn()) { state.scrubbing = true; state.wasPlaying = !app.cmp.paused(); if (state.wasPlaying) app.cmp.toggle(); return; } state.scrubbing = true; state.wasPlaying = !video.paused; if (!player.live) video.pause(); cache.hide(); state.stepping = false; });
tl.addEventListener("scrubend", () => { state.scrubbing = false; if (state.wasPlaying) (cmpOn() ? app.cmp.toggle() : player.play()); });
let scrubRaf = 0, scrubT = 0;
tl.addEventListener("seek", ({ detail }) => {
  if (cmpOn()) { tl.update(detail.t); if (!detail.scrub) app.cmp.seek(detail.t); else { clearTimeout(tl._cs); tl._cs = setTimeout(() => app.cmp.seek(detail.t), 60); } return; }
  scrubT = detail.t; state.frameT = scrubT;
  tl.update(scrubT); renderTimeAt(scrubT);
  if (detail.scrub && player.live) return; // live streams seek on release
  if (!scrubRaf) scrubRaf = requestAnimationFrame(() => { scrubRaf = 0; player.seek(scrubT, { fast: detail.scrub && player.duration > 600 }); });
  if (!detail.scrub) { cancelAnimationFrame(scrubRaf); scrubRaf = 0; player.seek(scrubT); }
});
function renderTimeAt(t) { const d = player.duration; $("tCur").textContent = state.timeMode === "frames" && player.info?.fps ? timecode(t, player.info.fps) : fmt(t, d >= 3600); }

// volume
function syncVol() {
  const v = video.muted ? 0 : video.volume, el = $("vol");
  el.value = String(Math.round(v * 100)); el.style.setProperty("--val", `${el.value}%`);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  $("btnMute").querySelector("use").setAttribute("href", v === 0 ? "#i-vol-mute" : v < 0.5 ? "#i-vol-mid" : "#i-vol-high");
}
$("vol").addEventListener("input", (e) => { if (!e.isTrusted) return; video.volume = +e.target.value / 100; video.muted = video.volume === 0; settings.volume = video.volume; settings.muted = video.muted; });
$("btnMute").onclick = () => { video.muted = !video.muted; if (!video.muted && video.volume === 0) video.volume = 0.5; settings.muted = video.muted; osd(video.muted ? "Muted" : `Volume ${Math.round(video.volume * 100)}%`); };
function volBy(d) { video.muted = false; video.volume = clamp(Math.round((video.volume + d) * 100) / 100, 0, 1); settings.volume = video.volume; settings.muted = false; osd(`Volume ${Math.round(video.volume * 100)}%`); }

// speed
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];
$("speedItems").innerHTML = SPEEDS.map((s) => `<button class="menu-item" role="menuitemradio" aria-checked="${s === 1}" data-speed="${s}">${s === 1 ? "Normal" : `${s}×`}<svg class="i mi-check"><use href="#i-check"/></svg></button>`).join("");
$("m-speed").addEventListener("click", (e) => { const b = e.target.closest("[data-speed]"); if (b) setSpeed(+b.dataset.speed); });
function setSpeed(s) { video.playbackRate = s; if (settings.rememberSpeed) settings.speed = s; osd(`${s}×`); }
function speedLabel() {
  const r = video.playbackRate; $("btnSpeed").textContent = `${Math.round(r * 100) / 100}×`;
  $("m-speed").querySelectorAll("[data-speed]").forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.speed === r)));
}
function speedStep(d) { const r = video.playbackRate; const i = SPEEDS.findIndex((s) => s >= r - 1e-3); setSpeed(SPEEDS[clamp((i < 0 ? 3 : i) + d, 0, SPEEDS.length - 1)]); }
if (settings.rememberSpeed && settings.speed) video.playbackRate = settings.speed;

// ---------------------------------------------------------------- tracks + subtitles
function trackLabel(s, n) {
  const lang = LANGS[s.tags?.language] ?? s.tags?.language ?? "";
  const title = s.tags?.title || "";
  const ch = s.channels ? ({ 1: "Mono", 2: "Stereo", 6: "5.1", 8: "7.1" }[s.channels] || `${s.channels} ch`) : "";
  return [title || lang || `Track ${n + 1}`, title && lang ? lang : "", codecName(s.codec_name), ch].filter(Boolean).join(" · ");
}
function renderTracks() {
  const i = player.info;
  const a = i?.audio || [];
  $("audioItems").innerHTML = a.length
    ? a.map((s, n) => `<button class="menu-item" role="menuitemradio" aria-checked="${n === player.audioIndex}" data-audio="${n}">${esc(trackLabel(s, n))}<svg class="i mi-check"><use href="#i-check"/></svg></button>`).join("")
    : `<button class="menu-item" role="menuitem" aria-disabled="true">No audio</button>`;
  const subs = (i?.subs || []).map((s, n) => ({ s, n, text: !/pgs|dvd_sub|dvb_sub|xsub/.test(s.codec_name) }));
  $("subItems").innerHTML = `<button class="menu-item" role="menuitemradio" aria-checked="${state.subIndex < 0}" data-sub="-1">Off<svg class="i mi-check"><use href="#i-check"/></svg></button>` +
    subs.map(({ s, n, text }) => `<button class="menu-item" role="menuitemradio" aria-checked="${state.subIndex === s.index}" data-sub="${s.index}" ${text ? "" : 'aria-disabled="true" title="Image subtitles aren\'t supported yet"'}>${esc(trackLabel(s, n))}<svg class="i mi-check"><use href="#i-check"/></svg></button>`).join("") +
    (state.extSub ? `<button class="menu-item" role="menuitemradio" aria-checked="${state.subIndex === -2}" data-sub="-2">${esc(base(state.extSub))}<svg class="i mi-check"><use href="#i-check"/></svg></button>` : "");
}
$("m-tracks").addEventListener("click", (e) => {
  const a = e.target.closest("[data-audio]"); if (a) { player.setAudio(+a.dataset.audio); renderTracks(); osd(trackLabel(player.info.audio[+a.dataset.audio], +a.dataset.audio)); }
  const s = e.target.closest("[data-sub]"); if (s) selectSub(+s.dataset.sub);
});
$("subLoad").onclick = async () => {
  const f = await openDialog({ multiple: false, filters: [{ name: "Subtitles", extensions: ["srt", "vtt", "ass", "ssa", "sub"] }] });
  if (f) { state.extSub = f; await selectSub(-2); }
};
async function autoSubs(i) {
  state.extSub = null;
  const def = i.subs.find((s) => s.disposition?.default || s.disposition?.forced);
  if (def && !/pgs|dvd_sub|dvb_sub/.test(def.codec_name)) selectSub(def.index, true);
}
function clearSubs() { state.subs = null; state.subIndex = -1; renderSubs(); }
async function selectSub(idx, quiet) {
  state.subIndex = idx; renderTracks();
  if (idx === -1) { state.subs = null; renderSubs(); if (!quiet) osd("Subtitles off"); return; }
  try {
    const u = idx === -2 ? url.subs(state.extSub, 0) : url.subs(player.path, idx);
    const txt = await (await fetch(u)).text();
    state.subs = parseVtt(txt); renderSubs();
    if (!quiet) osd("Subtitles on");
  } catch (e) { Steez.toast("err", "Couldn't load that subtitle track."); }
}
function parseVtt(t) {
  const cues = [], ts = (s) => { const p = s.trim().split(":").map(parseFloat); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
  for (const block of t.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.split("\n"); const k = lines.findIndex((l) => l.includes("-->"));
    if (k < 0) continue;
    const [a, b] = lines[k].split("-->");
    cues.push({ start: ts(a), end: ts(b.trim().split(/\s/)[0]), text: lines.slice(k + 1).join("\n") });
  }
  return cues;
}
let subEl;
function renderSubs() {
  if (!subEl) { subEl = document.createElement("div"); subEl.className = "subs"; $("stage").append(subEl); }
  if (!state.subs) { subEl.innerHTML = ""; return; }
  const t = app.currentTime();
  const on = state.subs.filter((c) => t >= c.start && t <= c.end);
  const html = on.map((c) => `<span>${esc(c.text).replace(/&lt;(\/?)(i|b|u)&gt;/g, "<$1$2>").replace(/\n/g, "<br>")}</span>`).join("<br>");
  if (subEl.innerHTML !== html) subEl.innerHTML = html;
}
app.renderSubs = renderSubs;

// ---------------------------------------------------------------- snapshot, info, menus
async function snapshot() {
  if (!player.info?.video) return;
  const t = app.currentTime();
  try {
    const out = await invoke("snapshot", { path: player.path, time: t + (player.info.start || 0), outDir: settings.outDir || null, format: settings.snapFormat });
    Steez.toast("ok", `Saved frame · ${base(out)}`, { action: "Show", onAction: () => reveal(out) });
  } catch (e) { Steez.toast("err", `Couldn't save the frame: ${e}`); }
}
$("btnSnap").onclick = snapshot;

function renderInfo() {
  const i = player.info; if (!i) { $("infoBody").innerHTML = `<p class="caption">Open a video to see its details.</p>`; return; }
  const kv = (rows) => `<dl class="kv">${rows.filter((r) => r[1] !== "" && r[1] != null).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
  let h = `<h5>File</h5>` + kv([["Name", i.name], ["Container", i.formatLong || i.format], ["Size", bytes(i.size)], ["Duration", fmt(i.duration, true, true)], ["Bitrate", i.bitrate ? kbps(i.bitrate) : ""],
    ["Playback", player.cachePath ? "Remuxed (cached)" : { direct: "Native decode", remux: "Live remux", transcode: "Live conversion" }[player.mode] || player.mode]]);
  if (i.video) {
    const v = i.video;
    h += `<h5>Video</h5>` + kv([["Codec", `${codecName(v.codec_name)}${v.profile ? ` · ${v.profile}` : ""}`], ["Resolution", `${i.width} × ${i.height}${i.rotation ? ` (rotated ${i.rotation}°)` : ""}`],
      ["Frame rate", `${Math.round(i.fps * 1000) / 1000} fps`], ["Pixel format", v.pix_fmt], ["Bit depth", `${i.bits}-bit`], ["Color", [v.color_primaries, v.color_transfer, v.color_space].filter(Boolean).join(" / ")],
      ["HDR", i.hdr ? "Yes" : ""], ["Bitrate", v.bit_rate ? kbps(+v.bit_rate) : ""], ["Keyframes", state.keyframes.length ? `${state.keyframes.length} (every ~${(i.duration / state.keyframes.length).toFixed(1)} s)` : ""]]);
  }
  i.audio.forEach((a, n) => { h += `<h5>Audio ${n + 1}</h5>` + kv([["Track", trackLabel(a, n)], ["Sample rate", a.sample_rate ? `${(+a.sample_rate / 1000).toFixed(1)} kHz` : ""], ["Bitrate", a.bit_rate ? kbps(+a.bit_rate) : ""]]); });
  if (i.subs.length) h += `<h5>Subtitles</h5>` + kv(i.subs.map((s, n) => [`Track ${n + 1}`, trackLabel(s, n)]));
  $("infoBody").innerHTML = h;
}
function toggleInfo(force) { const p = $("infoPanel"); p.hidden = force != null ? !force : !p.hidden; if (!p.hidden) renderInfo(); }
$("mInfo").onclick = () => toggleInfo(true);
$("infoClose").onclick = () => toggleInfo(false);
$("mReveal").onclick = () => player.path && reveal(player.path);
$("mCopyPath").onclick = () => { if (player.path) { navigator.clipboard.writeText(player.path); Steez.toast("ok", "Path copied"); } };
$("mLoop").onclick = () => { settings.loop = !settings.loop; osd(settings.loop ? "Loop on" : "Loop off"); };
$("mTop").onclick = () => { settings.alwaysOnTop = !settings.alwaysOnTop; };
$("mShortcuts").onclick = () => app.openSettings?.("keys");

// ---------------------------------------------------------------- open buttons + recent + drag/drop
async function pickAndOpen() {
  const f = await openDialog({ multiple: false, filters: [{ name: "Videos", extensions: VIDEO_EXT }, { name: "All files", extensions: ["*"] }] });
  if (f) openFile(f);
}
app.pickAndOpen = pickAndOpen;
$("btnOpen").onclick = pickAndOpen; $("emptyOpen").onclick = pickAndOpen;

function renderRecent() {
  const r = (settings.recent || []).slice(0, 5);
  $("recentWrap").hidden = !r.length;
  $("recent").innerHTML = r.map((p) => `<button class="list-row" data-open="${esc(p)}"><span class="lbl">${esc(base(p))}</span><span class="val">${esc(p.split(/[\\/]/).slice(-2, -1)[0] || "")}</span></button>`).join("");
}
$("recent").addEventListener("click", (e) => { const b = e.target.closest("[data-open]"); if (b) openFile(b.dataset.open); });

function onDrag(p) {
  const type = p.type;
  if (type === "enter" || type === "over") { $("dropHint").hidden = false; $("dropSub").textContent = (p.paths?.length || 0) > 1 ? "Two files: compare them" : "Drop two files to compare them"; }
  else if (type === "leave") $("dropHint").hidden = true;
  else if (type === "drop") {
    $("dropHint").hidden = true;
    const files = (p.paths || []).filter(Boolean);
    if (files.length >= 2) app.startCompare?.(files[0], files[1]);
    else if (files[0]) openFile(files[0]);
  }
}

// ---------------------------------------------------------------- window chrome
const W = win();
$("winMin").onclick = () => W?.minimize();
$("winMax").onclick = () => W?.toggleMaximize();
$("winClose").onclick = () => { savePos(); W?.close(); };
W?.onResized?.(async () => {
  const max = await W.isMaximized().catch(() => false);
  $("winMax").querySelector("use").setAttribute("href", max ? "#i-win-restore" : "#i-win-max");
  if (state.stepping && cache.shown) cache.show(cache.shown);
});
async function toggleFull(force) {
  if (!W) { document.fullscreenElement ? document.exitFullscreen() : body.requestFullscreen(); return; }
  const fs = force ?? !(await W.isFullscreen());
  await W.setFullscreen(fs);
  body.classList.toggle("fullscreen", fs);
  $("btnFull").querySelector("use").setAttribute("href", fs ? "#i-fullscreen-exit" : "#i-fullscreen");
}
app.toggleFull = toggleFull;
$("btnFull").onclick = () => toggleFull();
document.addEventListener("visibilitychange", () => { if (document.hidden && settings.pauseOnMinimize && !video.paused) player.pause(); });

// ---------------------------------------------------------------- stage mouse
const stage = $("stage");
let clickTimer = 0;
stage.addEventListener("click", (e) => {
  if (body.dataset.mode !== "play" || e.target.closest(".empty-wrap")) return;
  if (!settings.clickPause) return;
  clearTimeout(clickTimer); clickTimer = setTimeout(togglePlay, 220);
});
stage.addEventListener("dblclick", (e) => {
  if (body.dataset.mode !== "play") return;
  clearTimeout(clickTimer);
  if (settings.dblClick === "fullscreen") toggleFull();
  else { const x = e.clientX / innerWidth; seekBy(x < 0.5 ? -settings.seekShort : settings.seekShort); }
});
stage.addEventListener("wheel", (e) => {
  if (body.dataset.mode !== "play") return;
  e.preventDefault();
  const dir = e.deltaY < 0 ? 1 : -1;
  if (settings.wheel === "volume") volBy(dir * settings.volumeStep / 100);
  else if (settings.wheel === "seek") seekBy(dir * settings.seekShort);
  else if (settings.wheel === "frame") stepFrame(dir);
}, { passive: false });

// ---------------------------------------------------------------- idle hide
let idleT = 0;
function poke() {
  body.classList.remove("idle");
  clearTimeout(idleT);
  const can = body.dataset.mode !== "empty" && !(body.dataset.mode === "play" && video.paused);
  if (can) idleT = setTimeout(() => {
    if (document.querySelector(".popup.open, dialog[open], .dock:hover, .titlebar:hover, .timeline.drag")) return poke();
    body.classList.add("idle"); $("tlHover").classList.remove("show");
  }, settings.hideDelay);
}
app.poke = poke;
addEventListener("pointermove", poke); addEventListener("pointerdown", poke); addEventListener("keydown", poke);

// ---------------------------------------------------------------- OSD
let osdT = 0;
function osd(text, ms = 900) {
  if (!settings.osd) return;
  const el = $("osd"); el.textContent = text; el.classList.add("show");
  clearTimeout(osdT); osdT = setTimeout(() => el.classList.remove("show"), ms);
}

// ---------------------------------------------------------------- keyboard
function combo(e) {
  const mods = [e.ctrlKey || e.metaKey ? "Ctrl" : "", e.altKey ? "Alt" : "", e.shiftKey ? "Shift" : ""].filter(Boolean);
  return [...mods, e.code].join("+");
}
app.combo = combo;
const ACTIONS = {
  playPause: togglePlay, framePrev: () => stepFrame(-1), frameNext: () => stepFrame(1),
  seekBack: () => seekBy(-settings.seekShort), seekFwd: () => seekBy(settings.seekShort),
  seekBackLong: () => seekBy(-settings.seekLong), seekFwdLong: () => seekBy(settings.seekLong),
  volUp: () => volBy(settings.volumeStep / 100), volDown: () => volBy(-settings.volumeStep / 100), mute: () => $("btnMute").click(),
  fullscreen: () => toggleFull(), speedDown: () => speedStep(-1), speedUp: () => speedStep(1), speedReset: () => setSpeed(1),
  trim: () => app.toggleTrim?.(), setIn: () => app.trimSetIn?.(), setOut: () => app.trimSetOut?.(), newSegment: () => app.trimAdd?.(),
  compress: () => app.openCompress?.(), compare: () => app.openCompare?.(), snapshot, loop: () => $("mLoop").click(), info: () => toggleInfo(),
  open: pickAndOpen, settings: () => app.openSettings?.(),
  close: async () => {
    if (!$("infoPanel").hidden) return toggleInfo(false);
    if (body.classList.contains("fullscreen")) return toggleFull(false);
    if (app.trimOn?.()) return app.toggleTrim(false);
    if (body.dataset.mode === "compare") return app.exitCompare?.();
  },
};
const PLAYER_ONLY = new Set(["framePrev", "frameNext", "seekBack", "seekFwd", "seekBackLong", "seekFwdLong", "trim", "setIn", "setOut", "newSegment", "compress", "snapshot", "info"]);
addEventListener("keydown", (e) => {
  if (app.capturingKey) return;
  if (e.target.closest("input, textarea, select, [contenteditable]") && !e.target.matches('input[type="range"]')) return;
  if (document.querySelector("dialog[open]") && e.code !== "Escape") return;
  const c = combo(e);
  const keys = settings.keys;
  for (const [act, list] of Object.entries(keys)) {
    if (!list?.includes(c)) continue;
    if (act === "close" && document.querySelector("dialog[open], .popup.open")) return; // Steez closes those
    if (body.dataset.mode === "compare" && app.compareKey?.(act)) { e.preventDefault(); return; }
    if (PLAYER_ONLY.has(act) && body.dataset.mode !== "play") return;
    if (act === "info" && body.dataset.mode !== "play") return;
    e.preventDefault();
    ACTIONS[act]?.(e);
    return;
  }
  if (/^Digit[0-9]$/.test(e.code) && !e.ctrlKey && !e.altKey && body.dataset.mode === "play" && player.duration) { app.seek(player.duration * (+e.code.slice(5) / 10)); }
  if (e.key === "?" ) app.openSettings?.("keys");
});

addEventListener("resize", () => { if (state.stepping && cache.shown) cache.show(cache.shown); });

// ---------------------------------------------------------------- jobs
listen("jobs:update", renderJobs);
listen("jobs:finished", (j) => {
  if (j.state === "done") {
    const r = j.result || {};
    let msg = `${j.label.split(" · ")[0]} finished`;
    if (r.size && r.inputSize) msg += ` · ${bytes(r.size)} (${Math.round((1 - r.size / r.inputSize) * 100)}% smaller)`;
    if (r.vmaf != null) msg += ` · VMAF ${(+r.vmaf).toFixed(1)}`;
    Steez.toast("ok", msg, { action: "Show", onAction: () => reveal(j.output), ms: 7000 });
  } else if (j.state === "error") Steez.toast("err", `${j.label} failed: ${j.error}`, { ms: 9000 });
});
function renderJobs(list) {
  const active = list.filter((j) => j.state === "running" || j.state === "queued");
  $("btnJobs").hidden = !list.length;
  const cnt = $("jobCount");
  const n = active.length || list.length;
  if (cnt.textContent !== String(n)) { cnt.textContent = String(n); cnt.classList.remove("bump"); void cnt.offsetWidth; cnt.classList.add("bump"); }
  cnt.hidden = !active.length;
  $("jobs").innerHTML = list.length ? list.slice().reverse().map((j) => {
    const pct = Math.round(j.progress * 100);
    const tone = { done: "tone-ok", error: "tone-err", cancelled: "", queued: "", running: "tone-info" }[j.state];
    const st = { done: "Done", error: "Failed", cancelled: "Cancelled", queued: "Queued", running: `${pct}%` }[j.state];
    const r = j.result || {};
    const extra = j.state === "done" && r.size ? `${bytes(r.size)}${r.inputSize ? ` · ${Math.round((1 - r.size / r.inputSize) * 100)}% smaller` : ""}${r.vmaf != null ? ` · VMAF ${(+r.vmaf).toFixed(1)}` : ""}` : j.state === "error" ? esc(j.error || "") : esc(j.detail || "");
    const act = j.state === "running" || j.state === "queued" ? `<button class="btn btn--plain btn--sm pressable" data-cancel="${j.id}">Cancel</button>`
      : j.state === "done" && j.output ? `<button class="btn btn--plain btn--sm pressable" data-reveal="${esc(j.output)}">Show</button>` : "";
    if (j.state === "done" && !r.size && r.outputs?.length > 1) j.detail = `${r.outputs.length} files`;
    return `<div class="job"><div class="row"><span class="name">${esc(j.label)}</span><span class="badge ${tone}">${st}</span></div>
      ${j.state === "running" ? `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-label="${esc(j.label)}"><span style="--p:${j.progress}"></span></div>` : ""}
      <div class="meta"><span>${extra}</span>${act}</div></div>`;
  }).join("") : `<div class="empty-note">Trims and compressions show up here.</div>`;
}
$("jobs").addEventListener("click", (e) => {
  const c = e.target.closest("[data-cancel]"); if (c) invoke("job_cancel", { id: c.dataset.cancel });
  const r = e.target.closest("[data-reveal]"); if (r) reveal(r.dataset.reveal);
});
$("jobsClear").onclick = () => invoke("jobs_clear");
invoke("jobs_list").then(renderJobs).catch(() => {});

window.svp = app; // handy for debugging in devtools
void caps;
