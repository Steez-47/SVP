// SVP · settings dialog. Panes are generated from a schema into Steez list rows (STZ 7.1.01) with
// switches (2.1), native selects (3.4.02), sliders (2.6.01), theme buttons (8.1.01), appearance (8.2.01),
// rebindable shortcuts and a hold-to-confirm reset (1.5.02).
import { invoke, openDialog, isWindows } from "./api.js";
import { settings, onSetting, resetSettings, DEFAULT_KEYS, KEY_LABELS } from "./settings.js";
import { caps } from "./player.js";
import { $, esc, bytes } from "./util.js";
import { aboutPane } from "./updates.js";

const sel = (opts) => ({ type: "select", opts });
const S = (n) => [n, `${n} s`];
const SECTIONS = {
  playback: [
    ["h", "Opening files"],
    ["autoplay", "switch", "Play when opened"],
    ["resume", "switch", "Resume where you left off", "Remembers the position of the last 200 files"],
    ["rememberSpeed", "switch", "Keep playback speed between files"],
    ["loop", "switch", "Loop"],
    ["h", "Seeking"],
    ["seekShort", sel([S(1), S(2), S(3), S(5), S(10)]), "Arrow keys jump", "Hold Shift for the long jump"],
    ["seekLong", sel([S(10), S(15), S(30), S(60), S(120)]), "Shift + arrow jumps"],
    ["h", "Mouse"],
    ["wheel", sel([["volume", "Volume"], ["seek", "Seek"], ["frame", "Step frames"], ["none", "Nothing"]]), "Scroll wheel over video"],
    ["clickPause", "switch", "Click video to play / pause"],
    ["dblClick", sel([["fullscreen", "Fullscreen"], ["seek", "Seek back / forward by side"]]), "Double-click video"],
    ["volumeStep", sel([[2, "2%"], [5, "5%"], [10, "10%"]]), "Volume step"],
    ["pauseOnMinimize", "switch", "Pause when minimized"],
  ],
  frames: [
    ["note", "SVP keeps decoded frames around the playhead so , and . step instantly in both directions, even across long keyframe gaps."],
    ["h", "Frame cache"],
    ["cacheBack", { type: "range", min: 1, max: 10, step: 1, suffix: " s" }, "Decode behind the playhead"],
    ["cacheFwd", { type: "range", min: 1, max: 10, step: 1, suffix: " s" }, "Decode ahead of the playhead"],
    ["cacheRes", sel([["display", "Window size (sharp)"], ["half", "Half (lighter)"], ["source", "Full source"]]), "Cached frame resolution"],
    ["ringFrames", sel([[0, "Off"], [30, "30 frames"], [45, "45 frames"], [90, "90 frames"], [180, "180 frames"]]), "Remember frames while playing", "Makes the first steps back after pausing instant"],
    ["stats"],
  ],
  interface: [
    ["h", "Controls"],
    ["hideDelay", sel([[1000, "1 s"], [1800, "2 s"], [3000, "3 s"], [5000, "5 s"], [600000, "Never"]]), "Hide controls after"],
    ["timeMode", sel([["elapsed", "Elapsed"], ["remaining", "Remaining"], ["frames", "Timecode (HH:MM:SS:FF)"]]), "Time display"],
    ["showThumbs", "switch", "Timeline previews", "Thumbnails while hovering the timeline"],
    ["showBadges", "switch", "Format badges in the title bar"],
    ["osd", "switch", "On-screen messages", "Volume, speed and seek feedback"],
    ["alwaysOnTop", "switch", "Always on top"],
  ],
  appearance: [["theme"], ["prefs"]],
  export: [
    ["outdir"],
    ["h", "Trim"],
    ["trimMode", sel([["lossless", "Lossless (keyframe start)"], ["precise", "Frame-exact (re-encode)"]]), "Default cut"],
    ["trimMerge", "switch", "Join segments into one file"],
    ["h", "Compression defaults"],
    ["cxCodec", sel([["h264", "H.264"], ["hevc", "H.265 / HEVC"], ["av1", "AV1"]]), "Codec"],
    ["cxEncoder", sel([["auto", "Automatic"], ["cpu", "CPU"], ["nvenc", "NVIDIA NVENC"], ["amf", "AMD AMF"], ["qsv", "Intel Quick Sync"]]), "Encoder"],
    ["cxSpeed", sel([["fast", "Fast"], ["balanced", "Balanced"], ["slow", "Slow (smaller)"]]), "Encoding speed"],
    ["cxAudio", sel([["copy", "Keep original"], ["aac-192", "AAC 192 kbps"], ["aac-128", "AAC 128 kbps"], ["opus-128", "Opus 128 kbps"], ["none", "Remove"]]), "Audio"],
    ["cxVmaf", "switch", "Measure quality (VMAF) after compressing"],
    ["h", "Frames"],
    ["snapFormat", sel([["png", "PNG (lossless)"], ["jpg", "JPEG"], ["webp", "WebP (lossless)"]]), "Saved frame format"],
  ],
  keys: [["keys"]],
  engine: [["engine"]],
  about: [["about"]],
};

export function initSettings(app) {
  const panes = $("setPanes");
  let current = "playback";

  function row(key, ctl, label, sub) {
    const id = `set-${key}`;
    const lbl = `<span class="lbl">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ""}</span>`;
    const v = settings[key];
    if (ctl === "switch") return `<div class="list-row">${lbl}<button type="button" class="switch" role="switch" aria-checked="${!!v}" aria-label="${esc(label)}" data-set="${key}"><span class="knob"></span></button></div>`;
    if (ctl.type === "select") return `<div class="list-row">${lbl}<select class="input input--plain" id="${id}" data-set="${key}" aria-label="${esc(label)}">${ctl.opts.map(([val, t]) => `<option value="${val}" ${String(val) === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>`;
    if (ctl.type === "range") return `<div class="list-row">${lbl}<input type="range" id="${id}" min="${ctl.min}" max="${ctl.max}" step="${ctl.step}" value="${v}" data-set="${key}" data-output="${id}-o" data-suffix="${ctl.suffix || ""}" aria-label="${esc(label)}"><output class="val-out" id="${id}-o">${v}${ctl.suffix || ""}</output></div>`;
    return "";
  }

  function build(sec) {
    const items = SECTIONS[sec];
    let html = "", group = [];
    const flush = () => { if (group.length) { html += `<div class="list">${group.join("")}</div>`; group = []; } };
    for (const it of items) {
      const [k] = it;
      if (k === "h") { flush(); html += `<h3>${esc(it[1])}</h3>`; }
      else if (k === "note") { flush(); html += `<p class="caption">${esc(it[1])}</p>`; }
      else if (k === "stats") { flush(); html += `<div class="list"><div class="list-row"><span class="lbl">Cached now<small id="cacheStats">—</small></span><button type="button" class="btn btn--glass btn--sm pressable" id="cacheClear">Clear</button></div></div>`; }
      else if (k === "theme") {
        flush();
        html += `<h3>Theme</h3><!-- STZ 8.1.01 --><div class="row">${Steez.themes.map((t) => `<button type="button" class="btn btn--glass btn--sm pressable" data-set-theme="${t}" aria-pressed="${t === settings.theme}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div>
          <p class="caption">Noir is the default greyscale look. Every theme keeps the same controls.</p>`;
      } else if (k === "prefs") {
        const r = document.documentElement.dataset;
        html += `<h3>Accessibility</h3><!-- STZ 8.2.01 --><div class="list">
          <div class="list-row"><span class="lbl">Reduce transparency<small>Glass becomes solid</small></span><button type="button" class="switch" role="switch" aria-checked="${r.transparency === "reduced"}" data-pref="transparency" aria-label="Reduce transparency"><span class="knob"></span></button></div>
          <div class="list-row"><span class="lbl">Reduce motion<small>Springs and drifts stop</small></span><button type="button" class="switch" role="switch" aria-checked="${r.motion === "reduced"}" data-pref="motion" aria-label="Reduce motion"><span class="knob"></span></button></div>
          <div class="list-row"><span class="lbl">Increase contrast<small>Stronger text and edges</small></span><button type="button" class="switch" role="switch" aria-checked="${r.contrast === "more"}" data-pref="contrast" aria-label="Increase contrast"><span class="knob"></span></button></div></div>`;
      } else if (k === "outdir") {
        flush();
        html += `<h3>Output</h3><div class="list"><div class="list-row"><span class="lbl">Save exports to<small id="outDirLbl">${esc(settings.outDir || "Same folder as the source video")}</small></span>
          <button type="button" class="btn btn--glass btn--sm pressable" id="outDirPick">Choose…</button>${settings.outDir ? `<button type="button" class="btn btn--plain btn--sm pressable" id="outDirReset">Reset</button>` : ""}</div></div>`;
      } else if (k === "keys") {
        html += `<p class="caption">Click a shortcut, then press the new key. Esc cancels, Backspace clears.</p><div class="list keys-grid">${Object.keys(DEFAULT_KEYS).map((a) =>
          `<div class="list-row"><span class="lbl">${esc(KEY_LABELS[a] || a)}</span>${(settings.keys[a] || []).map((c, i) => `<kbd data-act="${a}" data-i="${i}" tabindex="0" role="button" aria-label="Change shortcut for ${esc(KEY_LABELS[a])}">${esc(pretty(c))}</kbd>`).join("")}<kbd data-act="${a}" data-i="${(settings.keys[a] || []).length}" tabindex="0" role="button" class="faint" aria-label="Add shortcut">+</kbd></div>`).join("")}</div>
          <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn--plain btn--sm pressable" id="keysReset">Reset shortcuts</button></div>`;
      } else if (k === "about") {
        html += aboutPane();
      } else if (k === "engine") {
        html += `<h3>FFmpeg</h3><div class="list">
          <div class="list-row"><span class="lbl">Status<small id="ffVer">Checking…</small></span></div>
          <div class="list-row"><span class="lbl">ffmpeg location<small>${esc(settings.ffmpegPath || "Automatic (bundled or PATH)")}</small></span><button type="button" class="btn btn--glass btn--sm pressable" data-bin="ffmpegPath">Choose…</button></div>
          <div class="list-row"><span class="lbl">ffprobe location<small>${esc(settings.ffprobePath || "Automatic (bundled or PATH)")}</small></span><button type="button" class="btn btn--glass btn--sm pressable" data-bin="ffprobePath">Choose…</button></div></div>
          <h3>Playback engine</h3><div class="list">
          ${row("liveEncoder", sel([["auto", "Automatic (GPU if available)"], ["cpu", "CPU"], ["nvenc", "NVIDIA NVENC"], ["amf", "AMD AMF"], ["qsv", "Intel Quick Sync"]]), "Real-time conversion encoder", "Used for codecs the system can't decode, like ProRes or MPEG-2")}
          <div class="list-row"><span class="lbl">Native decoders<small>${Object.entries(caps).filter(([, v]) => v).map(([k]) => k.toUpperCase().replace("_", " ")).join(" · ")}</small></span></div>
          <div class="list-row"><span class="lbl">Hardware encoders<small id="encList">Detecting…</small></span></div></div>
          <h3>Reset</h3><div class="list"><div class="list-row"><span class="lbl">Reset all settings<small>Keeps recent files and resume positions</small></span>
          <!-- STZ 1.5.02 --><button type="button" class="btn btn--danger btn-hold btn--sm pressable" data-hold="1200" id="resetAll"><svg class="i"><use href="#i-refresh"/></svg>Hold to reset</button></div></div>`;
      } else group.push(row(k, it[1], it[2], it[3]));
    }
    flush();
    return `<div class="set-pane" data-pane="${sec}">${html}</div>`;
  }

  function pretty(c) { return c.replace(/Key([A-Z])/g, "$1").replace(/Digit(\d)/g, "$1").replace("Comma", ",").replace("Period", ".").replace("BracketLeft", "[").replace("BracketRight", "]").replace("Arrow", "").replace("Space", "Space").replace("Escape", "Esc").replace(/\+/g, " + "); }

  function show(sec) {
    current = sec;
    panes.innerHTML = build(sec);
    $("setNav").querySelectorAll("button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.sec === sec)));
    Steez.init($("d-settings"));
    if (sec === "engine") fillEngine();
    if (sec === "frames") fillStats();
  }

  async function fillEngine() {
    const v = await invoke("set_ffmpeg_paths", { ffmpegPath: settings.ffmpegPath, ffprobePath: settings.ffprobePath }).catch(() => null);
    if ($("ffVer")) $("ffVer").innerHTML = v ? esc(v.replace(/Copyright.*/, "")) : `<span style="color:var(--danger)">Not found. ${isWindows ? "Choose ffmpeg.exe below." : "Install ffmpeg from your package manager, or choose it below."}</span>`;
    const e = app.encoders || await invoke("encoders").catch(() => null);
    const hw = e ? [...new Set(Object.values(e).flat().filter((x) => /nvenc|amf|qsv/.test(x)))] : [];
    if ($("encList")) $("encList").textContent = hw.length ? hw.join(" · ") : "None found (CPU encoders only)";
  }
  function fillStats() {
    const c = app.cache;
    const el = $("cacheStats"); if (!el) return;
    el.textContent = c?.frames?.length ? `${c.frames.length} frames · ${bytes(c.bytes)} decoded` : "Nothing cached yet";
    if (current === "frames" && $("d-settings").open) setTimeout(fillStats, 1000);
  }

  // ---- events
  $("setNav").addEventListener("click", (e) => { const b = e.target.closest("[data-sec]"); if (b) show(b.dataset.sec); });
  panes.addEventListener("click", async (e) => {
    const sw = e.target.closest(".switch[data-set]");
    if (sw) setTimeout(() => { settings[sw.dataset.set] = sw.getAttribute("aria-checked") === "true"; }, 0);
    if (e.target.closest("[data-set-theme]")) setTimeout(() => { settings.theme = document.documentElement.dataset.theme; show("appearance"); }, 50);
    if (e.target.closest("#cacheClear")) { app.cache.reset(app.player.path, app.player.info); fillStats(); }
    if (e.target.closest("#outDirPick")) { const d = await openDialog({ directory: true }); if (d) { settings.outDir = d; show("export"); } }
    if (e.target.closest("#outDirReset")) { settings.outDir = ""; show("export"); }
    const bin = e.target.closest("[data-bin]");
    if (bin) { const f = await openDialog({ multiple: false, ...(isWindows ? { filters: [{ name: "Executable", extensions: ["exe"] }] } : {}) }); if (f) { settings[bin.dataset.bin] = f; show("engine"); } }
    if (e.target.closest("#keysReset")) { settings.keys = structuredClone(DEFAULT_KEYS); show("keys"); }
    const kb = e.target.closest("kbd[data-act]"); if (kb) capture(kb);
  });
  panes.addEventListener("change", (e) => {
    const t = e.target.closest("[data-set]"); if (!t || t.classList.contains("switch")) return;
    const old = settings[t.dataset.set];
    settings[t.dataset.set] = typeof old === "number" ? +t.value : t.value;
  });
  panes.addEventListener("input", (e) => { const t = e.target; if (t.type === "range" && t.dataset.set) settings[t.dataset.set] = +t.value; });
  panes.addEventListener("stz:confirm", (e) => { if (e.target.closest("#resetAll")) { resetSettings(); Steez.setTheme("noir"); Steez.toast("ok", "Settings reset"); show(current); } });

  function capture(kb) {
    kb.classList.add("listening"); kb.textContent = "Press a key…";
    app.capturingKey = true;
    const onKey = (e) => {
      if (["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(e.code)) return;
      e.preventDefault(); e.stopPropagation();
      removeEventListener("keydown", onKey, true);
      app.capturingKey = false;
      const act = kb.dataset.act, i = +kb.dataset.i;
      const keys = structuredClone(settings.keys);
      const list = [...(keys[act] || [])];
      if (e.code === "Escape") { show("keys"); return; }
      if (e.code === "Backspace") list.splice(i, 1);
      else {
        const c = app.combo(e);
        for (const [a, l] of Object.entries(keys)) if (a !== act) keys[a] = l.filter((x) => x !== c); // steal from others
        list[i] = c;
      }
      keys[act] = [...new Set(list.filter(Boolean))];
      settings.keys = keys;
      show("keys");
    };
    addEventListener("keydown", onKey, true);
  }

  function open(sec) { show(sec || current); Steez.openDialog("d-settings"); requestAnimationFrame(() => requestAnimationFrame(() => { Steez.init($("d-settings")); })); }
  $("btnSettings").onclick = () => open();
  $("d-settings").addEventListener("stz:close", () => { app.capturingKey = false; });
  onSetting((k) => { if (k === "ffmpegPath" || k === "ffprobePath") invoke("set_ffmpeg_paths", { ffmpegPath: settings.ffmpegPath, ffprobePath: settings.ffprobePath }).catch(() => {}); });
  app.openSettings = open;
  app.registerPaneRenderer = (sec, give) => give(() => { if (current === sec && $("d-settings").open) { const top = panes.scrollTop; show(sec); panes.scrollTop = top; } });
}
