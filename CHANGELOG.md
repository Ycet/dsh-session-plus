# Changelog

`dsh-session-plus` 的版本变更记录。中文在前，English 在后。

---

## v0.5.0

### 中文

**新增：账户菜单顶部「主题快捷切换」（Rubber Segment）**

- 在左下角账户菜单（`设置` / `意见反馈` / `退出登录`）弹层最上方注入三态切换条：`跟随系统` / `浅色` / `深色`。
- 动效移植 react-bits 的 RubberSegment：滑块跨段拉伸、落位挤压回弹、按住拖拽时的边缘橡皮筋与甩动惯量；`prefers-reduced-motion` 下直接落位。
- 主题读写走客户端 `theme` 服务，与 DSH 自带「设置 → 通用 → 外观」共用同一条偏好，任一处修改另一处即时同步。
- 切换条不使用 `button` 元素，菜单原有的 autofocus 与方向键序列保持不变；点击或拖拽切换后菜单保持打开，便于连续比较。
- 仅识别官方 `settings.launcher` 席位；席位或菜单结构不匹配时静默不注入，既有两项功能不受影响。

**工程**

- 新增 `lib/rubber.js`（橡皮筋/投影/最近段/拉伸挤压/缓动等纯数学）与 `lib/account-menu.js`（弹层落点几何识别），均配 `node --test` 单测；`lib/client.js` 内有对应镜像实现并注明必须同步修改。
- 浏览器夹具适配当前桌面构建：官方前端入口标记改为语义化动态解析、加载官方样式表（Menu 的 `position: fixed` 与主题 token 都来自它）、补齐模型菜单夹具所需的新参数；夹具体渲染失败时先关闭浏览器再抛出，避免残留进程拖住测试。
- 单元测试 21 → 39 项，浏览器回归 6 → 13 项（新增 7 项主题切换用例，全部在解包的桌面运行时上真实跑通）。

### English

**Added: three-state theme shortcut at the top of the account menu (Rubber Segment)**

- Injects a `System / Light / Dark` switch at the top of the account menu (`Settings` / `Feedback` / `Sign out`) popup.
- Ports react-bits RubberSegment motion: the thumb stretches across slots, squashes on landing, and drag gives edge rubber banding plus flick momentum; `prefers-reduced-motion` lands instantly.
- Reads and writes the client `theme` service, sharing one preference with DSH's own **Settings → General → Appearance**; changing either place updates the other immediately.
- The switch uses no `button` elements, so the menu's autofocus and arrow-key order stay unchanged; the menu stays open after click or drag so themes can be compared back to back.
- Recognizes only the official `settings.launcher` seat; when the seat or menu structure does not match, it silently skips and the existing two features keep working.

**Engineering**

- New `lib/rubber.js` (rubber band, velocity projection, nearest slot, stretch/squash, easing) and `lib/account-menu.js` (popup anchoring geometry), both covered by `node --test`; `lib/client.js` keeps mirrored implementations with a sync-must note.
- Browser fixtures now adapt to the current desktop build: semantic detection of the official frontend entry markers, loading the official stylesheets (Menu's `position: fixed` and theme tokens come from them), and the newer model-menu fixture props; a failing fixture now closes the browser before rethrowing so no stray process keeps the runner alive.
- Unit tests 21 → 39, browser regressions 6 → 13 (7 new theme-switch cases, all executed against the extracted desktop runtime).

---

## 更早版本 / Earlier versions

早期版本以 Git 标签与提交历史为准，汇总如下（提交标题保持原文）：

| 版本 / Version | 提交 / Commit | 说明 |
|---|---|---|
| v0.4.2 | `fix(session): adapt to desktop model menus` | 适配桌面端分层模型菜单与富文本输入框，DOM 操作限定到所属会话 |
| v0.4.0 | `refactor!: remove redundant workspace opener` | 移除「打开工作区」（DSH 已内置 Open In…），保留提供商头部与选文插入 |
| v0.3.1 | `fix: 修复 Windows 下打开工作区无响应（PowerShell 可靠拉起 + 回退链）` | Windows 拉起重试与回退链 |
| v0.3.0 | `fix: 限定「添加至对话」仅聊天页与 better-sidebar 右侧边栏触发，插入结果末尾补空行，重写双语 README` | 触发范围收敛、末尾空行、双语文档 |
| v0.1.2 | `feat: 新增会话头部「打开工作区」按钮插件` | 首个版本：会话头部「打开工作区」按钮 |
