// SVP · timeline: scrub/seek, hover preview with thumbnails, buffered + frame-cache bands,
// chapters, keyframe ticks and trim segments (drag handles).
import { url, readFrames } from "./api.js";
import { settings } from "./settings.js";
import { fmt } from "./util.js";

const $ = (id) => document.getElementById(id);

export class Timeline extends EventTarget {
  constructor() {
    super();
    this.el = $("timeline");
    this.fill = $("tlFill"); this.thumb = $("tlThumb"); this.buf = $("tlBuf"); this.cacheEl = $("tlCache");
    this.segsEl = $("tlSegs"); this.keysEl = $("tlKeys"); this.chapEl = $("tlChapters");
    this.hover = $("tlHover"); this.hoverImg = $("tlHoverImg"); this.hoverTime = $("tlHoverTime");
    this.hctx = this.hoverImg.getContext("2d");
    this.duration = 0; this.time = 0; this.thumbs = []; this.segments = []; this.activeSeg = -1;
    this.fps = 30;
    this._bind();
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  frac(x) { const r = this.el.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)); }
  tAt(x) { return this.frac(x) * this.duration; }

  _bind() {
    const el = this.el;
    let dragging = false, segDrag = null;
    el.addEventListener("pointerdown", (e) => {
      if (!this.duration || e.button !== 0) return;
      const h = e.target.closest(".seg-range");
      if (h) {
        const i = +h.dataset.i, side = e.target.classList.contains("l") ? "l" : e.target.classList.contains("r") ? "r" : "m";
        const s = this.segments[i];
        segDrag = { i, side, t0: this.tAt(e.clientX), s0: { ...s } };
        this.activeSeg = i; this.emit("segselect", i);
      } else {
        dragging = true;
        el.classList.add("drag");
        this.emit("scrubstart");
        this.emit("seek", { t: this.tAt(e.clientX), scrub: true });
      }
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.duration) return;
      const t = this.tAt(e.clientX);
      this._hoverAt(e.clientX, t);
      if (segDrag) {
        const s = this.segments[segDrag.i], d = t - segDrag.t0, min = 1 / this.fps;
        if (segDrag.side === "l") s.start = Math.max(0, Math.min(s.end - min, segDrag.s0.start + d));
        else if (segDrag.side === "r") s.end = Math.min(this.duration, Math.max(s.start + min, segDrag.s0.end + d));
        else { const len = segDrag.s0.end - segDrag.s0.start; s.start = Math.max(0, Math.min(this.duration - len, segDrag.s0.start + d)); s.end = s.start + len; }
        this.renderSegments();
        this.emit("segmove", { i: segDrag.i, t: segDrag.side === "r" ? s.end : s.start });
      } else if (dragging) this.emit("seek", { t, scrub: true });
    });
    const end = (e) => {
      if (dragging) { dragging = false; el.classList.remove("drag"); this.emit("seek", { t: this.tAt(e.clientX), scrub: false }); this.emit("scrubend"); }
      if (segDrag) { this.emit("segchange", segDrag.i); segDrag = null; }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("pointerleave", () => { if (!dragging && !segDrag) this.hover.classList.remove("show"); });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Home") { this.emit("seek", { t: 0 }); e.preventDefault(); }
      if (e.key === "End") { this.emit("seek", { t: this.duration }); e.preventDefault(); }
    });
    window.addEventListener("resize", () => { this.renderSegments(); this.renderKeys(); });
  }

  _hoverAt(x, t) {
    const r = this.el.getBoundingClientRect();
    this.hoverTime.textContent = fmt(t, this.duration >= 3600);
    const th = this._thumbAt(t);
    this.hover.classList.toggle("no-img", !th || !settings.showThumbs);
    if (th && settings.showThumbs) {
      const c = this.hoverImg, s = Math.min(c.width / th.bmp.width, c.height / th.bmp.height);
      const w = th.bmp.width * s, h = th.bmp.height * s;
      this.hctx.fillStyle = "#000"; this.hctx.fillRect(0, 0, c.width, c.height);
      this.hctx.drawImage(th.bmp, (c.width - w) / 2, (c.height - h) / 2, w, h);
    }
    const hw = this.hover.offsetWidth || 80;
    const left = Math.max(6, Math.min(innerWidth - hw - 6, x - hw / 2));
    this.hover.style.left = `${left}px`;
    this.hover.style.bottom = `${innerHeight - r.top + 10}px`;
    this.hover.classList.add("show");
  }

  _thumbAt(t) {
    const a = this.thumbs; if (!a.length) return null;
    let lo = 0, hi = a.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m].t <= t) lo = m; else hi = m - 1; }
    const b = a[lo + 1];
    return b && Math.abs(b.t - t) < Math.abs(a[lo].t - t) ? b : a[lo];
  }

  /** Load hover thumbnails for a file (keyframe-only decode, streamed). */
  async loadThumbs(path, info) {
    this.thumbs.forEach((x) => x.bmp.close?.());
    this.thumbs = [];
    this._thumbAbort?.abort();
    if (!info?.video || !settings.showThumbs || !info.duration) return;
    const ac = new AbortController(); this._thumbAbort = ac;
    const n = Math.max(20, Math.min(240, Math.round(info.duration / 2)));
    try {
      await readFrames(url.thumbs(path, n, 180), async (pts, jpg) => {
        const bmp = await createImageBitmap(new Blob([jpg], { type: "image/jpeg" }));
        if (ac.signal.aborted) return bmp.close();
        const t = pts - (info.start || 0);
        const i = this.thumbs.findIndex((x) => x.t > t);
        this.thumbs.splice(i < 0 ? this.thumbs.length : i, 0, { t, bmp });
      }, ac.signal);
    } catch {}
  }

  setDuration(d, fps, chapters = []) {
    this.duration = d || 0; this.fps = fps || 30;
    this.el.setAttribute("aria-valuemax", String(Math.round(this.duration)));
    this.chapEl.innerHTML = this.duration ? chapters.filter((c) => c.start > 0.5).map((c) => `<i style="left:${(c.start / this.duration) * 100}%" title="${c.title}"></i>`).join("") : "";
  }

  update(t, bufferedEnd = 0, bufferedStart = 0) {
    this.time = t;
    const f = this.duration ? Math.max(0, Math.min(1, t / this.duration)) : 0;
    this.fill.style.transform = `scaleX(${f})`;
    this.thumb.style.left = `${f * 100}%`;
    this.el.setAttribute("aria-valuenow", String(Math.round(t)));
    this.el.setAttribute("aria-valuetext", fmt(t));
    if (this.duration) {
      this.buf.style.left = `${(bufferedStart / this.duration) * 100}%`;
      this.buf.style.width = `${Math.max(0, (bufferedEnd - bufferedStart) / this.duration) * 100}%`;
    }
  }

  renderCache(ranges) {
    if (!this.duration) { this.cacheEl.innerHTML = ""; return; }
    this.cacheEl.innerHTML = ranges.map(([a, b]) => `<span style="left:${(a / this.duration) * 100}%;width:max(2px, ${((b - a) / this.duration) * 100}%)"></span>`).join("");
  }

  // ---- trim
  setTrim(on) { this.el.classList.toggle("trim-on", on); document.getElementById("dock").classList.toggle("trim-on", on); this.renderSegments(); this.renderKeys(); }
  setSegments(segs, active = this.activeSeg) { this.segments = segs; this.activeSeg = active; this.renderSegments(); }
  setSnapped(snapped) { this.snapped = snapped; this.renderSegments(); }
  renderSegments() {
    const on = this.el.classList.contains("trim-on");
    if (!on || !this.duration) { this.segsEl.innerHTML = ""; return; }
    const d = this.duration;
    this.segsEl.innerHTML = this.segments.map((s, i) => {
      const snap = this.snapped?.[i];
      const ghost = snap != null && snap < s.start - 1e-3 ? `<span class="ghost" style="left:${((snap - s.start) / (s.end - s.start)) * 100}%;width:${((s.start - snap) / (s.end - s.start)) * 100}%"></span>` : "";
      return `<div class="seg-range${i === this.activeSeg ? " active" : ""}" data-i="${i}" style="left:${(s.start / d) * 100}%;width:${((s.end - s.start) / d) * 100}%">${ghost}<span class="h l"></span><span class="h r"></span></div>`;
    }).join("");
  }
  setKeyframes(k) { this.keyframes = k; this.renderKeys(); }
  renderKeys() {
    const on = this.el.classList.contains("trim-on");
    const k = this.keyframes || [];
    if (!on || !this.duration || !k.length) { this.keysEl.innerHTML = ""; return; }
    const w = this.el.getBoundingClientRect().width || 600;
    // thin out so ticks are ≥ 3px apart
    let last = -1e9; const out = [];
    for (const t of k) { const x = (t / this.duration) * w; if (x - last >= 3) { out.push(t); last = x; } }
    this.keysEl.innerHTML = out.map((t) => `<i style="left:${(t / this.duration) * 100}%"></i>`).join("");
  }
}
