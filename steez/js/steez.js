/* ==========================================================================
   STEEZ behavior layer — v0.2 · no dependencies
   Include ONCE in <head> (NOT deferred, so the saved theme applies before first paint):
     <link rel="stylesheet" href="css/steez.css">
     <script src="js/steez.js"></script>
   Then paste markup from library.html. Everything is wired by data-attributes via
   delegated listeners, so markup added later works without re-init (call
   Steez.init(el) only to place sliding thumbs in newly inserted groups).

   Public API  (window.Steez)
     Steez.setTheme(id, originElOrPoint?)   Steez.themes  → ["harbor", ...]
     Steez.toast(kind "ok"|"info"|"err", message, { action, onAction, ms })
     Steez.openDialog(idOrEl)  Steez.closeDialog(idOrEl, value)
     Steez.openMenu(id, triggerEl)  Steez.closeMenus()   Steez.init(rootEl)
     Steez.icon(name, cls?) → "<svg class='i'>…" string    Steez.icons → names
   Events (bubbling CustomEvents, read e.detail)
     stz:change   switch / radio / segmented / tabs / chips / stepper / rating / pager   {value}
     stz:select   menu item / select option / combobox option                         {value, label}
     stz:close    dialog closed                                                       {value}
     stz:confirm  hold-to-confirm completed, async button finished
     stz:complete one-time code filled                                                {value}
     stz:files    files dropped / picked in a drop zone                               {files}
     stz:theme    on document after a theme change                                    {id}
   ========================================================================== */
(() => {
  const root = document.documentElement;
  const THEMES = ["harbor", "porcelain", "espresso", "paper", "evergreen", "bubblegum", "noir", "tropic"];
  const PREFS = { transparency: "reduced", motion: "reduced", contrast: "more" };
  const KEY = "stz";

  /* ---------- 0. Restore theme + appearance before first paint ---------- */
  const store = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };
  try { const q = new URLSearchParams(location.search).get("theme"); if (THEMES.includes(q)) store.theme = q; } catch {}
  if (THEMES.includes(store.theme)) root.dataset.theme = store.theme;
  else if (!root.dataset.theme) root.dataset.theme = THEMES[0];
  for (const k in PREFS) if (store[k]) root.dataset[k] = store[k];

  /* ---------- helpers ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduced = () => root.dataset.motion === "reduced" || (matchMedia("(prefers-reduced-motion: reduce)").matches && root.dataset.motion !== "full");
  const ms = (v) => (reduced() ? 1 : parseFloat(getComputedStyle(root).getPropertyValue(v)) || 300);
  const emit = (el, name, detail = {}) => el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const byId = (x) => (typeof x === "string" ? document.getElementById(x.replace(/^#/, "")) : x);

  /* ---------- 0.7 Icons: injected sprite, use <svg class="i"><use href="#i-NAME"/></svg> ---------- */
  const ICONS = {
 "search": "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-3.5-3.5\"/>",
 "sidebar": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"M9 4v16\"/>",
 "sparkle": "<path d=\"M11 3l1.8 4.7 4.7 1.8-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z\"/><path d=\"M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z\"/>",
 "sliders": "<path d=\"M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12\"/><circle cx=\"16\" cy=\"6\" r=\"2\"/><circle cx=\"10\" cy=\"12\" r=\"2\"/><circle cx=\"18\" cy=\"18\" r=\"2\"/>",
 "plus": "<path d=\"M12 5v14M5 12h14\"/>",
 "minus": "<path d=\"M5 12h14\"/>",
 "check": "<path d=\"M5 12.5l4.5 4.5L19 7\"/>",
 "x": "<path d=\"M6 6l12 12M18 6 6 18\"/>",
 "chev-down": "<path d=\"m6 9 6 6 6-6\"/>",
 "chev-right": "<path d=\"m9 6 6 6-6 6\"/>",
 "chev-left": "<path d=\"m15 6-6 6 6 6\"/>",
 "heart": "<path d=\"M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z\"/>",
 "share": "<path d=\"M12 3v12M8 7l4-4 4 4\"/><path d=\"M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6\"/>",
 "trash": "<path d=\"M4 7h16M10 11v6M14 11v6\"/><path d=\"M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3\"/>",
 "edit": "<path d=\"M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z\"/><path d=\"m13.5 6.5 4 4\"/>",
 "copy": "<rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2\"/>",
 "bell": "<path d=\"M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z\"/><path d=\"M10 21h4\"/>",
 "home": "<path d=\"M4 11 12 4l8 7\"/><path d=\"M6 10v10h12V10\"/>",
 "grid": "<rect x=\"4\" y=\"4\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"13\" y=\"4\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"4\" y=\"13\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"13\" y=\"13\" width=\"7\" height=\"7\" rx=\"1.5\"/>",
 "user": "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21a8 8 0 0 1 16 0\"/>",
 "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/>",
 "moon": "<path d=\"M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z\"/>",
 "info": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5M12 8h.01\"/>",
 "warn": "<path d=\"M12 4 2.5 20h19z\"/><path d=\"M12 10v4M12 17h.01\"/>",
 "ok": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m8 12.5 3 3 5-6\"/>",
 "err": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m9 9 6 6M15 9l-6 6\"/>",
 "star": "<path d=\"m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z\"/>",
 "folder": "<path d=\"M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/>",
 "image": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"2\"/><path d=\"m21 16-5-5-9 9\"/>",
 "play": "<path d=\"M7 5v14l11-7z\"/>",
 "pause": "<path d=\"M8 5v14M16 5v14\"/>",
 "more": "<path d=\"M5 12h.01M12 12h.01M19 12h.01\" stroke-width=\"3.2\"/>",
 "download": "<path d=\"M12 4v11M7 10l5 5 5-5M5 20h14\"/>",
 "inbox": "<path d=\"M3 13h5l1.5 3h5l1.5-3h5\"/><path d=\"M5 5h14l2 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z\"/>",
 "layers": "<path d=\"m12 3 9 5-9 5-9-5z\"/><path d=\"m3 13 9 5 9-5\"/>",
 "type": "<path d=\"M5 7V5h14v2M12 5v14M9 19h6\"/>",
 "zap": "<path d=\"M13 2 4 14h7l-1 8 9-12h-7z\"/>",
 "drop": "<path d=\"M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z\"/>",
 "cursor": "<path d=\"m5 3 14 7-6 2-2 6z\"/>",
 "toggle": "<rect x=\"2\" y=\"7\" width=\"20\" height=\"10\" rx=\"5\"/><circle cx=\"16\" cy=\"12\" r=\"2.5\"/>",
 "form": "<rect x=\"3\" y=\"6\" width=\"18\" height=\"12\" rx=\"3\"/><path d=\"M7 10v4\"/>",
 "compass": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m15.5 8.5-2 5-5 2 2-5z\"/>",
 "chat": "<path d=\"M4 5h16v11H9l-5 4z\"/>",
 "window": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 9h18\"/>",
 "list": "<path d=\"M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01\"/>",
 "sort": "<path d=\"M12 19V5M6 11l6-6 6 6\"/>",
 "refresh": "<path d=\"M20 12a8 8 0 1 1-2.3-5.6\"/><path d=\"M20 4v4h-4\"/>",
 "eye": "<path d=\"M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
 "lock": "<rect x=\"5\" y=\"11\" width=\"14\" height=\"10\" rx=\"2\"/><path d=\"M8 11V8a4 4 0 0 1 8 0v3\"/>",
 "wifi": "<path d=\"M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5h.01\"/>",
 "music": "<path d=\"M9 18V5l11-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"17\" cy=\"16\" r=\"3\"/>",
 "cloud": "<path d=\"M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 9.5a4.3 4.3 0 0 1-1 8.5z\"/>",
 "mail": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m3 7 9 6 9-6\"/>",
 "link": "<path d=\"M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1\"/><path d=\"M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1\"/>",
 "calendar": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 10h18M8 3v4M16 3v4\"/>",
 "palette": "<path d=\"M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-2s-1-1.6-1-2.6 1-1.4 2-1.4h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z\"/><path d=\"M7.5 11h.01M10 7h.01M15 7.5h.01\"/>",
 "arrow-right": "<path d=\"M5 12h14M13 6l6 6-6 6\"/>",
 "arrow-left": "<path d=\"M19 12H5M11 6l-6 6 6 6\"/>",
 "eye-off": "<path d=\"M3 3l18 18\"/><path d=\"M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6\"/><path d=\"M9.9 9.9a3 3 0 0 0 4.2 4.2\"/>",
 "upload": "<path d=\"M12 15V4M7 9l5-5 5 5M5 20h14\"/>",
 "filter": "<path d=\"M4 5h16l-6 8v6l-4-2v-4z\"/>",
 "logout": "<path d=\"M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3\"/><path d=\"M10 17l5-5-5-5M15 12H4\"/>",
 "globe": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18\"/>",
 "bookmark": "<path d=\"M6 4h12v17l-6-4-6 4z\"/>",
 "vol-low": "<path d=\"M4 9v6h4l5 4V5L8 9z\"/>",
 "vol-high": "<path d=\"M4 9v6h4l5 4V5L8 9z\"/><path d=\"M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12\"/>",
 "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
 "card": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M3 10h18M7 15h4\"/>",
 "flag": "<path d=\"M5 21V4h11l-2 4 2 4H5\"/>",
 "settings": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z\"/>",
 "help": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2.2-2.4 3.7M12 17h.01\"/>"
};
  function injectIcons() {
    if (document.getElementById("stz-icons")) return;
    const svg = `<svg id="stz-icons" width="0" height="0" style="position:absolute" aria-hidden="true">${
      Object.entries(ICONS).map(([n, p]) => `<symbol id="i-${n}" viewBox="0 0 24 24">${p}</symbol>`).join("")}</svg>`;
    document.body.insertAdjacentHTML("afterbegin", svg);
  }
  const icon = (n, cls = "") => `<svg class="i ${cls}"><use href="#i-${n}"/></svg>`;

  /* ---------- 8.1 Themes ---------- */
  function setTheme(id, origin) {
    if (!THEMES.includes(id) || id === root.dataset.theme) return;
    const apply = () => { root.dataset.theme = id; store.theme = id; save(); emit(document, "stz:theme", { id }); requestAnimationFrame(() => init(document, false)); };
    if (!document.startViewTransition || reduced()) return apply();
    let x = innerWidth - 80, y = 30;
    if (origin instanceof Element) { const b = origin.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top + b.height / 2; }
    else if (origin) ({ x, y } = origin);
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(apply).ready.then(() => {
      root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 760, easing: "cubic-bezier(.65,0,.35,1)", pseudoElement: "::view-transition-new(root)" });
    }).catch(() => {});
  }

  /* ---------- Liquid thumbs: a .liquid-thumb glides + stretches under the "on" item ---------- */
  const ATTRS = ["aria-checked", "aria-selected", "aria-current"];
  const liquidItems = (g) => g.matches("[data-pager]") ? $$("[data-page]", g) : $$(":scope > button, :scope > a", g);
  const onAttr = (g) => g.dataset.attr || ATTRS.find((a) => liquidItems(g).some((b) => b.hasAttribute(a))) || "aria-checked";
  const isOn = (b, a) => { const v = b.getAttribute(a); return v && v !== "false"; };
  function syncThumb(g, animate = true) {
    const thumb = $(":scope > .liquid-thumb", g); if (!thumb) return;
    const a = onAttr(g), on = liquidItems(g).find((b) => isOn(b, a)); if (!on) return;
    const v = g.hasAttribute("data-liquid-v");
    const pos = v ? on.offsetTop : on.offsetLeft, size = v ? on.offsetHeight : on.offsetWidth;
    const still = !animate || reduced();
    if (still) thumb.style.transition = "none";
    thumb.style.transform = v ? `translateY(${pos}px)` : `translateX(${pos}px)`;
    thumb.style[v ? "height" : "width"] = `${size}px`;
    const prev = g._pos;
    if (!still && prev != null && prev !== pos && thumb.animate) {
      const d = Math.min(Math.abs(pos - prev) / (size || 1), 3), s = 1 + Math.min(0.12 * d, 0.32), k = 1 - Math.min(0.06 * d, 0.14);
      thumb.animate([{ scale: "1 1" }, { scale: v ? `${k} ${s}` : `${s} ${k}`, offset: 0.35 }, { scale: "1 1" }], { duration: ms("--dur-2") * 1.1, easing: "ease-out" });
    }
    if (still) { void thumb.offsetWidth; thumb.style.transition = ""; }
    g._pos = pos;
  }
  function selectIn(g, item) {
    const a = onAttr(g);
    liquidItems(g).forEach((b) => {
      if (a === "aria-current") b === item ? b.setAttribute(a, g.matches("[data-pager]") ? "page" : "true") : b.removeAttribute(a);
      else b.setAttribute(a, String(b === item));
    });
    syncThumb(g);
    emit(g, "stz:change", { value: item.dataset.value ?? item.dataset.page ?? item.textContent.trim() });
  }

  /* ---------- 4.3 Tabs ---------- */
  function syncInk(tabs, animate = true) {
    const ink = $(".tab-ink", tabs), on = $('[role="tab"][aria-selected="true"]', tabs); if (!ink || !on) return;
    if (!animate) ink.style.transition = "none";
    ink.style.width = `${on.offsetWidth}px`; ink.style.transform = `translateX(${on.offsetLeft}px)`;
    if (!animate) { void ink.offsetWidth; ink.style.transition = ""; }
  }

  /* ---------- Popups: menus, context menus, popovers (fixed, moved to <body>) ---------- */
  let openPop = null, openTrig = null;
  function closeMenus() {
    if (!openPop) return;
    openPop.classList.remove("open"); openTrig?.setAttribute("aria-expanded", "false");
    if (openPop._select) openPop._select.classList.remove("is-open");
    openPop = openTrig = null;
  }
  function place(pop, trigger, at, align) {
    if (pop.parentElement !== document.body && !pop.closest("[data-select],[data-combobox]")) document.body.append(pop);
    pop.style.position = "fixed";
    const mw = pop.offsetWidth || 240, mh = pop.offsetHeight || 200;
    let x, y, ox = "left", oy = "top";
    if (at) { x = at.x; y = at.y; }
    else {
      const b = trigger.getBoundingClientRect();
      y = b.bottom + 8;
      x = align === "center" ? b.left + b.width / 2 - mw / 2 : align === "end" ? b.right - mw : b.left;
      if (align === "center") ox = "center"; if (align === "end") ox = "right";
    }
    if (x + mw > innerWidth - 8) { x = innerWidth - mw - 8; ox = "right"; }
    if (x < 8) x = 8;
    if (y + mh > innerHeight - 8) { y = Math.max(8, (at ? at.y : trigger.getBoundingClientRect().top - 8) - mh); oy = "bottom"; }
    Object.assign(pop.style, { left: `${x}px`, top: `${y}px`, right: "auto" });
    pop.style.setProperty("--origin", `${oy} ${ox}`);
    if (trigger && pop.classList.contains("popover")) {
      const b = trigger.getBoundingClientRect(); pop.style.setProperty("--arrow-x", `${Math.max(16, Math.min(mw - 16, b.left + b.width / 2 - x))}px`);
    }
  }
  function openMenu(id, trigger, at) {
    const pop = byId(id); if (!pop) return;
    if (openPop === pop) return closeMenus();
    closeMenus();
    place(pop, trigger, at, pop.dataset.align || (pop.classList.contains("popover") ? "center" : "start"));
    $$(".menu-item", pop).forEach((m, n) => m.style.setProperty("--n", n));
    pop.classList.add("open"); trigger?.setAttribute("aria-expanded", "true");
    openPop = pop; openTrig = trigger;
    (pop.querySelector(".menu-item") || pop.querySelector("button, input"))?.focus({ preventScroll: true });
  }

  /* ---------- 6.x Dialogs (<dialog class="ov">) ---------- */
  function openDialog(x) { const d = byId(x); if (!d || d.open) return; closeMenus(); d.showModal(); requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add("in"))); }
  function closeDialog(x, value) {
    const d = byId(x); if (!d?.open || d._closing) return; d._closing = true; d.classList.remove("in");
    setTimeout(() => { d.close(value ?? ""); d._closing = false; d.style.removeProperty("--drag"); emit(d, "stz:close", { value: value ?? "" }); }, ms("--dur-3") * 0.9);
  }

  /* ---------- 5.1 Toasts ---------- */
  const TOAST_ICON = { ok: "ok", info: "info", err: "err" };
  function toast(kind = "info", msg = "", opts = {}) {
    let box = $(".toasts");
    if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("aria-live", "polite"); document.body.append(box); }
    const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status");
    t.innerHTML = `${icon(TOAST_ICON[kind] || "info", "t-" + kind)}<span></span>${opts.action ? `<button class="btn btn--tinted pressable"></button>` : ""}`;
    t.querySelector("span").textContent = msg;
    if (opts.action) t.querySelector("button").textContent = opts.action;
    box.append(t); while (box.children.length > 3) box.firstElementChild.remove();
    const kill = () => { t.classList.add("out"); setTimeout(() => t.remove(), ms("--dur-2") + 20); };
    t.querySelector("button")?.addEventListener("click", () => { opts.onAction?.(); kill(); });
    setTimeout(kill, opts.ms || 3600);
    return t;
  }

  /* ========== Delegated CLICK ========== */
  document.addEventListener("click", (e) => {
    const t = e.target;

    // 8.1 theme
    const th = t.closest("[data-set-theme]");
    if (th) { closeMenus(); setTheme(th.dataset.setTheme, th); }

    // 2.1 switch (+ 8.2 appearance prefs)
    const sw = t.closest(".switch");
    if (sw && !sw.disabled) {
      const on = sw.getAttribute("aria-checked") !== "true";
      if (sw.dataset.pref && PREFS[sw.dataset.pref]) {
        const k = sw.dataset.pref; if (on) root.dataset[k] = PREFS[k]; else delete root.dataset[k];
        store[k] = on ? PREFS[k] : undefined; save();
        $$(`.switch[data-pref="${k}"]`).forEach((x) => x.setAttribute("aria-checked", String(on)));
      } else sw.setAttribute("aria-checked", String(on));
      emit(sw, "stz:change", { value: on });
    }

    // 1.3 / 1.5 toggle buttons (favorite, follow, counter)
    const tp = t.closest("[data-toggle-press]");
    if (tp) {
      const on = tp.getAttribute("aria-pressed") !== "true"; tp.setAttribute("aria-pressed", String(on)); restart(tp, "pop");
      const n = $(".n", tp); if (n) n.textContent = (+n.textContent || 0) + (on ? 1 : -1);
      emit(tp, "stz:change", { value: on });
    }

    // 1.3 copy to clipboard
    const cp = t.closest("[data-copy]");
    if (cp) { navigator.clipboard?.writeText(cp.dataset.copy).catch(() => {}); cp.classList.add("is-done"); clearTimeout(cp._t); cp._t = setTimeout(() => cp.classList.remove("is-done"), 1600); }

    // 1.5 async button: idle → busy → done → idle
    const as = t.closest("[data-async]");
    if (as && (as.dataset.state || "idle") === "idle") {
      as.dataset.state = "busy"; as.setAttribute("aria-busy", "true");
      setTimeout(() => { as.dataset.state = "done"; as.removeAttribute("aria-busy"); emit(as, "stz:confirm"); }, +as.dataset.async || 1500);
      setTimeout(() => (as.dataset.state = "idle"), (+as.dataset.async || 1500) + 1700);
    }

    // 1.6 FAB speed dial
    const fab = t.closest(".fab-wrap > .fab");
    if (fab) { const w = fab.parentElement, o = !w.classList.contains("open"); w.classList.toggle("open", o); fab.setAttribute("aria-expanded", String(o)); }

    // 2.5 chips (filter / single-choice) + input chip remove
    const chip = t.closest(".chip[aria-pressed]");
    if (chip) {
      const single = chip.closest("[data-single]");
      if (single) $$(".chip[aria-pressed]", single).forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      else chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true"));
      emit(chip, "stz:change", { value: chip.textContent.trim() });
    }
    const x = t.closest(".chip--input .x");
    if (x) { const c = x.closest(".chip"); c.classList.add("leaving"); setTimeout(() => c.remove(), ms("--dur-2")); }

    // liquid groups (segmented, tab bar, sidebar, pager, theme dots)
    const lg = t.closest("[data-liquid], [data-liquid-v]");
    if (lg) {
      if (lg.matches("[data-pager]")) {
        const items = liquidItems(lg), cur = items.findIndex((b) => b.hasAttribute("aria-current"));
        const b = t.closest("[data-page], [data-page-prev], [data-page-next]");
        if (b && !b.disabled) {
          const i = b.hasAttribute("data-page-prev") ? cur - 1 : b.hasAttribute("data-page-next") ? cur + 1 : items.indexOf(b);
          if (items[i]) selectIn(lg, items[i]);
          const now = items.findIndex((y) => y.hasAttribute("aria-current"));
          const pv = $("[data-page-prev]", lg), nx = $("[data-page-next]", lg);
          if (pv) pv.disabled = now <= 0; if (nx) nx.disabled = now >= items.length - 1;
        }
      } else {
        const item = liquidItems(lg).find((b) => b.contains(t));
        if (item && !item.disabled) selectIn(lg, item);
      }
    } else {
      // generic radiogroup of buttons (swatches etc.)
      const r = t.closest('[role="radiogroup"] [role="radio"]');
      if (r && r.tagName !== "INPUT" && !r.closest("[data-rating]")) {
        $$('[role="radio"]', r.closest('[role="radiogroup"]')).forEach((y) => y.setAttribute("aria-checked", String(y === r)));
        emit(r, "stz:change", { value: r.dataset.value ?? r.getAttribute("aria-label") });
      }
    }

    // 4.3 tabs
    const tab = t.closest('[data-tabs] [role="tab"]');
    if (tab) {
      const tabs = tab.closest("[data-tabs]"), all = $$('[role="tab"]', tabs), i = all.indexOf(tab);
      all.forEach((y) => y.setAttribute("aria-selected", String(y === tab)));
      $$('[role="tabpanel"]', tabs).forEach((p, j) => { p.hidden = j !== i; if (j === i) restart(p, "in"); });
      syncInk(tabs); emit(tabs, "stz:change", { value: tab.textContent.trim() });
    }

    // 2.7 stepper
    const st = t.closest("[data-stepper] [data-step]");
    if (st) {
      const g = st.closest("[data-stepper]"), box = $(".stepper-val", g), d = +st.dataset.step;
      const v = +box.textContent.trim(), n = Math.max(+(g.dataset.min ?? -Infinity), Math.min(+(g.dataset.max ?? Infinity), v + d));
      if (n === v) box.animate?.([{ transform: "translateX(0)" }, { transform: `translateX(${d * 4}px)` }, { transform: "translateX(0)" }], 220);
      else {
        const old = $("span", box), nu = document.createElement("span"); nu.textContent = n;
        nu.style.transform = `translateY(${d > 0 ? 100 : -100}%)`; nu.style.opacity = "0"; box.append(nu);
        requestAnimationFrame(() => requestAnimationFrame(() => { nu.style.transform = ""; nu.style.opacity = ""; old.style.transform = `translateY(${d > 0 ? -100 : 100}%)`; old.style.opacity = "0"; }));
        setTimeout(() => old.remove(), ms("--dur-2") + 50); emit(g, "stz:change", { value: n });
      }
    }

    // 2.9 rating
    const rb = t.closest("[data-rating] button");
    if (rb) { const g = rb.closest("[data-rating]"), all = $$("button", g), v = all.indexOf(rb) + 1; g.dataset.value = v; paintRating(g); restart(rb, "bump"); emit(g, "stz:change", { value: v }); }

    // 3.1 password reveal
    const rv = t.closest("[data-reveal]");
    if (rv) { const inp = $("input", rv.closest(".input-wrap")); const show = inp.type === "password"; inp.type = show ? "text" : "password"; rv.setAttribute("aria-pressed", String(show)); rv.setAttribute("aria-label", show ? "Hide password" : "Show password"); }

    // 3.2 search clear
    const clr = t.closest(".search .clear");
    if (clr) { const inp = $("input", clr.closest(".search")); inp.value = ""; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.focus(); }

    // 3.8 drop zone click → file picker
    const dz = t.closest("[data-dropzone]");
    if (dz && !t.closest("input")) $("input[type=file]", dz)?.click();

    // 4.9 wizard
    const wz = t.closest("[data-wizard-next], [data-wizard-back]");
    if (wz) {
      const w = wz.closest("[data-wizard]"), li = $$(".steps li", w), cur = li.findIndex((l) => l.getAttribute("aria-current") === "step");
      const n = Math.max(0, Math.min(li.length - 1, cur + (wz.hasAttribute("data-wizard-next") ? 1 : -1)));
      li.forEach((l, i) => { l.classList.toggle("done", i < n); i === n ? l.setAttribute("aria-current", "step") : l.removeAttribute("aria-current"); });
      emit(w, "stz:change", { value: n + 1 });
    }

    // 5.1 declarative toast
    const tb = t.closest("[data-toast]");
    if (tb) toast(tb.dataset.toast, tb.dataset.toastMsg || "Done", { action: tb.dataset.toastAction });

    // 5.2 banner dismiss
    const dm = t.closest("[data-dismiss]");
    if (dm) { const w = dm.closest(".banner-wrap"); if (w) w.classList.add("gone"); else dm.closest(".banner, .toast")?.remove(); }

    // 6.x dialogs
    const dt = t.closest("[data-dialog]");
    if (dt) openDialog(dt.dataset.dialog);
    const dc = t.closest("dialog.ov [data-close]");
    if (dc) { e.preventDefault(); closeDialog(dc.closest("dialog"), dc.value || dc.dataset.close); }

    // 7.5 accordion
    const ah = t.closest(".acc-head");
    if (ah) {
      const open = ah.getAttribute("aria-expanded") !== "true", acc = ah.closest("[data-accordion]");
      if (open && acc?.dataset.accordion === "single") $$(".acc-head", acc).forEach((h) => h.setAttribute("aria-expanded", "false"));
      ah.setAttribute("aria-expanded", String(open));
    }

    // 7.4 sortable table
    const sh = t.closest("table[data-sortable] th button");
    if (sh) sortTable(sh);

    // menus / popovers / select / combobox
    const mt = t.closest("[data-menu], [data-popover]");
    if (mt) { e.stopPropagation(); openMenu(mt.dataset.menu || mt.dataset.popover, mt); return; }
    if (t.closest("[data-close-pop]")) return closeMenus();
    const mi = t.closest(".popup .menu-item");
    if (mi && openPop?.contains(mi)) {
      const role = mi.getAttribute("role"), label = mi.dataset.value || [...mi.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
      if (role === "menuitemcheckbox") { mi.setAttribute("aria-checked", String(mi.getAttribute("aria-checked") !== "true")); emit(openTrig || mi, "stz:select", { value: label, checked: mi.getAttribute("aria-checked") === "true" }); return; }
      if (role === "menuitemradio") $$('[role="menuitemradio"]', openPop).forEach((y) => y.setAttribute("aria-checked", String(y === mi)));
      const trig = openTrig; closeMenus(); emit(trig || mi, "stz:select", { value: label }); trig?.focus({ preventScroll: true }); return;
    }
    const selT = t.closest("[data-select] .select-trigger");
    if (selT) { e.stopPropagation(); const s = selT.closest("[data-select]"); s.classList.contains("is-open") ? closeMenus() : openSelect(s); return; }
    const opt = t.closest("[data-select] [role=option], [data-combobox] [role=option]");
    if (opt) { chooseOption(opt); return; }
    if (openPop && !openPop.contains(t)) closeMenus();
  });

  /* ========== Delegated INPUT ========== */
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.type === "range") paintRange(t);
    const s = t.closest(".search"); if (s && t.matches("input")) s.classList.toggle("has-value", !!t.value);
    if (t.matches("textarea[data-counter]")) { const c = $(".counter", t.closest(".field")), n = t.value.length, max = +t.dataset.counter; if (c) { c.textContent = `${n} / ${max}`; c.classList.toggle("over", n > max); } }
    if (t.matches("[data-autogrow]")) { t.style.height = "auto"; t.style.height = `${t.scrollHeight + 2}px`; }
    if (t.matches("[data-validate]")) validate(t);
    if (t.matches("[data-strength]")) { const m = byId(t.dataset.strength), v = t.value; let sc = 0; if (v.length >= 8) sc++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) sc++; if (/\d/.test(v)) sc++; if (/[^\w]/.test(v) || v.length >= 14) sc++; if (m) m.dataset.score = v ? Math.max(1, sc) : 0; }
    if (t.closest("[data-otp]")) otpInput(t);
    if (t.closest("[data-combobox]") && t.matches("input")) filterCombo(t.closest("[data-combobox]"));
    if (t.matches("[data-tristate] input[type=checkbox]")) tristate(t.closest("[data-tristate]"), t);
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("[data-tristate] input[type=checkbox]")) tristate(t.closest("[data-tristate]"), t);
    if (t.matches("[data-dropzone] input[type=file]")) files(t.closest("[data-dropzone]"), t.files);
  });
  document.addEventListener("focusout", (e) => { const t = e.target; if (t.matches?.("[data-validate]")) { validate(t); const f = t.closest(".field"); if (f?.classList.contains("is-error")) restart(f, "shake"); } });

  function paintRange(r) {
    r.style.setProperty("--val", `${((r.value - (r.min || 0)) / ((r.max || 100) - (r.min || 0))) * 100}%`);
    const o = r.dataset.output && byId(r.dataset.output); if (o) o.textContent = `${r.value}${r.dataset.suffix || ""}`;
  }
  function validate(inp) {
    const f = inp.closest(".field"), rules = { email: /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i, required: /\S/ };
    const ok = (rules[inp.dataset.validate] || new RegExp(inp.dataset.validate)).test(inp.value);
    f.classList.toggle("is-error", !ok); f.classList.toggle("is-ok", ok);
    const h = $(".help", f); if (h) h.innerHTML = `${icon(ok ? "ok" : "err")}<span></span>`, (h.lastChild.textContent = ok ? inp.dataset.ok || "Looks good" : inp.dataset.error || "Check this field");
  }
  function tristate(g, changed) {
    const all = $("input[data-all]", g), kids = $$("input[type=checkbox]:not([data-all])", g);
    if (changed === all) kids.forEach((k) => (k.checked = all.checked));
    const n = kids.filter((k) => k.checked).length; all.checked = n === kids.length; all.indeterminate = n > 0 && n < kids.length;
  }
  function otpInput(inp) {
    const g = inp.closest("[data-otp]"), cells = $$("input", g), i = cells.indexOf(inp);
    inp.value = inp.value.replace(/\D/g, "").slice(-1); inp.classList.toggle("filled", !!inp.value);
    if (inp.value && cells[i + 1]) cells[i + 1].focus();
    if (cells.every((c) => c.value)) emit(g, "stz:complete", { value: cells.map((c) => c.value).join("") });
  }
  function paintRating(g) { const v = +g.dataset.value || 0; $$("button", g).forEach((b, i) => { b.classList.toggle("on", i < v); b.setAttribute("aria-checked", String(i + 1 === v)); }); }
  function sortTable(btn) {
    const th = btn.closest("th"), tbl = th.closest("table"), k = [...th.parentElement.children].indexOf(th);
    const dir = th.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
    $$("th", tbl).forEach((x) => x.removeAttribute("aria-sort")); th.setAttribute("aria-sort", dir);
    const body = $("tbody", tbl), rows = $$("tr", body);
    const val = (r) => { const c = r.children[k]; return c.dataset.v != null ? +c.dataset.v : c.textContent.trim().toLowerCase(); };
    const first = new Map(rows.map((r) => [r, r.getBoundingClientRect().top]));
    rows.sort((a, z) => (val(a) > val(z) ? 1 : val(a) < val(z) ? -1 : 0) * (dir === "ascending" ? 1 : -1)).forEach((r) => body.append(r));
    if (!reduced()) rows.forEach((r) => { const d = first.get(r) - r.getBoundingClientRect().top; if (d) r.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: ms("--dur-2"), easing: "cubic-bezier(.16,1,.3,1)" }); });
  }
  function files(dz, list) {
    const ul = $(".file-list", dz.parentElement) || $(".file-list", dz);
    if (ul) [...list].forEach((f) => { const li = document.createElement("li"); li.innerHTML = `${icon("ok", "i-sm")}<span></span>`; li.lastChild.textContent = `${f.name} · ${(f.size / 1024).toFixed(0)} KB`; ul.append(li); });
    emit(dz, "stz:files", { files: [...list] });
  }

  /* ---------- 3.4 Select + 3.7 Combobox ---------- */
  function openSelect(s) {
    closeMenus(); const list = $('[role="listbox"]', s), trig = $(".select-trigger", s);
    s.classList.add("is-open"); list.classList.add("open"); trig.setAttribute("aria-expanded", "true");
    list._select = s; openPop = list; openTrig = trig;
    $$('[role="option"]', list).forEach((o, n) => { o.style.setProperty("--n", n); o.classList.toggle("active", o.getAttribute("aria-selected") === "true"); });
  }
  function chooseOption(opt) {
    const host = opt.closest("[data-select], [data-combobox]"), list = opt.closest('[role="listbox"]');
    $$('[role="option"]', list).forEach((o) => o.setAttribute("aria-selected", String(o === opt)));
    const label = opt.dataset.value || opt.textContent.trim();
    if (host.matches("[data-select]")) {
      $(".select-trigger .value", host).textContent = opt.textContent.trim();
      const sw = $(".select-trigger .sw", host), osw = $(".sw", opt); if (sw && osw) sw.style.setProperty("--c", osw.style.getPropertyValue("--c"));
      closeMenus(); $(".select-trigger", host).focus();
    } else { const inp = $("input", host); inp.value = opt.textContent.trim(); list.classList.remove("open"); inp.setAttribute("aria-expanded", "false"); if (openPop === list) openPop = openTrig = null; }
    emit(host, "stz:select", { value: label });
  }
  function filterCombo(c) {
    const inp = $("input", c), list = $('[role="listbox"]', c), q = inp.value.trim().toLowerCase(); let n = 0;
    $$('[role="option"]', list).forEach((o) => { const hit = !q || o.textContent.toLowerCase().includes(q); o.hidden = !hit; o.classList.remove("active"); if (hit) o.style.setProperty("--n", n++); });
    const empty = $(".combo-empty", list); if (empty) empty.hidden = n > 0;
    if (openPop !== list) { closeMenus(); list.classList.add("open"); inp.setAttribute("aria-expanded", "true"); openPop = list; openTrig = inp; }
  }
  document.addEventListener("focusin", (e) => { const c = e.target.closest?.("[data-combobox]"); if (c && e.target.matches("input")) filterCombo(c); });

  /* ========== Keyboard ========== */
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    // select + combobox navigation
    const host = t.closest?.("[data-select], [data-combobox]");
    if (host) {
      const list = $('[role="listbox"]', host), opts = $$('[role="option"]:not([hidden])', list), open = list.classList.contains("open");
      let i = opts.findIndex((o) => o.classList.contains("active"));
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); if (!open) { host.matches("[data-select]") ? openSelect(host) : filterCombo(host); return; }
        i = (i + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length; opts.forEach((o, j) => o.classList.toggle("active", j === i)); return;
      }
      if ((e.key === "Enter" || (e.key === " " && host.matches("[data-select]"))) && open && opts[i]) { e.preventDefault(); chooseOption(opts[i]); return; }
    }
    if (e.key === "Escape" && openPop) { const tr = openTrig; closeMenus(); tr?.focus?.(); return; }
    if (openPop && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      const items = $$(".menu-item", openPop); if (!items.length) return; e.preventDefault();
      const i = items.indexOf(document.activeElement); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
    }
    // 4.8 context menu from keyboard
    const cm = t.closest?.("[data-contextmenu]");
    if (cm && ((e.shiftKey && e.key === "F10") || e.key === "ContextMenu")) { e.preventDefault(); const b = cm.getBoundingClientRect(); openMenu(cm.dataset.contextmenu, null, { x: b.left + 24, y: b.top + 24 }); }
    // 3.6 OTP backspace
    if (e.key === "Backspace" && t.closest?.("[data-otp]") && !t.value) { const c = $$("input", t.closest("[data-otp]")); c[c.indexOf(t) - 1]?.focus(); }
  });
  document.addEventListener("paste", (e) => {
    const g = e.target.closest?.("[data-otp]"); if (!g) return;
    const d = (e.clipboardData.getData("text") || "").replace(/\D/g, ""); if (!d) return;
    e.preventDefault(); const c = $$("input", g); c.forEach((x, j) => { x.value = d[j] || ""; x.classList.toggle("filled", !!x.value); });
    c[Math.min(d.length, c.length - 1)].focus(); if (c.every((x) => x.value)) emit(g, "stz:complete", { value: d.slice(0, c.length) });
  });

  /* ========== Pointer: context menu, long-press, hold-to-confirm, tilt, drop zone, sheet drag, rating hover ========== */
  document.addEventListener("contextmenu", (e) => { const cm = e.target.closest("[data-contextmenu]"); if (cm) { e.preventDefault(); openMenu(cm.dataset.contextmenu, null, { x: e.clientX, y: e.clientY }); } });
  let lp;
  document.addEventListener("touchstart", (e) => { const cm = e.target.closest("[data-contextmenu]"); if (!cm) return; const p = e.touches[0]; lp = setTimeout(() => openMenu(cm.dataset.contextmenu, null, { x: p.clientX, y: p.clientY }), 480); }, { passive: true });
  ["touchend", "touchmove"].forEach((ev) => document.addEventListener(ev, () => clearTimeout(lp), { passive: true }));

  const holdStart = (b) => {
    if (b.classList.contains("is-done")) return; const dur = +b.dataset.hold || 1200;
    b.style.setProperty("--hold-ms", `${dur}ms`); b.classList.add("holding");
    b._h = setTimeout(() => { b.classList.remove("holding"); b.classList.add("is-done"); emit(b, "stz:confirm"); setTimeout(() => b.classList.remove("is-done"), 2200); }, dur);
  };
  const holdEnd = (b) => { clearTimeout(b._h); b.classList.remove("holding"); };
  document.addEventListener("pointerdown", (e) => { const b = e.target.closest("[data-hold]"); if (b) holdStart(b); });
  ["pointerup", "pointercancel", "pointerout"].forEach((ev) => document.addEventListener(ev, (e) => { const b = e.target.closest?.("[data-hold]"); if (b) holdEnd(b); }));
  document.addEventListener("keydown", (e) => { const b = e.target.closest?.("[data-hold]"); if (b && (e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); holdStart(b); } });
  document.addEventListener("keyup", (e) => { const b = e.target.closest?.("[data-hold]"); if (b && (e.key === " " || e.key === "Enter")) holdEnd(b); });

  document.addEventListener("pointermove", (e) => {
    const c = e.target.closest?.("[data-tilt]"); if (c && !reduced()) { const b = c.getBoundingClientRect(); c.style.setProperty("--rx", `${((e.clientX - b.left) / b.width - 0.5) * 8}deg`); c.style.setProperty("--ry", `${-((e.clientY - b.top) / b.height - 0.5) * 8}deg`); }
    const rb = e.target.closest?.("[data-rating] button"); if (rb) { const all = $$("button", rb.parentElement), i = all.indexOf(rb); all.forEach((b, j) => b.classList.toggle("preview", j <= i && !b.classList.contains("on"))); }
  }, { passive: true });
  document.addEventListener("pointerout", (e) => {
    const c = e.target.closest?.("[data-tilt]"); if (c && !c.contains(e.relatedTarget)) { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); }
    const r = e.target.closest?.("[data-rating]"); if (r && !r.contains(e.relatedTarget)) $$("button", r).forEach((b) => b.classList.remove("preview"));
  });

  ["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => { const dz = e.target.closest?.("[data-dropzone]"); if (dz) { e.preventDefault(); dz.classList.add("over"); } }));
  ["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => {
    const dz = e.target.closest?.("[data-dropzone]"); if (!dz) return;
    if (ev === "dragleave" && dz.contains(e.relatedTarget)) return;
    dz.classList.remove("over"); if (ev === "drop") { e.preventDefault(); files(dz, e.dataTransfer.files); }
  }));

  // sheet drag-to-dismiss: drag the .grabber (or sheet title)
  let drag = null;
  document.addEventListener("pointerdown", (e) => { const g = e.target.closest("dialog.sheet-dlg [data-grab], dialog.sheet-dlg .sheet h2"); if (!g) return; const d = g.closest("dialog"); drag = { d, y0: e.clientY }; d.classList.add("dragging"); });
  document.addEventListener("pointermove", (e) => { if (!drag) return; const dy = e.clientY - drag.y0; drag.d.style.setProperty("--drag", `${dy > 0 ? dy : dy / 6}px`); });
  document.addEventListener("pointerup", (e) => { if (!drag) return; const { d, y0 } = drag; drag = null; d.classList.remove("dragging"); if (e.clientY - y0 > 110) closeDialog(d); else d.style.setProperty("--drag", "0px"); });

  // dialogs: Esc, backdrop click, form submit → animated close
  document.addEventListener("cancel", (e) => { if (e.target.matches?.("dialog.ov")) { e.preventDefault(); closeDialog(e.target); } }, true);
  document.addEventListener("mousedown", (e) => { if (e.target.matches?.("dialog.ov")) e.target._down = true; });
  document.addEventListener("click", (e) => { const d = e.target; if (d.matches?.("dialog.ov") && d._down) closeDialog(d); if (d.matches?.("dialog.ov")) d._down = false; });
  document.addEventListener("submit", (e) => { const d = e.target.closest("dialog.ov"); if (!d) return; e.preventDefault(); closeDialog(d, e.submitter?.value); });

  // scrolling closes fixed popups (not while focus is inside one)
  document.addEventListener("scroll", (e) => { if (openPop && openPop.style.position === "fixed" && !openPop.contains(e.target)) closeMenus(); }, true);

  /* ---------- init: place thumbs, ink, ranges, tristates, ratings ---------- */
  function init(scope = document, animate = false) {
    $$("[data-liquid], [data-liquid-v]", scope).forEach((g) => syncThumb(g, animate));
    $$("[data-tabs]", scope).forEach((t) => syncInk(t, animate));
    $$('input[type="range"]', scope).forEach(paintRange);
    $$("[data-tristate]", scope).forEach((g) => tristate(g));
    $$("[data-rating]", scope).forEach(paintRating);
    $$("[data-pager]", scope).forEach((g) => { const it = liquidItems(g), i = it.findIndex((b) => b.hasAttribute("aria-current")); const pv = $("[data-page-prev]", g), nx = $("[data-page-next]", g); if (pv) pv.disabled = i <= 0; if (nx) nx.disabled = i >= it.length - 1; });
    $$(".switch[data-pref]", scope).forEach((s) => s.setAttribute("aria-checked", String(!!root.dataset[s.dataset.pref])));
    $$("[data-set-theme][role=radio]", scope).forEach((b) => b.setAttribute("aria-checked", String(b.dataset.setTheme === root.dataset.theme)));
  }
  let rz; addEventListener("resize", () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => init(document, false)); });

  const boot = () => { injectIcons(); init(document, false); document.fonts?.ready.then(() => init(document, false)); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();

  window.Steez = { setTheme, themes: THEMES, toast, openDialog, closeDialog, openMenu, closeMenus, init, icon, get icons() { return Object.keys(ICONS); } };
})();
