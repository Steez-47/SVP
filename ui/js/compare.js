// SVP · compare: two videos scaled into the same rect, a draggable split line, synced transport,
// wheel zoom + pan (pixelated past 2×) for judging compression.
import { invoke, openDialog, VIDEO_EXT } from "./api.js";
import { Player } from "./player.js";
import { $, base, bytes, kbps, codecName, clamp, esc, fmt } from "./util.js";

export function initCompare(app) {
  const body = document.body;
  const view = $("cmpView"), vA = $("cmpA"), vB = $("cmpB");
  const A = new Player(vA), B = new Player(vB);
  const pick = { a: "", b: "" };
  let split = 0.5, z = 1, px = 0, py = 0, fit = { x: 0, y: 0, w: 0, h: 0 };
  let frameA = 0, syncTimer = 0, active = false;
  vB.muted = true;
  // B is silent, so let it resample instead of time-stretch: with pitch preservation on, Chromium's
  // time-stretcher loses ~20-30 ms on every rate change and B's sync corrections went nowhere.
  vB.preservesPitch = false;
  // A carries the audio and follows the main volume/mute (slider, wheel, keys all drive the main <video>).
  const main = app.player.v;
  const syncVolume = () => { vA.volume = main.volume; vA.muted = main.muted; vB.muted = true; };
  main.addEventListener("volumechange", () => active && syncVolume());

  // ---------------------------------------------------------------- picker dialog
  async function setSlot(slot, path) {
    pick[slot] = path || "";
    const el = $(slot === "a" ? "pickA" : "pickB");
    el.classList.toggle("set", !!path);
    el.querySelector(".pick-name").textContent = path ? base(path) : "Choose video";
    el.querySelector(".pick-sub").textContent = "";
    if (path) invoke("file_info", { path }).then((i) => { if (pick[slot] === path) el.querySelector(".pick-sub").textContent = bytes(i.size); }).catch(() => {});
    $("cmpGo").disabled = !(pick.a && pick.b);
  }
  async function choose(slot) {
    const f = await openDialog({ multiple: false, filters: [{ name: "Videos", extensions: VIDEO_EXT }] });
    if (f) setSlot(slot, f);
  }
  function openPicker() {
    if (!pick.a && app.player.path) setSlot("a", app.player.path);
    Steez.openDialog("d-compare");
  }
  $("pickA").onclick = () => choose("a");
  $("pickB").onclick = () => choose("b");
  $("pickSwap").onclick = () => { const a = pick.a, b = pick.b; setSlot("a", b); setSlot("b", a); };
  $("cmpGo").onclick = () => { Steez.closeDialog("d-compare"); start(pick.a, pick.b); };
  $("btnCompare").onclick = () => (active ? exit() : openPicker());
  $("emptyCompare").onclick = openPicker;

  // ---------------------------------------------------------------- start / exit
  async function start(a, b) {
    if (!a || !b) return;
    setSlot("a", a); setSlot("b", b);
    app.player.pause();
    if (app.trimOn?.()) app.toggleTrim(false);
    active = true;
    $("compare").hidden = false;
    app.setMode("compare");
    $("btnCompare").setAttribute("aria-pressed", "true");
    z = 1; px = py = 0; setSplit(0.5);
    $("title").textContent = `${base(a)}  vs  ${base(b)}`;
    $("badges").innerHTML = "";
    const ready = (p) => new Promise((r) => { const f = () => { p.removeEventListener("ready", f); r(); }; p.addEventListener("ready", f); });
    const ra = ready(A), rb = ready(B);
    vA.muted = vB.muted = true; // silent until both are ready
    A.open(a, { autoplay: false }); B.open(b, { autoplay: false });
    A.addEventListener("info", tags, { once: true }); B.addEventListener("info", tags, { once: true });
    await Promise.all([ra, rb]);
    layout();
    app.tl.setDuration(Math.min(A.duration || Infinity, B.duration || Infinity), A.info?.fps || 30, []);
    app.tl.loadThumbs(a, A.info);
    syncVolume();
    frameA = 0; resetSync();
    watchFrames();
    app.refreshTime();
    // warn on mismatched lengths (offset compressions etc.)
    if (A.info && B.info && Math.abs(A.duration - B.duration) > 0.5) Steez.toast("info", `Lengths differ by ${fmt(Math.abs(A.duration - B.duration), false, true)}. Playback stays aligned from 0:00.`);
  }
  function tags() {
    const t = (p, k) => {
      const i = p.info; if (!i) return k;
      const v = i.video;
      return [k, i.name, bytes(i.size), v ? codecName(v.codec_name) : "", v ? `${i.width}×${i.height}` : "", i.bitrate ? kbps(i.bitrate) : ""].filter(Boolean).join(" · ");
    };
    $("cmpTagA").textContent = t(A, "A"); $("cmpTagB").textContent = t(B, "B");
    $("cmpTagA").title = $("cmpTagA").textContent; $("cmpTagB").title = $("cmpTagB").textContent;
  }
  function exit() {
    if (!active) return;
    active = false;
    A.close(); B.close();
    $("compare").hidden = true;
    $("btnCompare").setAttribute("aria-pressed", "false");
    clearInterval(syncTimer); endPulse(); resetSync();
    if (app.player.path) {
      app.setMode("play");
      $("title").textContent = base(app.player.path);
      const i = app.player.info; app.tl.setDuration(i?.duration || 0, i?.fps || 30, i?.chapters || []); app.tl.loadThumbs(app.player.path, i);
      app.refreshTime();
    } else { app.setMode("empty"); $("title").textContent = "Steez Video Player"; }
  }

  // ---------------------------------------------------------------- layout, zoom, split
  function layout() {
    const r = view.getBoundingClientRect();
    const aw = vA.videoWidth || A.info?.width || 16, ah = vA.videoHeight || A.info?.height || 9;
    const s = Math.min(r.width / aw, r.height / ah);
    fit = { w: aw * s, h: ah * s, x: (r.width - aw * s) / 2, y: (r.height - ah * s) / 2 };
    for (const v of [vA, vB]) Object.assign(v.style, { left: `${fit.x}px`, top: `${fit.y}px`, width: `${fit.w}px`, height: `${fit.h}px` });
    applyZoom();
  }
  function applyZoom() {
    const tf = `translate(${px}px, ${py}px) scale(${z})`;
    vA.style.transform = vB.style.transform = tf;
    const pix = z >= 2 ? "pixelated" : "auto";
    vA.style.imageRendering = vB.style.imageRendering = pix;
  }
  function setSplit(f) {
    split = clamp(f, 0, 1);
    view.style.setProperty("--split", `${split * 100}%`);
    $("cmpHandle").setAttribute("aria-valuenow", String(Math.round(split * 100)));
  }
  addEventListener("resize", () => active && layout());
  vA.addEventListener("loadedmetadata", () => active && layout());

  let drag = null;
  view.addEventListener("pointerdown", (e) => {
    if (!active) return;
    const r = view.getBoundingClientRect();
    if (e.button === 0 && !e.shiftKey) { drag = { kind: "split" }; view.classList.add("drag"); setSplit((e.clientX - r.left) / r.width); }
    else { drag = { kind: "pan", x: e.clientX, y: e.clientY, px, py }; }
    view.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  view.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = view.getBoundingClientRect();
    if (drag.kind === "split") setSplit((e.clientX - r.left) / r.width);
    else { px = drag.px + (e.clientX - drag.x); py = drag.py + (e.clientY - drag.y); applyZoom(); }
  });
  const end = () => { drag = null; view.classList.remove("drag"); };
  view.addEventListener("pointerup", end); view.addEventListener("pointercancel", end);
  view.addEventListener("contextmenu", (e) => e.preventDefault());
  view.addEventListener("wheel", (e) => {
    if (!active) return;
    e.preventDefault();
    const r = view.getBoundingClientRect();
    const cx = e.clientX - r.left - fit.x, cy = e.clientY - r.top - fit.y;
    const nz = clamp(z * (e.deltaY < 0 ? 1.18 : 1 / 1.18), 1, 16);
    const lx = (cx - px) / z, ly = (cy - py) / z;
    z = nz; px = cx - lx * z; py = cy - ly * z;
    if (z === 1) { px = py = 0; }
    applyZoom();
    app.osd(`Zoom ${Math.round(z * 100)}%`, 600);
  }, { passive: false });
  view.addEventListener("dblclick", () => { z = 1; px = py = 0; applyZoom(); app.osd("Fit"); });
  $("cmpHandle").addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { setSplit(split - 0.02); e.preventDefault(); e.stopPropagation(); }
    if (e.key === "ArrowRight") { setSplit(split + 0.02); e.preventDefault(); e.stopPropagation(); }
  });

  // ---------------------------------------------------------------- synced transport
  // Sync on what is actually on screen, not currentTime: the two decoders (HW HEVC vs SW AV1, direct vs
  // live stream) have different presentation latency, so equal currentTimes still showed B a frame late.
  // rVFC fires once per newly presented frame; per video we average
  //   phase = sourceTime(frame) - displayTime(frame) * rate
  // over a short window. Both videos run off the same clock, so once the phases match they stay matched:
  // a whole-frame mismatch is fixed with one timed playbackRate pulse on B, then we settle and measure again.
  // (Continuous rate steering oscillated, because Chromium applies rate changes with a lag.)
  const SETTLE = 300, WINDOW = 800;
  const ph = { a: [], b: [] }, off = { a: 0, b: 0 };
  let measureFrom = 0, pulseTimer = 0;
  const tok = { a: 0, b: 0 };
  const resetSync = (settle = SETTLE) => { ph.a = []; ph.b = []; measureFrom = performance.now() + settle; };
  const endPulse = () => { if (pulseTimer) { clearTimeout(pulseTimer); pulseTimer = 0; vB.playbackRate = vA.playbackRate; } };
  // one rVFC chain per video; a new src (live restart, cache swap) cancels pending callbacks, so re-arm on loadeddata
  function track(key) {
    const p = key === "a" ? A : B, v = p.v, t = ++tok[key];
    const cb = (now, m) => {
      if (!active || t !== tok[key]) return;
      const src = m.mediaTime + (p.live ? p.offset : 0);
      if (key === "a") frameA = src;
      if (off[key] !== p.offset) { off[key] = p.offset; resetSync(); }
      if (!v.paused && !v.seeking && !pulseTimer && now >= measureFrom) ph[key].push(src - (m.expectedDisplayTime / 1000) * vA.playbackRate);
      v.requestVideoFrameCallback(cb);
    };
    v.requestVideoFrameCallback(cb);
  }
  function watchFrames() { track("a"); track("b"); }
  vA.addEventListener("loadeddata", () => active && track("a"));
  vB.addEventListener("loadeddata", () => active && track("b"));
  for (const v of [vA, vB]) for (const ev of ["seeking", "emptied", "loadstart"]) v.addEventListener(ev, () => resetSync());

  // trimmed mean: robust to the odd late frame, but still averages 3:2 cadences (24p on 60 Hz) properly
  const tmean = (xs) => { const s = [...xs].sort((x, y) => x - y), k = Math.floor(s.length / 5), m = s.slice(k, s.length - k); return m.reduce((a, x) => a + x, 0) / m.length; };
  function tick() {
    if (!active || vA.paused || pulseTimer) return;
    const rate = vA.playbackRate, fd = 1 / (A.info?.fps || 30);
    if (vB.paused && !vB.seeking) B.play();
    if (Math.abs(A.time - B.time) > 0.5) { vB.playbackRate = rate; B.seek(A.time + 0.05 * rate); resetSync(); return; }
    if (performance.now() - measureFrom < WINDOW || ph.a.length < 8 || ph.b.length < 8) return;
    const d = tmean(ph.a) - tmean(ph.b), c = A.time - B.time; // > 0: B is behind
    // the presented-frame phase only refines currentTime by a few frames of decoder latency; a bigger
    // disagreement is a start-up transient (a decoder still catching up), so measure again
    if (Math.abs(d - c) > Math.max(0.12, 4 * fd)) { resetSync(0); return; }
    // Only whole-frame errors are corrected. A smaller one means B's cadence locked onto the other vsync
    // phase (30 fps on 60 Hz holds each frame for 2 vsyncs); rate pulses can't move that, so leave it.
    if (Math.abs(d) < fd * 0.75) { resetSync(0); return; }
    // a gentle pulse of >= 0.5 s: shorter rate blips are partly swallowed by the media pipeline
    const k = clamp(Math.abs(d) / 0.5, 0.01, 0.12), ms = Math.min(4000, (Math.abs(d) / (k * rate)) * 1000);
    vB.playbackRate = rate * (1 + k * Math.sign(d));
    pulseTimer = setTimeout(() => { pulseTimer = 0; vB.playbackRate = vA.playbackRate; resetSync(); }, ms);
  }
  vA.addEventListener("play", () => {
    if (!active) return;
    endPulse(); resetSync(400);
    vB.playbackRate = vA.playbackRate;
    // both were parked on the same frame by the pause handler: start together, only re-seek if they drifted
    if (Math.abs(A.time - B.time) > 1 / (A.info?.fps || 30)) B.seek(A.time);
    B.play();
    clearInterval(syncTimer);
    syncTimer = setInterval(tick, 100);
  });
  vA.addEventListener("pause", () => {
    if (!active) return;
    clearInterval(syncTimer); endPulse();
    B.pause(); vB.playbackRate = vA.playbackRate;
    // park B on A's displayed frame (mid-frame target, robust to small pts offsets between files)
    const fd = 1 / (A.info?.fps || 30);
    setTimeout(() => { if (active && vA.paused) B.seek((frameA || A.time) + fd * 0.5); }, 40);
  });
  vA.addEventListener("ratechange", () => { endPulse(); vB.playbackRate = vA.playbackRate; resetSync(); });
  for (const ev of ["play", "seeked", "loadeddata"]) vA.addEventListener(ev, () => active && app.refreshTime());
  for (const ev of ["play", "pause"]) vA.addEventListener(ev, () => {
    const b = $("btnPlay"); if (!active) return;
    b.querySelector("use").setAttribute("href", vA.paused ? "#i-play" : "#i-pause");
  });

  const cmp = {
    get active() { return active; },
    toggle() { vA.paused ? A.play() : A.pause(); },
    paused: () => vA.paused,
    fps: () => A.info?.fps || 30,
    time: () => (vA.paused ? frameA || A.time : A.time),
    duration: () => Math.min(A.duration || Infinity, B.duration || Infinity) || 0,
    seek(t) { A.seek(t); B.seek(t); frameA = t; app.refreshTime(); },
    async step(dir) {
      if (!vA.paused) { A.pause(); await new Promise((r) => setTimeout(r, 30)); }
      const fd = 1 / (A.info?.fps || 30);
      const t = clamp((frameA || A.time) + dir * fd, 0, cmp.duration());
      frameA = t;
      A.seek(t + fd * 0.5); B.seek(t + fd * 0.5);
      app.refreshTime();
    },
    buffered: () => vA.buffered,
  };
  app.cmp = cmp;
  app.startCompare = start;
  app.exitCompare = exit;
  app.openCompare = () => (active ? exit() : openPicker());
  app.compareKey = (act) => {
    if (act === "close" || act === "compare") { exit(); return true; }
    if (act === "playPause") { cmp.toggle(); return true; }
    if (act === "framePrev" || act === "frameNext") { cmp.step(act === "frameNext" ? 1 : -1); return true; }
    if (act === "seekBack" || act === "seekFwd") { cmp.seek(cmp.time() + (act === "seekFwd" ? 5 : -5)); return true; }
    return false;
  };
  void esc;
}
