// SVP · updates from GitHub Releases + Windows default-app integration.
// Backend: src-tauri/src/updater.rs (signed NSIS installer, passive install, relaunch).
import { invoke, listen, isTauri } from "./api.js";
import { settings } from "./settings.js";
import { esc, bytes } from "./util.js";

export const RELEASES_URL = "https://github.com/Steez-47/SVP/releases";
const state = { version: "", update: null, checking: false, installing: false, progress: null, error: "", checked: 0, registered: null };
let rerender = () => {};

export async function checkForUpdates({ quiet = false } = {}) {
  if (state.checking || state.installing || !isTauri) return state.update;
  state.checking = true; state.error = ""; rerender();
  try {
    state.update = await invoke("update_check");
    state.checked = Date.now();
    if (state.update && quiet) {
      Steez.toast("info", `SVP ${state.update.version} is available`, { action: "Update", onAction: () => window.svp?.openSettings?.("about"), ms: 9000 });
    }
  } catch (e) { state.error = String(e); if (!quiet) console.warn("update check", e); }
  state.checking = false; rerender();
  return state.update;
}

async function install() {
  if (!state.update || state.installing) return;
  state.installing = true; state.progress = { done: 0, total: null }; state.error = ""; rerender();
  try { await invoke("update_install"); }
  catch (e) { state.installing = false; state.error = String(e); rerender(); }
}

/** Markup for the "Updates & system" settings pane (Steez list rows, async button, progress bar). */
export function aboutPane() {
  const u = state.update, busy = state.checking ? "busy" : "idle";
  const pct = state.progress?.total ? state.progress.done / state.progress.total : 0;
  const status = state.installing
    ? (state.progress?.total ? `Downloading ${bytes(state.progress.done)} of ${bytes(state.progress.total)}` : "Installing… SVP will reopen by itself")
    : state.error ? state.error
    : u ? `Version ${esc(u.version)} is ready to install`
    : state.checked ? "You're on the latest version" : "Not checked yet";
  const notes = u?.notes ? `<div class="update-notes">${esc(u.notes).replace(/\n/g, "<br>")}</div>` : "";
  const reg = state.registered;
  return `
  <h3>Updates</h3>
  <div class="list">
    <div class="list-row"><span class="lbl">SVP ${esc(state.version || "")}<small id="updStatus">${status}</small></span>
      ${u && !state.installing
        ? `<!-- STZ 1.1.10 --><button type="button" class="btn btn--filled btn--sm pressable" id="updInstall"><svg class="i"><use href="#i-download"/></svg>Install and restart</button>`
        : `<!-- STZ 1.5.01 --><button type="button" class="btn btn--glass btn--sm btn-async pressable" id="updCheck" data-state="${busy}" ${state.installing ? "disabled" : ""}>
            <span class="a-idle">Check for updates</span>
            <span class="a-busy"><span class="ring-spin" style="width:16px;height:16px;border-width:2px"></span></span>
            <span class="a-done"><svg class="i"><use href="#i-check"/></svg>Up to date</span></button>`}
    </div>
    ${state.installing && state.progress?.total ? `<div class="list-row"><!-- STZ 5.3.01 --><div class="progress w-full" role="progressbar" aria-valuenow="${Math.round(pct * 100)}" aria-label="Update download"><span style="--p:${pct}"></span></div></div>` : ""}
    ${notes ? `<div class="list-row">${notes}</div>` : ""}
    <div class="list-row"><span class="lbl">Check automatically<small>Looks for a new release each time SVP starts</small></span><button type="button" class="switch" role="switch" aria-checked="${settings.autoUpdate !== false}" aria-label="Check for updates automatically" data-set="autoUpdate"><span class="knob"></span></button></div>
    <div class="list-row"><span class="lbl">Release notes<small>${RELEASES_URL.replace("https://", "")}</small></span><button type="button" class="btn btn--plain btn--sm pressable" id="updReleases">Open</button></div>
  </div>
  <h3>Windows</h3>
  <div class="list">
    <div class="list-row"><span class="lbl">Default video player<small>${reg === false ? "Install SVP with its installer to register it with Windows" : "Make SVP open your videos instead of Photos, Media Player or VLC"}</small></span>
      <button type="button" class="btn btn--glass btn--sm pressable" id="setDefault" ${reg === false ? "disabled" : ""}>Set as default…</button></div>
    <div class="list-row"><span class="lbl">Open with<small>${reg ? "Listed for 38 video types. Right-click a video › Open with › SVP" : "Available after installing"}</small></span>${reg ? `<span class="badge tone-ok"><svg class="i i-sm"><use href="#i-check"/></svg>Registered</span>` : `<span class="badge">Not registered</span>`}</div>
  </div>`;
}

export function initUpdates(app) {
  if (!isTauri) return;
  invoke("app_version").then((v) => { state.version = v; rerender(); }).catch(() => {});
  invoke("shell_registered").then((r) => { state.registered = r; rerender(); }).catch(() => {});
  listen("update:progress", (p) => { state.progress = p; const el = document.getElementById("updStatus"); if (el && p.total) el.textContent = `Downloading ${bytes(p.done)} of ${bytes(p.total)}`; const bar = document.querySelector('[aria-label="Update download"] span'); if (bar && p.total) bar.style.setProperty("--p", p.done / p.total); else rerender(); });
  listen("update:installing", () => { state.progress = { done: 0, total: null }; window.dispatchEvent(new Event("beforeunload")); rerender(); });
  document.addEventListener("click", (e) => {
    if (e.target.closest("#updCheck")) checkForUpdates().then((u) => { const b = document.getElementById("updCheck"); if (b && !u && !state.error) { b.dataset.state = "done"; setTimeout(() => { if (b.isConnected) b.dataset.state = "idle"; }, 1800); } });
    if (e.target.closest("#updInstall")) install();
    if (e.target.closest("#updReleases")) window.__TAURI__?.opener.openUrl(RELEASES_URL);
    if (e.target.closest("#setDefault")) invoke("open_default_apps").catch((err) => Steez.toast("err", `Couldn't open Windows Settings: ${err}`));
  });
  app.registerPaneRenderer?.("about", (render) => { rerender = render; });
  if (settings.autoUpdate !== false) setTimeout(() => checkForUpdates({ quiet: true }), 4000);
}
