<div align="center">

# dsh-session-plus

**Session enhancement plugin: live model provider in the model menu · three-state theme switch in the account menu (official theme icons) · Codex-style reasoning-effort slider · an “Open in app” button on the new-session page · a settings gear in the sidebar account row · a language picker in the account menu — each one toggleable in Settings → General**

[![中文](https://img.shields.io/badge/简体中文-red?style=for-the-badge)](README.md)
[![English](https://img.shields.io/badge/English-blue?style=for-the-badge)](README_en.md)

![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![DSH](https://img.shields.io/badge/DSH-0.2.2--rc.5-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-v0.9.0-blue?style=for-the-badge)

</div>

<!-- Preview placeholder: replace this comment once a screenshot / GIF exists; never link a missing image.
<!-- Preview placeholder: docs/preview.gif is not in the repo yet; replace this comment with <img src="docs/preview.gif" alt="dsh-session-plus preview" width="720"> once added. -->
-->

**dsh-session-plus** is a session enhancement plugin for [DeepSeek Harness](https://github.com/deepseek-ai) (DSH) that adds seven lightweight boosts plus one switch panel:

- 🏷 **Show** the active model provider at the top of the model selection menu, in real time
- 🎚 A `System / Light / Dark` **theme shortcut** at the very top of the account menu (react-bits Rubber Segment motion)
- 🎛 A **Codex-style continuous slider** replacing the official `Reasoning effort` row (per-level colours plus a max-level energy layer, ported from `dsh-codex-effort-slider`)
- 🪟 The **Open In… split button** on the new-session page header, which the official UI only renders once a conversation exists (fixed-positioned as the leftmost control of the button group; hidden while the right panel is open)
- ⚙️ A **settings gear** at the right end of the sidebar account row (the official DSH settings icon), opening Settings → General in one click
- 🌐 A **language item** above Settings in the account menu (official globe icon plus the current language's native name), expanding into all eight languages DSH ships
- 🧜 **Mermaid fences in replies render inline as SVG** (mermaid 11.17.2 in its own lazy chunk; diagram / source / copy / download toolbar; follows the active theme)
- ⚙️ **One switch per feature** under Settings → General (the official `Switch` component itself, so the look matches the official rows), applied instantly

> [!NOTE]
> **As of v0.4.0, "Open Workspace" is no longer implemented by this plugin.** DSH ships its own richer **Open In…** split button in the session header; since **v0.7.0** this plugin simply mirrors that official button onto the **new-session page** (where the official utilities row is not rendered), with identical behaviour.

## 📑 Table of Contents

- [✨ Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [📖 Usage](#-usage)
- [🧪 Tests](#-tests)
- [🗂 Project Structure](#-project-structure)
- [🛠 Tech Stack](#-tech-stack)
- [🧭 Roadmap](#-roadmap)
- [📄 License](#-license)

---

## ✨ Features

### 1️⃣ Model Provider Header

| Feature | Description |
|---|---|
| Menu header | Injects a quiet `Provider: xxx` info row at the top of the model selection menu |
| Display name first | Uses the provider display name from the model directory (same source as the in-menu group titles); falls back to the raw provider id when missing |
| Live updates | Subscribes to the per-session model directory while the menu is open; the header refreshes instantly on switch |
| Empty state | Shows `—` before the directory reports a selection, then resolves automatically |
| Bilingual copy | Follows the UI locale (简体中文 / English) |
| Read-only, non-invasive | Pure display, never interactive or focusable; never touches the shipped menu's behavior or styles; the `/model` popup stays untouched |

### 2️⃣ Account-Menu Theme Shortcut

| Feature | Description |
|---|---|
| Top of the menu | Injects a three-state switch at the top of the account menu (`Settings` / `Feedback` / `Sign out`) popup, above "Settings" |
| Three states | `System` / `Light` / `Dark` (since v0.9.0 drawn with the official sun / moon / monitor icons instead of text, with slot geometry and the selected state unchanged); shares one preference with **Settings → General → Appearance**, so either place updates the other immediately |
| Rubber Segment | Ports the react-bits rubber thumb: stretch across slots, squash on landing, plus drag with flick momentum; lands instantly under `prefers-reduced-motion` |
| Mouse + keyboard | Arrow keys / Home / End switch states; the switch deliberately uses no `button` elements, so the menu's own focus and arrow-key order are unchanged |
| Non-interrupting | The menu stays open after click or drag, so the three themes can be compared back to back |
| Theme-aware | Track, thumb, and labels use DSH theme tokens only, matching the surrounding menu in both palettes |
| Safe fallback | The account menu comes from the official `settings.launcher` seat; when the seat or the menu structure does not match, the switch is silently skipped and the other features keep working |

### 3️⃣ Reasoning-Effort Slider

| Feature | Description |
|---|---|
| No new entry point | Reworks the official `Reasoning effort` row itself: taller, wrapping, with the slider filling a second line; the official label / value / chevron are left untouched |
| Continuous drag | Levels change while you drag (no waiting for release); release projects the pointer velocity and snaps to the nearest level; level count adapts per model (2 / 4 / 6) |
| One colour per level | The fill runs from blue to violet, energising towards the right; the top level lights up a violet energy layer, a sweep, and 22 starfield particles, and the row gets a violet outline |
| Seat in sync | The effort text on the composer model button and the row value are tinted per level; the `Off` level keeps the official grey |
| Reliable writes | `directory.select({ provider, model, reasoningEffort })` with same-level dedupe, in-flight merge, 120 ms throttling, and a 10 s timeout rollback; failures show an inline message instead of pretending to succeed |
| Motion profile | Fixed to the upstream `full` motion and **unaffected by the OS reduce-motion setting**; ticks fixed to `highlight reached levels` |
| No context-menu panel | The slider itself never opens a right-click, long-press or context-menu popup, and a window-capture guard also stops leftover document-level listeners from the previous version. To turn the slider on or off, use Settings → General |
| Safe fallback | When the official row, the model effort levels, or the session directory is missing, nothing happens and the official menu stays as-is |
| Attribution | Ported from MIT-licensed `dsh-codex-effort-slider@1.1.3`; see [NOTICE.md](NOTICE.md) for provenance and the exact changes |

### 4️⃣ "Open in app" Button on the New-Session Page

| Trait | Behaviour |
|---|---|
| Fills an official gap | The official Open In… split button only exists in the header of a session that already has messages; on the **new-session page** that utilities row is not rendered, so this plugin renders the same split button there |
| Exact placement | Anchored to the row holding the official "expand right panel" button and **fixed-positioned** as the **leftmost** control of the whole group (the official button plus the floating buttons of `dsh-better-sidebar` / `dsh-awesome-hud`), 8px away from the nearest one. The host node lives on `document.body`, takes no space in the header layout, and therefore neither consumes the measuring space of the other plugins nor overlaps them |
| Live re-measure | Re-aligns automatically when buttons are added or removed, on window resize and on sidebar toggles (`MutationObserver` + `resize` + a 500ms fallback poll); hidden until placed, so it never flashes in the top-left corner |
| Vertical alignment | Centred on the official 28px corner button (computed from the anchor's real rect, so it also follows the native Windows title bar) |
| Same behaviour | The left cell shows the current default app and opens the session workspace in it; the chevron lists installed apps, remembers the pick, and opens immediately |
| Shared preference | Read-only inheritance from the official `dsh.open-in-app.choice` on first use; this plugin records its own choice under `dsh.session-plus.open-in-app.v1` and never rewrites the official value |
| Steps aside | As soon as the first message is sent the plugin button unmounts, leaving only the official one — never duplicated |
| Panel exclusion | Hidden while the right panel is expanded, restored the moment it collapses |
| No workspace, no button | Hidden when the session has no workspace directory (`cwd`) yet |
| Failure feedback | A "Could not open. Try again." notice appears when the host refuses, and disappears after 3 seconds |
| Safe fallback | The whole button is not rendered when the official apps route is unavailable or returns an empty list (same as the official behaviour); other features are unaffected |
| Attribution | Button copy and the 34 application names mirror MIT-licensed `@deepseek-ai/dsh-client-ui-open-in-app`; see [NOTICE.md](NOTICE.md) |

### 5️⃣ Settings Gear in the Sidebar Account Row

| Trait | Behaviour |
|---|---|
| Position | Right end of the account row (avatar + name) at the sidebar foot; always visible, independent of whether the account menu is open |
| Official icon | Reuses DSH's built-in settings icon (`dsw-icon-settings-outline-medium` from the icon sprite); when that sprite is missing at runtime it falls back to the plugin's own gear SVG with the same look |
| One click | Opens Settings → General directly, instead of "open the account card, then click Settings" |
| Three-step fallback | Calls the shell's internal store handle first (`store.create().actions.openSection('general')` off the `settings.launcher` seat); when that internal field is unavailable it degrades to "open the account menu → click Settings", then to the General nav item — all invisible to the user |
| No crowded look | While the sidebar is expanded the account trigger reserves room on the right so the name never sits under the gear; the 32×32 hit area makes it easy to hit |
| Hidden when collapsed | Not shown while the sidebar is collapsed (`data-collapsed="true"`), and the reserved padding is dropped so the avatar stays centred |
| Works signed out | The account row exists when signed out too, and the gear keeps working (the settings panel does not depend on the account) |
| Safe fallback | Silently injects nothing when the account row cannot be found or a third-party sidebar takes it over; if the settings panel still cannot be opened, only the tooltip changes to "Could not open the settings panel" and nothing else is affected |

### 6️⃣ Language Picker in the Account Menu

| Trait | Behaviour |
|---|---|
| Position | Directly **above** the official Settings item in the account menu (below the theme strip and the balance row) |
| Row content | Official globe icon on the left, "Language" in the middle, and the **native name** of the current language on the right (`中文` / `English` / `日本語` …) — the same spot that holds the shortcut hint on the official Settings row |
| Language source | Reads the official locale snapshot: whatever DSH ships is listed, with DSH's own names and order (currently eight: 中文 / English / 日本語 / Español / Français / Deutsch / Русский / Português); a language DSH adds later shows up automatically |
| Picking | Clicking the row expands a checked flyout beside it; a pick only closes the flyout and keeps the account menu open, writing straight into the official locale so the UI switches immediately |
| Mouse + keyboard | `Enter` / `Space` / `→` expand, `↑` / `↓` move between languages, `Esc` collapses and returns focus to the row; clicking outside also collapses it |
| Official row untouched | The built-in Settings → General → Language row stays exactly as-is; both places write the same preference, so they stay in sync |
| Safe fallback | The row is not rendered when the locale service is missing; if the menu structure changes so the Settings item cannot be located, nothing is injected |

### 7️⃣ Per-Feature Switches in Settings → General

| Trait | Behaviour |
|---|---|
| Position | Settings → General, directly **below** the official "Upload Session Log when using the official model API" row and **above** the official "Update channel" row (orders 90.5–93, step 0.5, leaving room for later switches) |
| Seven independent switches | Provider header · account-menu theme switch · effort slider · new-session button · sidebar settings gear · account-menu language picker · mermaid diagrams — one switch each |
| Instant | Turning one off removes its UI and injections immediately (timers, listeners, DOM, styles are all released); turning it back on restores it — no reload, no restart |
| Official look | Renders the official `@deepseek-ai/dsh-client-ui-primitives` `Switch` directly — the same component and CSS as the official settings rows (including `corner-shape:round`), so every computed style matches. On older runtimes without that primitive it falls back to a self-drawn switch whose CSS mirrors the official one |
| Native fallback | Turning the effort slider off restores the official `Reasoning effort` row exactly (height, wrapping, padding) |
| On by default | All three new switches (gear, language, mermaid) start on; the preference lives in browser `localStorage` under `dsh.session-plus.features.v1` |
| Fault-tolerant | Unavailable or corrupt `localStorage` falls back to "everything on" in memory without throwing |

### 8️⃣ Mermaid Diagrams Rendered Inline

| Trait | Behaviour |
|---|---|
| Trigger | Any chat-stream fence tagged `mermaid` (assistant replies, user messages and reasoning blocks alike) while the feature-8 switch is on |
| Result | Replaced in place by an SVG as wide as the message column (100% max), scrolling vertically past 520px and horizontally for very wide diagrams |
| Lazy loading | mermaid `11.17.2` (MIT) ships as a separate chunk that is **downloaded the first time a diagram appears**; one load per page, renders are queued serially |
| Streaming | While the text is still streaming the official code block stays; the diagram only appears once the message settles, so no half-drawn graphs or spurious errors |
| Toolbar | Hovering the chart reveals `Source` (switch back to the code block) / `Copy mermaid source` / `Download SVG` (`mermaid-YYYYMMDD-HHmmss.svg`) |
| Enlarge | Clicking the diagram (or focusing it and pressing Enter / Space) opens a full-screen overlay with `−` / ratio / `+` / `✕`; Esc closes, `+` `-` zoom and `0` resets, and a click on the backdrop also closes |
| Valid downloads | The saved SVG is well-formed XML: bare HTML void tags such as `<br>` become self-closing, HTML entities become numeric ones and bare `&` is escaped, so browsers and design tools open the file without a tag-mismatch error |
| Theme | Colours are read from `--dsw-alias-*` and mapped to mermaid `themeVariables`; switching light / dark invalidates the cache and redraws |
| Failure | A syntax error or an unavailable chunk falls back to the official code block plus one hint line (hover it for the original parser error); the rest of the conversation is unaffected |
| Safety | `securityLevel: "strict"`, `suppressErrorRendering: true`, `maxTextSize: 50000`; the produced SVG is additionally sanitised (no `<script>`, no `on*` handlers, no `javascript:` URLs) |

---

## 🚀 Quick Start

> [!NOTE]
> The npm package is **`@ycet/dsh-session-plus`**: the unscoped `dsh-session-plus` name belongs to another author and is a different project.

### 1. Install from npm (recommended, updatable from the plugin page)

```bash
# Web
dsh plugin --profile web add @ycet/dsh-session-plus@0.9.0

# Desktop: fully quit DeepSeek Harness, then use its bundled CLI
"<path-to-desktop-cli>" plugin --profile desktop add @ycet/dsh-session-plus@0.9.0
```

### 2. Install from local source

```bash
cd <absolute-path-to-plugin> && pnpm install

# Web
dsh plugin --profile web add "@ycet/dsh-session-plus@link:<absolute-path-to-plugin>"

# Desktop (current version: **v0.9.0**)
"<path-to-desktop-cli>" plugin --profile desktop add "@ycet/dsh-session-plus@link:<absolute-path-to-plugin>"
```

The default macOS CLI is `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`. Keep the quotes when the plugin path contains spaces. Reopen the desktop app after installation.

### Install from GitHub / a Release asset (no local source, no npm account)

```bash
# Option 1: GitHub dependency (pinned to a release tag; requires git)
dsh plugin --profile web add "github:Ycet/dsh-session-plus#v0.9.0"
# Desktop: replace --profile web with --profile desktop (using the desktop-bundled CLI)

# Option 2: Release asset tarball (no git required)
dsh plugin --profile web add "https://github.com/Ycet/dsh-session-plus/releases/download/v0.9.0/dsh-session-plus-0.9.0.tgz"
```

To uninstall, quit the app first, then run:

```bash
"<path-to-desktop-cli>" plugin --profile desktop remove @ycet/dsh-session-plus
```

### 3. Restart Web and verify

This is a **bundle-layer plugin**; restart `dsh web` to activate:

```bash
# Stop with Ctrl+C in the terminal, then start again
npm exec @deepseek-ai/dsh web
```

After restart, open any session:

- Click the composer's model select — the menu shows the current provider at the top
- Click the account card at the bottom left — a `System / Light / Dark` switch appears at the top of the menu

> [!NOTE]
> An **"Open In…"** button in the session header's top-right comes from **DSH itself**, not from this plugin.

### Upgrade & Rollback

<details>
<summary>Expand</summary>

**v0.9.0**: adds a **settings gear** at the right end of the sidebar account row (official settings icon, one click into Settings → General; opening goes through the shell's internal store handle first, then the account-menu Settings item, then the General nav item; hidden while the sidebar is collapsed) and a **language picker** above Settings in the account menu (reads the official locale snapshot so all eight shipped languages appear with their native names in the official order, opens a checked flyout beside the row and keeps the menu open after a pick). The account-menu theme strip now draws the official sun / moon / monitor icons instead of text, with slot geometry and the selected state unchanged. The Settings → General switch rows grow from four to six and are now ordered from 90.5 in 0.5 steps, so the whole group sits above the official "Update channel" row and later switches still have room. Adds the `lib/account-extras.js` pure-logic mirror with unit tests, plus account-row / language-row / theme-icon browser regressions. The last feature is **inline mermaid rendering** in replies: it uses the official `conversation.chat.markdown.fence` hoc seat keyed by fence language (the official Markdown renderer itself is untouched), bundles mermaid `11.17.2` as an independent lazy chunk (fetched only when the first diagram appears), offers source / copy / download-SVG actions, follows the theme and falls back to the official code block on failure. The Settings → General group therefore grows to seven rows (orders 90.5–93.5, still above the official "Update channel" row). Adds the `lib/mermaid.js` pure-logic mirror, the `scripts/build-mermaid-chunk.mjs` generator, and mermaid unit plus browser regressions. Unit tests 86 → 96, browser regressions 32 → 40; all 136 tests pass, and diagrams can be enlarged and download as valid XML.

**v0.8.0**: removes "Selected Text → Add to Conversation" and its settings switch on product decision. The floating "Add to conversation" pill, the code-block composition helper (`lib/insert.js`), the `.sp-add-btn` styles and the corresponding Settings → General row are all gone; the switch panel now has four rows (orders 91–94) and the other four features are unaffected. A leftover `selection-add` key in `localStorage` is ignored (only known feature ids are read), so no manual cleanup is needed. Unit tests 87 → 81, browser regressions 31 → 26 (baseline after v0.7.2); all 107 tests pass.

**v0.7.2**: drops the "the official root panel has exactly two menuitems" hard requirement when locating the effort row — the official 0.2.2 root panel still has "model / reasoning effort", but the row count is not a contract, and an extra row used to make the slider silently not inject. It now identifies the row by its label first, then falls back to the official fixed order ("the second row is reasoning effort"); only a single row (model has no effort levels) yields nothing. Also adds `engines.dsh: >=0.2.1-rc.2` so DSH's plugin-compatibility gate applies to this package.

**v0.7.1**: fixes two UI issues. (1) The five Settings → General switches now render the official `Switch` component: the previous self-drawn switch lacked `corner-shape:round`, so under DSH 0.2.1-rc.3's global `corner-shape: superellipse(1.5)` it was painted as a rounded square instead of matching the official switch. (2) The new-session "Open in app" button is now fixed-positioned on `document.body`: anchored to the official expand button's row and always the leftmost control of the whole group, instead of being inserted into the header corner container where it consumed the measuring space of the `dsh-better-sidebar` / `dsh-awesome-hud` floating buttons and made those two overlap. Browser fixtures gained two neighbour stand-ins plus an official-`Switch` reference; unit tests 79 → 85, browser regressions 29 → 31.

**v0.7.0**: adds the "Open in app" split button on the new-session page (filling the official gap where the empty-session utilities row is not rendered, reusing the host routes and shared preference) and the five per-feature switches in Settings → General (`settings.general.item` seat, instant effect, `localStorage` persistence), plus their offline and browser cases.

**v0.6.0**: adds a Codex-style slider for the official `Reasoning effort` row (ported from the MIT-licensed `dsh-codex-effort-slider@1.1.3`: continuous drag, one colour per level, max-level energy layer with starfield, seat tinting, dedupe plus timeout rollback), along with an offline harness with 10 behaviour assertions, 6 real-`ModelSelect` browser cases, and `NOTICE.md` for upstream attribution.

**v0.5.0**: adds a three-state theme shortcut at the top of the account menu (react-bits Rubber Segment: stretch across slots, landing squash, drag rubber band and flick momentum, reduced-motion aware). Adds the `lib/rubber.js` and `lib/account-menu.js` pure modules with unit tests, adapts the browser fixtures to the current desktop build (dynamic detection of the official frontend entry markers, loading the official stylesheets, fixing the model-menu fixture), and adds 7 browser regressions for the theme switch.

**v0.4.2**: adapts the layered model menu and rich-text composer in DSH Desktop `0.2.0-rc.2`. DOM operations are scoped to their owning conversation to prevent provider and draft cross-talk. Fixes repeated selections and scroll recovery, supports official right-side previews, and removes headers and listeners on unmount.

**Upgrade**: rerun the installation command for the relevant profile. Restart `dsh web` for Web; fully quit Desktop before installation, then reopen it.

**Rollback**:

```bash
dsh plugin --profile web remove @ycet/dsh-session-plus
# Restart dsh web to finish uninstall
```

</details>

---

## 📖 Usage

### Model Provider Header

- **Position**: first row of the model selection menu (appears as soon as the menu opens).
- **Content**: `Provider: <display name>`; raw provider id when the directory lacks the group; `—` before a selection is loaded.
- **Live**: switching models/providers while open refreshes the header immediately; closing the menu or unmounting the component removes it; reopening re-injects it.
- **No side effects**: model list scrolling, effort levels, and keyboard navigation are untouched; the `/model` popup is not injected.

### Theme Shortcut

- **Position**: the very top of the account menu popup (open it from the account card at the bottom left).
- **States**: `System` (default, follows the OS light/dark setting) / `Light` / `Dark`; this is the same preference as **Settings → General → Appearance**, so changing either one updates the other immediately.
- **Interaction**: click a segment, use arrow keys / Home / End, or drag the thumb and release (the change commits on release, so a drag never writes the preference repeatedly).
- **Non-interrupting**: the menu stays open after switching, so you can compare the three themes.
- **Edges**: the account menu is provided by the official `settings.launcher` seat; if a third-party sidebar takes that seat over, or DSH changes the menu structure, the switch silently does not appear (the provider header and the other features are unaffected).

### Reasoning-Effort Slider

- **Position**: open the model menu under the composer; the `Reasoning effort` row gains a slider underneath it (the row grows taller because of it).
- **Interaction**: hold and drag the track — the level changes as you drag. On release the pointer velocity is projected and the thumb snaps to the nearest level. Keyboard works too: focus the slider, then use the arrow keys / Home / End.
- **Colouring**: one colour per level; at the top level the track lights up with the violet energy layer and starfield, and the effort text on the composer model button is tinted to match.
- **Writes**: releasing (or switching with the keyboard) writes back to the host — the same preference as choosing a level in the official `Reasoning effort` sub-pane. Failures or timeouts roll the display back and show an inline message.
- **Edges**: if the official model menu changes shape, or the current model has no effort levels, the slider does not appear and the official menu is unaffected.

### "Open in app" on the New-Session Page

- **Position**: a new-session page opened from a workspace (blank, no messages): fixed-positioned as the **leftmost** control of the button group at the right of the header (the official expand button and the floating buttons of `dsh-better-sidebar` / `dsh-awesome-hud` all sit to its right with an 8px gap, never overlapping).
- **Interaction**: the left cell opens the workspace in the current default app; the chevron picks another installed app and remembers the choice.
- **Visibility**: hidden while the right panel is open and restored when it collapses; once the first message is sent the official button takes over.
- **Shortcut**: shared with the official command (default ⌥⌘O) and shown in the hover tooltip.
- **Failure**: a "Could not open. Try again." notice when the host or transport fails.
- **Edges**: hidden when no local application is available, or the session has no workspace directory yet.

### Settings Gear in the Account Row

- **Position**: right end of the account row (avatar + name) at the sidebar foot, always visible.
- **Interaction**: one click opens Settings → General; if the shell's internal store handle is unavailable it quietly falls back to "open the account menu → click Settings → click General".
- **Collapsed**: not shown (and no padding is reserved) while the sidebar is collapsed.
- **Edges**: when a third-party sidebar takes the row over or the panel really cannot be opened, only the tooltip changes to "Could not open the settings panel".

### Language Picker in the Account Menu

- **Position**: directly above the official Settings item in the account menu.
- **Interaction**: click the row to expand the flyout; a pick collapses the flyout, keeps the menu open and switches the UI language immediately.
- **Keyboard**: `Enter` / `Space` / `→` expand, `↑` / `↓` move, `Esc` collapses and returns focus; clicking outside also collapses it.
- **Languages**: follows the official locale snapshot (currently eight), so languages DSH adds later appear automatically; it writes the same preference as Settings → General → Language.

### Mermaid Diagrams

- **Where**: in place of any chat-stream fence tagged `mermaid` (assistant replies, user messages and reasoning blocks are all handled).
- **What happens**: once the message stops streaming, the fence is rendered to SVG; the code block stays visible while rendering, so nothing flashes.
- **Toolbar**: hovering the chart reveals `Source` (back to the code block; click `Mermaid diagram` to return), `Copy mermaid source` and `Download SVG` (`mermaid-<timestamp>.svg`).
- **Enlarge**: clicking anywhere on the diagram opens a full-screen overlay (`−` / ratio / `+` / `✕`; Esc closes, `+` `-` zoom, `0` resets, and clicking the backdrop also closes).
- **Download**: `Download SVG` saves `mermaid-<timestamp>.svg` as well-formed XML (bare void tags such as `<br>` are self-closed, HTML entities become numeric and bare `&` is escaped), so browsers and design tools open it directly.
- **Theme**: colours come from the active DSH theme tokens, so light / dark switches redraw immediately.
- **Failure**: a syntax error or an unavailable library falls back to the code block with the hint "Diagram render failed, showing source"; hover the hint for the parser's original message.
- **Scope**: relies on the official `conversation.chat.markdown.fence` seat (available in DSH 0.2.2+). On runtimes without that seat the layer is simply never registered and replies keep the official code block, with no effect on other features.

### Settings Switches

- **Position**: Settings → General, below the official "Upload Session Log" row and above the official "Update channel" row.
- **Usage**: flip a switch — it is the official `Switch` component, so it looks exactly like the official rows; the related UI disappears immediately and comes back immediately.
- **Persistence**: browser `localStorage` (`dsh.session-plus.features.v1`). If the local server port — and therefore the page origin — changes, the preference resets to the default "all on"; that is why "on" is the default.

### Supported Scope

| Item | Scope |
|---|---|
| DSH | Desktop `0.2.2-rc.5` (verified against that build); retains legacy Web `menu` detection compatibility |
| OS | Official Desktop frontend verified in browser fixtures; native Windows Desktop untested |
| Mermaid diagrams | Relies on the official `conversation.chat.markdown.fence` hoc seat and the `require.async` chunk route (`/plugins/<id>/client.*.js?rev=`); without either, the official code block is kept silently. Rendering happens locally in the browser and makes no network calls |
| Browser | Modern Chrome / Safari / Edge |
| Theme switch | Relies on the official `settings.launcher` seat and the `role="menu"` popup structure; degrades silently when they change |
| Settings gear | Relies on the official account-row structure (`data-inset` container plus the `[aria-haspopup="menu"]` trigger) and the `dsw-icon-settings-outline-medium` sprite; opening the panel prefers the `settings.launcher` internal store handle and degrades to menu clicks, only changing the tooltip when everything fails |
| Account-menu language | Relies on the official Settings item inside the account menu and the `locale` service (`getSnapshot()` / `setLocale()`); new language rows are not injected when either is missing |
| Effort slider | Relies on the official `Reasoning effort` row (`button[role="menuitem"]` plus its label/value spans) and the `modelDirectories` service; degrades silently when they change |
| New-session button | Relies on the official `conversation.hero.options` seat, the official "expand right panel" button (`[data-sidebar-right-expand]`, inside `[data-conversation-header-corner]`) as its anchor, and the host routes `GET /open-in-app/apps` / `POST /open-in-app/open`; renders nothing if any is missing. The button is a fixed-position node on `document.body` and does not depend on the corner container's layout |
| Settings switches | Relies on the official `settings.general.item` seat and the official `@deepseek-ai/dsh-client-ui-primitives` `Switch` (falls back to a self-drawn switch when the primitive is absent); without the seat the seven rows do not appear and everything else still works |

---

## 🧪 Tests

```bash
npm test
```

**93 unit tests + 39 browser regressions**. Browser tests require the official DSH runtime and Playwright supplied by the verification environment; plain `npm test` skips those 39 cases. Enable the isolated fixtures with the following command (no model calls):

```bash
SESSION_PLUS_TEST_RUNTIME="<path-to-extracted-desktop-dsh>" \
SESSION_PLUS_TEST_PLAYWRIGHT="<path-to-playwright-package>" \
SESSION_PLUS_TEST_BROWSER="<path-to-chromium-executable>" \
node --test test/*.test.mjs
```

<details>
<summary>How to prepare <code>&lt;path-to-extracted-desktop-dsh&gt;</code></summary>

The fixtures read only two packages: `@deepseek-ai/dsh-web-frontend` (official frontend entry and stylesheets) and `@deepseek-ai/dsh-client-ui-model-selection` (model menu component). Extract the matching directories under `dsh/node_modules/@deepseek-ai/` from the desktop app's `Contents/Resources/app.asar`; the resulting layout must look like `<runtime>/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-*.js`.

The asar data area starts at `8 + readUInt32LE(4)` (not `16 + readUInt32LE(12)`, which shifts every extracted file by 1–2 bytes). The official stylesheets must be injected into the page as well: Menu's `position: fixed` and the theme tokens come from them, otherwise the popup falls back to normal flow and the geometric menu detection cannot work.

</details>

Coverage:

- **Provider label**: display-name priority / raw-id fallback / empty-state placeholder / tolerance for empty groups and names
- **Host-half mounting**: export surface is exactly `name` + `apply` (a no-op without `inject`) — guards the "the host row must stay" constraint
- **Rubber Segment math**: rubber-band damping / velocity projection / sample window / nearest slot / stretch and squash directions / easing curve
- **Account-menu anchoring**: side-top placement, viewport clamping, 4px tolerance acceptance and rejection, post-insertion self-correction
- **Browser runtime**: official model menu, live directory updates, multi-session isolation, unmount cleanup
- **Theme switch (real Menu primitive)**: injection point and panel fit, single write per click without closing the menu, single commit per drag, arrow keys and focus, close cleanup and reopen state, external theme changes, reduced-motion landing, no injection into other popups
- **Account-row gear / language row (offline)**: locale-snapshot cleaning (rows missing an id or native name, or with illegal values, are dropped while the official order is kept), nav-item index sorted by `order` stably, and collapsed-state detection
- **Account-row gear / language row (real DOM)**: the gear is always there with the official icon and opens General through the shell's store handle, degrades to the account-menu Settings item when that handle is missing, disappears while the sidebar is collapsed and returns afterwards; the language row sits directly above Settings and shows the current native name, the flyout lists every language with the current one checked and keeps the menu open after a pick, each feature disappears as soon as its switch is turned off, and the theme strip renders one official icon per slot with its accessible name preserved
- **Effort slider (offline harness)**: injection into the official row (padding / wrap / height, official spans and chevron preserved), level mapping and detents, energy and particle maths, motion engine convergence without overshoot, write-back contract (single commit, correct `provider`/`model`/`reasoningEffort`, dedupe), rollback plus inline message on failure, per-row restoration on close, fail-open when the menu is closed, seat tinting, and the i18n hook falling back to the upstream copy
- **Effort slider (real `ModelSelect`)**: slider fills the second line of the official row, a drag to the far right writes `max` once and keeps the menu open, closing the menu restores the row's inline styles, End / ArrowLeft write back through the keyboard, right-click opens no settings panel even with a foreign document-level listener installed, and a model without effort levels gets no slider at all
- **Feature switches (offline)**: all-on defaults, `localStorage` write/read-back, tolerance for corrupt JSON / non-objects / illegal values, write failures in private mode, unknown ids ignored, subscription dedupe and unsubscribe, `reset` re-read, plus row ordering and bilingual copy completeness
- **Open in app (offline)**: the three host-route constants, request body and failure results, one-shot app-directory read with empty / non-2xx / offline fallbacks, preference inheritance (own key first, official key as a bare string or JSON), application-name fallback, the four-condition visibility truth table, the service/DOM dual path of the panel-expanded probe, and the cluster-placement geometry (8px gap on the left, cross-row buttons ignored, viewport clamp on very narrow windows, `null` when the anchor or size is unusable)
- **Open in app (real DOM)**: appears on the new-session page fixed-positioned as the leftmost control of the whole group (the `dsh-better-sidebar` / `dsh-awesome-hud` stand-ins sit to its right with no overlap, 8px gap, vertically centred), re-aligns when those neighbours disappear, unmounts together with its host node once a message is sent, hides on panel expand and returns on collapse, correct POST body from the primary button, app-menu switching that persists the preference, and a failure notice that auto-dismisses
- **Mermaid diagrams (offline)**: gating truth table (switch off / streaming / empty fence / non-string), theme-token to `themeVariables` mapping with blank fallbacks, theme fingerprint, SVG sanitising (script / event attributes / `javascript:` removed, `xmlns` added, bare void tags self-closed, HTML entities numeric, bare `&` escaped), download file name, cache key and capacity trimming, error-message compaction and truncation
- **Mermaid diagrams (real DOM)**: the code block shows and no chunk loads while streaming, the settled message swaps in an SVG, the chunk is reused afterwards, diagram / source toggling, copy writes to the clipboard and shows a short confirmation, syntax and chunk failures fall back with a hint, a theme change clears the cache and redraws, and turning the switch off returns to the code block without loading the chunk again
- **Feature switches (real DOM)**: the seven rows land below the official upload row and above the official Update channel row in a stable order and reuse the official `Switch` with computed styles identical to an official reference; disabling the provider header / effort slider / theme strip / new-session button / gear / language row / mermaid diagrams removes it immediately and re-enabling restores it (including item-by-item restoration of the official row's height, wrapping and padding when the slider is switched off)
- **Browser-half registration surface**: one `conversation.input.overlay` registration, one `conversation.input.right`, one `conversation.hero.options`, one `conversation.chat.markdown.fence` (key `mermaid`) and seven `settings.general.item` rows, eighty-five locale keys, dictionary and style effects intact, session-header / `shell.overlay` registrations verifiably gone, graceful degradation when the model or theme service is missing, and a guard that the v0.8.0-removed selection-insertion feature (registration, copy keys, style class) can never come back

---

## 🗂 Project Structure

```text
dsh-session-plus/
├── lib/
│   ├── client.js        # Browser half: provider header + theme switch + effort slider + new-session button + settings gear + language row + switch panel (single bundle)
│   ├── index.js         # Host half: deliberately empty apply (lets dsh-client-modules discover the browser half)
│   ├── label.js         # Provider-label pure function (unit-testable)
│   ├── rubber.js        # Rubber Segment geometry and motion math (unit-testable)
│   ├── account-menu.js  # Account-menu anchoring geometry (unit-testable)
│   ├── account-extras.js # Pure-logic mirror for the account-row gear and language row (unit-testable)
│   ├── mermaid.js       # Mermaid gating / theme mapping / SVG sanitising / cache trimming (unit-testable)
│   └── client.mermaid-11.17.2.js # mermaid 11.17.2 lazy chunk (build artefact, do not edit)
├── scripts/
│   └── build-mermaid-chunk.mjs # Rebuilds the chunk from the npm package (sha256 check + MIT header)
├── test/                # unit tests and official-frontend browser fixtures
├── cordis.patch.yml
├── CHANGELOG.md
├── NOTICE.md            # third-party provenance and MIT notices (effort-slider port + official open-in-app copy/visual mirror)
├── package.json
└── LICENSE
```

---

## 🛠 Tech Stack

| Category | Technology |
|---|---|
| Runtime | DeepSeek Harness (DSH `0.2.2-rc.5`) · Cordis plugin system |
| Language | Plain JavaScript (ESM, no build step) |
| Browser side | DSH client runtime (`@deepseek-ai/dsh-client-*`), injected as a single bundle |
| Host side | No runtime dependencies: an empty `apply` host row, kept so `dsh-client-modules` discovers the browser half |
| Styling | DSH theme variables (`--dsw-alias-*`), styles mounted and removed with the client lifecycle |
| Diagrams | mermaid `11.17.2` (MIT, separate lazy chunk, `securityLevel: strict`) |
| Tests | Node built-in test runner (`node --test`) |

---

## 🧭 Roadmap

- [x] Model provider header (live updates + bilingual copy)
- [x] Desktop rich-text composer, layered model menu, and conversation isolation
- [x] Remove "Open Workspace" (superseded by DSH's built-in Open In…)
- [x] Account-menu theme shortcut (Rubber Segment, drag momentum, reduced motion)
- [x] Reasoning-effort slider (ported from `dsh-codex-effort-slider`: continuous drag, one colour per level, max-level energy layer)
- [x] "Open in app" button on the new-session page (same split button, fixed-positioned as the leftmost control without crowding other plugins, panel exclusion, shared preference)
- [x] Per-feature switches in Settings → General (reusing the official `Switch`, instant effect, native fallback, `localStorage` persistence)
- [x] Settings gear at the right end of the sidebar account row (official icon, one click into General, three-step open fallback, hidden when the sidebar is collapsed)
- [x] Language picker above Settings in the account menu (official locale snapshot, native names, checked flyout, menu stays open)
- [x] Inline mermaid rendering (official fence seat, mermaid 11.17.2 lazy chunk, source / copy / download SVG, theme following, graceful fallback)
- [x] Remove "Selected Text → Add to Conversation" (v0.8.0, retired on product decision: floating button, code-block insertion, settings row and unit tests all deleted)

---

## 📄 License

This project is released under the [MIT](LICENSE) license (SPDX: `MIT`).

Specifically:

- the reasoning-effort slider is ported from the MIT-licensed `dsh-codex-effort-slider`;
- the new-session button mirrors the visual parameters, button copy and the 34 application names of the MIT-licensed official package `@deepseek-ai/dsh-client-ui-open-in-app` (no code was copied; only its host HTTP route contract is reused);
- the Settings → General switches render the MIT-licensed official primitive `@deepseek-ai/dsh-client-ui-primitives` `Switch` at runtime (no code was copied); the fallback self-drawn switch used on older runtimes mirrors that component's geometry from `Switch.module.css`;
- the settings-gear / language-row / theme-strip icons reference DSH's official icon sprite by symbol id (no icon path data was copied); when the sprite is missing they fall back to the plugin's own matching SVG;
- the mermaid diagrams bundle the MIT-licensed `mermaid@11.17.2` build (`dist/mermaid.min.js`, `Copyright (c) 2014 - 2022 Knut Sveidqvist`) unchanged, wrapped into a chunk by `scripts/build-mermaid-chunk.mjs` after a sha256 check.

See [NOTICE.md](NOTICE.md) for the third-party copyright notices and the exact scope of changes.
