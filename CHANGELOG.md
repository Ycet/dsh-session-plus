# Changelog

`dsh-session-plus` 的版本变更记录。中文在前，English 在后。

---

## v0.6.0

### 中文

**新增：官方模型菜单「推理等级」行的 Codex 风格滑条（迁自 `dsh-codex-effort-slider@1.1.3`）**

- 不新增入口：直接改造官方模型菜单里的「推理等级」那一行——加高、允许折行，滑条作为第二行铺满整行，官方 label / value / chevron 一个不动。
- 连续跟手：拖动中即时切换档位，松手按指针速度做落点外推与吸附；档位数随模型自适应（2 / 4 / 6 档均可）。
- 一档一色：填充从蓝渐变到紫罗兰，最高档亮起紫色能量层、扫光与 22 颗星尘粒子并描边；输入框模型席的档位文字与菜单行数值同步着色，`Off` 保持官方灰。
- 写回可靠：`directory.select({ provider, model, reasoningEffort })`，同档去重 + 在途合并 + 120 ms 降频 + 10 s 超时回滚，失败时行内提示而不假装成功。
- 动画口径：固定上游「完整」动画，**不受系统「减少动态效果」影响**；刻度点固定「亮白显示已到达档位」。
- 安全降级：找不到官方那一行、模型无推理档位、目录未就绪时什么都不做，官方菜单保持原样。
- 无设置面板：本插件不提供设置面板，右键 / 长按 / 菜单键都不弹浮层；并在 window 捕获阶段截住这些事件、清理旧版本残留的 document 级监听，避免历史面板重新弹出。
- 迁移范围按既定决策裁剪：**不迁移**右键设置面板、浏览器本地存储设置、三档动画切换与逐帧诊断。

**工程**

- 客户端单 bundle 内新增 vendor 段落（上游核心按「迁移改造」注释标注改动点）；文案改走本插件 zh/en 词典（新增 6 个键），样式并入既有 `<style>` 标签而不再单独挂载。
- `exports.inject` 保持不变；滑条用 `ctx.inject(["modelDirectories"])` 单独装配，服务缺失时其余三项功能不受影响。
- 新增离线测试台 `test/helpers/effort-harness.mjs`（假 DOM + 带状态 React 桩 + 假宿主）与 10 项关键行为断言；浏览器夹具补齐 `reasoning.efforts` 与 `select()` 记录，新增 6 项真实 `ModelSelect` 用例（含键盘 End / ArrowLeft 写回、右键不弹面板）。
- 单元测试 39 → 51 项，浏览器回归 13 → 19 项；新增 `NOTICE.md` 保留上游 MIT 声明。

### English

**Added: Codex-style slider for the official "Reasoning effort" row (ported from `dsh-codex-effort-slider@1.1.3`)**

- No new entry point: reworks the official row in place — taller, wrapping, slider filling a second line; the official label / value / chevron stay untouched.
- Continuous drag: levels change while dragging; release projects pointer velocity and snaps to the nearest level; level count adapts per model (2 / 4 / 6).
- One colour per level, from blue to violet; the top level lights a violet energy layer, sweep, and 22 starfield particles with a row outline. The composer's effort text and the row value are tinted per level; `Off` keeps the official grey.
- Reliable writes via `directory.select({ provider, model, reasoningEffort })` with same-level dedupe, in-flight merge, 120 ms throttling, and a 10 s timeout rollback; failures show an inline message.
- Motion fixed to upstream's "full" profile and **unaffected by the OS reduce-motion setting**; ticks fixed to "highlight reached levels".
- Safe fallback: missing row, no effort levels, or an unready directory means nothing happens and the official menu is untouched.
- No settings panel: the plugin ships none, so right-click, long-press, and the context-menu key never open a popup; a window-capture guard also clears document-level listeners left behind by the previous version.
- Scope trimmed as agreed: the right-click settings panel, browser-local settings, the three motion profiles, and the per-frame diagnostics are **not** ported.

**Engineering**

- New vendor segment inside the single client bundle (every change marked "迁移改造"); copy now resolves through this plugin's zh/en dictionary (6 new keys) and styles are merged into the existing `<style>` tag instead of a separate one.
- `exports.inject` is unchanged; the slider assembles through its own `ctx.inject(["modelDirectories"])`, so the other three features keep working when the service is missing.
- New offline harness `test/helpers/effort-harness.mjs` (fake DOM + stateful React stub + fake host) with 10 key behaviour assertions; the browser fixture now carries `reasoning.efforts` and records `select()`, with 6 new cases against the real `ModelSelect` (including keyboard End / ArrowLeft write-back and right-click opening no panel).
- Unit tests 39 → 51, browser regressions 13 → 19; `NOTICE.md` preserves the upstream MIT notice.

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
