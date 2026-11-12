// SVP · bridge to the Rust backend (Tauri invoke + local media server URLs).
const T = window.__TAURI__;
export const isTauri = !!T;
export const isWindows = /Windows/.test(navigator.userAgent);
export const invoke = (cmd, args) => (T ? T.core.invoke(cmd, args) : Promise.reject(new Error("Not running inside SVP")));
export const listen = (ev, cb) => (T ? T.event.listen(ev, (e) => cb(e.payload)) : Promise.resolve(() => {}));
export const win = () => T?.window.getCurrentWindow();

let base = "", token = "", fileUrls = false;
/** `direct`: the backend lets this page play `file://` URLs (Linux, see allow_file_urls in lib.rs). */
export function setServer(port, k, direct = false) {
  base = `http://127.0.0.1:${port}`; token = k;
  fileUrls = direct && location.protocol === "tauri:"; // `tauri dev` serves the UI over http, which may not load file://
}
const q = (o) => Object.entries({ k: token, ...o }).map(([a, b]) => `${a}=${encodeURIComponent(b)}`).join("&");
export const url = {
  /** Direct playback source. `http: true` forces the media server (the fallback when a file:// load fails). */
  file: (p, { http = false } = {}) => (fileUrls && !http && p.startsWith("/")
    ? `file://${p.split("/").map(encodeURIComponent).join("/")}` : `${base}/file?${q({ p })}`),
  /** `pace` = { id, rate, hold }: the playback state the server paces the stream to (Linux, see server.rs). */
  live: (p, t, v, a = 0, vf = "", pace = null) =>
    `${base}/live?${q({ p, t: t.toFixed(3), v, a, ...(vf ? { vf } : {}), ...(pace ? { id: pace.id, r: pace.rate, hold: pace.hold ? 1 : 0 } : {}) })}`,
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
