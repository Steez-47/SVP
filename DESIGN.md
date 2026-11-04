<!-- steez-kit -->
# STEEZ design system: instructions for agents

You are building UI with **Steez**, a liquid-glass, theme-forward design system. **Do not design components yourself.** Every control already exists as numbered, copy-ready markup in `steez/library.html`. Your job is to pick the right snippet, paste it, change its content and wire up its events.

> Kit installed from `C:/Users/baldr/.t3/projects/steez-design`. Refresh it with `python "C:/Users/baldr/.t3/projects/steez-design/tools/steez_kit.py" update`.
> Adding components: edit `steez/tools/build_library.py` here, and upstream them to the source repo if they should reach every project.

---

## 1. Files

| File | What it is | Do you edit it? |
|---|---|---|
| `steez/css/steez.css` | The one stylesheet (imports tokens, themes, material, components) | No |
| `steez/js/steez.js` | The one behavior script: all interactivity, icons, themes, toasts | No |
| `steez/library.html` | **The copy source.** 150 snippets, `STZ x.y.zz`, each with use / animation / JS notes | No (it is generated) |
| `steez/tools/build_library.py` | Generator for `steez/library.html`. New snippets are added here | Only when adding a component (§8) |
| `steez/css/tokens.css`, `steez/css/themes.css` | Token contract + 8 themes | Only when adding a theme |

## 2. Setup (every page)

```html
<head>
  <link rel="stylesheet" href="steez/css/steez.css">
  <script src="steez/js/steez.js"></script>   <!-- in <head>, NOT defer: applies saved theme before first paint -->
</head>
<body>
  <!-- optional but recommended for glass apps: STZ 0.1.03 wallpaper as first child -->
</body>
```
Fonts: copy the Google Fonts `<link>` from the top of `steez/library.html` (Inter + the 8 heading fonts).

## 3. Workflow

1. **Find** the snippet: use the decision table in §4, or the `INDEX` comment at the top of `steez/library.html`.
2. **Copy** everything between the comments `BEGIN STZ x.y.zz` and `END STZ x.y.zz` (search the ID).
3. **Change only:** visible text, icon names, `id`s, values, `aria-label`s, `data-value`s.
   **Keep:** every `class` and every `data-*` attribute. They carry the look and the behavior.
4. **Make ids unique.** Snippets with ids (`m-*` menus, `d-*` dialogs, `p-*` popovers, `f-*` fields, `o-*` outputs) need new ids. Update the matching `data-menu`, `data-dialog`, `data-popover`, `for=`, `aria-labelledby` and `data-output` too.
5. **Wire results** with events (§6). Never add your own click handlers for open/close/toggle; steez.js already does it.
6. **Reference** components as `STZ x.y.zz` in code comments, for example `<!-- STZ 4.7.02 -->`, so humans can refine by number.

## 4. Pick the right component

| You need… | Use |
|---|---|
| Main action of a view | 1.1.01 primary (one per view) |
| Secondary / neutral / low-emphasis action | 1.1.02 tinted · 1.1.04 outline · 1.1.05 plain |
| Action on media, toolbars or glass | 1.1.03 glass |
| Inline text link action | 1.1.06 |
| Delete / irreversible | Entry: 1.1.08 soft danger → confirm with 6.4.01 alert (or 1.5.02 hold-to-confirm, no dialog) |
| Forward navigation (Continue, Next) | 1.1.11 trailing arrow |
| Button doing network work | 1.5.01 async (busy → done) |
| Icon-only action | 1.3.01 (+ `data-tip`), 1.3.02 ghost in toolbars |
| On/off icon (bookmark, mute) | 1.3.04 · like/favorite 1.3.05 · with count 1.5.04 |
| Copy a value | 1.3.06 button · 3.1.06 read-only field + copy |
| Follow / subscribe | 1.5.03 |
| More actions on an item | 1.3.09 overflow → 4.7 menu; plus 4.8.01 context menu |
| Default action + alternatives | 1.4.02 split button |
| Create on mobile | 1.6.01 FAB · 1.6.02 speed dial · 1.6.03 extended |
| Setting that applies instantly | 2.1 switch |
| Pick several options | 2.2 checkboxes · 2.2.05 cards · 2.5.01 filter chips · 2.10.01 tiles |
| Pick one of 2–5 visible options | 2.3 radio · 2.3.02 radio cards · 2.4 segmented (switches a view) · 2.5.02 chips · 2.10.02 tiles |
| Pick one of many | 3.4.01 custom select (≤12, rich rows) · 3.4.02 native select (long lists) · 3.7.01 combobox (type to filter) |
| Number | 2.6 slider (continuous) · 2.7 stepper (small integers) |
| Rating | 2.9.01 · color 2.8.01 |
| Text input | 3.1.01 floating label (default) · 3.1.02 label above (dense forms) · 3.1.03 with icon · 3.1.05 prefix/suffix |
| Password | 3.1.04 (reveal + strength) |
| Validation | 3.5.01 live (`data-validate`) · 3.5.02 error · 3.5.03 success |
| Search | 3.2.01 · with filters 3.2.02 |
| Long text | 3.3.01 counter · 3.3.02 auto-grow (chat/comments) |
| Code / OTP | 3.6.01 |
| Files | 3.8.01 drop zone · 1.5.05 upload button |
| Dates | 3.9.01 |
| App navigation | Desktop 4.1.01 sidebar · mobile 4.4.01 tab bar · screen header 4.2.01 |
| Sections of one object | 4.3.01 tabs (2.4 segmented if it is a view filter) |
| Hierarchy | 4.5.01 breadcrumbs |
| Pages of results | 4.6.01 numbered · 4.6.02 simple |
| Action menus | 4.7.01 basic · .02 icons/shortcuts · .03 sections · .04 checkable · .05 sort · .06 account |
| Multi-step flow | 4.9.01 wizard |
| Confirm something happened | 5.1 toast (non-blocking) |
| Persistent page message | 5.2 banner (info / success / warning / error + fix) |
| Loading | Known: 5.3.01 bar / 5.3.03 ring · unknown: 5.3.02 · spinner 5.4 · content placeholders 5.5 |
| Status of an item | 5.6.01 badges · live 5.6.02 · counts 5.6.03 |
| Explain an icon | 5.7.01 tooltip |
| Focused small task | 6.1.01 dialog |
| Mobile choices / share | 6.2.01 share sheet · 6.2.02 action sheet |
| Extra info by a control | 6.3.01 popover · low-risk confirm 6.3.02 |
| Destructive confirm | 6.4.01 alert |
| Filters / details beside content | 6.5.01 drawer |
| Rows of data | 7.1.01 settings list · 7.1.02 people · 7.4.01 table · 7.7.01 key/value · 7.8.01 timeline |
| Cards | 7.2.01 media · 7.2.02 content link |
| People | 7.3 avatars / stack |
| FAQ / collapsible | 7.5 accordion |
| Nothing to show | 7.6.01 empty · 7.6.02 no results |
| Theme picker / settings | 8.1.01 buttons · 8.1.02 select · 8.2.01 appearance switches |

If nothing fits, compose from existing snippets first. Only then add a new component (§8).

## 5. Behavior hooks (provided by steez.js)

| Attribute / class | Effect |
|---|---|
| `.switch[role=switch][aria-checked]` | Toggles; `data-pref="transparency\|motion\|contrast"` = app appearance setting |
| `data-toggle-press` | Toggles `aria-pressed`, pops icon; child `.n` counts ±1 |
| `data-copy="text"` | Copies, swaps `.swap` icon to check for 1.6s |
| `data-async="ms"` | idle → busy → done. Real use: set `el.dataset.state = "busy" \| "done" \| "idle"` yourself |
| `data-hold="ms"` | Hold-to-confirm, fires `stz:confirm` |
| `.fab-wrap > .fab` | Opens speed dial |
| `.chip[aria-pressed]` · `[data-single]` wrapper | Filter chips · single choice |
| `.chip--input .x` | Removes chip |
| `data-liquid` / `data-liquid-v` + `.liquid-thumb` child | Sliding selection (segmented, tab bar, sidebar). Children: buttons with `aria-checked`, `aria-selected` or `aria-current` |
| `data-pager` (with `data-liquid`) · `data-page`, `data-page-prev`, `data-page-next` | Pagination |
| `[role=radiogroup] > [role=radio]` (buttons) | Single selection (swatches) |
| `data-tabs` (+ `.tab-ink`, `role=tab`, `role=tabpanel`) | Tabs; panels in tab order |
| `data-stepper` (+ `data-min`, `data-max`, buttons `data-step="±1"`) | Stepper |
| `data-rating` (+ `data-value`) | Star rating |
| `data-tristate` wrapper + `data-all` input | Select-all checkbox |
| `input[type=range]` (+ `data-output="id"`, `data-suffix`) | Fill + live value |
| `.search` (+ `.clear`) | Clear button |
| `textarea[data-counter="max"]` · `[data-autogrow]` | Counter · auto-height |
| `data-validate="email\|required\|REGEX"` (+ `data-error`, `data-ok`) | Live validation, shake on blur |
| `data-reveal` · `data-strength="meterId"` | Password show/hide · strength meter |
| `data-otp` | Code input |
| `data-select` · `data-combobox` | Listbox select · autocomplete |
| `data-menu="id"` on trigger + `.popup[role=menu]#id` | Dropdown; `data-align="end\|center"` on popup; items: `menuitem` / `menuitemcheckbox` / `menuitemradio` |
| `data-contextmenu="id"` | Right-click / long-press / Shift+F10 menu |
| `data-popover="id"` + `.popup.popover#id` · `data-close-pop` | Popover |
| `data-dialog="id"` + `dialog.ov#id` (`.sheet-dlg`, `.drawer-dlg`) · `[data-grab]` | Dialog / sheet (drag to dismiss) / drawer |
| `data-toast="ok\|info\|err"` + `data-toast-msg`, `data-toast-action` | Toast |
| `data-dismiss` | Collapses the closest `.banner-wrap` |
| `.acc-head` · `data-accordion="single"` | Accordion |
| `table[data-sortable]` (+ `data-v` numeric cells) | Sort with gliding rows |
| `data-dropzone` | Drag-and-drop files |
| `data-wizard` + `data-wizard-next/back` | Step bar |
| `data-tilt` | Card tilts toward the pointer |
| `data-set-theme="id"` | Switch theme (circular reveal) |
| `data-tip="text"` | Tooltip (CSS) |

Content inserted after load works automatically. Call `Steez.init(container)` only to position sliding thumbs in newly inserted liquid groups or tabs.

## 6. JS API and events

```js
Steez.setTheme("paper", originElement?)      // themes: Steez.themes
Steez.toast("ok" | "info" | "err", "Message", { action: "Undo", onAction() {}, ms: 3600 })
Steez.openDialog("d-id"); Steez.closeDialog("d-id", "value")
Steez.openMenu("m-id", triggerEl); Steez.closeMenus()
Steez.icon("share", "i-sm")                  // → svg string; names: Steez.icons
Steez.init(rootEl)

el.addEventListener("stz:change",   e => e.detail.value)   // switch, chips, segmented, tabs, stepper, rating, pager, wizard, radios
el.addEventListener("stz:select",   e => e.detail.value)   // menu item (checked for checkbox items), select, combobox
dialog.addEventListener("stz:close", e => e.detail.value)  // value of the button that closed it ("" for Esc/backdrop)
el.addEventListener("stz:confirm",  …)                     // hold-to-confirm done, async button done
el.addEventListener("stz:complete", e => e.detail.value)   // OTP filled
el.addEventListener("stz:files",    e => e.detail.files)   // drop zone
document.addEventListener("stz:theme", e => e.detail.id)
```
All events bubble, so one listener on a container is fine.

## 7. Visual rules (when writing any custom CSS)

- **Tokens only.** Never write raw colors in components. Use `--text-1/2/3`, `--accent`, `--accent-ink` (text on accent), `--accent-text` (accent used as text), `--accent-soft`, `--success/--warning/--danger` (+ `-soft`), `--fill`, `--fill-2`, `--hairline`, `--glass`, `--glass-thick`, `--shadow-1..4`, `--r-xs/sm/md/lg/xl/full`, spacing `--s-1..16` (4-pt grid), type `--t-display … --t-caption`.
- **Motion tokens only:** `--dur-1` (press/hover), `--dur-2` (toggles, thumbs, menus), `--dur-3` (sheets, dialogs); easing `--ease-out` or `--spring`. Animate transform, opacity and filter only. Reduced motion is handled globally.
- **Glass:** content panels use `.glass`; chrome (sidebar, toolbar, tab bar, menus, dialogs) uses `.glass.glass--thick`. Never nest panels. No pointer-follow glows.
- **Same controls in every theme.** Never restyle a component per theme. Themes only change color (plus heading font and a small radius nudge).
- **Copy:** buttons name their action ("Rename project", not "OK"). Errors say what is wrong and how to fix it. Status is never shown by color alone (add an icon or word).
- **Accessibility:** icon-only controls need `aria-label`. Keep the snippet's roles and aria attributes. Do not remove focus rings.
- **Never:** gradient text, emoji as icons, eyebrow labels above headings, colored side stripes on cards, purple/blue glow gradients.

## 8. Adding a new component

1. Compose from tokens and existing classes. Put new CSS at the end of `steez/css/components.css` under a `/* x.y name */` header.
2. If it needs behavior, add a delegated, `data-*`-driven handler in `steez/js/steez.js` and emit a `stz:*` event. Never write per-instance JS.
3. Add a tuple to `SNIPPETS` in `steez/tools/build_library.py` with the next free ID in the right category: `(id, title, use, anim, js, html)`.
4. Run `python steez/tools/build_library.py` and check it in `steez/library.html`. Check at least one light theme and one dark theme.

## 9. Themes

| ID | Name | Scheme | Accent | Heading font |
|---|---|---|---|---|
| `harbor` (default) | T1 Harbor | dark navy | brass | Manrope |
| `porcelain` | T2 Porcelain | light cool | cobalt | Plus Jakarta Sans |
| `espresso` | T3 Espresso | dark brown | caramel | Fraunces |
| `paper` | T4 Paper | light warm | vermilion | Newsreader |
| `evergreen` | T5 Evergreen | dark green | mint | Outfit |
| `bubblegum` | T6 Bubblegum | light pink | magenta | Nunito |
| `noir` | T7 Noir | black mono | white | Instrument Serif |
| `tropic` | T8 Tropic | light sunny | coral | Bricolage Grotesque |

Body/control font is always Inter. `data-theme` on any element re-themes that subtree (8.1.03). A new theme must fill every variable in the THEME CONTRACT in `steez/css/tokens.css`, with text ≥ 4.5:1 on `--glass`.