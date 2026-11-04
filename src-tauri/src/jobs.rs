//! Background job queue (trim, compress, …). One running job per lane; each job runs on its own thread.
//! Every change emits `jobs:update` (full public list) to the webview; completion emits `jobs:finished`.
use crate::ffmpeg::{Ctx, CANCELLED};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
pub struct Job {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub input: String,
    pub output: Option<String>,
    pub state: String, // queued | running | done | error | cancelled
    pub progress: f64,
    pub detail: String,
    pub error: Option<String>,
    pub result: Value,
    pub created: u64,
}

type Work = Box<dyn FnOnce(&Ctx) -> Result<Value, String> + Send>;
struct Entry { job: Job, lane: String, cancel: Arc<AtomicBool>, work: Option<Work> }

static JOBS: Lazy<Mutex<Vec<Entry>>> = Lazy::new(|| Mutex::new(Vec::new()));
static SEQ: Lazy<Mutex<u64>> = Lazy::new(|| Mutex::new(0));

fn now_ms() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

pub fn list() -> Vec<Job> { JOBS.lock().iter().map(|e| e.job.clone()).collect() }
fn emit(app: &AppHandle) { let _ = app.emit("jobs:update", list()); }

/// Queue work. `lane` serialises heavy jobs (e.g. all compressions share "encode").
pub fn add(app: &AppHandle, kind: &str, lane: &str, label: String, input: String, work: Work) -> String {
    let id = { let mut s = SEQ.lock(); *s += 1; format!("j{}", *s) };
    JOBS.lock().push(Entry {
        job: Job { id: id.clone(), kind: kind.into(), label, input, output: None, state: "queued".into(), progress: 0.0,
                   detail: String::new(), error: None, result: Value::Null, created: now_ms() },
        lane: lane.into(), cancel: Arc::new(AtomicBool::new(false)), work: Some(work),
    });
    emit(app);
    pump(app);
    id
}

pub fn cancel(app: &AppHandle, id: &str) {
    let mut g = JOBS.lock();
    if let Some(e) = g.iter_mut().find(|e| e.job.id == id) {
        match e.job.state.as_str() {
            "queued" => { e.job.state = "cancelled".into(); e.work = None; }
            "running" => e.cancel.store(true, Ordering::Relaxed),
            _ => {}
        }
    }
    drop(g);
    emit(app);
}

pub fn clear_finished(app: &AppHandle) {
    JOBS.lock().retain(|e| matches!(e.job.state.as_str(), "queued" | "running"));
    emit(app);
}

fn pump(app: &AppHandle) {
    let mut starts = Vec::new();
    {
        let mut g = JOBS.lock();
        let mut busy: Vec<String> = g.iter().filter(|e| e.job.state == "running").map(|e| e.lane.clone()).collect();
        for e in g.iter_mut() {
            if e.job.state != "queued" || busy.contains(&e.lane) { continue; }
            e.job.state = "running".into();
            busy.push(e.lane.clone());
            starts.push((e.job.id.clone(), e.cancel.clone(), e.work.take()));
        }
    }
    if !starts.is_empty() { emit(app); }
    for (id, cancel, work) in starts {
        let Some(work) = work else { continue };
        let app2 = app.clone();
        std::thread::spawn(move || {
            let last = Arc::new(Mutex::new(Instant::now()));
            let (pid, papp) = (id.clone(), app2.clone());
            let ctx = Ctx {
                cancel: cancel.clone(),
                on_progress: Arc::new(move |f, d| {
                    {
                        let mut g = JOBS.lock();
                        if let Some(e) = g.iter_mut().find(|e| e.job.id == pid) { e.job.progress = f; e.job.detail = d.to_string(); }
                    }
                    let mut l = last.lock();
                    if l.elapsed().as_millis() > 150 || f >= 1.0 { *l = Instant::now(); emit(&papp); }
                }),
            };
            let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| work(&ctx)))
                .unwrap_or_else(|_| Err("Internal error (panic)".into()));
            let finished = {
                let mut g = JOBS.lock();
                let e = g.iter_mut().find(|e| e.job.id == id).unwrap();
                match res {
                    Ok(v) => {
                        e.job.state = "done".into(); e.job.progress = 1.0;
                        e.job.output = v.get("output").and_then(|o| o.as_str()).map(String::from);
                        e.job.result = v;
                    }
                    Err(m) if m == CANCELLED || cancel.load(Ordering::Relaxed) => e.job.state = "cancelled".into(),
                    Err(m) => { e.job.state = "error".into(); e.job.error = Some(m); }
                }
                e.job.clone()
            };
            let _ = app2.emit("jobs:finished", finished);
            emit(&app2);
            pump(&app2);
        });
    }
}
