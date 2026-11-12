//! Local media server on 127.0.0.1 (random port, random token on every request).
//!
//! Routes (all GET, all require `k=<token>`):
//!   /file?p=PATH                         byte-range file serving (direct playback, instant)
//!   /live?p=PATH&t=SEC&v=copy|ENC&a=N    fragmented-MP4 stream from ffmpeg (remux / realtime transcode), restart on seek
//!                                        Linux adds id=ID&r=SPEED&hold=0|1: the stream is paced to playback (see `Pace`)
//!   /frames?p=PATH&t=SEC&d=SEC&w=W&h=H   decoded frame window as records [f64 pts LE][u32 len LE][jpeg]
//!   /thumbs?p=PATH&n=N&h=H               N evenly spaced keyframe thumbnails, same record format
//!   /subs?p=PATH&i=STREAM                subtitle stream (or external file with i=0) as WebVTT
use crate::ffmpeg;
use percent_encoding::percent_decode_str;
use std::collections::hash_map::RandomState;
use std::collections::HashMap;
use std::fs::File;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::process::{Child, ChildStdout, Stdio};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tiny_http::{Header, Request, Response, Server, StatusCode};

static TOKEN: OnceLock<String> = OnceLock::new();
pub fn token() -> &'static str { TOKEN.get().map(|s| s.as_str()).unwrap_or("") }

fn random_token() -> String {
    let mut out = String::new();
    for i in 0..2u64 {
        let mut h = RandomState::new().build_hasher();
        h.write_u64(i ^ std::process::id() as u64);
        h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out
}

/// Start the server thread; returns the bound port.
pub fn start() -> u16 {
    let _ = TOKEN.set(random_token());
    let server = Server::http("127.0.0.1:0").expect("media server bind failed");
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            std::thread::spawn(move || handle(req));
        }
    });
    port
}

fn hdr(k: &str, v: &str) -> Header { Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap() }
fn cors() -> Header { hdr("Access-Control-Allow-Origin", "*") }

fn query(url: &str) -> (String, HashMap<String, String>) {
    let (path, q) = url.split_once('?').unwrap_or((url, ""));
    let map = q.split('&').filter_map(|kv| {
        let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
        let dec = |s: &str| percent_decode_str(&s.replace('+', " ")).decode_utf8_lossy().into_owned();
        Some((dec(k), dec(v)))
    }).collect();
    (path.to_string(), map)
}

fn err(req: Request, code: u16, msg: &str) {
    let _ = req.respond(Response::from_string(msg).with_status_code(code).with_header(cors()));
}

fn handle(req: Request) {
    let (path, q) = query(req.url());
    if q.get("k").map(String::as_str) != Some(token()) { return err(req, 403, "forbidden"); }
    let p = q.get("p").cloned().unwrap_or_default();
    let num = |k: &str, d: f64| q.get(k).and_then(|v| v.parse::<f64>().ok()).unwrap_or(d);
    match path.as_str() {
        "/file" => serve_file(req, &p),
        "/live" => {
            let pace = q.get("id").filter(|_| PACED).map(|id| Pace::register(id, num("r", 1.0), q.get("hold").is_some_and(|h| h == "1")));
            serve_live(req, &p, num("t", 0.0), q.get("v").map(String::as_str).unwrap_or("copy"), num("a", 0.0) as i64, q.get("vf").cloned(), pace)
        }
        "/frames" => serve_frames(req, &p, num("t", 0.0), num("d", 2.0), num("w", 1280.0) as u32, num("h", 720.0) as u32),
        "/thumbs" => serve_thumbs(req, &p, num("n", 120.0) as u32, num("h", 90.0) as u32),
        "/subs" => serve_subs(req, &p, num("i", 0.0) as i64),
        _ => err(req, 404, "not found"),
    }
}

fn mime(p: &str) -> &'static str {
    match p.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "mp4" | "m4v" | "mov" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "ogv" | "ogg" => "video/ogg",
        "mp3" => "audio/mpeg",
        "m4a" | "aac" => "audio/mp4",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "opus" => "audio/ogg",
        _ => "application/octet-stream",
    }
}

// ---------------------------------------------------------------- /file
/// Send `Content-Length` instead of tiny_http's default of chunking every body over 32 KB.
/// WebKitGTK's GStreamer source only treats a response as seekable when it knows the length; without it
/// an MP4 whose index sits at the end of the file fails to load ("no 'moov' atom within the first 10 MB")
/// and every other file plays with no duration and no seeking.
fn sized<R: Read>(r: Response<R>) -> Response<R> { r.with_chunked_threshold(usize::MAX) }

fn serve_file(req: Request, p: &str) {
    let Ok(mut f) = File::open(p) else { return err(req, 404, "file not found") };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let range = req.headers().iter().find(|h| h.field.equiv("Range")).map(|h| h.value.as_str().to_string());
    let base = vec![cors(), hdr("Accept-Ranges", "bytes"), hdr("Content-Type", mime(p))];
    if let Some(r) = range.and_then(|r| r.strip_prefix("bytes=").map(String::from)) {
        let (a, b) = r.split_once('-').unwrap_or((&r, ""));
        let (start, end) = match (a.parse::<u64>().ok(), b.parse::<u64>().ok()) {
            (Some(s), Some(e)) => (s, e.min(len.saturating_sub(1))),
            (Some(s), None) => (s, len.saturating_sub(1)),
            (None, Some(n)) => (len.saturating_sub(n), len.saturating_sub(1)),
            _ => (0, len.saturating_sub(1)),
        };
        if start >= len || start > end {
            let _ = req.respond(Response::empty(416).with_header(hdr("Content-Range", &format!("bytes */{len}"))).with_header(cors()));
            return;
        }
        let n = end - start + 1;
        let _ = f.seek(SeekFrom::Start(start));
        let mut h = base;
        h.push(hdr("Content-Range", &format!("bytes {start}-{end}/{len}")));
        let _ = req.respond(sized(Response::new(StatusCode(206), h, BufReader::with_capacity(1 << 20, f.take(n)), Some(n as usize), None)));
    } else {
        let _ = req.respond(sized(Response::new(StatusCode(200), base, BufReader::with_capacity(1 << 20, f), Some(len as usize), None)));
    }
}

/// Child stdout that kills the process when the HTTP client goes away.
struct KillOnDrop { child: Child, out: ChildStdout }
impl Read for KillOnDrop { fn read(&mut self, b: &mut [u8]) -> std::io::Result<usize> { self.out.read(b) } }
impl Drop for KillOnDrop { fn drop(&mut self) { let _ = self.child.kill(); let _ = self.child.wait(); } }

/// Reader over chunks produced by another thread.
struct ChanReader { rx: Receiver<Vec<u8>>, buf: Vec<u8>, pos: usize }
impl Read for ChanReader {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        while self.pos >= self.buf.len() {
            match self.rx.recv() { Ok(b) => { self.buf = b; self.pos = 0; } Err(_) => return Ok(0) }
        }
        let n = out.len().min(self.buf.len() - self.pos);
        out[..n].copy_from_slice(&self.buf[self.pos..self.pos + n]);
        self.pos += n;
        Ok(n)
    }
}

// ---------------------------------------------------------------- /live
/// Linux only. WebKitGTK never pushes back on a stream it can't seek: whatever the server sends, it keeps
/// in memory. ffmpeg remuxes at around 1 GB/s, so an unpaced stream filled RAM within seconds, and a paused
/// one kept growing. (Chromium reads only what it is about to play, which stalls ffmpeg through the pipe.)
/// So here the server holds ffmpeg to `LEAD` seconds of media ahead of playback. It knows how far ffmpeg
/// has got from `-progress`, and how playback moves from the UI: `live_pace` reports speed and pause.
const PACED: bool = cfg!(target_os = "linux");
const LEAD: f64 = 10.0;

pub struct Pace {
    id: String,
    /// playback speed × 1000
    rate: AtomicU32,
    hold: AtomicBool,
    /// media time ffmpeg has written, in µs from the start of this stream
    produced: AtomicI64,
}
static PACES: Mutex<Vec<Arc<Pace>>> = Mutex::new(Vec::new());

impl Pace {
    fn register(id: &str, rate: f64, hold: bool) -> Arc<Pace> {
        let p = Arc::new(Pace { id: id.into(), rate: AtomicU32::new(0), hold: AtomicBool::new(hold), produced: AtomicI64::new(0) });
        p.set(rate, hold);
        PACES.lock().unwrap().push(p.clone());
        p
    }
    fn set(&self, rate: f64, hold: bool) {
        self.rate.store((rate.clamp(0.1, 16.0) * 1000.0) as u32, Ordering::Relaxed);
        self.hold.store(hold, Ordering::Relaxed);
    }
}

/// The UI's playback state for one live stream. Unknown ids (stream already gone, other systems) are ignored.
#[tauri::command]
pub fn live_pace(id: String, rate: f64, hold: bool) {
    if let Some(p) = PACES.lock().unwrap().iter().find(|p| p.id == id) { p.set(rate, hold); }
}

/// ffmpeg's stdout for a /live response: kills ffmpeg when the client leaves and, when paced, only reads on
/// while ffmpeg is less than `LEAD` seconds ahead of playback (a full pipe then stops ffmpeg by itself).
struct LiveBody { child: Child, out: ChildStdout, pace: Option<Arc<Pace>>, played: f64, at: Instant }
impl Read for LiveBody {
    fn read(&mut self, b: &mut [u8]) -> std::io::Result<usize> {
        if let Some(p) = self.pace.clone() {
            // Never wait longer than 2 s in one go: only the write that follows a read notices that the
            // client has gone, and a paused stream that never noticed would keep its ffmpeg forever.
            for _ in 0..80 {
                let now = Instant::now();
                if !p.hold.load(Ordering::Relaxed) {
                    self.played += now.duration_since(self.at).as_secs_f64() * p.rate.load(Ordering::Relaxed) as f64 / 1000.0;
                }
                self.at = now;
                if p.produced.load(Ordering::Relaxed) as f64 / 1e6 <= self.played + LEAD { break; }
                std::thread::sleep(Duration::from_millis(25));
            }
        }
        self.out.read(b)
    }
}
impl Drop for LiveBody {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(p) = &self.pace { PACES.lock().unwrap().retain(|x| !Arc::ptr_eq(x, p)); }
    }
}

/// `v` = "copy" (remux: container/audio unsupported) or an encoder name for realtime transcode.
fn serve_live(req: Request, p: &str, t: f64, v: &str, a: i64, vf: Option<String>, pace: Option<Arc<Pace>>) {
    let mut c = ffmpeg::ffmpeg_cmd();
    c.args(["-hide_banner", "-nostdin", "-v", "error"]);
    if pace.is_some() { c.args(["-nostats", "-progress", "pipe:2", "-stats_period", "0.2"]); }
    if v != "copy" { c.args(["-hwaccel", "auto"]); }
    if t > 0.0 { c.args(["-ss", &format!("{t:.3}")]); }
    c.args(["-i", p, "-map", "0:v:0?", "-map", &format!("0:a:{a}?"), "-sn", "-dn"]);
    if v == "copy" {
        c.args(["-c:v", "copy"]);
    } else {
        c.args(["-c:v", v]);
        match v {
            e if e.ends_with("_nvenc") => { c.args(["-preset", "p1", "-tune", "ll", "-rc", "vbr", "-cq", "20", "-b:v", "0"]); }
            e if e.ends_with("_amf") => { c.args(["-usage", "lowlatency", "-quality", "speed", "-rc", "cqp", "-qp_i", "20", "-qp_p", "22"]); }
            e if e.ends_with("_qsv") => { c.args(["-preset", "veryfast", "-global_quality", "22"]); }
            _ => { c.args(["-preset", "ultrafast", "-tune", "zerolatency", "-crf", "20"]); }
        }
        let mut filt = vf.unwrap_or_default();
        if !filt.is_empty() { filt.push(','); }
        filt.push_str("format=yuv420p");
        c.args(["-vf", &filt, "-g", "60"]);
    }
    c.args(["-c:a", "aac", "-b:a", "192k", "-ac", "2",
            "-f", "mp4", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-frag_duration", "400000", "pipe:1"]);
    c.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(if pace.is_some() { Stdio::piped() } else { Stdio::null() });
    let Ok(mut child) = c.spawn() else { return err(req, 500, "ffmpeg missing") };
    let out = child.stdout.take().unwrap();
    if let (Some(pace), Some(stderr)) = (pace.clone(), child.stderr.take()) {
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if let Some(us) = line.strip_prefix("out_time_us=").and_then(|v| v.trim().parse::<i64>().ok()) {
                    pace.produced.store(us, Ordering::Relaxed);
                }
            }
        });
    }
    let body = LiveBody { child, out, pace, played: 0.0, at: Instant::now() };
    let _ = req.respond(Response::new(StatusCode(200), vec![cors(), hdr("Content-Type", "video/mp4"), hdr("Cache-Control", "no-store")], body, None, None));
}

// ---------------------------------------------------------------- frame streams
/// Spawns ffmpeg emitting MJPEG on stdout + showinfo pts on stderr, and turns it into
/// records [f64 pts][u32 len][jpeg] streamed to the client. Stops ffmpeg when the client leaves.
fn stream_frames(req: Request, args: Vec<String>) {
    let mut c = ffmpeg::ffmpeg_cmd();
    c.args(["-hide_banner", "-nostdin", "-v", "info"]).args(&args)
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let Ok(mut child) = c.spawn() else { return err(req, 500, "ffmpeg missing") };
    let stderr = child.stderr.take().unwrap();
    let mut stdout = child.stdout.take().unwrap();
    let (pts_tx, pts_rx) = mpsc::channel::<f64>();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if !line.contains("Parsed_showinfo") { continue; }
            if let Some(i) = line.find("pts_time:") {
                let v: String = line[i + 9..].chars().take_while(|c| !c.is_whitespace()).collect();
                if let Ok(t) = v.parse::<f64>() { if pts_tx.send(t).is_err() { break; } }
            }
        }
    });
    let (tx, rx): (SyncSender<Vec<u8>>, Receiver<Vec<u8>>) = mpsc::sync_channel(64);
    std::thread::spawn(move || {
        let mut buf: Vec<u8> = Vec::with_capacity(1 << 20);
        let mut chunk = vec![0u8; 256 * 1024];
        let mut alive = true;
        while alive {
            let n = match stdout.read(&mut chunk) { Ok(0) | Err(_) => break, Ok(n) => n };
            buf.extend_from_slice(&chunk[..n]);
            while let Some(end) = jpeg_end(&buf) {
                let frame: Vec<u8> = buf.drain(..end).collect();
                let pts = pts_rx.recv_timeout(Duration::from_secs(3)).unwrap_or(f64::NAN);
                let mut rec = Vec::with_capacity(frame.len() + 12);
                rec.extend_from_slice(&pts.to_le_bytes());
                rec.extend_from_slice(&(frame.len() as u32).to_le_bytes());
                rec.extend_from_slice(&frame);
                if tx.send(rec).is_err() { alive = false; break; }
            }
        }
        let _ = child.kill();
        let _ = child.wait();
    });
    let body = ChanReader { rx, buf: Vec::new(), pos: 0 };
    let _ = req.respond(Response::new(StatusCode(200), vec![cors(), hdr("Content-Type", "application/octet-stream"), hdr("Cache-Control", "no-store")], body, None, None));
}

/// Byte length of the first complete JPEG in `b` (walks markers to SOS, then scans for EOI).
fn jpeg_end(b: &[u8]) -> Option<usize> {
    if b.len() < 4 || b[0] != 0xFF || b[1] != 0xD8 { return None; }
    let mut i = 2;
    loop {
        if i + 4 > b.len() { return None; }
        if b[i] != 0xFF { i += 1; continue; }
        let m = b[i + 1];
        if m == 0xFF { i += 1; continue; }
        if m == 0xD9 { return Some(i + 2); }
        let len = ((b[i + 2] as usize) << 8) | b[i + 3] as usize;
        if m == 0xDA {
            let mut j = i + 2 + len;
            while j + 1 < b.len() {
                if b[j] == 0xFF && b[j + 1] == 0xD9 { return Some(j + 2); }
                j += 1;
            }
            return None;
        }
        i += 2 + len;
    }
}

fn s(v: impl ToString) -> String { v.to_string() }

fn serve_frames(req: Request, p: &str, t: f64, d: f64, w: u32, h: u32) {
    let (w, h) = (w.clamp(16, 7680) & !1, h.clamp(16, 4320) & !1);
    let args = vec![
        s("-hwaccel"), s("auto"),
        // input-side -t: with -copyts an output-side -t is measured on absolute timestamps and truncates the window
        s("-ss"), format!("{:.4}", t.max(0.0)), s("-t"), format!("{:.4}", d.max(0.04)), s("-copyts"), s("-i"), s(p),
        s("-map"), s("0:v:0"), s("-an"), s("-sn"), s("-dn"),
        s("-vf"), format!("scale={w}:{h}:flags=bicubic,showinfo"),
        s("-fps_mode"), s("passthrough"),
        s("-c:v"), s("mjpeg"), s("-q:v"), s("2"), s("-f"), s("image2pipe"), s("pipe:1"),
    ];
    stream_frames(req, args);
}

fn serve_thumbs(req: Request, p: &str, n: u32, h: u32) {
    let dur = ffmpeg::probe(p).map(|v| ffmpeg::duration_of(&v)).unwrap_or(0.0);
    if dur <= 0.0 { return err(req, 422, "unknown duration"); }
    let rate = (n.max(1) as f64 / dur).max(0.0001);
    let args = vec![
        // -discard: the demuxer skips everything but keyframes without reading it (MP4/MOV: 339 MB instead of
        // all 14 GB of a 14 GB file, 3 s instead of 23). -skip_frame covers demuxers that ignore it.
        // -hwaccel: a 4K film has well over 1000 keyframes; on the CPU they took 31 s of CPU time across every
        // core while the video was starting (1.6 s on the GPU, same thumbnails).
        s("-hwaccel"), s("auto"), s("-discard:v"), s("nokey"), s("-skip_frame"), s("nokey"), s("-i"), s(p),
        s("-map"), s("0:v:0"), s("-an"), s("-sn"), s("-dn"),
        s("-vf"), format!("fps={rate:.6}:round=near,scale=-2:{}:flags=bilinear,showinfo", h.clamp(32, 360) & !1),
        s("-c:v"), s("mjpeg"), s("-q:v"), s("5"), s("-f"), s("image2pipe"), s("pipe:1"),
    ];
    stream_frames(req, args);
}

// ---------------------------------------------------------------- /subs
fn serve_subs(req: Request, p: &str, i: i64) {
    let mut c = ffmpeg::ffmpeg_cmd();
    c.args(["-hide_banner", "-nostdin", "-v", "error", "-i", p, "-map", &format!("0:{i}"), "-f", "webvtt", "pipe:1"])
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    let Ok(mut child) = c.spawn() else { return err(req, 500, "ffmpeg missing") };
    let out = child.stdout.take().unwrap();
    let body = KillOnDrop { child, out };
    let _ = req.respond(Response::new(StatusCode(200), vec![cors(), hdr("Content-Type", "text/vtt; charset=utf-8")], body, None, None));
}
