// SVP · diagnostics. `SVP_LOG=1 svp file.mp4` prints the playback path, media events and once-a-second
// frame rates to stderr (WebKitGTK has no CDP, so scripts/cdp.mjs can't reach it).
// `SVP_LOG=pin` also keeps the controls on screen, to measure the glass over a playing video, and the
// value can script the player (see the end of this file).
import { invoke } from "./api.js";

export function initDiag(app, flags) {
  const { player } = app, v = player.v, t0 = performance.now();
  const log = (m) => invoke("debug_log", { msg: `${((performance.now() - t0) / 1000).toFixed(2).padStart(7)} ${m}` }).catch(() => {});
  for (const ev of ["mode", "busy", "ready", "fail", "mediaerror"]) player.addEventListener(ev, (e) => log(`player ${ev} ${e.detail ?? ""}`));
  const ranges = (r) => Array.from({ length: r.length }, (_, k) => `${r.start(k).toFixed(1)}-${r.end(k).toFixed(1)}`).join(",");
  // WebKitGTK: reading `seekable` before the metadata is in makes it cache the current position as the
  // duration for good, so the log itself must not ask early.
  const seekable = () => (v.readyState ? ranges(v.seekable) : "");
  for (const ev of ["loadstart", "loadedmetadata", "durationchange", "canplay", "playing", "waiting", "stalled", "seeking", "seeked", "pause", "ended", "error", "resize"]) {
    v.addEventListener(ev, () => log(`video ${ev} t=${v.currentTime.toFixed(2)} ready=${v.readyState} ${v.videoWidth}x${v.videoHeight}`
      + ` dur=${v.duration} buffered=[${ranges(v.buffered)}] seekable=[${seekable()}]${v.error ? ` error=${v.error.code} ${v.error.message}` : ""}`));
  }
  const cmpV = (id) => { const e = document.getElementById(id); return `${e.currentTime.toFixed(2)}${e.paused ? "p" : ""}/${e.videoWidth}x${e.videoHeight}`; };
  let ui = 0, shown = 0, worst = 0, last = performance.now();
  (function tick(now) { ui++; worst = Math.max(worst, now - last); last = now; requestAnimationFrame(tick); })(last);
  const onFrame = () => { shown++; v.requestVideoFrameCallback(onFrame); };
  v.requestVideoFrameCallback(onFrame);
  setInterval(() => {
    const q = v.getVideoPlaybackQuality?.() || {};
    log(`fps ui=${ui} video=${shown} worst=${Math.round(worst)}ms dropped=${q.droppedVideoFrames ?? "?"}/${q.totalVideoFrames ?? "?"} t=${v.currentTime.toFixed(2)}`
      + ` dur=${Number(v.duration).toFixed(1)} buffered=[${ranges(v.buffered)}] mode=${player.mode}${v.paused ? " paused" : ""}${document.body.classList.contains("idle") ? " idle" : ""}`
      + (app.cmp?.active ? ` cmp a=${cmpV("cmpA")} b=${cmpV("cmpB")}` : ""));
    ui = shown = worst = 0;
  }, 1000);
  if (String(flags).includes("pin")) setInterval(() => app.poke(), 500);
  // scripted actions, e.g. SVP_LOG="seek@5=600 pause@8 step@9=1 play@12": <action>@<seconds after start>[=<value>]
  const c = () => app.cmp?.active && app.cmp; // in compare mode the actions drive both videos
  const acts = { seek: (x) => (c() ? c().seek(x) : app.seek(x)),
    pause: () => (c() ? c().paused() || c().toggle() : player.pause()), play: () => (c() ? c().paused() && c().toggle() : player.play()),
    step: (x) => (c() ? c().step(x < 0 ? -1 : 1) : app.stepFrame(x < 0 ? -1 : 1)),
    ring: (x) => { app.settings.ringFrames = x; }, full: (x) => app.toggleFull(!!x),
    cmp: () => app.startCompare(player.path, player.path) };
  for (const [all, act, at, val] of String(flags).matchAll(/(\w+)@([\d.]+)(?:=(-?[\d.]+))?/g)) {
    if (acts[act]) setTimeout(() => { log(`do ${all}`); acts[act](+val); }, at * 1000);
  }
  log(`diag on · ${navigator.userAgent}`);
}
