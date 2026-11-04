"""Builds library.html: every Steez snippet, numbered, with use / animation / JS notes.
Edit SNIPPETS below, then run:  python tools/build_library.py
Each snippet = (id, title, use, anim, js, html). IDs are STZ x.y.zz (x.y = showcase number)."""
import html as H
from pathlib import Path

def I(name, cls=""):
    return f'<svg class="i{(" " + cls) if cls else ""}"><use href="#i-{name}"/></svg>'

PRESS = "press: scale(--press-scale) on :active (dur-1, spring); hover: fill/brighten (dur-1)"
NONE = "none (CSS only)"
POP = "opens: scale .88→1 + blur 6→0 from trigger corner (dur-2 spring); items cascade 22ms apart"
DLG = "opens: scale .9→1 + blur 8→0 (dur-3 spring), backdrop blur 0→6px; closes in reverse"

CATS = {
 "0": "Foundations", "1": "Actions", "2": "Selection", "3": "Inputs", "4": "Navigation",
 "5": "Feedback", "6": "Overlays", "7": "Content", "8": "Theme & appearance",
}

SNIPPETS = [
# ───────────────────────── 0 FOUNDATIONS
("0.1.01", "Glass panel (regular)", "Any content panel or card-level surface that sits on the wallpaper.", "none", NONE,
 '<div class="glass" style="padding:16px;border-radius:var(--r-xl)">Panel content</div>'),
("0.1.02", "Glass panel (thick / chrome)", "App chrome: sidebars, toolbars, floating bars. Highest contrast.", "none", NONE,
 '<div class="glass glass--thick" style="padding:16px;border-radius:var(--r-xl)">Toolbar or sidebar content</div>'),
("0.1.03", "Wallpaper backdrop", "Once per app, first child of <body>. Gives glass something to sit on. Drifts slowly (off when reduced motion).", "blobs drift 38–52s alternate", NONE,
 '<div class="wallpaper" aria-hidden="true"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="blob b4"></div></div>'),
("0.7.01", "Icon", "Every icon. Sizes: default 20, add class i-sm (16) or i-lg (28). Names: Steez.icons. Decorative next to text: no label needed; icon-only control: put aria-label on the button.", "none", "steez.js injects the sprite",
 f'{I("star")} {I("star","i-sm")} {I("star","i-lg")}'),

# ───────────────────────── 1 ACTIONS
("1.1.01", "Primary button", "The one main action in a view (Save, Create, Continue). Max one per view.", PRESS, NONE,
 '<button class="btn btn--filled pressable">Create project</button>'),
("1.1.02", "Secondary button (tinted)", "Supporting action beside a primary (Duplicate, Invite).", PRESS, NONE,
 '<button class="btn btn--tinted pressable">Duplicate</button>'),
("1.1.03", "Glass button", "Actions on media, toolbars or other glass (Share, Edit cover).", PRESS, NONE,
 f'<button class="btn btn--glass pressable">{I("share")}Share</button>'),
("1.1.04", "Outline button", "Neutral secondary action where tint is too loud (Filters, Edit).", PRESS, NONE,
 '<button class="btn btn--outline pressable">Edit details</button>'),
("1.1.05", "Plain button", "Tertiary action, Cancel, low-emphasis toolbar actions.", PRESS, NONE,
 '<button class="btn btn--plain pressable">Cancel</button>'),
("1.1.06", "Link button", "Inline navigation in text or forms (Forgot password?).", "hover: underline thickens", NONE,
 '<button class="btn btn--link">Forgot password?</button>'),
("1.1.07", "Destructive button", "Irreversible action, usually the confirm inside 6.4 Alert.", PRESS, NONE,
 f'<button class="btn btn--danger pressable">{I("trash")}Delete</button>'),
("1.1.08", "Destructive soft button", "Entry point to a destructive flow inside settings or lists (Remove member).", PRESS, NONE,
 '<button class="btn btn--danger-soft pressable">Remove member</button>'),
("1.1.09", "Disabled button", "Action unavailable. Always explain why nearby (helper text or tooltip).", "none", NONE,
 '<button class="btn btn--filled pressable" disabled>Publish</button>'),
("1.1.10", "Button with leading icon", "Make common actions scannable (Add, Download, Share).", PRESS, NONE,
 f'<button class="btn btn--filled pressable">{I("plus")}New project</button>'),
("1.1.11", "Button with trailing arrow", "Forward navigation (Continue, Next step). Arrow nudges right on hover.", PRESS + "; arrow translateX(3px) on hover (dur-2 spring)", NONE,
 f'<button class="btn btn--filled pressable">Continue{I("arrow-right","i-trail")}</button>'),
("1.1.12", "Button with shortcut", "Desktop apps: show the keyboard shortcut inside the button.", PRESS, NONE,
 '<button class="btn btn--glass pressable">Search<kbd>⌘K</kbd></button>'),
("1.1.13", "Pill button", "Onboarding / marketing CTAs, friendly standalone actions.", PRESS, NONE,
 '<button class="btn btn--filled btn--pill pressable">Get started</button>'),
("1.1.14", "Two-line CTA", "Plans, pricing, or an action that needs a one-line consequence.", PRESS, NONE,
 '<button class="btn btn--filled btn--two-line pressable">Upgrade to Pro<small>$8 / month · cancel anytime</small></button>'),

("1.2.01", "Button sizes", "sm 32px (dense rows), md 40px (default), lg 50px (primary on mobile, empty states).", PRESS, NONE,
 '<button class="btn btn--filled btn--sm pressable">Small</button>\n<button class="btn btn--filled pressable">Medium</button>\n<button class="btn btn--filled btn--lg pressable">Large</button>'),
("1.2.02", "Block button", "Full-width primary in mobile forms, sheets and auth screens.", PRESS, NONE,
 '<button class="btn btn--filled btn--lg btn--block pressable">Continue with email</button>'),
("1.2.03", "Footer actions (right-aligned)", "Dialog / form footers: secondary first, primary last (rightmost).", PRESS, NONE,
 '<div class="row" style="justify-content:flex-end;width:100%">\n  <button class="btn btn--plain pressable">Cancel</button>\n  <button class="btn btn--filled pressable">Save changes</button>\n</div>'),
("1.2.04", "Stacked actions (mobile)", "Mobile sheets and empty states: primary on top, full width.", PRESS, NONE,
 '<div class="stack" style="width:100%;max-width:320px">\n  <button class="btn btn--filled btn--lg btn--block pressable">Create account</button>\n  <button class="btn btn--glass btn--lg btn--block pressable">Sign in</button>\n</div>'),

("1.3.01", "Icon button + tooltip", "Icon-only action. Always aria-label; add data-tip for a hover/focus tooltip.", PRESS + "; tooltip fades + scales in after 350ms", NONE,
 f'<button class="icon-btn pressable" aria-label="Download" data-tip="Download">{I("download")}</button>'),
("1.3.02", "Ghost icon button", "Toolbars and dense rows where a filled circle is too heavy.", PRESS, NONE,
 f'<button class="icon-btn icon-btn--ghost pressable" aria-label="Edit">{I("edit")}</button>'),
("1.3.03", "Small icon button", "Close buttons, inline row actions (32px).", PRESS, NONE,
 f'<button class="icon-btn icon-btn--sm pressable" aria-label="Close">{I("x")}</button>'),
("1.3.04", "Toggle icon button", "On/off state (Bookmark, Pin, Mute). aria-pressed carries the state.", PRESS + "; glyph pops (scale .6→1, dur-2 spring) and fills", "data-toggle-press → stz:change {value:boolean}",
 f'<button class="icon-btn pressable" aria-label="Bookmark" aria-pressed="false" data-toggle-press>{I("bookmark")}</button>'),
("1.3.05", "Favorite (heart)", "Like / favorite. Same as 1.3.04 with heart glyph.", PRESS + "; heart pops and fills", "data-toggle-press",
 f'<button class="icon-btn pressable" aria-label="Favorite" aria-pressed="false" data-toggle-press>{I("heart")}</button>'),
("1.3.06", "Copy to clipboard", "Copy a link, code or ID. Icon swaps to a check for 1.6s.", "icons cross-fade + rotate (dur-2 spring)", 'data-copy="text to copy"',
 f'<button class="icon-btn pressable" aria-label="Copy link" data-copy="https://steez.app/p/midnight"><span class="swap"><span class="s-off">{I("copy")}</span><span class="s-on">{I("check")}</span></span></button>'),
("1.3.07", "Icon button with count", "Notifications / inbox with unread count. Update aria-label with the number.", PRESS + "; add class bump to .count-bubble to pulse", NONE,
 f'<button class="icon-btn has-count pressable" aria-label="Notifications, 3 unread">{I("bell")}<span class="count-bubble">3</span></button>'),
("1.3.08", "Icon button with new dot", "Something new, no count needed.", PRESS, NONE,
 f'<button class="icon-btn pressable" aria-label="Updates, new" style="position:relative">{I("sparkle")}<span class="new-dot" style="top:4px;right:4px"></span></button>'),
("1.3.09", "Overflow (more) button", "Opens a menu of secondary actions. Pair with a 4.7 menu.", PRESS + "; menu: " + POP, 'data-menu="MENU_ID" → stz:select {value}',
 f'<button class="icon-btn icon-btn--ghost pressable" aria-label="More" aria-haspopup="menu" aria-expanded="false" data-menu="m-1309">{I("more")}</button>\n<div class="popup" id="m-1309" role="menu">\n  <button class="menu-item" role="menuitem">{I("edit")}Rename</button>\n  <button class="menu-item" role="menuitem">{I("copy")}Duplicate</button>\n  <div class="menu-sep"></div>\n  <button class="menu-item danger" role="menuitem">{I("trash")}Delete</button>\n</div>'),

("1.4.01", "Button group", "Related, equal-weight actions (alignment, zoom levels).", PRESS, NONE,
 '<div class="btn-group" role="group" aria-label="Alignment">\n  <button class="btn pressable">Left</button><button class="btn pressable">Center</button><button class="btn pressable">Right</button>\n</div>'),
("1.4.02", "Split button", "A default action plus alternatives (Export → formats).", PRESS + "; chevron rotates 180°; " + POP, 'data-menu="MENU_ID"',
 f'<div class="split">\n  <button class="btn btn--filled pressable">{I("download")}Export</button>\n  <button class="btn btn--filled pressable" aria-label="Export options" aria-haspopup="menu" aria-expanded="false" data-menu="m-1402">{I("chev-down","i-chev")}</button>\n</div>\n<div class="popup" id="m-1402" role="menu">\n  <div class="menu-label">Export as</div>\n  <button class="menu-item" role="menuitem">{I("music")}Audio (WAV)</button>\n  <button class="menu-item" role="menuitem">{I("layers")}Stems (ZIP)</button>\n  <button class="menu-item" role="menuitem">{I("image")}Cover (PNG)</button>\n</div>'),
("1.4.03", "Previous / next pair", "Step through items (photos, records, steps).", PRESS, NONE,
 f'<div class="row">\n  <button class="btn btn--glass pressable">{I("chev-left")}Previous</button>\n  <button class="btn btn--glass pressable">Next{I("chev-right")}</button>\n</div>'),
("1.4.04", "Toolbar icon group", "Formatting or tool palettes inside a toolbar.", PRESS, NONE,
 f'<div class="btn-group" role="toolbar" aria-label="Formatting">\n  <button class="btn pressable" aria-label="Bold"><b>B</b></button><button class="btn pressable" aria-label="Italic"><i>I</i></button><button class="btn pressable" aria-label="Link">{I("link")}</button>\n</div>'),

("1.5.01", "Async save button", "Any network action. Shows busy spinner, then a success state, then resets. Replace the timer with your real promise.", "label blurs out, spinner scales in, then check + 'Saved' (dur-2 spring)", 'data-async="ms" → stz:confirm when done. Real use: set el.dataset.state = "busy" | "done" | "idle" yourself.',
 f'<button class="btn btn--filled btn--lg btn-async pressable" data-async="1500" data-state="idle">\n  <span class="a-idle">Save changes</span>\n  <span class="a-busy"><span class="ring-spin" style="width:20px;height:20px;border-width:2.5px;border-color:color-mix(in oklab,var(--accent-ink) 30%,transparent);border-top-color:var(--accent-ink)"></span></span>\n  <span class="a-done">{I("check")}Saved</span>\n</button>'),
("1.5.02", "Hold to confirm", "Destructive or irreversible action without a dialog (Delete forever). User holds for 1.2s; works with Space/Enter.", "fill sweeps left→right while held (linear, data-hold ms); releases spring back", 'data-hold="1200" → stz:confirm',
 f'<button class="btn btn--danger btn-hold pressable" data-hold="1200">{I("trash")}Hold to delete</button>'),
("1.5.03", "Follow / Following toggle", "Subscribe, follow, join. Label and style flip on press.", "labels slide vertically and cross-fade (dur-2 spring)", "data-toggle-press",
 '<button class="btn btn--filled btn-follow pressable" aria-pressed="false" data-toggle-press><span class="swap"><span class="s-off">Follow</span><span class="s-on">Following</span></span></button>'),
("1.5.04", "Like counter button", "Reactions with a visible count. Count updates ±1 automatically.", "heart pops + fills (dur-2 spring)", "data-toggle-press + child .n",
 f'<button class="btn btn--glass btn-count pressable" aria-pressed="false" data-toggle-press>{I("heart")}<span class="n">12</span></button>'),
("1.5.05", "Upload button", "Pick files from a button. For drag-and-drop use 3.8.01.", PRESS, NONE,
 f'<label class="btn btn--tinted pressable" style="cursor:pointer">{I("upload")}Upload files<input type="file" multiple hidden></label>'),
("1.5.06", "Back button", "Top-left of a pushed screen. Label = previous screen name.", PRESS, NONE,
 f'<button class="btn btn--plain pressable" style="padding-left:6px">{I("chev-left")}Library</button>'),

("1.6.01", "Floating action button", "The single most common create action on mobile screens.", PRESS, NONE,
 f'<button class="fab pressable" aria-label="Create">{I("plus")}</button>'),
("1.6.02", "Speed dial", "FAB that expands into 2–4 create options.", "plus rotates 135°; options rise + scale in, staggered 50ms (dur-2 spring)", ".fab-wrap > .fab toggles .open",
 f'<div class="fab-wrap">\n  <div class="dial">\n    <button class="icon-btn pressable" style="--k:2" aria-label="New image" data-tip="Image">{I("image")}</button>\n    <button class="icon-btn pressable" style="--k:1" aria-label="New note" data-tip="Note">{I("edit")}</button>\n    <button class="icon-btn pressable" style="--k:0" aria-label="New folder" data-tip="Folder">{I("folder")}</button>\n  </div>\n  <button class="fab pressable" aria-label="Create" aria-expanded="false">{I("plus")}</button>\n</div>'),
("1.6.03", "Extended FAB", "FAB with a label when the action is not obvious from the icon.", PRESS, NONE,
 f'<button class="fab fab--ext pressable">{I("edit")}Compose</button>'),

# ───────────────────────── 2 SELECTION
("2.1.01", "Switch row", "Instant on/off settings (applies immediately, no Save button).", "knob slides (dur-2 spring); knob stretches to 34px while pressed", ".switch → stz:change {value:boolean}",
 '<div class="toggle-row"><span>Notifications</span><button class="switch" role="switch" aria-checked="true" aria-label="Notifications"><span class="knob"></span></button></div>'),
("2.1.02", "Switch with description", "Settings that need a one-line explanation.", "as 2.1.01", ".switch",
 '<div class="toggle-row"><span class="choice-label">Sync over cellular<small>May use mobile data</small></span><button class="switch" role="switch" aria-checked="false" aria-label="Sync over cellular"><span class="knob"></span></button></div>'),
("2.1.03", "Disabled switch", "Setting locked by policy or plan. Explain why in the label.", "none", NONE,
 '<div class="toggle-row"><span class="faint">Managed by admin</span><button class="switch" role="switch" aria-checked="true" disabled aria-label="Managed by admin"><span class="knob"></span></button></div>'),

("2.2.01", "Checkbox", "Multi-select options, agreements. Native input, fully keyboard accessible.", "tick draws in (stroke-dashoffset, dur-2); box squishes on press", NONE,
 '<label class="check"><input type="checkbox"><span class="box"><svg viewBox="0 0 16 16"><path class="tick" d="M3.5 8.5l3 3 6-7"/><path class="dash" d="M4 8h8"/></svg></span>Remember me</label>'),
("2.2.02", "Checkbox with description", "Options needing context.", "as 2.2.01", NONE,
 '<label class="check"><input type="checkbox" checked><span class="box"><svg viewBox="0 0 16 16"><path class="tick" d="M3.5 8.5l3 3 6-7"/><path class="dash" d="M4 8h8"/></svg></span><span class="choice-label">Email me about new features<small>About once a month</small></span></label>'),
("2.2.03", "Tri-state checkbox group", "Select-all over a list. Parent shows a dash when some are checked.", "as 2.2.01; dash draws for indeterminate", "data-tristate on wrapper, data-all on parent input",
 '<div class="stack" data-tristate>\n  <label class="check"><input type="checkbox" data-all><span class="box"><svg viewBox="0 0 16 16"><path class="tick" d="M3.5 8.5l3 3 6-7"/><path class="dash" d="M4 8h8"/></svg></span>Select all</label>\n  <label class="check" style="margin-left:34px"><input type="checkbox" checked><span class="box"><svg viewBox="0 0 16 16"><path class="tick" d="M3.5 8.5l3 3 6-7"/><path class="dash" d="M4 8h8"/></svg></span>cover.png</label>\n  <label class="check" style="margin-left:34px"><input type="checkbox"><span class="box"><svg viewBox="0 0 16 16"><path class="tick" d="M3.5 8.5l3 3 6-7"/><path class="dash" d="M4 8h8"/></svg></span>stems.zip</label>\n</div>'),
("2.2.04", "Disabled checkbox", "Option not available.", "none", NONE,
 '<label class="check"><input type="checkbox" disabled><span class="box"><svg viewBox="0 0 16 16"><path class="tick" d="M3.5 8.5l3 3 6-7"/><path class="dash" d="M4 8h8"/></svg></span><span class="faint">Offline mode (Pro)</span></label>'),
("2.2.05", "Checkbox cards", "Pick several larger options (features, interests, add-ons).", "card tints + accent ring when checked (dur-2)", NONE,
 '<div class="stack" style="width:100%">\n  <label class="choice-card"><input type="checkbox" class="sr-only" checked><span class="check"><span class="box"><svg viewBox="0 0 16 16"><path class="tick" d="M3.5 8.5l3 3 6-7"/><path class="dash" d="M4 8h8"/></svg></span></span><span class="choice-label">Cloud backup<small>Every file, every version</small></span></label>\n  <label class="choice-card"><input type="checkbox" class="sr-only"><span class="check"><span class="box"><svg viewBox="0 0 16 16"><path class="tick" d="M3.5 8.5l3 3 6-7"/><path class="dash" d="M4 8h8"/></svg></span></span><span class="choice-label">Team sharing<small>Up to 10 collaborators</small></span></label>\n</div>'),

("2.3.01", "Radio group", "Pick exactly one of 2–5 visible options.", "dot springs in (scale 0→1, dur-2 spring)", NONE,
 '<div class="stack" role="radiogroup" aria-label="Quality">\n  <label class="radio"><input type="radio" name="q-2301" checked><span class="dot"></span><span class="choice-label">High<small>Best quality, larger files</small></span></label>\n  <label class="radio"><input type="radio" name="q-2301"><span class="dot"></span><span class="choice-label">Compact<small>Smaller files</small></span></label>\n</div>'),
("2.3.02", "Radio cards", "Pick one plan / option where each needs detail.", "card tint + ring (dur-2); dot springs in", NONE,
 '<div class="stack" style="width:100%" role="radiogroup" aria-label="Plan">\n  <label class="choice-card"><input type="radio" name="p-2302" class="sr-only" checked><span class="radio"><span class="dot"></span></span><span class="choice-label">Free<small>3 projects · 2 GB</small></span></label>\n  <label class="choice-card"><input type="radio" name="p-2302" class="sr-only"><span class="radio"><span class="dot"></span></span><span class="choice-label">Pro · $8/mo<small>Unlimited projects · 200 GB</small></span></label>\n</div>'),
("2.3.03", "Radio with disabled option", "One option unavailable; say why.", "as 2.3.01", NONE,
 '<div class="stack" role="radiogroup" aria-label="Delivery">\n  <label class="radio"><input type="radio" name="d-2303" checked><span class="dot"></span>Standard</label>\n  <label class="radio"><input type="radio" name="d-2303" disabled><span class="dot"></span><span class="faint">Express (not in your region)</span></label>\n</div>'),

("2.4.01", "Segmented control", "Switch views or ranges, 2–5 short options. Changes content instantly.", "thumb glides + stretches along travel then settles (dur-2 spring)", "data-liquid → stz:change {value}",
 '<div class="seg" role="radiogroup" aria-label="Range" data-liquid>\n  <span class="seg-thumb liquid-thumb"></span>\n  <button role="radio" aria-checked="false">Day</button><button role="radio" aria-checked="true">Week</button><button role="radio" aria-checked="false">Month</button>\n</div>'),
("2.4.02", "Segmented control, full width", "Mobile headers, sheets, forms.", "as 2.4.01", "data-liquid",
 '<div class="seg seg--wide" role="radiogroup" aria-label="View" data-liquid>\n  <span class="seg-thumb liquid-thumb"></span>\n  <button role="radio" aria-checked="true">List</button><button role="radio" aria-checked="false">Grid</button>\n</div>'),
("2.4.03", "Icon segmented control", "Compact view switchers. Each button needs aria-label.", "as 2.4.01", "data-liquid",
 f'<div class="seg seg--icons" role="radiogroup" aria-label="Layout" data-liquid>\n  <span class="seg-thumb liquid-thumb"></span>\n  <button role="radio" aria-checked="true" aria-label="List">{I("list")}</button><button role="radio" aria-checked="false" aria-label="Grid">{I("grid")}</button><button role="radio" aria-checked="false" aria-label="Calendar">{I("calendar")}</button>\n</div>'),

("2.5.01", "Filter chips", "Toggle several filters on a list.", "check icon grows in (grid 0fr→1fr, dur-2 spring); tint fades", ".chip[aria-pressed] → stz:change",
 f'<div class="chips">\n  <button class="chip pressable" aria-pressed="true"><span class="chip-check"><span>{I("check")}</span></span>Audio</button>\n  <button class="chip pressable" aria-pressed="false"><span class="chip-check"><span>{I("check")}</span></span>Video</button>\n  <button class="chip pressable" aria-pressed="false"><span class="chip-check"><span>{I("check")}</span></span>Images</button>\n</div>'),
("2.5.02", "Choice chips (single)", "Pick one from short options inline (sizes, categories).", "as 2.5.01", "wrapper data-single",
 f'<div class="chips" data-single>\n  <button class="chip pressable" aria-pressed="true"><span class="chip-check"><span>{I("check")}</span></span>Small</button>\n  <button class="chip pressable" aria-pressed="false"><span class="chip-check"><span>{I("check")}</span></span>Medium</button>\n  <button class="chip pressable" aria-pressed="false"><span class="chip-check"><span>{I("check")}</span></span>Large</button>\n</div>'),
("2.5.03", "Input chips (removable)", "Entered values: recipients, tags.", "removed chip shrinks + blurs out (dur-2)", ".chip--input .x removes",
 f'<div class="chips">\n  <span class="chip chip--input">mara@steez.app<button class="x" aria-label="Remove mara@steez.app">{I("x")}</button></span>\n  <span class="chip chip--input">design<button class="x" aria-label="Remove design">{I("x")}</button></span>\n</div>'),
("2.5.04", "Suggestion chips", "Quick replies / suggested searches. They act like buttons.", PRESS, NONE,
 f'<div class="chips">\n  <button class="chip pressable">{I("sparkle","i-sm")}&nbsp;Summarize</button>\n  <button class="chip pressable">Recent files</button>\n  <button class="chip pressable">Shared with me</button>\n</div>'),

("2.6.01", "Slider with value", "Continuous values (volume, opacity).", "knob becomes a clear glass lens while dragging (scale 1.45, dur-2 spring)", 'data-output="OUTPUT_ID" data-suffix="%"',
 '<div class="slider"><div class="slider-top"><label for="s-2601">Volume</label><output id="o-2601">64%</output></div><input type="range" id="s-2601" min="0" max="100" value="64" data-output="o-2601" data-suffix="%"></div>'),
("2.6.02", "Stepped slider with ticks", "Discrete steps (blur, quality levels).", "as 2.6.01", "data-output / data-suffix",
 '<div class="slider"><div class="slider-top"><label for="s-2602">Blur</label><output id="o-2602">24 px</output></div><input type="range" id="s-2602" min="0" max="48" step="12" value="24" data-output="o-2602" data-suffix=" px"><div class="ticks"><span>0</span><span>12</span><span>24</span><span>36</span><span>48</span></div></div>'),
("2.6.03", "Slider with icons", "Media volume, brightness: min/max icons instead of a label.", "as 2.6.01", NONE,
 f'<div class="slider-icons">{I("vol-low")}<input type="range" min="0" max="100" value="40" aria-label="Volume">{I("vol-high")}</div>'),

("2.7.01", "Stepper", "Small integer quantities (copies, guests). Use data-min/data-max.", "number rolls up/down in the direction of change (dur-2 spring); nudges sideways at limits", "data-stepper → stz:change {value}",
 f'<div class="stepper" data-stepper data-min="1" data-max="20">\n  <button class="icon-btn pressable" aria-label="Decrease" data-step="-1">{I("minus")}</button>\n  <div class="stepper-val" aria-live="polite"><span>2</span></div>\n  <button class="icon-btn pressable" aria-label="Increase" data-step="1">{I("plus")}</button>\n</div>'),
("2.8.01", "Swatch picker", "Pick a color label / tag color.", "selection ring scales in (dur-2 spring)", 'role="radiogroup" + role="radio" buttons → stz:change',
 '<div class="swatches" role="radiogroup" aria-label="Label color">\n  <button class="swatch" role="radio" aria-checked="true" aria-label="Accent" style="--c:var(--accent)"></button>\n  <button class="swatch" role="radio" aria-checked="false" aria-label="Blue" style="--c:#2563eb"></button>\n  <button class="swatch" role="radio" aria-checked="false" aria-label="Green" style="--c:#0b7d5a"></button>\n  <button class="swatch" role="radio" aria-checked="false" aria-label="Amber" style="--c:#b45309"></button>\n</div>'),
("2.9.01", "Star rating", "Rate 1–5. Hover previews, click commits.", "hovered stars preview; clicked star pops (dur-2 spring)", "data-rating → stz:change {value}",
 '<div class="rating" role="radiogroup" aria-label="Rating" data-rating data-value="3">\n' + "\n".join(f'  <button role="radio" aria-label="{n} star{"s" if n > 1 else ""}">{I("star")}</button>' for n in range(1, 6)) + '\n</div>'),
("2.10.01", "Selectable tiles (multi)", "Pick several visual options (interests, platforms, features).", "tile tints, ring draws, icon scales 1.1 (dur-2 spring)", NONE,
 f'<div class="tile-grid">\n  <label class="sel-tile"><input type="checkbox" checked>{I("music")}Music</label>\n  <label class="sel-tile"><input type="checkbox">{I("image")}Photos</label>\n  <label class="sel-tile"><input type="checkbox">{I("chat")}Podcasts</label>\n</div>'),
("2.10.02", "Selectable tiles (single)", "Pick one visual option (theme, layout, account type).", "as 2.10.01", NONE,
 f'<div class="tile-grid" role="radiogroup" aria-label="Device">\n  <label class="sel-tile"><input type="radio" name="t-21002" checked>{I("window")}Desktop</label>\n  <label class="sel-tile"><input type="radio" name="t-21002">{I("grid")}Tablet</label>\n  <label class="sel-tile"><input type="radio" name="t-21002">{I("user")}Phone</label>\n</div>'),

# ───────────────────────── 3 INPUTS
("3.1.01", "Text field (floating label)", "Default text input. Label sits inside, floats up on focus/value. Keep placeholder=\" \".", "label moves up + scales .76 (dur-2 spring); focus ring fades in", NONE,
 '<div class="field"><input class="input" id="f-3101" placeholder=" "><label class="float-label" for="f-3101">Project name</label></div>'),
("3.1.02", "Text field (label above)", "Dense forms, filters, or when a placeholder example is useful.", "focus ring fades in (dur-1)", NONE,
 '<div class="field"><label class="label" for="f-3102">Display name</label><input class="input input--plain" id="f-3102" placeholder="e.g. Mara Okafor"><span class="help">Shown on comments and shares.</span></div>'),
("3.1.03", "Text field with icon", "Inputs whose type benefits from a hint icon (email, URL, location).", "as 3.1.02", NONE,
 f'<div class="field"><label class="label" for="f-3103">Email</label><div class="input-wrap">{I("mail")}<input class="input input--plain" id="f-3103" type="email" placeholder="you@company.com"></div></div>'),
("3.1.04", "Password + reveal + strength", "Sign-up / change password.", "eye icon swaps; strength bars fill with color (dur-2)", 'data-reveal on the eye button; data-strength="METER_ID" on the input',
 f'<div class="field"><label class="label" for="f-3104">Password</label>\n  <div class="input-wrap"><input class="input input--plain" id="f-3104" type="password" placeholder="At least 8 characters" data-strength="m-3104"><button class="icon-btn icon-btn--ghost icon-btn--sm trail" type="button" aria-label="Show password" aria-pressed="false" data-reveal><span class="swap"><span class="s-off">{I("eye")}</span><span class="s-on">{I("eye-off")}</span></span></button></div>\n  <div class="strength" id="m-3104" data-score="0"><i></i><i></i><i></i><i></i></div>\n</div>'),
("3.1.05", "Prefix / suffix field", "URLs, handles, currency, units.", "focus ring on the whole group (dur-1)", NONE,
 '<div class="field"><label class="label" for="f-3105">Profile URL</label><div class="affix"><span>steez.app/</span><input class="input" id="f-3105" placeholder="your-name"></div></div>'),
("3.1.06", "Read-only + copy", "Show a value the user copies (invite link, API key).", "copy icon swaps to check (dur-2 spring)", 'data-copy on the button',
 f'<div class="field"><label class="label" for="f-3106">Invite link</label><div class="input-wrap"><input class="input input--plain" id="f-3106" readonly value="https://steez.app/i/8FQ2"><button class="icon-btn icon-btn--ghost icon-btn--sm trail" type="button" aria-label="Copy invite link" data-copy="https://steez.app/i/8FQ2"><span class="swap"><span class="s-off">{I("copy")}</span><span class="s-on">{I("check")}</span></span></button></div></div>'),

("3.2.01", "Search field", "Search / filter a list. Clear button springs in when there is text.", "clear button scales in (dur-2 spring); focus ring", ".search handles clear + has-value",
 f'<label class="search">{I("search","i-search")}<input type="search" placeholder="Search files" aria-label="Search files"><button class="clear" type="button" aria-label="Clear search" tabindex="-1">{I("x")}</button><kbd>⌘K</kbd></label>'),
("3.2.02", "Search + filter button", "List headers with advanced filters.", "as 3.2.01", ".search",
 f'<div class="row" style="width:100%;flex-wrap:nowrap"><label class="search">{I("search","i-search")}<input type="search" placeholder="Search people" aria-label="Search people"><button class="clear" type="button" aria-label="Clear search" tabindex="-1">{I("x")}</button></label><button class="icon-btn pressable" aria-label="Filters" data-tip="Filters">{I("filter")}</button></div>'),

("3.3.01", "Text area with counter", "Long text with a soft limit. Counter turns red over the limit (does not block).", "focus ring (dur-1)", 'data-counter="MAX" + a .counter in the same .field',
 '<div class="field"><label class="label" for="f-3301">Release notes</label><textarea class="textarea" id="f-3301" data-counter="140" placeholder="What changed in this version?"></textarea><span class="counter">0 / 140</span></div>'),
("3.3.02", "Auto-grow text area", "Chat / comment boxes that grow with content.", "height eases as it grows (dur-1)", "data-autogrow",
 '<div class="field"><textarea class="textarea" rows="1" data-autogrow placeholder="Write a comment…" aria-label="Comment"></textarea></div>'),

("3.4.01", "Select (custom listbox)", "Pick one of 3–12 options with rich rows (dots, icons). Keyboard: ↑ ↓ Enter Esc.", "listbox: " + POP + "; chevron flips", "data-select → stz:select {value}",
 f'<div class="select" data-select style="max-width:320px">\n  <span class="select-label" id="l-3401">Workspace</span>\n  <button class="select-trigger" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="l-3401"><span class="sw" style="--c:#2563eb"></span><span class="value">Studio</span>{I("chev-down","i-chev")}</button>\n  <div class="popup" role="listbox" style="top:calc(100% + 6px);left:0;right:0">\n    <div class="option" role="option" aria-selected="false"><span class="sw" style="--c:#d63a28"></span>Personal{I("check","check-i")}</div>\n    <div class="option" role="option" aria-selected="true"><span class="sw" style="--c:#2563eb"></span>Studio{I("check","check-i")}</div>\n    <div class="option" role="option" aria-selected="false"><span class="sw" style="--c:#0b7d5a"></span>Archive{I("check","check-i")}</div>\n  </div>\n</div>'),
("3.4.02", "Select (native)", "Long option lists, mobile-first forms, anywhere the OS picker is better.", "focus ring", NONE,
 '<div class="field" style="max-width:320px"><label class="label" for="f-3402">Country</label><select class="input input--plain" id="f-3402"><option>New Zealand</option><option>Australia</option><option>United Kingdom</option><option>United States</option></select></div>'),

("3.5.01", "Live validation", "Validate as the user types; shake once on blur if still wrong. data-validate = email | required | a regex.", "error ring + one shake (360ms) on blur", 'data-validate="email" data-error="…" data-ok="…"',
 f'<div class="field"><input class="input" id="f-3501" placeholder=" " data-validate="email" data-error="Add a domain ending, like .com" data-ok="Looks good"><label class="float-label" for="f-3501">Email</label><span class="help">{I("info")}We never share your email.</span></div>'),
("3.5.02", "Error state", "Server-side or submit-time error. Say what is wrong and how to fix it.", "none (add class shake to .field to shake once)", NONE,
 f'<div class="field is-error"><input class="input" id="f-3502" placeholder=" " value="mara@steez"><label class="float-label" for="f-3502">Email</label><span class="help">{I("err")}Add a domain ending, like .app or .com</span></div>'),
("3.5.03", "Success state", "Confirm availability / validity.", "none", NONE,
 f'<div class="field is-ok"><input class="input" id="f-3503" placeholder=" " value="midnight-drive"><label class="float-label" for="f-3503">Handle</label><span class="help">{I("ok")}Available</span></div>'),
("3.5.04", "Disabled field", "Value shown but not editable here.", "none", NONE,
 '<div class="field"><input class="input" id="f-3504" placeholder=" " value="Free plan" disabled><label class="float-label" for="f-3504">Plan</label></div>'),

("3.6.01", "One-time code", "Verification codes. Auto-advances, Backspace goes back, paste fills all.", "focused cell lifts 2px; filled cell pops (dur-2 spring)", "data-otp → stz:complete {value}",
 '<div class="otp" data-otp role="group" aria-label="Verification code">\n  <input inputmode="numeric" maxlength="1" aria-label="Digit 1"><input inputmode="numeric" maxlength="1" aria-label="Digit 2"><input inputmode="numeric" maxlength="1" aria-label="Digit 3"><span class="otp-sep"></span><input inputmode="numeric" maxlength="1" aria-label="Digit 4"><input inputmode="numeric" maxlength="1" aria-label="Digit 5"><input inputmode="numeric" maxlength="1" aria-label="Digit 6">\n</div>'),
("3.7.01", "Combobox (autocomplete)", "Type to filter a known list (assignee, city, tag). Keyboard: ↑ ↓ Enter Esc.", "list: " + POP + "; options re-cascade as you filter", "data-combobox → stz:select {value}",
 f'<div class="select" data-combobox style="max-width:320px">\n  <label class="label" for="f-3701">Assign to</label>\n  <div class="input-wrap">{I("user")}<input class="input input--plain" id="f-3701" role="combobox" aria-expanded="false" aria-autocomplete="list" placeholder="Type a name" autocomplete="off"></div>\n  <div class="popup" role="listbox" style="top:calc(100% + 6px);left:0;right:0">\n    <div class="option" role="option">Mara Okafor</div>\n    <div class="option" role="option">Jules Park</div>\n    <div class="option" role="option">Kai Rangi</div>\n    <div class="option" role="option">Rosa Lind</div>\n    <div class="menu-label combo-empty" hidden>No matches</div>\n  </div>\n</div>'),
("3.8.01", "File drop zone", "Upload by drag-and-drop or click. Lists picked files below.", "zone tints, scales 1.015, icon lifts while dragging over (dur-2 spring); files fade up", "data-dropzone → stz:files {files}",
 f'<div style="width:100%">\n  <div class="dropzone" data-dropzone role="button" tabindex="0" aria-label="Upload files">{I("upload")}<strong>Drop files here</strong><span>or click to browse · max 2 GB</span><input type="file" multiple></div>\n  <ul class="file-list"></ul>\n</div>'),
("3.9.01", "Date and time", "Native pickers, themed. Use for any date/time input.", "focus ring", NONE,
 '<div class="row" style="width:100%;flex-wrap:nowrap">\n  <div class="field"><label class="label" for="f-3901">Date</label><input class="input input--plain" id="f-3901" type="date"></div>\n  <div class="field"><label class="label" for="f-3902">Time</label><input class="input input--plain" id="f-3902" type="time"></div>\n</div>'),

# ───────────────────────── 4 NAVIGATION
("4.1.01", "Sidebar list", "Primary app navigation on desktop/tablet. Wrap in a 0.1.02 thick glass panel.", "highlight glides vertically + stretches (dur-2 spring)", "data-liquid-v → stz:change",
 f'<nav class="mini-side" data-liquid-v aria-label="Main">\n  <span class="liquid-thumb"></span>\n  <button aria-current="true">{I("home")}Home</button>\n  <button>{I("folder")}Projects<span class="count">12</span></button>\n  <button>{I("music")}Library<span class="count">248</span></button>\n  <button>{I("trash")}Recently deleted</button>\n</nav>'),
("4.2.01", "Toolbar / nav bar", "Top of every screen: back, title, 1–2 actions.", PRESS, NONE,
 f'<header class="mini-toolbar glass glass--thick">\n  <button class="icon-btn icon-btn--ghost icon-btn--sm pressable" aria-label="Back">{I("chev-left")}</button>\n  <span class="title">Midnight Drive</span>\n  <button class="icon-btn icon-btn--ghost icon-btn--sm pressable" aria-label="Share">{I("share")}</button>\n  <button class="icon-btn icon-btn--ghost icon-btn--sm pressable" aria-label="More">{I("more")}</button>\n</header>'),
("4.3.01", "Tabs with panels", "Switch between sibling sections of one object. Panels in the same order as tabs.", "ink morphs width + position (dur-2 spring); panel fades up", "data-tabs → stz:change",
 '<div class="tabs" data-tabs>\n  <div class="tablist" role="tablist" aria-label="Project">\n    <button role="tab" aria-selected="true">Overview</button><button role="tab" aria-selected="false">Activity</button><button role="tab" aria-selected="false">People</button>\n    <span class="tab-ink"></span>\n  </div>\n  <div class="tabpanel" role="tabpanel">4 tracks, 2 drafts, 1 master.</div>\n  <div class="tabpanel" role="tabpanel" hidden>Mara left 3 comments.</div>\n  <div class="tabpanel" role="tabpanel" hidden>3 editors, 2 viewers.</div>\n</div>'),
("4.4.01", "Tab bar (mobile)", "Bottom navigation on phones, 3–5 destinations. Fix it to the bottom in real apps.", "liquid pill glides + stretches; active icon lifts (dur-2 spring)", "data-liquid → stz:change",
 f'<nav class="tabbar glass glass--thick" role="tablist" aria-label="Sections" data-liquid>\n  <span class="liquid-thumb"></span>\n  <button role="tab" aria-selected="true">{I("home")}Home</button>\n  <button role="tab" aria-selected="false">{I("search")}Search</button>\n  <button role="tab" aria-selected="false">{I("music")}Library</button>\n  <button role="tab" aria-selected="false">{I("user")}You</button>\n</nav>'),
("4.5.01", "Breadcrumbs", "Deep hierarchies on desktop. Last item = current page (not a link).", "hover fill (dur-1)", NONE,
 f'<nav class="crumbs" aria-label="Breadcrumb"><a href="#">Library</a>{I("chev-right")}<a href="#">Albums</a>{I("chev-right")}<span aria-current="page">Night Shift</span></nav>'),
("4.6.01", "Pagination (numbered)", "Paged tables and results.", "accent pill glides between pages (dur-2 spring)", "data-liquid data-pager → stz:change {value:page}",
 f'<nav class="pager" aria-label="Pages" data-liquid data-pager>\n  <span class="liquid-thumb"></span>\n  <button aria-label="Previous page" data-page-prev>{I("chev-left","i-sm")}</button>\n  <button data-page aria-current="page">1</button><button data-page>2</button><button data-page>3</button><button data-page>4</button>\n  <button aria-label="Next page" data-page-next>{I("chev-right","i-sm")}</button>\n</nav>'),
("4.6.02", "Pagination (simple)", "Mobile or when total pages do not matter.", PRESS, NONE,
 f'<div class="pager-simple"><button class="icon-btn pressable" aria-label="Previous page">{I("chev-left")}</button><span class="tnum">Page 2 of 9</span><button class="icon-btn pressable" aria-label="Next page">{I("chev-right")}</button></div>'),

("4.7.01", "Dropdown menu (basic)", "A list of actions from a button.", POP, 'data-menu="MENU_ID" → stz:select {value}',
 f'<button class="btn btn--glass pressable" aria-haspopup="menu" aria-expanded="false" data-menu="m-4701">Actions{I("chev-down","i-chev")}</button>\n<div class="popup" id="m-4701" role="menu">\n  <button class="menu-item" role="menuitem">Rename</button>\n  <button class="menu-item" role="menuitem">Duplicate</button>\n  <button class="menu-item" role="menuitem">Move to…</button>\n</div>'),
("4.7.02", "Menu with icons, shortcuts, destructive", "Desktop action menus. Destructive item always last, after a separator.", POP, "data-menu",
 f'<button class="btn btn--glass pressable" aria-haspopup="menu" aria-expanded="false" data-menu="m-4702">Edit{I("chev-down","i-chev")}</button>\n<div class="popup" id="m-4702" role="menu">\n  <button class="menu-item" role="menuitem">{I("edit")}Rename<kbd>⌘R</kbd></button>\n  <button class="menu-item" role="menuitem">{I("copy")}Duplicate<kbd>⌘D</kbd></button>\n  <button class="menu-item" role="menuitem">{I("share")}Share…</button>\n  <div class="menu-sep"></div>\n  <button class="menu-item danger" role="menuitem">{I("trash")}Delete<kbd>⌫</kbd></button>\n</div>'),
("4.7.03", "Menu with sections", "Many actions grouped under labels.", POP, "data-menu",
 f'<button class="btn btn--glass pressable" aria-haspopup="menu" aria-expanded="false" data-menu="m-4703">New{I("chev-down","i-chev")}</button>\n<div class="popup" id="m-4703" role="menu">\n  <div class="menu-label">Create</div>\n  <button class="menu-item" role="menuitem">{I("folder")}Folder</button>\n  <button class="menu-item" role="menuitem">{I("edit")}Note</button>\n  <div class="menu-sep"></div>\n  <div class="menu-label">Import</div>\n  <button class="menu-item" role="menuitem">{I("upload")}From device</button>\n  <button class="menu-item" role="menuitem">{I("link")}From link</button>\n</div>'),
("4.7.04", "Checkable menu (multi)", "Show/hide columns, toggle view options. Stays open while toggling.", POP + "; check scales in (dur-2 spring)", 'role="menuitemcheckbox" → stz:select {value, checked}',
 f'<button class="btn btn--glass pressable" aria-haspopup="menu" aria-expanded="false" data-menu="m-4704">{I("eye")}Columns</button>\n<div class="popup" id="m-4704" role="menu">\n  <button class="menu-item" role="menuitemcheckbox" aria-checked="true">Name{I("check","mi-check")}</button>\n  <button class="menu-item" role="menuitemcheckbox" aria-checked="true">Owner{I("check","mi-check")}</button>\n  <button class="menu-item" role="menuitemcheckbox" aria-checked="false">Size{I("check","mi-check")}</button>\n</div>'),
("4.7.05", "Radio menu (sort by)", "Pick one mode from a menu (sort, group by).", POP, 'role="menuitemradio"',
 f'<button class="btn btn--glass pressable" aria-haspopup="menu" aria-expanded="false" data-menu="m-4705">{I("sort")}Sort</button>\n<div class="popup" id="m-4705" role="menu">\n  <div class="menu-label">Sort by</div>\n  <button class="menu-item" role="menuitemradio" aria-checked="true">Date modified{I("check","mi-check")}</button>\n  <button class="menu-item" role="menuitemradio" aria-checked="false">Name{I("check","mi-check")}</button>\n  <button class="menu-item" role="menuitemradio" aria-checked="false">Size{I("check","mi-check")}</button>\n</div>'),
("4.7.06", "Account menu", "Avatar in the toolbar → profile, settings, sign out.", POP + "; data-align=end opens from the right", "data-menu",
 f'<button class="avatar-btn" aria-label="Account" aria-haspopup="menu" aria-expanded="false" data-menu="m-4706"><span class="avatar" style="--c:#d63a28">MA</span></button>\n<div class="popup" id="m-4706" role="menu" data-align="end">\n  <div class="menu-head"><span class="avatar" style="--c:#d63a28">MA</span><div><b>Mara Okafor</b><small>mara@steez.app</small></div></div>\n  <div class="menu-sep"></div>\n  <button class="menu-item" role="menuitem">{I("user")}Profile</button>\n  <button class="menu-item" role="menuitem">{I("settings")}Settings<kbd>⌘,</kbd></button>\n  <button class="menu-item" role="menuitem">{I("help")}Help</button>\n  <div class="menu-sep"></div>\n  <button class="menu-item" role="menuitem">{I("logout")}Sign out</button>\n</div>'),
("4.8.01", "Context menu", "Right-click / long-press / Shift+F10 on an item. Keep a visible alternative (1.3.09).", POP + " at the pointer", 'data-contextmenu="MENU_ID" on the target',
 f'<div class="ctx-target" tabindex="0" aria-haspopup="menu" data-contextmenu="m-4801"><div><strong>cover-final.png</strong>Right-click or long-press</div></div>\n<div class="popup" id="m-4801" role="menu">\n  <button class="menu-item" role="menuitem">{I("eye")}Quick look</button>\n  <button class="menu-item" role="menuitem">{I("download")}Download</button>\n  <div class="menu-sep"></div>\n  <button class="menu-item danger" role="menuitem">{I("trash")}Move to trash</button>\n</div>'),
("4.9.01", "Wizard steps", "Multi-step flows (onboarding, checkout). Back/Next update the step bar.", "connector fills left→right (dur-3); current dot scales 1.12 with soft ring", "data-wizard + data-wizard-next/back → stz:change {value:step}",
 '<div class="stack" style="width:100%" data-wizard>\n  <ol class="steps"><li class="done">Account</li><li aria-current="step">Workspace</li><li>Invite</li><li>Done</li></ol>\n  <div class="row" style="justify-content:space-between"><button class="btn btn--plain pressable" data-wizard-back>Back</button><button class="btn btn--filled pressable" data-wizard-next>Next</button></div>\n</div>'),

# ───────────────────────── 5 FEEDBACK
("5.1.01", "Toast (declarative)", "Confirm a completed action without interrupting. Max 3 stacked, 3.6s.", "springs up from the bottom with blur 8→0 (dur-3 spring); leaves down + blur", 'data-toast="ok|info|err" data-toast-msg="…" [data-toast-action="Undo"]',
 f'<button class="btn btn--glass pressable" data-toast="ok" data-toast-msg="Project exported">{I("ok")}Success toast</button>\n<button class="btn btn--glass pressable" data-toast="err" data-toast-msg="Couldn’t reach the server" data-toast-action="Retry">{I("err")}Error toast</button>'),
("5.1.02", "Toast (JS API)", "Toasts after async work. Steez.toast(kind, message, {action, onAction, ms}).", "as 5.1.01", "Steez.toast()",
 '<button class="btn btn--glass pressable" onclick="Steez.toast(\'info\', \'Moved to Archive\', { action: \'Undo\', onAction: () => {} })">Toast with Undo</button>'),
("5.2.01", "Banner: info", "Persistent page-level information. Dismissible.", "dismiss collapses height + fades (grid-rows, dur-2)", "data-dismiss on the close button",
 f'<div class="banner-wrap"><div><div class="banner tone-info">{I("info")}<div><strong>New version available</strong><p>It installs on next launch.</p></div><button class="icon-btn icon-btn--ghost icon-btn--sm pressable" aria-label="Dismiss" data-dismiss>{I("x")}</button></div></div></div>'),
("5.2.02", "Banner: success", "Completed background work.", "as 5.2.01", "data-dismiss",
 f'<div class="banner-wrap"><div><div class="banner tone-ok">{I("ok")}<div><strong>Backup complete</strong><p>All 248 files are safe.</p></div><button class="icon-btn icon-btn--ghost icon-btn--sm pressable" aria-label="Dismiss" data-dismiss>{I("x")}</button></div></div></div>'),
("5.2.03", "Banner: warning", "Something needs attention soon.", "as 5.2.01", "data-dismiss",
 f'<div class="banner-wrap"><div><div class="banner tone-warn">{I("warn")}<div><strong>Storage almost full</strong><p>82% used. Clear old drafts or upgrade.</p></div><button class="icon-btn icon-btn--ghost icon-btn--sm pressable" aria-label="Dismiss" data-dismiss>{I("x")}</button></div></div></div>'),
("5.2.04", "Banner: error with action", "Failure the user can fix. Always offer the fix.", "as 5.2.01", NONE,
 f'<div class="banner-wrap"><div><div class="banner tone-err">{I("err")}<div><strong>Upload failed</strong><p>stems.zip is over 2 GB.</p><button class="btn btn--plain btn--sm pressable" style="padding:0;margin-top:4px">Split and retry</button></div></div></div></div>'),
("5.3.01", "Progress bar", "Known progress (uploads, exports). Set --p from 0 to 1 and aria-valuenow.", "fill eases to new value (dur-3)", 'set style="--p:.42" yourself',
 '<div class="progress-row"><div class="row"><span>Uploading stems.zip</span><span class="tnum muted">42%</span></div><div class="progress" role="progressbar" aria-valuenow="42" aria-label="Upload"><span style="--p:.42"></span></div></div>'),
("5.3.02", "Indeterminate progress", "Unknown duration work.", "bar slides left→right, 1.4s loop", NONE,
 '<div class="progress-row"><div class="row"><span>Preparing export</span></div><div class="progress indet" role="progressbar" aria-label="Preparing"><span></span></div></div>'),
("5.3.03", "Progress ring", "Compact progress inside rows, avatars or buttons.", "stroke eases (dur-3)", 'set style="--p:.6"',
 '<div class="ring-wrap" role="progressbar" aria-valuenow="60" aria-label="Sync"><svg class="ring" viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fg" cx="22" cy="22" r="18" style="--p:.6"/></svg><span>60</span></div>'),
("5.4.01", "Spinner (native)", "Default loading indicator.", "8 bars fade around, 0.9s", NONE,
 '<div class="spinner" role="status" aria-label="Loading">' + "".join(f'<i style="transform:rotate({n*45}deg);animation-delay:{-0.9 + n*0.1125:.4f}s"></i>' for n in range(8)) + '</div>'),
("5.4.02", "Spinner (ring)", "Inside buttons and small spaces.", "rotates 0.8s", NONE, '<div class="ring-spin" role="status" aria-label="Loading"></div>'),
("5.4.03", "Typing dots", "Someone is typing / AI is responding.", "dots bob in sequence, 1s", NONE, '<div class="dots" role="status" aria-label="Typing"><i></i><i></i><i></i></div>'),
("5.4.04", "Liquid loader", "Playful full-screen or empty-area loading.", "blob morphs + rotates, 2.4s", NONE, '<div class="blob-spin" role="status" aria-label="Loading"></div>'),
("5.5.01", "Skeleton row", "Placeholder for list rows while loading. Swap for real content (it fades up).", "shimmer sweeps 1.4s", NONE,
 '<div class="skel"><div class="sk sk-a"></div><div><div class="sk sk-l" style="width:70%"></div><div class="sk sk-l" style="width:45%"></div></div></div>'),
("5.5.02", "Skeleton card", "Placeholder for a media card.", "shimmer", NONE,
 '<div class="stack" style="width:240px"><div class="sk" style="height:130px;border-radius:var(--r-lg);background:var(--fill-2);position:relative;overflow:hidden"></div><div class="skel" style="grid-template-columns:1fr"><div><div class="sk sk-l" style="width:80%"></div><div class="sk sk-l" style="width:50%"></div></div></div></div>'),
("5.6.01", "Status badges", "Status of an item. Tone + word (+ icon for warnings).", "none", NONE,
 f'<span class="badge tone-ok">Final</span> <span class="badge tone-info">Beta</span> <span class="badge tone-warn">{I("warn","i-sm")}Expiring</span> <span class="badge tone-err">Failed</span> <span class="badge">Draft</span>'),
("5.6.02", "Live badge", "Something is happening now (recording, live, online).", "dot pulses a ring, 1.6s", NONE,
 '<span class="badge tone-ok"><span class="dot live"></span>Live</span>'),
("5.6.03", "Count bubble", "Unread counts on icons and nav items.", "add class bump to pulse (dur-2 spring)", NONE,
 f'<span class="has-count" style="display:inline-grid;place-items:center;width:40px;height:40px">{I("mail")}<span class="count-bubble">12</span></span>'),
("5.7.01", "Tooltip", "Name or explain an icon-only control. Text only, short.", "fade + scale .9→1 after 350ms (dur-2 spring)", 'data-tip="…" on any element',
 f'<button class="btn btn--glass pressable" data-tip="Copies a link anyone can view">{I("link")}Copy link</button>'),

# ───────────────────────── 6 OVERLAYS
("6.1.01", "Dialog (form)", "Short focused tasks (rename, create). Enter submits; Esc/backdrop cancels.", DLG, 'data-dialog="DIALOG_ID"; buttons inside form[method=dialog] with value → stz:close {value}',
 '<button class="btn btn--filled pressable" data-dialog="d-6101">Rename project</button>\n<dialog class="ov" id="d-6101" aria-labelledby="d-6101-t">\n  <form method="dialog" class="dialog ov-card">\n    <h2 id="d-6101-t">Rename project</h2>\n    <p>Collaborators see the new name right away.</p>\n    <div class="field"><input class="input" id="d-6101-n" placeholder=" " value="Midnight Drive"><label class="float-label" for="d-6101-n">Project name</label></div>\n    <div class="actions"><button class="btn btn--plain pressable" value="cancel">Cancel</button><button class="btn btn--filled pressable" value="ok">Rename</button></div>\n  </form>\n</dialog>'),
("6.1.02", "Dialog (information)", "Explain something that needs acknowledgement.", DLG, "data-dialog",
 '<button class="btn btn--glass pressable" data-dialog="d-6102">What’s new</button>\n<dialog class="ov" id="d-6102" aria-labelledby="d-6102-t">\n  <form method="dialog" class="dialog ov-card">\n    <h2 id="d-6102-t">What’s new in 2.4</h2>\n    <p>Offline stems, faster exports, and eight new themes.</p>\n    <div class="actions"><button class="btn btn--filled pressable" value="ok">Got it</button></div>\n  </form>\n</dialog>'),
("6.2.01", "Sheet (share)", "Mobile-first panel from the bottom. Drag the grabber down to dismiss.", "slides up (dur-3 spring); follows the finger; >110px closes", "data-dialog; class sheet-dlg; [data-grab]",
 f'<button class="btn btn--glass pressable" data-dialog="d-6201">{I("share")}Share</button>\n<dialog class="ov sheet-dlg" id="d-6201" aria-label="Share">\n  <form method="dialog" class="sheet ov-card">\n    <div class="grabber" data-grab></div>\n    <h2>Share “Midnight Drive”</h2>\n    <div class="share-grid">\n      <button type="button" class="pressable"><span class="tile" style="--c:#2563eb">{I("mail")}</span>Mail</button>\n      <button type="button" class="pressable"><span class="tile" style="--c:#0b7d5a">{I("chat")}</span>Messages</button>\n      <button type="button" class="pressable"><span class="tile" style="--c:#7c3aed">{I("link")}</span>Copy link</button>\n      <button type="button" class="pressable"><span class="tile" style="--c:#d63a28">{I("download")}</span>Save</button>\n    </div>\n    <button class="btn btn--glass btn--lg btn--block pressable" value="done">Done</button>\n  </form>\n</dialog>'),
("6.2.02", "Action sheet", "Mobile: choose among 2–5 actions on an item, with Cancel.", "as 6.2.01", "data-dialog; buttons with value close it → stz:close {value}",
 '<button class="btn btn--glass pressable" data-dialog="d-6202">Photo options</button>\n<dialog class="ov sheet-dlg" id="d-6202" aria-label="Photo options">\n  <form method="dialog" class="sheet ov-card action-sheet">\n    <div class="grabber" data-grab></div>\n    <div class="group"><div class="title">cover-final.png</div><button value="save">Save to Photos</button><button value="copy">Copy</button><button value="delete" class="destructive">Delete</button></div>\n    <div class="group"><button value="cancel" class="cancel">Cancel</button></div>\n  </form>\n</dialog>'),
("6.3.01", "Popover (info)", "Extra detail anchored to a control; light and dismissible.", POP + " from the trigger center, with arrow", 'data-popover="POPOVER_ID"; data-close-pop on buttons inside',
 f'<button class="btn btn--tinted pressable" aria-expanded="false" data-popover="p-6301">{I("info")}Storage details</button>\n<div class="popup popover" id="p-6301" role="dialog" aria-label="Storage details">\n  <h4>82% of 50 GB used</h4>\n  <p>Audio uses the most space.</p>\n  <div class="progress"><span style="--p:.82"></span></div>\n  <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn btn--plain btn--sm pressable" data-close-pop>Not now</button><button class="btn btn--filled btn--sm pressable" data-close-pop>Manage</button></div>\n</div>'),
("6.3.02", "Popover (inline confirm)", "Lightweight confirm for low-risk, reversible actions (remove from list).", "as 6.3.01", "data-popover",
 '<button class="btn btn--danger-soft pressable" aria-expanded="false" data-popover="p-6302">Remove</button>\n<div class="popup popover popover--sm" id="p-6302" role="dialog" aria-label="Confirm remove">\n  <h4>Remove from playlist?</h4>\n  <p>The track stays in your library.</p>\n  <div class="row" style="justify-content:flex-end"><button class="btn btn--plain btn--sm pressable" data-close-pop>Cancel</button><button class="btn btn--danger btn--sm pressable" data-close-pop>Remove</button></div>\n</div>'),
("6.4.01", "Alert (destructive confirm)", "Confirm irreversible actions. Title asks the question; body states the consequence.", "scales down 1.12→1 + fades (dur-3 spring)", 'data-dialog; role="alertdialog"',
 f'<button class="btn btn--danger pressable" data-dialog="d-6401">{I("trash")}Delete draft</button>\n<dialog class="ov" id="d-6401" role="alertdialog" aria-labelledby="d-6401-t">\n  <form method="dialog" class="alert ov-card">\n    <div class="body"><h2 id="d-6401-t">Delete this draft?</h2><p>It will be removed from all devices. You can’t undo this.</p></div>\n    <div class="alert-actions"><button value="cancel">Cancel</button><button value="delete" class="destructive">Delete</button></div>\n  </form>\n</dialog>'),
("6.4.02", "Alert (single action)", "Blocking notice with one acknowledgement.", "as 6.4.01", "data-dialog",
 '<button class="btn btn--glass pressable" data-dialog="d-6402">Session expired</button>\n<dialog class="ov" id="d-6402" role="alertdialog" aria-labelledby="d-6402-t">\n  <form method="dialog" class="alert ov-card">\n    <div class="body"><h2 id="d-6402-t">Session expired</h2><p>Sign in again to keep editing.</p></div>\n    <div class="alert-actions" style="grid-template-columns:1fr"><button value="ok">Sign in</button></div>\n  </form>\n</dialog>'),
("6.5.01", "Drawer (side panel)", "Filters, details or settings beside the content on desktop.", "slides in from the right (dur-3 spring), backdrop blurs", "data-dialog; class drawer-dlg; [data-close] buttons",
 f'<button class="btn btn--glass pressable" data-dialog="d-6501">{I("filter")}Filters</button>\n<dialog class="ov drawer-dlg" id="d-6501" aria-labelledby="d-6501-t">\n  <form method="dialog" class="drawer ov-card">\n    <header><h2 id="d-6501-t">Filters</h2><button class="icon-btn icon-btn--sm pressable" value="close" aria-label="Close">{I("x")}</button></header>\n    <div class="toggle-row"><span>Only shared</span><button type="button" class="switch" role="switch" aria-checked="false" aria-label="Only shared"><span class="knob"></span></button></div>\n    <div class="toggle-row"><span>Include archived</span><button type="button" class="switch" role="switch" aria-checked="true" aria-label="Include archived"><span class="knob"></span></button></div>\n    <div class="actions"><button class="btn btn--plain pressable" value="reset">Reset</button><button class="btn btn--filled pressable" value="apply">Apply</button></div>\n  </form>\n</dialog>'),

# ───────────────────────── 7 CONTENT
("7.1.01", "Settings list", "Grouped settings rows: icon tile, label, value/switch, chevron.", "row highlight on hover/press (dur-1)", NONE,
 f'<div class="list">\n  <button class="list-row"><span class="tile" style="--c:#2563eb">{I("wifi")}</span><span class="lbl">Wi-Fi</span><span class="val">Studio 5G</span>{I("chev-right","i-chev")}</button>\n  <div class="list-row"><span class="tile" style="--c:#d63a28">{I("bell")}</span><span class="lbl">Notifications</span><button class="switch" role="switch" aria-checked="true" aria-label="Notifications"><span class="knob"></span></button></div>\n  <button class="list-row"><span class="tile" style="--c:#7c3aed">{I("lock")}</span><span class="lbl">Privacy</span>{I("chev-right","i-chev")}</button>\n</div>'),
("7.1.02", "People list", "Members, contacts, search results with a trailing action.", "row highlight (dur-1)", NONE,
 '<div class="list">\n  <div class="list-row"><span class="avatar avatar--sm" style="--c:#d63a28">MA</span><span class="lbl">Mara Okafor<span class="sub">Owner</span></span><span class="badge tone-ok">Online</span></div>\n  <div class="list-row"><span class="avatar avatar--sm" style="--c:#2563eb">JU</span><span class="lbl">Jules Park<span class="sub">Can edit</span></span><button class="btn btn--outline btn--sm pressable">Manage</button></div>\n</div>'),
("7.2.01", "Media card", "Albums, projects, videos: art, title, meta, actions.", "lifts 4px + tilts toward pointer (dur-2)", "data-tilt (optional)",
 f'<div class="media-card" data-tilt>\n  <div class="media-art"><span class="badge">New mix</span><button class="play pressable" aria-label="Play">{I("play")}</button></div>\n  <div class="media-body"><h4>Midnight Drive</h4><p>Night Shift · 4 tracks · 14 min</p></div>\n  <div class="media-foot"><span class="spacer"></span><button class="icon-btn icon-btn--ghost icon-btn--sm pressable" aria-label="Favorite" aria-pressed="false" data-toggle-press>{I("heart")}</button><button class="icon-btn icon-btn--ghost icon-btn--sm pressable" aria-label="More">{I("more")}</button></div>\n</div>'),
("7.2.02", "Content card (link)", "Articles, docs, settings shortcuts. Whole card is the link.", "lifts 3px + shadow (dur-2)", NONE,
 f'<a class="card" href="#" style="max-width:320px">\n  <div class="meta">{I("clock","i-sm")}5 min read</div>\n  <h4>Mixing vocals at night</h4>\n  <p>A short guide to keeping levels consistent across sessions.</p>\n</a>'),
("7.3.01", "Avatars", "People. sm 30 / md 40 / lg 56. Status dot for presence.", "none", NONE,
 '<span class="avatar avatar--lg" style="--c:#d63a28">MA<span class="status"></span></span> <span class="avatar" style="--c:#2563eb">JU</span> <span class="avatar avatar--sm" style="--c:#7c3aed">KA</span>'),
("7.3.02", "Avatar stack", "Collaborators on an item. Show 3–4 then +N.", "fans out on hover (dur-2 spring)", NONE,
 '<div class="avatar-stack"><span class="avatar" style="--c:#d63a28">MA</span><span class="avatar" style="--c:#2563eb">JU</span><span class="avatar" style="--c:#0b7d5a">KA</span><span class="avatar more">+4</span></div>'),
("7.4.01", "Sortable table", "Tabular data. Click headers to sort; rows glide to new positions. Put numeric value in data-v.", "rows FLIP-animate (dur-2); sort arrow rotates", "table data-sortable",
 '<div class="table-wrap">\n  <table class="tbl" data-sortable>\n    <thead><tr><th aria-sort="ascending"><button>Name<svg class="i"><use href="#i-sort"/></svg></button></th><th><button>Status<svg class="i"><use href="#i-sort"/></svg></button></th><th class="num"><button>Size<svg class="i"><use href="#i-sort"/></svg></button></th></tr></thead>\n    <tbody>\n      <tr><td>bridge-v3.wav</td><td><span class="badge tone-warn">Review</span></td><td class="num" data-v="312.4">312.4 MB</td></tr>\n      <tr><td>cover-final.png</td><td><span class="badge tone-ok">Final</span></td><td class="num" data-v="8.1">8.1 MB</td></tr>\n      <tr><td>stems.zip</td><td><span class="badge tone-err">Failed</span></td><td class="num" data-v="2140">2,140.0 MB</td></tr>\n    </tbody>\n  </table>\n</div>'),
("7.5.01", "Accordion", "FAQs, grouped settings. Several can be open.", "height animates (grid-rows 0fr→1fr, dur-2); chevron flips; text fades in", ".acc-head",
 f'<div class="accordion" data-accordion>\n  <div class="acc-item"><button class="acc-head" aria-expanded="true">Who can see my projects?{I("chev-down")}</button><div class="acc-body"><div><p>Only people you invite.</p></div></div></div>\n  <div class="acc-item"><button class="acc-head" aria-expanded="false">Does it work offline?{I("chev-down")}</button><div class="acc-body"><div><p>Yes. Edits sync when you reconnect.</p></div></div></div>\n</div>'),
("7.5.02", "Accordion (single open)", "Step-by-step help where one section at a time is clearer.", "as 7.5.01", 'data-accordion="single"',
 f'<div class="accordion" data-accordion="single">\n  <div class="acc-item"><button class="acc-head" aria-expanded="true">1. Create a project{I("chev-down")}</button><div class="acc-body"><div><p>Tap New project and give it a name.</p></div></div></div>\n  <div class="acc-item"><button class="acc-head" aria-expanded="false">2. Invite people{I("chev-down")}</button><div class="acc-body"><div><p>Share a link or add emails.</p></div></div></div>\n</div>'),
("7.6.01", "Empty state", "No content yet. Say what goes here and give one action.", "orb floats 4s loop", NONE,
 f'<div class="empty"><div class="orb">{I("inbox")}</div><h4>No shared projects yet</h4><p>When someone invites you, it shows up here.</p><button class="btn btn--tinted pressable">{I("link")}Join with a link</button></div>'),
("7.6.02", "No results", "Search/filter returned nothing. Offer a way out.", "orb floats", NONE,
 f'<div class="empty"><div class="orb">{I("search")}</div><h4>No results for “bridge v9”</h4><p>Check the spelling or clear filters.</p><button class="btn btn--glass pressable">Clear filters</button></div>'),
("7.7.01", "Description list", "Key/value details (file info, order summary, receipts).", "none", NONE,
 '<dl class="kv"><dt>Created</dt><dd>3 Nov 2026</dd><dt>Size</dt><dd>312.4 MB</dd><dt>Format</dt><dd>WAV · 48 kHz</dd><dt>Owner</dt><dd>Mara Okafor</dd></dl>'),
("7.8.01", "Timeline / activity", "History, audit logs, activity feeds. Newest first.", "none", NONE,
 '<ol class="timeline">\n  <li><div><b>Mara</b> exported the final master<time>2 min ago</time></div></li>\n  <li><div><b>Jules</b> commented on bridge-v3<time>1 hour ago</time></div></li>\n  <li><div><b>Kai</b> created the project<time>Yesterday</time></div></li>\n</ol>'),

# ───────────────────────── 8 THEME
("8.1.01", "Theme buttons", "Any control can switch theme with data-set-theme. Persists to localStorage.", "circular reveal from the clicked point (760ms, View Transitions)", 'data-set-theme="harbor|porcelain|espresso|paper|evergreen|bubblegum|noir|tropic"',
 '<div class="row">\n  <button class="btn btn--glass btn--sm pressable" data-set-theme="harbor">Harbor</button>\n  <button class="btn btn--glass btn--sm pressable" data-set-theme="porcelain">Porcelain</button>\n  <button class="btn btn--glass btn--sm pressable" data-set-theme="espresso">Espresso</button>\n  <button class="btn btn--glass btn--sm pressable" data-set-theme="paper">Paper</button>\n  <button class="btn btn--glass btn--sm pressable" data-set-theme="evergreen">Evergreen</button>\n  <button class="btn btn--glass btn--sm pressable" data-set-theme="bubblegum">Bubblegum</button>\n  <button class="btn btn--glass btn--sm pressable" data-set-theme="noir">Noir</button>\n  <button class="btn btn--glass btn--sm pressable" data-set-theme="tropic">Tropic</button>\n</div>'),
("8.1.02", "Theme select (native)", "Settings screens. Uses the JS API.", "as 8.1.01", "Steez.setTheme(id)",
 '<div class="field" style="max-width:240px"><label class="label" for="f-8102">Theme</label><select class="input input--plain" id="f-8102" onchange="Steez.setTheme(this.value, this)"><option value="harbor">Harbor</option><option value="porcelain">Porcelain</option><option value="espresso">Espresso</option><option value="paper">Paper</option><option value="evergreen">Evergreen</option><option value="bubblegum">Bubblegum</option><option value="noir">Noir</option><option value="tropic">Tropic</option></select></div>'),
("8.1.03", "Scoped theme", "Preview or embed a different theme inside one element (cards, previews).", "none", 'data-theme="…" on any container',
 '<div data-theme="paper" style="padding:16px;border-radius:var(--r-xl);background:var(--bg);color:var(--text-1)"><button class="btn btn--filled pressable">Paper inside any theme</button></div>'),
("8.2.01", "Appearance settings", "Accessibility preferences. Persisted; every switch with the same data-pref stays in sync.", "as 2.1.01", 'data-pref="transparency|motion|contrast"',
 '<div class="stack" style="width:100%;max-width:420px">\n  <div class="toggle-row"><span class="choice-label">Reduce transparency<small>Glass becomes solid</small></span><button class="switch" role="switch" aria-checked="false" data-pref="transparency" aria-label="Reduce transparency"><span class="knob"></span></button></div>\n  <div class="toggle-row"><span class="choice-label">Reduce motion<small>Springs and drifts stop</small></span><button class="switch" role="switch" aria-checked="false" data-pref="motion" aria-label="Reduce motion"><span class="knob"></span></button></div>\n  <div class="toggle-row"><span class="choice-label">Increase contrast<small>Stronger text and edges</small></span><button class="switch" role="switch" aria-checked="false" data-pref="contrast" aria-label="Increase contrast"><span class="knob"></span></button></div>\n</div>'),
]

# ───────────────────────── page
def anchor(i): return "stz-" + i.replace(".", "-")

def build():
    seen = set()
    for s in SNIPPETS:
        assert s[0] not in seen, f"duplicate id {s[0]}"; seen.add(s[0])
    index_lines, toc, body = [], [], []
    cur = None
    for sid, title, use, anim, js, markup in SNIPPETS:
        cat = sid.split(".")[0]
        if cat != cur:
            cur = cat
            index_lines.append(f"   {cat}  {CATS[cat].upper()}")
            toc.append(f'<li class="cat"><a href="#cat-{cat}">{cat} {CATS[cat]}</a></li>')
            body.append(f'\n<h2 class="cat-head" id="cat-{cat}">{cat} · {CATS[cat]}</h2>\n')
        index_lines.append(f"     STZ {sid:<8} {title}")
        toc.append(f'<li><a href="#{anchor(sid)}">{sid} {H.escape(title)}</a></li>')
        body.append(f'''<section class="snip" id="{anchor(sid)}" data-id="{sid}" data-name="{H.escape(title.lower())}">
  <h3><code>STZ {sid}</code> {H.escape(title)}</h3>
  <p><b>Use:</b> {H.escape(use)}</p>
  <p><b>Anim:</b> {H.escape(anim)}<br><b>JS:</b> {H.escape(js)}</p>
  <div class="demo">
<!-- BEGIN STZ {sid} -->
{markup}
<!-- END STZ {sid} -->
  </div>
</section>''')

    page = f'''<!doctype html>
<!--
  STEEZ SNIPPET LIBRARY  ·  GENERATED by tools/build_library.py (edit there, then: python tools/build_library.py)

  FOR AGENTS — this file is the copy source. Do not invent components; copy one of these.
   1. Every page includes, in <head> (in an installed project the kit lives in steez/, so prefix paths with steez/):
        <link rel="stylesheet" href="css/steez.css">
        <script src="js/steez.js"></script>
   2. Find the snippet by ID in the index below. Copy everything between the two
      HTML comments that read  BEGIN STZ x.y.zz  and  END STZ x.y.zz  (search for the ID).
   3. Change only: visible text, icon names (#i-NAME, see Steez.icons), ids, values, aria-labels.
      Keep every class and data-* attribute exactly; they carry the look and the behavior.
   4. Snippets with ids (menus m-*, dialogs d-*, popovers p-*, fields f-*) must get NEW unique ids;
      update the matching data-menu / data-dialog / data-popover / for= / aria-labelledby too.
   5. Listen for results with events (stz:change, stz:select, stz:close, stz:confirm,
      stz:complete, stz:files, stz:theme). See js/steez.js header for the API.

  INDEX ({len(SNIPPETS)} snippets)
{chr(10).join(index_lines)}
-->
<html lang="en" data-theme="harbor">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Steez snippet library</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400..700&family=Instrument+Serif&family=JetBrains+Mono:wght@400..700&family=Manrope:wght@500..800&family=Newsreader:opsz,wght@6..72,400..700&family=Nunito:wght@400..900&family=Outfit:wght@400..700&family=Plus+Jakarta+Sans:wght@400..800&display=swap">
<link rel="stylesheet" href="css/steez.css">
<script src="js/steez.js"></script>
<style>
  /* library page chrome only — deliberately plain */
  body {{ display: grid; grid-template-columns: 260px 1fr; align-items: start; height: auto; min-height: 100vh; }}
  .toc {{ position: sticky; top: 0; height: 100vh; overflow: auto; padding: 16px; border-right: 1px solid var(--hairline); font-size: 12px; background: var(--glass-thick); }}
  .toc ul {{ list-style: none; padding: 0; margin: 8px 0 0; }}
  .toc li a {{ color: var(--text-2); text-decoration: none; display: block; padding: 2px 4px; border-radius: 4px; }}
  .toc li a:hover {{ background: var(--fill); color: var(--text-1); }}
  .toc li.cat a {{ color: var(--text-1); font-weight: 700; margin-top: 10px; }}
  .toc input, .toc select {{ width: 100%; margin-top: 8px; }}
  main {{ padding: 24px 32px 120px; max-width: 1100px; }}
  .cat-head {{ font-size: 22px; margin: 40px 0 8px; padding-bottom: 6px; border-bottom: 2px solid var(--hairline); }}
  .snip {{ border-bottom: 1px solid var(--hairline); padding: 18px 0; display: grid; gap: 6px; }}
  .snip h3 {{ font: 650 15px/1.3 var(--font-body); letter-spacing: 0; }}
  .snip h3 code {{ font: 600 12px var(--font-mono); color: var(--accent-text); background: var(--accent-soft); padding: 3px 6px; border-radius: 4px; margin-right: 6px; }}
  .snip p {{ font-size: 13px; color: var(--text-2); }}
  .snip p b {{ color: var(--text-1); }}
  .demo {{ display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 20px; margin-top: 6px; border-radius: 12px; background: var(--fill); position: relative; }}
  .snip details {{ font-size: 12px; }}
  .snip summary {{ cursor: pointer; color: var(--text-2); }}
  .snip pre {{ font: 12px/1.5 var(--font-mono); background: var(--glass-thick); color: var(--text-1); padding: 12px; border-radius: 8px; overflow: auto; white-space: pre-wrap; margin: 6px 0 0; }}
  .copy-snip {{ margin-left: 8px; }}
  .snip[hidden], .cat-head[hidden] {{ display: none; }}
  .demo .wallpaper {{ position: absolute; border-radius: 12px; }}
  #stz-0-1-03 .demo {{ min-height: 120px; overflow: hidden; }}
  @media (max-width: 800px) {{ body {{ grid-template-columns: 1fr; }} .toc {{ position: static; height: auto; }} main {{ padding: 16px; }} }}
</style>
</head>
<body>
<nav class="toc" aria-label="Snippet index">
  <b>Steez snippet library</b><br><span class="faint">{len(SNIPPETS)} snippets · copy by ID</span>
  <input class="input input--plain" id="lib-filter" type="search" placeholder="Filter: 4.7 or menu" aria-label="Filter snippets">
  <select class="input input--plain" aria-label="Theme" onchange="Steez.setTheme(this.value, this)" id="lib-theme">
    <option value="harbor">T1 Harbor</option><option value="porcelain">T2 Porcelain</option><option value="espresso">T3 Espresso</option><option value="paper">T4 Paper</option>
    <option value="evergreen">T5 Evergreen</option><option value="bubblegum">T6 Bubblegum</option><option value="noir">T7 Noir</option><option value="tropic">T8 Tropic</option>
  </select>
  <ul>{"".join(toc)}</ul>
</nav>
<main>
<h1 style="font-size:28px">Steez snippet library</h1>
<p class="muted" style="font-size:14px;max-width:70ch">Every component, numbered. Each entry says when to use it, what animates and which JS hook it needs, followed by the exact markup (open “Markup” or read the page source between BEGIN/END comments). Include <code>css/steez.css</code> + <code>js/steez.js</code> and paste.</p>
{"".join(body)}
</main>
<script>
  // library page only: show each snippet's source + copy button, filter, theme select sync
  for (const s of document.querySelectorAll(".snip")) {{
    const html = s.querySelector(".demo").innerHTML.replace(/^[\\s\\S]*?<!-- BEGIN[^>]*-->\\n?/, "").replace(/\\n?<!-- END[\\s\\S]*$/, "");
    const d = document.createElement("details");
    d.innerHTML = `<summary>Markup</summary><pre></pre>`;
    d.querySelector("pre").textContent = html;
    const b = document.createElement("button"); b.className = "btn btn--plain btn--sm copy-snip"; b.textContent = "Copy STZ " + s.dataset.id;
    b.onclick = () => {{ navigator.clipboard?.writeText(html); Steez.toast("ok", "Copied STZ " + s.dataset.id); }};
    s.querySelector("h3").append(b); s.append(d);
  }}
  const f = document.getElementById("lib-filter");
  f.addEventListener("input", () => {{
    const q = f.value.trim().toLowerCase();
    document.querySelectorAll(".snip").forEach((s) => s.hidden = q && !(s.dataset.id.startsWith(q) || s.dataset.name.includes(q)));
    document.querySelectorAll(".cat-head").forEach((h) => {{ let n = h.nextElementSibling, any = false; while (n && !n.matches(".cat-head")) {{ any ||= !n.hidden; n = n.nextElementSibling; }} h.hidden = !any; }});
  }});
  const sel = document.getElementById("lib-theme"); sel.value = document.documentElement.dataset.theme;
  document.addEventListener("stz:theme", (e) => sel.value = e.detail.id);
</script>
</body>
</html>
'''
    out = Path(__file__).resolve().parent.parent / "library.html"
    out.write_text(page, encoding="utf-8")
    print(f"wrote {out} with {len(SNIPPETS)} snippets")

if __name__ == "__main__":
    build()
