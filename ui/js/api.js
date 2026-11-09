// SVP · bridge to the Rust backend (Tauri invoke + local media server URLs).
const T = window.__TAURI__;
export const isTauri = !!T;
export const isWindows = /Windows/.test(navigator.userAgent);
export const invoke = (cmd, args) => (T ? T.core.invoke(cmd, args) : Promise.reject(new Error("Not running inside SVP")));
export const listen = (ev, cb) => (T ? T.event.listen(ev, (e) => cb(e.payload)) : Promise.resolve(() => {}));
export const win = () => T?.window.getCurrentWindow();

let base = "", token = "";
export function setServer(port, k) { base = `http://127.0.0.1:${port}`; token = k; }
const q = (o) => Object.entries({ k: token, ...o }).map(([a, b]) => `${a}=${encodeURIComponent(b)}`).join("&");
export const url = {
  file: (p) => `${base}/file?${q({ p })}`,
  live: (p, t, v, a = 0, vf = "") => `${base}/live?${q({ p, t: t.toFixed(3), v, a, ...(vf ? { vf } : {}) })}`,
  frames: (p, t, d, w, h) => `${base}/frames?${q({ p, t: t.toFixed(4), d: d.toFixed(4), w, h })}`,
  thumbs: (p, n, h) => `${base}/thumbs?${q({ p, n, h })}`,
  subs: (p, i) => `${base}/subs?${q({ p, i })}`,
};

/** Stream a frame endpoint; calls onFrame(pts, Uint8Array jpeg) per record. Returns when done/aborted. */
export async function readFrames(u, onFrame, signal) {
  const res = await fetch(u, { signal });
  if (!res.ok) throw new Error(await res.text());
  const reader = res.body.getReader();
  let buf = new Uint8Array(0);
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const nb = new Uint8Array(buf.length + value.length); nb.set(buf); nb.set(value, buf.length); buf = nb;
    let off = 0;
    while (buf.length - off >= 12) {
      const dv = new DataView(buf.buffer, buf.byteOffset + off, 12);
      const pts = dv.getFloat64(0, true), len = dv.getUint32(8, true);
      if (buf.length - off - 12 < len) break;
      onFrame(pts, buf.slice(off + 12, off + 12 + len));
      off += 12 + len;
    }
    if (off) buf = buf.slice(off);
  }
}

export async function openDialog(opts) { return T.dialog.open(opts); }
export async function saveDialog(opts) { return T.dialog.save(opts); }
export const reveal = (p) => T?.opener.revealItemInDir(p);
export const VIDEO_EXT = ["mp4","mkv","mov","webm","avi","m4v","ts","m2ts","mts","wmv","flv","mpg","mpeg","3gp","ogv","mxf","vob","y4m","ivf","hevc","av1","264","265","h264","h265","divx","rm","rmvb","asf","f4v","dv","nut"];
