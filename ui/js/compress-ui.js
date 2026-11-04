// SVP · compress drawer: quality presets with size estimates, or an exact target size.
import { invoke } from "./api.js";
import { settings } from "./settings.js";
import { $, bytes, kbps, codecName, resLabel, fmt } from "./util.js";

// Rough bits-per-pixel for HEVC at each preset on typical content; other codecs scale from it.
const BPP = { "near-lossless": 0.11, high: 0.065, balanced: 0.038, small: 0.02 };
const CODEC_K = { h264: 1.55, hevc: 1, av1: 0.78 };
const AUDIO_KBPS = { copy: null, "aac-192": 192, "aac-128": 128, "aac-96": 96, "opus-128": 128, "opus-96": 96, none: 0 };

export function initCompress(app) {
  const { player } = app;
  const d = $("d-compress");
  let useTrim = false;

  const seg = (id) => $(id).querySelector('[aria-checked="true"]')?.dataset.value;
  const setSeg = (id, v) => { $(id).querySelectorAll("[role=radio]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.value === v))); };
  const sw = (id) => $(id).getAttribute("aria-checked") === "true";
  const setSw = (id, v) => $(id).setAttribute("aria-checked", String(!!v));

  function window_() {
    const segs = app.trimSelection?.();
    if (sw("cxUseTrim") && segs?.length) return { start: segs[0].start, end: segs[0].end };
    return { start: 0, end: player.duration };
  }
  function outGeom() {
    const i = player.info; const maxH = +$("cxRes").value || 0, maxF = +$("cxFps").value || 0;
    let w = i.width, h = i.height;
    if (maxH && h > maxH) { w = Math.round((w * maxH) / h); h = maxH; }
    const fps = maxF && i.fps > maxF ? maxF : i.fps || 30;
    return { w, h, fps };
  }
  function audioBps() {
    const a = $("cxAudio").value;
    if (AUDIO_KBPS[a] != null) return AUDIO_KBPS[a] * 1000;
    return player.info.audio.reduce((s, x) => s + (+x.bit_rate || 160000), 0);
  }

  function estimate() {
    const i = player.info; if (!i?.video) return;
    const { start, end } = window_(), dur = Math.max(0.1, end - start);
    const { w, h, fps } = outGeom(), codec = seg("cxCodec");
    const srcV = +i.video.bit_rate || Math.max(0, (i.bitrate || 0) - audioBps());
    for (const [p, bpp] of Object.entries(BPP)) {
      let vb = w * h * fps * bpp * CODEC_K[codec] * (i.bits > 8 ? 1.1 : 1);
      if (srcV) vb = Math.min(vb, srcV * ({ "near-lossless": 0.9, high: 0.6, balanced: 0.4, small: 0.25 }[p]) * (codec === "h264" ? 1.3 : 1));
      const size = ((vb + audioBps()) * dur) / 8;
      const el = d.querySelector(`[data-est="${p}"]`);
      el.textContent = `≈ ${bytes(size)}`;
    }
    // target-size help
    const mb = parseFloat($("cxMB").value);
    const help = $("cxMBHelp");
    if (mb > 0) {
      const vbps = (mb * 1e6 * 8 * 0.985) / dur - audioBps();
      const bpp = vbps / (w * h * fps);
      const sizeNow = i.size * (dur / (i.duration || dur));
      if (vbps < 60000) help.innerHTML = `<svg class="i"><use href="#i-warn"/></svg>Too small for ${fmt(dur)}. Try at least ${Math.ceil(((60000 + audioBps()) * dur) / 8 / 1e6 / 0.985)} MB or remove audio.`;
      else if (mb * 1e6 >= sizeNow) help.innerHTML = `<svg class="i"><use href="#i-info"/></svg>That's not smaller than the source (${bytes(sizeNow)}).`;
      else help.innerHTML = `<svg class="i"><use href="#i-info"/></svg>${kbps(vbps)} video${bpp < 0.02 && h > 720 ? " · consider a lower resolution for a cleaner result" : ""}`;
    } else help.textContent = "Enter a size in megabytes.";
  }

  function open(opts = {}) {
    const i = player.info;
    if (!i?.video) return Steez.toast("info", "Open a video first.");
    useTrim = !!opts.useTrim;
    $("cxSrc").innerHTML = [bytes(i.size), codecName(i.video.codec_name), `${resLabel(i.width, i.height)} · ${Math.round(i.fps)} fps`, i.bitrate ? kbps(i.bitrate) : ""]
      .filter(Boolean).map((x) => `<span class="badge">${x}</span>`).join("");
    setSeg("cxCodec", settings.cxCodec);
    $("cxEnc").value = settings.cxEncoder; $("cxSpeed").value = settings.cxSpeed; $("cxAudio").value = settings.cxAudio;
    setSw("cxVmaf", settings.cxVmaf);
    const hasTrim = !!app.trimOn?.() || useTrim;
    setSw("cxUseTrim", hasTrim);
    // grey out encoders this machine can't use
    const enc = app.encoders || {};
    const all = Object.values(enc).flat();
    for (const o of $("cxEnc").options) if (["nvenc", "amf", "qsv"].includes(o.value)) o.disabled = all.length > 0 && !all.some((e) => e.includes(o.value));
    Steez.openDialog("d-compress");
    requestAnimationFrame(() => requestAnimationFrame(() => { Steez.init(d); estimate(); }));
  }

  async function go() {
    const i = player.info; if (!i) return;
    const mode = seg("cxMode");
    const target = parseFloat($("cxMB").value);
    if (mode === "target" && !(target > 0)) { $("cxMB").focus(); return Steez.toast("err", "Enter a target size in MB."); }
    const { start, end } = window_();
    const trimmed = start > 0.01 || end < player.duration - 0.01;
    const s0 = i.start || 0;
    const opts = {
      input: player.path, output: null, outDir: settings.outDir || null,
      mode, preset: d.querySelector('input[name="cx-preset"]:checked').value, targetMb: mode === "target" ? target : null,
      codec: seg("cxCodec"), encoder: $("cxEnc").value, speed: $("cxSpeed").value,
      maxHeight: +$("cxRes").value || null, maxFps: +$("cxFps").value || null, audio: $("cxAudio").value,
      vmaf: sw("cxVmaf"), start: trimmed ? start + s0 : null, end: trimmed ? end + s0 : null,
    };
    settings.cxCodec = opts.codec; settings.cxEncoder = opts.encoder; settings.cxSpeed = opts.speed; settings.cxAudio = opts.audio; settings.cxVmaf = opts.vmaf;
    try {
      await invoke("compress_start", { opts });
      Steez.closeDialog("d-compress");
      Steez.toast("info", "Compression started. Track it under Exports.");
    } catch (e) { Steez.toast("err", `Couldn't start compression: ${e}`); }
  }

  // ---- wiring
  $("btnCompress").onclick = () => open();
  $("cxGo").onclick = go;
  $("cxMode").addEventListener("click", () => setTimeout(() => {
    const t = seg("cxMode") === "target";
    $("cxPresets").hidden = t; $("cxTarget").hidden = !t; estimate();
  }, 0));
  $("cxQuick").addEventListener("click", (e) => { const c = e.target.closest("[data-mb]"); if (c) { $("cxMB").value = c.dataset.mb; estimate(); } });
  $("cxMB").addEventListener("input", () => { $("cxQuick").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.mb === $("cxMB").value))); estimate(); });
  $("cxMB").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
  for (const id of ["cxRes", "cxFps", "cxAudio", "cxEnc", "cxSpeed"]) $(id).addEventListener("change", estimate);
  d.addEventListener("click", (e) => { if (e.target.closest("#cxCodec, #cxUseTrim")) setTimeout(estimate, 0); });
  app.openCompress = open;
}
