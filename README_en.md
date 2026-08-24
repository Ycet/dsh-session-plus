# dsh-open-workspace

A "Open Workspace" button in the DSH session header: open the current session's workspace root in Finder (macOS) or File Explorer (Windows) with one click.

[![中文](https://img.shields.io/badge/简体中文-red?style=for-the-badge)](README.md)
[![EN](https://img.shields.io/badge/English-blue?style=for-the-badge)](README_en.md)

![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)

## ✨ Features

| Feature | Description |
|---|---|
| Open workspace in one click | Icon button in the top-right of the chat header, left of the **Session log** download button |
| Platform-aware icon | Finder icon on macOS, folder icon on Windows / Linux (icon only, no label); icons ship inside the plugin package and are served by the host |
| Native platform support | macOS `open` · Windows `explorer` · Linux `xdg-open` fallback |
| Correct workspace resolution | Uses the session's `session.header.cwd` (identical to the session's bash working directory) |
| Result feedback | Bottom-right toast: shows the specific reason on failure only; success stays quiet (same style as dsh-my-plugins) |
| Security | Host API only accepts loopback / trusted-host same-origin requests; the browser sends only a sessionId, paths are resolved server-side |

## 🚀 Quick Start

### 1. Install

```bash
cd <absolute-path-to-plugin> && pnpm install
dsh plugin --profile web add dsh-open-workspace@link:<absolute-path-to-plugin>
```

### 2. Restart and verify

This is a bundle-layer plugin — restart `dsh web` to activate:

```bash
# Stop with Ctrl+C in the terminal, then start again
npm exec @deepseek-ai/dsh web
```

Open any session: an icon button appears in the top-right (left of the **Session log** button). Click it to open the session's workspace root in Finder / File Explorer.

## 📖 Usage

- **Position**: top-right utility area of the session header, immediately left of the Session log download button.
- **Icon semantics**: Finder-style icon on macOS; folder icon on Windows / Linux.
- **Success**: no toast — the file manager window opening is the feedback itself.
- **Failure**: bottom-right red toast with the specific reason (session not found, session has no workspace record, workspace directory deleted, command failed, ...).
- **Debounce**: the button is disabled while a request is in flight to avoid opening multiple file manager windows.

### Supported environments

- DSH: `0.1.1-rc.2` (current web profile)
- Platforms: macOS / Windows (Linux via `xdg-open` fallback)
- Browsers: modern Chrome / Safari / Edge on the same machine as `dsh web`

### Upgrade / Rollback

- Upgrade: client-layer changes take effect on page refresh or HMR; bundle / host-layer changes require restarting `dsh web`.
- Rollback:

```bash
dsh plugin --profile web remove dsh-open-workspace
# Restart dsh web to complete the removal
```

## 🧪 Tests

```bash
npm test
```

Host-side pure-function unit tests (platform command mapping, request trust validation, workspace path resolution, Windows exit-code tolerance).

## 📄 License

[MIT](LICENSE)