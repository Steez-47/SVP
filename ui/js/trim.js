// SVP · trim mode: segments on the timeline, I/O/N keys, lossless (keyframe) vs exact cuts,
// cut preview (playback skips removed parts), export through the Rust trim engine.
import { invoke } from "./api.js";
import { settings } from "./settings.js";
import { $, fmt } from "./util.js";

export function initTrim(app) {
  const { tl, player, state } = app;
  let on = false, segs = [], active = 0;
  const mode = () => $("trimMode").querySelector('[aria-checked="true"]')?.dataset.value || "lossless";

  function setMode(m) {
    $("trimMode").querySelectorAll("[role=radio]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.value === m)));
    Steez.init($("trimbar"));
  }

  function toggle(force) {
    if (!player.info) return;
    on = force ?? !on;
    $("trimbar").hidden = !on;
    $("btnTrim").setAttribute("aria-pressed", String(on));
    if (on) {
      if (!segs.length || segs[0]._path !== player.path) { segs = [{ start: 0, end: player.duration, _path: player.path }]; active = 0; }
      setMode(settings.trimMode);
      requestAnimationFrame(() => Steez.init($("trimbar")));
    }
    tl.setTrim(on);
    render();
    app.poke();
  }

  function snappedStart(t) {
    const k = app.keyframes(); if (!k.length) return null;
    let s = 0; for (const x of k) { if (x <= t + 1e-3) s = x; else break; }
    return s;
  }

  function render() {
    tl.setSegments(segs, active);
    const lossless = mode() === "lossless";
    tl.setSnapped(lossless ? segs.map((s) => snappedStart(s.start)) : null);
    const total = segs.reduce((a, s) => a + (s.end - s.start), 0);
    const hrs = player.duration >= 3600;
    const a = segs[active];
    const real = lossless ? segs.reduce((acc, s) => acc + (s.end - (snappedStart(s.start) ?? s.start)), 0) : total;
    const lead = real - total > 0.05 ? ` (${fmt(real, hrs)} with keyframe lead-in)` : "";
    $("trimInfo").textContent = !a ? "" : segs.length > 1
      ? `${segs.length} segments · ${fmt(total, hrs)} kept${lead}`
      : `${fmt(a.start, hrs, true)} → ${fmt(a.end, hrs, true)} · ${fmt(a.end - a.start, hrs, true)}${lead}`;
    const snap = lossless && a ? snappedStart(a.start) : null;
    $("trimInfo").dataset.tip = snap != null && snap < a.start - 0.01 ? `Lossless cuts begin on a keyframe: this segment really starts at ${fmt(snap, hrs, true)}` : "";
  }

  function setIn() {
    if (!on) toggle(true);
    const t = app.currentTime(), s = segs[active]; if (!s) return;
    s.start = Math.min(t, s.end - 1 / (player.info?.fps || 30));
    if (s.start < 0) s.start = 0;
    render(); app.osd(`Start ${fmt(s.start, false, true)}`);
  }
  function setOut() {
    if (!on) toggle(true);
    const t = app.currentTime(), s = segs[active]; if (!s) return;
    s.end = Math.max(t, s.start + 1 / (player.info?.fps || 30));
    render(); app.osd(`End ${fmt(s.end, false, true)}`);
  }
  function add() {
    if (!on) toggle(true);
    const t = app.currentTime(), d = player.duration;
    // if the playhead sits inside a segment, split it there; otherwise start a new one
    const i = segs.findIndex((s) => t > s.start + 0.05 && t < s.end - 0.05);
    if (i >= 0) { const s = segs[i]; segs.splice(i + 1, 0, { start: t, end: s.end, _path: player.path }); s.end = t; active = i + 1; app.osd("Split segment"); }
    else {
      const next = segs.filter((s) => s.start > t).sort((a, b) => a.start - b.start)[0];
      segs.push({ start: t, end: Math.min(next ? next.start : d, t + Math.max(5, d * 0.1)), _path: player.path });
      segs.sort((a, b) => a.start - b.start); active = segs.findIndex((s) => s.start === t);
      app.osd("New segment");
    }
    render();
  }
  function removeActive() {
    if (segs.length <= 1) { segs = [{ start: 0, end: player.duration, _path: player.path }]; active = 0; }
    else { segs.splice(active, 1); active = Math.max(0, active - 1); }
    render();
  }

  async function exportCut() {
    if (!segs.length) return;
    const merge = settings.trimMerge;
    const m = mode();
    const s0 = player.info?.start || 0;
    const id = await invoke("trim_start", { opts: {
      input: player.path, outDir: settings.outDir || null, mode: m, merge, format: null,
      segments: [...segs].sort((a, b) => a.start - b.start).map((s) => ({ start: s.start + s0, end: s.end + s0 })),
    } }).catch((e) => { Steez.toast("err", `Couldn't start the export: ${e}`); return null; });
    if (id) Steez.toast("info", m === "lossless" ? "Cutting losslessly…" : "Cutting frame-exact…");
  }

  // ---- wiring
  $("btnTrim").onclick = () => toggle();
  $("trimClose").onclick = () => toggle(false);
  $("trimIn").onclick = setIn; $("trimOut").onclick = setOut; $("trimAdd").onclick = add;
  $("trimExport").onclick = exportCut;
  $("trimMode").addEventListener("stz:change", () => { settings.trimMode = mode(); render(); });
  $("trimMode").addEventListener("click", () => setTimeout(() => { settings.trimMode = mode(); render(); }, 0));
  const syncMerge = () => $("m-trimx").querySelectorAll("[data-merge]").forEach((b) => b.setAttribute("aria-checked", String((b.dataset.merge === "1") === !!settings.trimMerge)));
  syncMerge();
  $("m-trimx").addEventListener("click", (e) => { const b = e.target.closest("[data-merge]"); if (b) { settings.trimMerge = b.dataset.merge === "1"; syncMerge(); } });
  $("trimClear").onclick = () => { segs = [{ start: 0, end: player.duration, _path: player.path }]; active = 0; render(); };
  $("trimToCompress").onclick = () => app.openCompress?.({ useTrim: true });
  tl.addEventListener("segselect", (e) => { active = e.detail; render(); });
  tl.addEventListener("segmove", (e) => { app.seek(e.detail.t); render(); });
  tl.addEventListener("segchange", () => render());
  addEventListener("keydown", (e) => {
    if (!on || e.target.closest("input, textarea, select") || document.querySelector("dialog[open]")) return;
    if (e.code === "Delete") { e.preventDefault(); removeActive(); }
  });

  // cut preview: while trimming and playing, skip the parts that will be removed
  (function watch() {
    if (on && !player.paused && segs.length && settings.trimPreview !== false) {
      const t = player.time, sorted = [...segs].sort((a, b) => a.start - b.start);
      const inside = sorted.some((s) => t >= s.start - 0.02 && t < s.end);
      if (!inside) {
        const next = sorted.find((s) => s.start > t);
        if (next) player.seek(next.start); else { player.pause(); app.seek(sorted[sorted.length - 1].end); }
      }
    }
    setTimeout(watch, 40);
  })();

  app.toggleTrim = toggle; app.trimSetIn = setIn; app.trimSetOut = setOut; app.trimAdd = add; app.trimOn = () => on;
  app.trimSelection = () => (segs.length ? [...segs].sort((a, b) => a.start - b.start) : null);
  app.onKeyframes = () => { if (on) render(); };
  const prevOpen = app.onOpen;
  app.onOpen = (p) => { prevOpen?.(p); if (on) toggle(false); segs = []; };
  void state;
}
