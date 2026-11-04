// SVP companion icon sprite: player-specific glyphs in the Steez icon style
// (24×24, stroke = currentColor, width/cap/join from the theme via `.i`). Use like any Steez icon:
// <svg class="i"><use href="#i-scissors"/></svg>
const ICONS = {
  "frame-prev": '<path d="M6 5v14"/><path d="M18 6l-8 6 8 6z"/>',
  "frame-next": '<path d="M18 5v14"/><path d="M6 6l8 6-8 6z"/>',
  "rewind": '<path d="M11 7 4 12l7 5z"/><path d="M20 7l-7 5 7 5z"/>',
  "forward": '<path d="m13 7 7 5-7 5z"/><path d="m4 7 7 5-7 5z"/>',
  "scissors": '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  "compress": '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  "compare": '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M12 2v20"/><path d="m7 10-2 2 2 2M17 10l2 2-2 2"/>',
  "fullscreen": '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
  "fullscreen-exit": '<path d="M9 4v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M15 20v-4a1 1 0 0 1 1-1h4M4 15h4a1 1 0 0 1 1 1v4"/>',
  "captions": '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3"/>',
  "vol-mute": '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  "vol-mid": '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/>',
  "gauge": '<path d="M4.5 18a8.5 8.5 0 1 1 15 0"/><path d="m12 14 4-5"/><circle cx="12" cy="14" r="1.2"/>',
  "repeat": '<path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/>',
  "camera": '<path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/>',
  "win-min": '<path d="M6 12h12"/>',
  "win-max": '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  "win-restore": '<rect x="5" y="8" width="11" height="11" rx="1.5"/><path d="M9 5h8.5A1.5 1.5 0 0 1 19 6.5V15"/>',
  "film": '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  "bracket-in": '<path d="M10 4H6v16h4"/><path d="M14 12h6M17 9l3 3-3 3"/>',
  "bracket-out": '<path d="M14 4h4v16h-4"/><path d="M4 12h6M7 9l3 3-3 3"/>',
  "keyboard": '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7 14h10"/>',
  "cpu": '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
  "layers-split": '<rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="16" rx="2"/>',
  "zoom": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/>',
  "pip": '<rect x="3" y="5" width="18" height="14" rx="2.5"/><rect x="12" y="11" width="6" height="5" rx="1"/>',
  "audio-track": '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  "segment": '<path d="M4 12h16"/><path d="M8 8v8M16 8v8"/>',
  "swap": '<path d="M7 4 3 8l4 4"/><path d="M3 8h13a4 4 0 0 1 4 4"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8a4 4 0 0 1-4-4"/>',
};
const svg = `<svg id="svp-icons" width="0" height="0" style="position:absolute" aria-hidden="true">${
  Object.entries(ICONS).map(([n, p]) => `<symbol id="i-${n}" viewBox="0 0 24 24">${p}</symbol>`).join("")}</svg>`;
document.body.insertAdjacentHTML("afterbegin", svg);
export const icon = (name, cls = "") => `<svg class="i ${cls}"><use href="#i-${name}"/></svg>`;
