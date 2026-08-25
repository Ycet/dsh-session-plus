# dsh-session-plus

Session enhancement plugin: an "Open Workspace" button in the session header, the current model provider at the top of the model selection menu, and one-click "Add to conversation" for selected text.

[![中文](https://img.shields.io/badge/简体中文-red?style=for-the-badge)](README.md)
[![EN](https://img.shields.io/badge/English-blue?style=for-the-badge)](README_en.md)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![DSH](https://img.shields.io/badge/DSH-0.1.1--rc.2-blue?style=for-the-badge)

> This plugin merges and renames `dsh-open-workspace` (open workspace) and `dsh-model-provider-header` (model provider header) into one.

## ✨ Features

### 1️⃣ Open Workspace

| Feature | Description |
|---|---|
| One-click open workspace | A new icon button in the top-right of the chat UI, left of the Session log download button |
| Platform-adaptive icon | Finder icon on macOS, folder icon on Windows / Linux (icon-only, no text); icons ship inside the package and are served by the host |
| Native platform support | macOS `open` · Windows `explorer` · Linux `xdg-open` fallback |
| Correct workspace resolution | Reads the session's `session.header.cwd` (identical to the session's bash working directory) |
| Result feedback | Bottom-right toast only on failure (success stays silent; style matches dsh-my-plugins) |
| Security | The host API accepts loopback/trusted hosts + same-origin requests only; the browser sends only the sessionId, paths are resolved server-side |

### 2️⃣ Model Provider Header

| Feature | Description |
|---|---|
| Menu header | Injects a quiet `Provider: xxx` info row at the top of the model selection menu |
| Display name first | Uses the provider display name from the model directory (same source as the in-menu group titles); falls back to the raw provider id when missing |
| Live updates | Subscribes to the per-session model directory while the menu is open; the header refreshes instantly on switch |
| Empty state | Shows `—` before the directory reports a selection, then resolves automatically |
| Bilingual copy | Follows the UI locale (中文 / English) |
| Read-only, non-invasive | Pure display, non-interactive, never focusable; never touches the shipped menu's behavior or styles; the `/model` popup stays untouched |

### 3️⃣ Selected Text → Add to Conversation

| Feature | Description |
|---|---|
| Floating button | Select any text in the chat message area — an "Add to conversation" pill appears centered above the selection; flips below when there's no room above |
| Prepend insertion | Clicking inserts the text as a markdown code block (no language tag) at the **start** of the input; existing draft stays after it, separated by a blank line |
| Adaptive fence | If the selected text contains ```, a longer fence (````) is used automatically so markdown stays intact |
| Standard toolbar behavior | Hides on outside click / Escape / collapsed selection / message-area scroll; after clicking, the selection clears, the button hides, and the input regains focus |
| Scoped | Triggers only in the chat message area; selections in the input, sidebar, or settings never show it |
| No length limit | Wraps the whole selection; label follows the UI locale |

## 🚀 Quick Start

### 1. Install

```bash
cd <absolute-path-to-plugin> && pnpm install
dsh plugin --profile web add dsh-session-plus@link:<absolute-path-to-plugin>
```

### 2. Restart and verify

This is a bundle-layer plugin; restart `dsh web` to activate:

```bash
# Stop with Ctrl+C in the terminal, then start again
npm exec @deepseek-ai/dsh web
```

After restart, open any session: the "Open Workspace" icon button appears at the top-right (left of the Session log button); click the composer's model select — the menu shows the current provider at the top.

## 📖 Usage

### Open Workspace

- **Position**: session header top-right utilities, next to the Session log download button.
- **Icon**: Finder-style on macOS; folder icon on Windows / Linux.
- **Success**: no toast — the file manager opening is the feedback.
- **Failure**: red bottom-right toast with the reason (session missing, no workspace record, directory deleted, command failure, etc.).
- **Debounce**: the button disables while a request is in flight to avoid duplicate file-manager windows.

### Model Provider Header

- **Position**: first row of the model selection menu (appears as soon as the menu opens).
- **Content**: `Provider: <display name>`; raw provider id when the directory lacks the group; `—` before a selection is loaded.
- **Live**: switching models/providers while open refreshes the header immediately; closing the menu removes it, reopening re-injects it.
- **No side effects**: model list scrolling, effort levels, and keyboard navigation are untouched; the `/model` popup is not injected.

### Selected Text → Add to Conversation

- **Trigger**: drag-select text in the chat message area (assistant reply or user message); the "Add to conversation" button appears above the selection on release.
- **Result**: clicking puts a ` ``` `-fenced code block at the **start** of the input; existing draft content stays after it (blank line separated).
- **Dismiss**: outside click, Escape, collapsed selection, or scrolling the message area hides it; after clicking, the selection clears and the input regains focus.
- **Edges**: selections inside the input / sidebar / settings never trigger; text containing triple backticks automatically gets a longer fence.

### Supported Scope

- DSH: `0.1.1-rc.2` (current web profile)
- OS: macOS / Windows (Linux via `xdg-open` fallback)
- Browser: modern Chrome / Safari / Edge on the same machine as `dsh web`

### Upgrade / Rollback

- Upgrade: client-layer changes apply on page refresh/HMR; bundle/host-layer changes require restarting `dsh web`.
- Rollback:

```bash
dsh plugin --profile web remove dsh-session-plus
# Restart dsh web to finish uninstall
```

## 🧪 Tests

```bash
npm test
```

- Host pure-function tests: platform command mapping, request trust checks, workspace path resolution, Windows exit-code tolerance.
- Provider-label tests: display name priority / raw-id fallback / empty-state placeholder / tolerance for empty groups and names.
- Code-block insertion tests: fence computation / prepend composition / empty draft / longer-fence upgrade on ```.

## 🗂 Structure

```text
dsh-session-plus/
├── lib/
│   ├── client.js   # Browser half: button + toasts + provider header + selected-text add (single bundle)
│   ├── index.js    # Host half: /session-plus/api open-workspace API + asset routes
│   ├── insert.js   # Selected-text → code-block composition (unit-testable)
│   └── label.js    # Provider-label pure function (unit-testable)
├── assets/icons/   # finder.png / folder.svg platform icons
├── test/           # index / label / insert test suites
├── cordis.patch.yml
└── package.json
```

## 📄 License

[MIT](LICENSE)