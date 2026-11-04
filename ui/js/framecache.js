// SVP · frame cache for instant "," / "." stepping in both directions.
//
// Two sources fill it:
//  1. Playback ring: while playing, every presented frame (requestVideoFrameCallback) is captured as an
//     ImageBitmap, so the last ~N frames are instantly steppable the moment you pause.
//  2. Decode windows: when paused (or after a paused seek), ffmpeg decodes a window around the playhead
//     at display resolution and streams JPEG frames + exact pts (see server.rs /frames).
// A "range" is an interval where every frame is known, so neighbour lookups inside it are exact.
import { url, readFrames } from "./api.js";
import { settings } from "./settings.js";

const MAX_BYTES = 512 * 1024 * 1024; // JPEG budget
const MAX_BMPS = 28;                 // decoded bitmaps kept around the playhead

export class FrameCache {
  constructor(canvas, video) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    this.video = video;
    this.reset();
    this._ringPending = false;
  }

  reset(path = "", info = null) {
    this.abortAll?.();
    this.path = path; this.info = info;
    this.frames = [];          // sorted { t, jpg?: Uint8Array, bmp?: ImageBitmap, ring?: bool }
    this.ranges = [];          // [[a, b]] fully known intervals (source seconds)
    this.bytes = 0;
    this.reqs = new Set();
    this.bmpOrder = [];
    this.shown = null;
    this.size = { w: 0, h: 0 };
    this.ring = { last: -1, lastT: -1 };
    this.ringRange = null;
    this.hide();
    this.onchange?.();
  }

  get fd() { return 1 / (this.info?.fps || 30); }
  get eps() { return this.fd * 0.25; }

  /** Pixel size to decode at, from the displayed video rect. */
  targetSize() {
    const i = this.info; if (!i?.width) return { w: 1280, h: 720 };
    const r = this.canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    let scale = Math.min((r.width * dpr) / i.width, (r.height * dpr) / i.height);
    if (settings.cacheRes === "half") scale *= 0.5;
    if (settings.cacheRes === "source" || !Number.isFinite(scale) || scale <= 0) scale = 1;
    scale = Math.min(1, scale);
    return { w: Math.max(16, Math.round(i.width * scale / 2) * 2), h: Math.max(16, Math.round(i.height * scale / 2) * 2) };
  }

  // ---------------------------------------------------------------- storage
  _idx(t) { // first index with frame.t >= t - tiny
    let lo = 0, hi = this.frames.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.frames[m].t < t - 1e-4) lo = m + 1; else hi = m; }
    return lo;
  }
  _insert(f) {
    const i = this._idx(f.t);
    const ex = this.frames[i];
    if (ex && Math.abs(ex.t - f.t) < 1e-4) {
      if (f.jpg && !ex.jpg) { ex.jpg = f.jpg; this.bytes += f.jpg.length; }
      if (f.bmp && !ex.bmp) { ex.bmp = f.bmp; this._touch(ex); } else if (f.bmp) f.bmp.close();
      return ex;
    }
    this.frames.splice(i, 0, f);
    if (f.jpg) this.bytes += f.jpg.length;
    if (f.bmp) this._touch(f);
    return f;
  }
  _cover(a, b) {
    if (!(b >= a)) return;
    const g = this.fd * 1.6;
    const r = [...this.ranges, [a, b]].sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const x of r) { const l = out[out.length - 1]; if (l && x[0] <= l[1] + g) l[1] = Math.max(l[1], x[1]); else out.push([...x]); }
    this.ranges = out;
    this.onchange?.();
  }
  rangeOf(t) {
    const r = this.ringRange;
    if (r && t >= r[0] - this.eps && t <= r[1] + this.eps) return r;
    return this.ranges.find(([a, b]) => t >= a - this.eps && t <= b + this.eps) || null;
  }
  covered(a, b) { const r = this.rangeOf(a); return !!r && b <= r[1] + this.eps; }

  _touch(f) {
    const o = this.bmpOrder; const k = o.indexOf(f); if (k >= 0) o.splice(k, 1); o.push(f);
    while (o.length > MAX_BMPS) {
      const old = o.shift();
      if (old === this.shown) { o.push(old); if (o.length <= MAX_BMPS + 1) break; continue; }
      if (old.jpg) { old.bmp?.close(); old.bmp = null; }       // can re-decode from JPEG
      else if (old.ring) { o.push(old); if (o.length > MAX_BMPS + settings.ringFrames) { o.pop(); old.bmp?.close(); old.bmp = null; this._drop(old); } else break; }
      else { old.bmp?.close(); old.bmp = null; this._drop(old); }
    }
  }
  _drop(f) { const i = this.frames.indexOf(f); if (i >= 0) this.frames.splice(i, 1); }

  /** Evict JPEGs far from t when over budget. */
  _evict(t) {
    if (this.bytes <= MAX_BYTES) return;
    const far = [...this.frames].filter((f) => f.jpg).sort((a, b) => Math.abs(b.t - t) - Math.abs(a.t - t));
    for (const f of far) {
      if (this.bytes <= MAX_BYTES * 0.8) break;
      this.bytes -= f.jpg.length; f.jpg = null; f.bmp?.close(); f.bmp = null; this._drop(f);
      this.ranges = this.ranges.flatMap(([a, b]) => (f.t < a || f.t > b) ? [[a, b]] : [[a, f.t - this.eps], [f.t + this.eps, b]].filter(([x, y]) => y > x));
    }
    this.onchange?.();
  }

  // ---------------------------------------------------------------- playback ring
  /** Call from requestVideoFrameCallback while playing. t = source time of the presented frame. */
  capture(t, presented) {
    if (!settings.ringFrames || !this.info?.width) return;
    const contiguous = presented === this.ring.last + 1 && t > this.ring.lastT;
    this.ring.last = presented; this.ring.lastT = t;
    if (!contiguous) this.ringRange = null;
    if (this._ringPending) { this.ringRange = null; return; } // missed one → not contiguous anymore
    this._ringPending = true;
    const { w, h } = this.targetSize();
    createImageBitmap(this.video, { resizeWidth: w, resizeHeight: h, resizeQuality: "medium" }).then((bmp) => {
      this._ringPending = false;
      this._insert({ t, bmp, ring: true });
      this.ringRange = this.ringRange ? [this.ringRange[0], t] : [t, t];
      const ringF = this.frames.filter((x) => x.ring && x.bmp && !x.jpg);
      for (const old of ringF.slice(0, Math.max(0, ringF.length - settings.ringFrames))) {
        old.bmp.close(); old.bmp = null; this._drop(old);
        const oi = this.bmpOrder.indexOf(old); if (oi >= 0) this.bmpOrder.splice(oi, 1);
      }
      const first = this.frames.find((x) => x.ring && x.bmp);
      if (first && this.ringRange) this.ringRange[0] = Math.max(this.ringRange[0], first.t);
    }).catch(() => { this._ringPending = false; this.ringRange = null; });
  }
  breakRing() {
    this.ring.last = -1; this.ring.lastT = -1;
    if (this.ringRange) { this._cover(this.ringRange[0], this.ringRange[1]); this.ringRange = null; }
  }

  // ---------------------------------------------------------------- decode windows
  /** Ensure [a, b] is decoded. Concurrent windows are fine (ffmpeg per window). */
  fill(a, b, { priority = false } = {}) {
    const d = this.info?.duration || 0;
    a = Math.max(0, a); b = Math.min(d || b, b);
    if (b - a < this.fd * 0.5 || !this.path) return null;
    if (this.covered(a, b)) return null;
    for (const r of this.reqs) if (a >= r.a - this.eps && b <= r.b + this.eps) return r.p;
    if (!priority && this.reqs.size >= 2) return null;
    const { w, h } = this.targetSize();
    if (w !== this.size.w || h !== this.size.h) { this.size = { w, h }; }
    const ac = new AbortController();
    const req = { a, b, ac };
    const start = this.info?.start || 0;
    let first = NaN, last = NaN;
    const path = this.path;
    req.p = readFrames(url.frames(path, a, b - a + this.fd, w, h), (pts, jpg) => {
      if (path !== this.path || !Number.isFinite(pts)) return;
      const t = pts - start;
      this._insert({ t, jpg });
      if (!Number.isFinite(first)) first = t;
      last = t;
      if (t - first > this.fd * 3) this._cover(first, last); // progressive coverage
    }, ac.signal).catch(() => {}).finally(() => {
      this.reqs.delete(req);
      if (Number.isFinite(first) && path === this.path) {
        // the window started at `a`; ffmpeg's first frame is the one at/after a, so the true range edge is a
        this._cover(Math.min(first, Math.max(a, first - this.fd)), last);
        this._evict((a + b) / 2);
      }
    });
    this.reqs.add(req);
    return req.p;
  }
  abortAll() { for (const r of this.reqs || []) r.ac.abort(); this.reqs?.clear(); }

  /** Prefetch around t (called on pause / paused seek / while stepping). */
  around(t, dir = 0) {
    const back = settings.cacheBack, fwd = settings.cacheFwd;
    // small, fast window first so the very first step is instant, then the wide one
    const nearA = t - Math.min(0.6, back), nearB = t + Math.min(0.4, fwd);
    if (!this.covered(nearA, nearB)) this.fill(nearA, nearB, { priority: true });
    const wa = t - (dir > 0 ? back * 0.5 : back), wb = t + (dir < 0 ? fwd * 0.5 : fwd);
    if (!this.covered(wa, nearA)) this.fill(wa, nearA + this.fd);
    if (!this.covered(nearB, wb)) this.fill(nearB - this.fd, wb);
  }

  /** Frame adjacent to t in direction dir (±1), only if exactly known. */
  neighbor(t, dir) {
    const r = this.rangeOf(t); if (!r) return null;
    let f;
    if (dir > 0) { const i = this._idx(t + this.eps); f = this.frames[i]; }
    else { const i = this._idx(t - this.eps) - 1; f = this.frames[i]; }
    if (!f || f.t < r[0] - this.eps || f.t > r[1] + this.eps) return null;
    if (!f.jpg && !f.bmp) return null;
    return f;
  }
  at(t) { const i = this._idx(t - this.eps); const f = this.frames[i]; return f && Math.abs(f.t - t) < this.eps * 2 ? f : null; }

  async bitmap(f) {
    if (f.bmp) { this._touch(f); return f.bmp; }
    if (!f.jpg) return null;
    if (!f._dec) f._dec = createImageBitmap(new Blob([f.jpg], { type: "image/jpeg" })).then((b) => { f.bmp = b; f._dec = null; this._touch(f); return b; });
    return f._dec;
  }
  /** Decode a few frames ahead in the stepping direction so held keys stay smooth. */
  predecode(t, dir, n = 6) {
    let cur = t;
    for (let k = 0; k < n; k++) { const f = this.neighbor(cur, dir); if (!f) break; if (!f.bmp) this.bitmap(f); cur = f.t; }
  }

  // ---------------------------------------------------------------- display
  async show(f) {
    const bmp = await this.bitmap(f);
    if (!bmp) return false;
    const c = this.canvas, r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const s = Math.min(W / bmp.width, H / bmp.height), dw = bmp.width * s, dh = bmp.height * s;
    this.ctx.fillStyle = "#000"; this.ctx.fillRect(0, 0, W, H);
    this.ctx.imageSmoothingQuality = "high";
    this.ctx.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
    c.classList.add("on");
    this.shown = f;
    return true;
  }
  hide() { this.canvas.classList.remove("on"); this.shown = null; }
}
