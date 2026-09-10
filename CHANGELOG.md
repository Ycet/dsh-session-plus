# 变更记录 / Changelog

本文件记录 dsh-session-plus 的版本变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

更早的版本历史（v0.1.0 – v0.3.1）未回填，见仓库的 git 提交记录。

## [0.4.0] - 2026-09-10

### 移除 / Removed

- **移除「打开工作区」功能**：会话页头部右上角的「访达 / 文件资源管理器」图标按钮不再提供。
  - **原因**：DSH `0.1.5-rc.1` 已内置功能更完整的 **Open In…** 分体按钮（同一会话头部工具区），可在已安装的目录应用中打开当前会话 workspace，本插件无需重复实现。
  - 一并移除的配套实现：宿主侧原生命令执行 API（macOS `open` / Linux `xdg-open`，Windows PowerShell → cmd `start` → `explorer` 回退链）、包内平台图标资产路由、`assets/icons/`（`finder.png` / `folder.svg`）、失败提示 toast 基建（`shell.overlay` 注册与 `.ow-*` 样式）、`@deepseek-ai/dsh-native-command` 依赖，以及仅覆盖该功能的 28 项单元测试。
  - **不影响另外两项功能**：模型提供商头部、选中文本 → 添加至对话保持原样；新增的浏览器半区注册面回归测试会持续守护这一点。
  - Removed the "Open Workspace" header button and every supporting piece: the host-side native-command API (macOS `open` / Linux `xdg-open`, with a Windows PowerShell → cmd `start` → `explorer` fallback chain), the bundled platform-icon asset route, `assets/icons/`, the failure-toast plumbing (the `shell.overlay` registration and `.ow-*` styles), the `@deepseek-ai/dsh-native-command` dependency, and the 28 unit tests that covered it only. Reason: DSH `0.1.5-rc.1` ships a richer built-in **Open In…** split button that opens the session workspace in an installed directory app. **The other two features are unaffected.**

### 变更 / Changed

- 宿主半区（`lib/index.js`）收敛为刻意保留的空 `apply`：浏览器半区只从「宿主 Loader entries 中声明了 `dsh.client`、entry.fiber 存在且未被 disabled」的包被 `dsh-client-modules` 发现并组装，因此这一行必须保留，删掉它会让另外两项功能一起静默失效。`lib/index.js` 与 `cordis.patch.yml` 均已写明该约束。
- 测试从 41 项（旧 README 记作 35 项，为已过期的数字）收敛为 **20 项**：删除 28 项 host 侧功能测试，新增宿主半区挂载冒烟测试（3 项）与浏览器半区注册面回归测试（4 项），并保留提供商名解析（6 项）与代码块插入（7 项）。
- `package.json`：`version` 0.3.1 → 0.4.0；`files` 移除 `assets`；移除整个 `dependencies` 字段（不再有任何运行时依赖）；`description` 改为描述剩余两项功能。
- 双语 README 全面同步，并修正此前与代码不符的信息：DSH 版本（`0.1.1-rc.2` → `0.1.5-rc.1`）、版本徽章（`v0.3.0` → `v0.4.0`）、测试数量、项目结构、技术栈，以及随原生命令一并失效的「平台 macOS / Windows」与「浏览器需与 `dsh web` 同机」两条约束。
- The host half (`lib/index.js`) is now a deliberately empty `apply`: the browser half is only discovered by `dsh-client-modules` via host Loader entries that declare `dsh.client`, own a fiber, and are not disabled — so this row has to stay. Tests: 41 → 20, with host-half mount smoke tests and browser-half registration regression tests added while the provider-label and code-block insertion tests are kept.

---

[0.4.0]: https://github.com/Ycet/dsh-session-plus/releases/tag/v0.4.0
