# Changelog

`dsh-session-plus` 的版本变更记录。中文在前，English 在后。

---

## v0.7.0

### 中文

**新增 1：新建会话页的「在应用中打开」分体按钮**

- 补齐官方缺口：官方只把 Open In… 分体按钮放在已有对话的会话页头部；新建会话页（已选工作区、尚未发消息）那一行工具区在空会话下不渲染，本插件在那里补一个同款按钮。
- 位置：以官方「展开右侧面板」按钮所在的那组按钮为基准，插在整组**最左侧**（其它插件如 `dsh-better-sidebar` 的按钮排在它右侧），左侧留出固定间距。
- 行为一致：左格=当前默认应用图标，点击用该应用打开当前会话工作区；右格箭头弹出已安装应用列表，选择后记住并立即打开；悬停提示带官方快捷键（默认 ⌥⌘O）。
- 偏好共享：首次从官方 `dsh.open-in-app.choice` **只读**继承；本插件用 `dsh.session-plus.open-in-app.v1` 记录自己的选择，绝不改写官方状态。
- 自动让位与面板互斥：发出第一条消息后本插件按钮立即卸载（只剩官方那一个）；右侧面板展开时隐藏、收起后立即恢复。
- 复用官方宿主路由（`GET /open-in-app/apps`、`GET /open-in-app/icon/<id>`、`POST /open-in-app/open`），未复制官方代码；图标加载失败回退为上箭头字形；打开失败提示「打开失败，请重试」并在 3 秒后自动消失。
- 安全降级：官方应用目录不可用或返回空列表、会话没有工作区目录时整颗按钮不渲染；其余功能不受影响。

**新增 2：「设置 → 通用」里的 5 个功能开关**

- 位置：紧接官方「在使用官方模型 API 时上传 Session Log」行（`order: 90`）下方、「当前版本」行（`order: 100`）上方，占 `order: 91–95`。
- 粒度：提供商头部 / 选中文本加入对话 / 账户菜单主题切换 / 推理等级滑条 / 新建会话页按钮，各一个独立开关，互不影响；默认全开，升级后行为不变。
- 即时生效：关闭即移除对应 UI 与注入（定时器、`MutationObserver`、`resize` / `pointerdown` 监听、DOM 节点、样式一并回收），重新打开立即回来，无需刷新或重启。
- 原生回退：关闭「推理等级滑条」后，官方「推理等级」行的行高、折行、内边距逐项还原。
- 外观：与官方开关同一套几何与 token（36×20 轨道、16px 圆形滑块、选中色 `--dsw-alias-brand-primary`、`.12s` 位移、`role="switch"` + `aria-checked`）。
- 持久化与容错：偏好存浏览器 `localStorage`（键 `dsh.session-plus.features.v1`）；`localStorage` 不可用或内容损坏时退回「全开」并在内存生效，不报错。

**工程**

- `lib/client.js` 新增功能开关仓库（含 `useFeatureFlag`，优先 `useSyncExternalStore`）、五条 `settings.general.item` 注册与新会话按钮的 portal 落点逻辑；`lib/index.js`、`cordis.patch.yml`、`package.json` 的 `dsh.client.inject` 均未改动。
- 修掉两个自查发现的缺陷：① 面板展开时官方锚点消失导致插入点退化为自身、观察回调自激成死循环（改为显式识别并加 rAF 节流）；② 主题切换条被关掉后重新开启时，菜单高度已变导致几何反查失配（改为记住原菜单并在其仍可见时直接复用）。
- 测试：新增 `test/feature-flags.test.mjs`（11 项）、`test/open-in-app.test.mjs`（15 项）与 `test/session-plus-v070-browser.test.mjs`（6 项浏览器用例）；既有套件补 4 项开关门控用例。单元测试 51 → 79 项，浏览器回归 19 → 29 项，合计 108 项全绿。
- `NOTICE.md` 增补官方 `@deepseek-ai/dsh-client-ui-open-in-app` 的 MIT 来源说明（仅镜像视觉参数与文案、复用宿主路由契约）。

### English

**New 1: an "Open in app" split button on the new-session page**

- Fills an official gap: the official Open In… split button only exists in the header of a session that already has messages; the new-session page does not render that utilities row, so this plugin renders the same split button there.
- Placement: anchored to the group holding the official "expand right panel" button and inserted as that group's **leftmost** control, with a fixed gap on the left.
- Same behaviour: the left cell shows the current default app and opens the workspace in it; the chevron lists installed apps, remembers the pick and opens immediately; the tooltip shows the official shortcut (⌥⌘O by default).
- Shared preference: read-only inheritance from `dsh.open-in-app.choice` on first use; the plugin records its own choice under `dsh.session-plus.open-in-app.v1` and never rewrites the official value.
- Steps aside and excludes the panel: the plugin button unmounts once the first message is sent; it hides while the right panel is expanded and returns on collapse.
- Reuses the official host routes (`GET /open-in-app/apps`, `GET /open-in-app/icon/<id>`, `POST /open-in-app/open`) without copying official code; a failed icon falls back to an arrow glyph; a refused open shows "Could not open. Try again." for 3 seconds.

**New 2: five per-feature switches in Settings → General**

- Position: directly below the official "Upload Session Log when using the official model API" row (`order: 90`) and above the version row (`order: 100`), occupying `order: 91–95`.
- Granularity: provider header / selected-text insertion / account-menu theme switch / effort slider / new-session button — one independent switch each; all on by default, so upgrading changes nothing.
- Instant: turning one off removes its UI and injections (timers, `MutationObserver`, `resize` / `pointerdown` listeners, DOM nodes and styles are all released); turning it on restores it without a reload or restart.
- Native fallback: switching the effort slider off restores the official `Reasoning effort` row's height, wrapping and padding item by item.
- Appearance: the same geometry and tokens as the official switch (36×20 track, 16px round thumb, `--dsw-alias-brand-primary` when on, `.12s` transition, `role="switch"` + `aria-checked`).
- Persistence and tolerance: browser `localStorage` (`dsh.session-plus.features.v1`); unavailable or corrupt storage falls back to "everything on" in memory without throwing.

**Engineering**

- `lib/client.js` gains a feature-flag store (`useFeatureFlag`, `useSyncExternalStore` first), five `settings.general.item` registrations and the portal placement for the new-session button; `lib/index.js`, `cordis.patch.yml` and `dsh.client.inject` are untouched.
- Two self-found defects fixed: (1) with the panel expanded the official anchor disappears and the insertion point degrades to our own node, making the observer self-trigger in a loop (explicit identity check plus rAF throttling); (2) after switching the theme strip off and on again the menu height changed, breaking the geometric lookup (the bridge now remembers the menu and reuses it while still visible).
- Tests: new `test/feature-flags.test.mjs` (11), `test/open-in-app.test.mjs` (15) and `test/session-plus-v070-browser.test.mjs` (6 browser cases), plus 4 switch-gating cases in the existing suites. Unit tests 51 → 79, browser regressions 19 → 29, 108 in total, all green.
- `NOTICE.md` records the MIT provenance of `@deepseek-ai/dsh-client-ui-open-in-app` (visual parameters and copy mirrored, host route contract reused).

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
