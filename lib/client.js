// dsh-session-plus — browser half（ModuleLoader bundle）
//
// 功能：
//   1. 模型选择菜单顶部「提供商：xxx」头部（原 dsh-model-provider-header）：菜单识别基于
//      a11y 契约（role="menu" + 触发器 aria-haspopup="menu"/aria-controls 配对 +
//      aria-expanded="true"）；数据来自会话共享目录 ctx.modelDirectories；store 订阅
//      实现打开期间实时跟随；1s interval 保险在菜单被 React 重挂载后重新注入；
//      /model 指令打开的 popupSelect 弹出器不做任何注入。
//   2. 选中文本 → 添加至对话（v0.3.0）：在聊天消息区选中文本时，选区上方居中显示
//      「添加至对话」悬浮按钮；点击后把选中文本以 markdown 代码块插入输入框开头
//      （已有内容也置于开头，块后空一行；围栏一律为 ```，不随文本内容升级）。
//   3. 账户菜单顶部「主题切换」Rubber Segment（v0.5.0）：在官方 settings.launcher
//      席位的账户菜单弹层最上方注入三态切换条（跟随系统 / 浅色 / 深色），动效移植
//      react-bits 的 RubberSegment（拉伸跨段 + 落位挤压 + 拖拽边缘橡皮筋 + 甩动惯量）。
//      主题读写走客户端 theme 服务（与「设置 → 通用 → 外观」同一条持久化通道）。
//
// 注：宿主半区（lib/index.js）刻意保留为空 apply —— 浏览器半区只从「宿主 Loader
// entries 中声明了 dsh.client、entry.fiber 存在且未被 disabled」的包被
// dsh-client-modules 发现并组装；删掉宿主行会让本文件整体静默失效。
//
// 历史：v0.3.x 的「打开工作区」按钮（原由独立插件提供）已于 v0.4.0 移除，
// 该能力由 DSH 内置的 Open In… 分体按钮提供。
window.__ModuleLoader__.load({
	id: "dsh-session-plus",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");

		const NS = "sessionPlus";
		const HEADER_ENTRY_ID = "provider-header";
		const HEADER_ATTR = "data-model-provider-header";
		const SELECTION_ADD_ID = "selection-add";
		const CSS_TAG = "dsh-session-plus/client.css";

		const zh = {
			providerEntry: "模型提供商",
			providerLabel: "提供商：{name}",
			addToConversation: "添加至对话",
			themeGroup: "主题",
			themeSystem: "跟随系统",
			themeLight: "浅色",
			themeDark: "深色",
			themeSwitchHint: "切换界面主题",
			themeUnavailable: "主题服务不可用",
		};
		const en = {
			providerEntry: "Model provider",
			providerLabel: "Provider: {name}",
			addToConversation: "Add to conversation",
			themeGroup: "Theme",
			themeSystem: "System",
			themeLight: "Light",
			themeDark: "Dark",
			themeSwitchHint: "Switch interface theme",
			themeUnavailable: "Theme service unavailable",
		};

		// 样式仅使用 Theme provider 已核实的 token（--dsw-alias-*）。
		// .sp-ts-* 为账户菜单顶部的主题切换条；既有的 .php-* / .sp-add-btn 保持原样。
		const css = ".php-header{box-sizing:border-box;flex:none;align-items:baseline;gap:6px;padding:6px 10px 5px;margin-bottom:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);display:flex;user-select:none}.php-value{color:var(--dsw-alias-label-primary);font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sp-add-btn{position:fixed;z-index:2147482995;transform:translateX(-50%);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv1);border-radius:999px;align-items:center;padding:5px 12px;font-size:12px;line-height:18px;font-weight:500;cursor:pointer;user-select:none;display:flex;-webkit-app-region:no-drag}.sp-add-btn:hover{filter:brightness(1.08);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,var(--dsw-alias-border-l2))}" + ".sp-ts{box-sizing:border-box;flex:none;margin:0 0 3px;padding:0 0 3px;border-bottom:.5px solid var(--dsw-alias-border-l2)}.sp-ts-track{position:relative;box-sizing:border-box;display:flex;align-items:stretch;height:32px;padding:3px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);user-select:none;-webkit-user-select:none;touch-action:none}.sp-ts-thumb{position:absolute;top:3px;bottom:3px;left:3px;width:0;border-radius:6px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv1);pointer-events:none}.sp-ts-slot{box-sizing:border-box;position:relative;flex:1 1 0;min-width:0;display:block;padding:0 8px;height:26px;line-height:26px;text-align:center;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;border-radius:6px}.sp-ts-slot[aria-checked=\"true\"]{color:var(--dsw-alias-label-primary);font-weight:500}.sp-ts-slot:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.sp-ts-ghost{display:block;height:0;overflow:hidden;line-height:0;visibility:hidden}.sp-ts-text{pointer-events:none}";

		function interpolate(template, values) { return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? ""); }

		// 镜像 lib/label.js 的 resolveProviderLabel（ModuleLoader bundle 自包含，
		// 不支持包内 import；两处必须同步修改，label.js 有对应 node --test 单测）。
		function resolveProviderLabel(current, groups) {
			if (current === null || current === undefined || typeof current.provider !== "string") return "—";
			if (Array.isArray(groups)) {
				for (const group of groups) {
					if (group !== null && typeof group === "object" && group.id === current.provider && typeof group.name === "string" && group.name.length > 0) {
						return group.name;
					}
				}
			}
			return current.provider;
		}

		// 镜像 lib/insert.js 的 codeFence / prependCodeBlock（ModuleLoader bundle 自包含，
		// 不支持包内 import；两处必须同步修改，insert.js 有对应 node --test 单测）。
		// 围栏固定为三个反引号（产品要求只展示 ```，不随文本内容升级为 ```` 等）。
		function codeFence() {
			return "```";
		}
		function prependCodeBlock(draft, text) {
			const fence = codeFence();
			const block = `${fence}\n${text}\n${fence}`;
			const rest = draft === undefined || draft === null ? "" : draft;
			const result = rest === "" ? block : `${block}\n\n${rest}`;
			return result.endsWith("\n") ? result : `${result}\n`;
		}

		const inject = ["slots", "locale"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-session-plus: dictionaries");
			const t = ctx.locale.bind(NS);

			ctx.effect(() => {
				if (typeof document === "undefined") return;
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-session-plus";
				tag.dataset.pluginCss = CSS_TAG;
				tag.textContent = css;
				document.head.appendChild(tag);
				return () => tag.remove();
			}, "dsh-session-plus: styles");

			/** overlay 内的隐形锚点把 DOM 操作限定到所属 composer，避免主会话和侧会话串用数据。 */
			const composerOf = (owner) => owner?.closest('[data-composer-card], [data-slot="conversation.composer.bar"]') ?? null;

			// —— 功能 1：模型选择菜单提供商头部 ——
			// 仅该能力等待模型目录服务；服务不存在时，选中文本功能仍可独立运行。
			ctx.inject(["modelDirectories"], (scope) => {
				scope.slots.inject("conversation.input.overlay", () => scope.slots.register({
					name: "conversation.input.overlay",
					id: HEADER_ENTRY_ID,
					order: 90,
					label: () => t("providerEntry"),
					locale: NS,
					inject: (sessionId) => {
						if (sessionId === undefined || sessionId === null) return { store: null };
						const directory = scope.modelDirectories.directoryFor(sessionId);
						return { store: directory?.store ?? null };
					},
				}, ProviderHeader));
			});

			function ProviderHeader(props) {
				const ownerRef = react.useRef(null);
				const store = props.store;
				react.useEffect(() => {
					const composer = composerOf(ownerRef.current);
					if (!composer || !store) return undefined;
					const headers = new Map();
					const labelOf = () => {
						const state = store.getSnapshot();
						return interpolate(t("providerLabel"), { name: resolveProviderLabel(state?.current, state?.groups) });
					};
					const renderHeader = (header) => {
						const value = header.querySelector(":scope > .php-value");
						const label = labelOf();
						// 不重复写入相同文本，避免 MutationObserver 观察自身形成刷新循环。
						if (value && value.textContent !== label) value.textContent = label;
					};
					const scan = () => {
						const menus = new Set();
						const modelSeat = composer.querySelector('[data-slot="conversation.input.model"]');
						for (const trigger of modelSeat?.querySelectorAll('[aria-haspopup="menu"][aria-expanded="true"][aria-controls]') ?? []) {
							const menu = document.getElementById(trigger.getAttribute("aria-controls"));
							// 新版模型子面板的外层为 group；内部模型列表仍是 menu，但不是头部的宿主。
							if (menu && ["menu", "group"].includes(menu.getAttribute("role"))) menus.add(menu);
						}
						for (const [menu, header] of headers) {
							if (!menus.has(menu) || !header.isConnected) { header.remove(); headers.delete(menu); }
						}
						for (const menu of menus) {
							let header = headers.get(menu);
							if (!header) {
								header = document.createElement("div");
								header.setAttribute(HEADER_ATTR, "");
								header.className = "php-header";
								header.setAttribute("role", "presentation");
								header.setAttribute("aria-hidden", "true");
								const value = document.createElement("span"); value.className = "php-value";
								header.appendChild(value); menu.prepend(header); headers.set(menu, header);
							}
							renderHeader(header);
						}
					};
					const observer = new MutationObserver(scan);
					observer.observe(document.body, { childList: true, subtree: true, attributes: true,
						attributeFilter: ["aria-expanded", "aria-controls", "role", "id"] });
					const unsubscribe = store.subscribe(scan);
					scan();
					const interval = window.setInterval(scan, 1000);
					return () => {
						observer.disconnect(); unsubscribe(); window.clearInterval(interval);
						for (const header of headers.values()) header.remove();
						headers.clear();
					};
				}, [store, t]);
				return react.createElement("span", { ref: ownerRef, hidden: true, "data-session-plus-owner": HEADER_ENTRY_ID });
			}

			// —— 功能 2：选中文本 → 添加至对话 ——
			// 在聊天消息区选中文本时，选区上方居中显示「添加至对话」悬浮按钮；
			// 点击后把选中文本以代码块形式插入输入框开头（已有内容时也置于开头，
			// 块后空一行再接原文）。挂载在同一 overlay 席位（标准 props 提供
			// useInput/inputActions），按钮本体 portal 到 body。
			ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
				name: "conversation.input.overlay",
				id: SELECTION_ADD_ID,
				order: 91,
				label: () => t("addToConversation"),
				locale: NS,
			}, SelectionAdd));

			/** 从所属 composer 内查找新版富文本编辑器，保留旧版 textarea 支持。 */
			function composerInput(composer) {
				return composer?.querySelector("[data-composer-input], textarea") ?? null;
			}

			/** 旧版 better-sidebar 面板没有官方 session 标记，仅保留它的右侧预览兼容。 */
			function betterSidebarRightPanel() {
				const host = document.querySelector("[data-dsh-better-sidebar] [data-dsh-panel-host]");
				if (!host) return null;
				for (const child of host.children) {
					const rect = child.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 100 && Math.abs(rect.right - window.innerWidth) <= 4
						&& rect.top <= chromeTop() + 8) return child;
				}
				return null;
			}

			/** Windows 浮动工具栏避开原生标题栏；全屏及其他平台不加偏移。 */
			function chromeTop() {
				const root = document.documentElement;
				if (!root.hasAttribute("data-windows-titlebar") || root.hasAttribute("data-fullscreen")) return 0;
				const style = window.getComputedStyle(root);
				const top = parseFloat(style.getPropertyValue("--dsh-frame-chrome-top") || style.getPropertyValue("--dsh-windows-titlebar-height"));
				return Number.isFinite(top) && top >= 0 ? top : 40;
			}

			/** DOM 所属关系优先，不能用选区与面板矩形相交代替会话归属判断。 */
			function inAllowedZone(range, composer, sessionId) {
				const container = range.commonAncestorContainer;
				const node = container?.nodeType === Node.TEXT_NODE ? container.parentElement : container;
				if (!(node instanceof Element) || !composer || !composer.isConnected) return false;
				const blocked = 'input, textarea, [contenteditable]:not([contenteditable="false"]), [data-composer-card], [hidden], [aria-hidden="true"]';
				const elementOf = value => value?.nodeType === Node.TEXT_NODE ? value.parentElement : value;
				// 选区跨消息和输入框时，共同祖先是 scrollport；仍须逐一检查两个端点。
				if ([node, elementOf(range.startContainer), elementOf(range.endContainer)].some(value => value?.closest?.(blocked))) return false;
				const selectedScroll = node.closest("[data-conversation-scroll]");
				const ownScroll = composer.closest("[data-conversation-scroll]")
					?? composer.closest('[data-slot="conversation.content"], [data-slot="main.conversation"], main')?.querySelector("[data-conversation-scroll]");
				if (selectedScroll) return selectedScroll === ownScroll;
				// 官方侧栏中的普通预览发送到它所属主会话；内嵌会话优先走上面的独立 scrollport。
				const nativePanel = node.closest("[data-sidebar-right-session]");
				if (nativePanel) return (nativePanel.hasAttribute("data-sidebar-right-open") || node.closest("[data-dockkit-float]") !== null)
					&& nativePanel.dataset.sidebarRightSession === sessionId;
				const legacyPanel = betterSidebarRightPanel();
				return Boolean(legacyPanel?.contains(node) && !legacyPanel.contains(composer));
			}

			function SelectionAdd(props) {
				const useInput = typeof props.useInput === "function" ? props.useInput : () => undefined;
				const input = useInput((state) => state);
				const [anchor, setAnchor] = react.useState(null);
				const ownerRef = react.useRef(null);
				const buttonRef = react.useRef(null);
				const scrollTimerRef = react.useRef(null);
				const latest = react.useRef(null);
				latest.current = { input, actions: props.inputActions, sessionId: props.sessionId };
				const enabled = typeof props.inputActions?.setDraft === "function" && input !== undefined
					&& !["adjudicating", "submitting"].includes(input?.phase);
				const canWrite = () => {
					const { input: state, actions } = latest.current;
					const editor = composerInput(composerOf(ownerRef.current));
					return typeof actions?.setDraft === "function" && state !== undefined && editor !== null
						&& !["adjudicating", "submitting"].includes(state?.phase)
						&& editor.getAttribute("contenteditable") !== "false" && !editor.disabled && !editor.readOnly;
				};
				const selectionOf = () => {
					const sel = window.getSelection();
					if (!canWrite() || !sel || sel.isCollapsed || sel.rangeCount !== 1) return null;
					const range = sel.getRangeAt(0);
					if (!range.toString().trim() || !inAllowedZone(range, composerOf(ownerRef.current), latest.current.sessionId)) return null;
					return { sel, range };
				};
				const updateAnchor = () => {
					const selection = selectionOf();
					if (!selection) { setAnchor(null); return; }
					const rect = selection.range.getBoundingClientRect();
					const vw = window.innerWidth, vh = window.innerHeight, minimum = chromeTop() + 8;
					if (rect.width === 0 && rect.height === 0 || rect.bottom < minimum || rect.top > vh || rect.right < 0 || rect.left > vw) {
						setAnchor(null); return;
					}
					const margin = Math.min(90, vw / 2);
					const left = Math.min(Math.max(rect.left + rect.width / 2, margin), vw - margin);
					const above = rect.top - 38;
					const top = Math.max(minimum, above < minimum ? Math.min(rect.bottom + 8, vh - 38) : above);
					// 直接比较 React 当前状态；隐藏后的 null 必须允许同坐标选区重新出现。
					setAnchor(previous => previous?.top === top && previous?.left === left ? previous : { top, left });
				};
				react.useEffect(() => {
					if (!enabled) { setAnchor(null); return undefined; }
					const onShiftKeyUp = event => { if (event.key === "Shift") updateAnchor(); };
					const onPointerDown = event => { if (!buttonRef.current?.contains(event.target)) setAnchor(null); };
					const onKeyDown = event => { if (event.key === "Escape") setAnchor(null); };
					const onScroll = () => {
						setAnchor(null);
						if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
						scrollTimerRef.current = window.setTimeout(() => { scrollTimerRef.current = null; updateAnchor(); }, 150);
					};
					const listeners = [["selectionchange", updateAnchor], ["mouseup", updateAnchor], ["keyup", onShiftKeyUp],
						["pointerdown", onPointerDown], ["keydown", onKeyDown], ["scroll", onScroll, true]];
					for (const [name, fn, capture] of listeners) document.addEventListener(name, fn, capture);
					window.addEventListener("resize", updateAnchor);
					updateAnchor();
					return () => {
						for (const [name, fn, capture] of listeners) document.removeEventListener(name, fn, capture);
						window.removeEventListener("resize", updateAnchor);
						if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
					};
				}, [enabled, props.inputActions]);

				const addToConversation = () => {
					// 点击时重新验证选区与归属，防止切会话或面板关闭后的迟到事件写错草稿。
					const selection = selectionOf();
					if (!selection) { setAnchor(null); return; }
					const { input: state, actions } = latest.current;
					actions.setDraft(prependCodeBlock(state.draft, selection.range.toString()));
					selection.sel.removeAllRanges(); setAnchor(null);
					composerInput(composerOf(ownerRef.current))?.focus({ preventScroll: true });
				};
				return react.createElement(react.Fragment, null,
					react.createElement("span", { ref: ownerRef, hidden: true, "data-session-plus-owner": SELECTION_ADD_ID }),
					anchor !== null && enabled ? react_dom.createPortal(react.createElement("button", {
						ref: buttonRef, type: "button", className: "sp-add-btn", style: { top: anchor.top, left: anchor.left },
						onMouseDown: event => event.preventDefault(), onClick: addToConversation,
					}, t("addToConversation")), document.body) : null);
			}

			// —— 功能 3（v0.5.0）：账户菜单顶部「主题切换」Rubber Segment ——
			// 只认官方席位 [data-slot="settings.launcher"] 里的账户菜单触发器；该菜单没有
			// aria-controls，因此按 Menu 原语 side=top / align=start 的落点几何反查它的
			// portal 弹层。找不到就静默不装配，另两项功能不受影响。
			// 装配调用放在本段常量与函数之后：ctx.inject 会在服务已就绪时同步执行回调，
			// 放在 const 之前会触发暂时性死区。

			// 下列数值函数是 lib/rubber.js 与 lib/account-menu.js 的镜像实现
			// （ModuleLoader bundle 自包含，不支持包内 import）。两处必须同步修改，
			// lib 侧由 test/rubber.test.mjs 与 test/account-menu.test.mjs 保护。
			const SWITCH_ATTR = "data-sp-theme-switch";
			const ACCOUNT_MENU_ATTR = "data-sp-account-menu";
			const LAUNCHER_SELECTOR = '[data-slot="settings.launcher"] [aria-haspopup="menu"]';
			const THEME_PREFS = ["system", "light", "dark"];
			const RUBBER_FACTOR = 0.55;
			const DEFAULT_GLIDE = 75;
			const DILATE_MS = 190;
			const LEAD_MS = 300;
			const RELAX_MS = 160;
			const SQUASH_PX = 3;
			const FLICK_VELOCITY = 110;
			const MAX_VELOCITY = 2000;
			const DEADZONE_PX = 4;
			const SLOP_PX = 10;
			const VELOCITY_WINDOW_MS = 100;
			const HISTORY_LIMIT = 8;
			const MENU_MARGIN = 12;
			const MENU_GAP = 4;
			const MENU_TOLERANCE = 4;
			const MENU_RETRY_LIMIT = 90;

			const clampValue = (value, min, max) => Math.min(Math.max(min, value), max);

			function rubberBandOf(over, dim) {
				if (!(dim > 0) || !(over > 0)) return 0;
				return (over * dim * RUBBER_FACTOR) / (dim + RUBBER_FACTOR * Math.abs(over));
			}

			function projectOf(velocity, glide) {
				const d = 1 - 0.1 * Math.pow(0.05, glide / 100);
				return d > 0 && d < 1 ? ((velocity / 1000) * d) / (1 - d) : 0;
			}

			function velocityOfSamples(history, at) {
				const recent = history.filter(([time]) => at - time <= VELOCITY_WINDOW_MS);
				if (recent.length < 2) return 0;
				const [t0, x0] = recent[0];
				const [t1, x1] = recent[recent.length - 1];
				if (!(t1 - t0 >= 8)) return 0;
				return ((x1 - x0) / (t1 - t0)) * 1000;
			}

			function pushSampleOf(history, sample) {
				const next = history.concat([sample]);
				return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
			}

			function nearestIndexOf(centers, x) {
				if (!centers.length) return -1;
				let best = 0;
				for (let i = 1; i < centers.length; i += 1) {
					if (Math.abs(centers[i] - x) < Math.abs(centers[best] - x)) best = i;
				}
				return best;
			}

			function centersOf(rects) {
				return rects.map((rect) => (rect.l + rect.r) / 2);
			}

			function dragEdgesOf(x, offset, width, thumbWidth) {
				const maxLeft = Math.max(0, width - thumbWidth);
				const left = x - offset;
				if (left < 0) return { l: 0, r: Math.max(0, thumbWidth - rubberBandOf(-left, thumbWidth)) };
				if (left > maxLeft) return { l: Math.min(width, maxLeft + rubberBandOf(left - maxLeft, thumbWidth)), r: width };
				return { l: left, r: left + thumbWidth };
			}

			function resolveTargetOf(centers, x, velocity, from) {
				const projected = nearestIndexOf(centers, x + projectOf(velocity, DEFAULT_GLIDE));
				const flick = Math.abs(velocity) > FLICK_VELOCITY;
				const target = flick && projected === from
					? clampValue(projected + Math.sign(velocity), 0, centers.length - 1)
					: projected;
				return { target, flick };
			}

			function dilateEdgesOf(from, to) {
				return { l: Math.min(from.l, to.l), r: Math.max(from.r, to.r) };
			}

			function landPlanOf(from, to, squash) {
				const dir = Math.sign((to.l + to.r) / 2 - (from.l + from.r) / 2) || 1;
				const amount = Math.max(0, squash);
				return dir > 0
					? { dir, lead: { edge: "r", value: to.r }, trail: { edge: "l", value: to.l + dir * amount, relax: to.l } }
					: { dir, lead: { edge: "l", value: to.l }, trail: { edge: "r", value: to.r + dir * amount, relax: to.r } };
			}

			function cubicBezierOf(x1, y1, x2, y2) {
				const ax = 3 * x1 - 3 * x2 + 1;
				const bx = 3 * x2 - 6 * x1;
				const cx = 3 * x1;
				const ay = 3 * y1 - 3 * y2 + 1;
				const by = 3 * y2 - 6 * y1;
				const cy = 3 * y1;
				const sampleX = (value) => ((ax * value + bx) * value + cx) * value;
				const sampleY = (value) => ((ay * value + by) * value + cy) * value;
				const slopeX = (value) => (3 * ax * value + 2 * bx) * value + cx;
				return (x) => {
					if (!(x > 0)) return 0;
					if (x >= 1) return 1;
					let guess = x;
					for (let i = 0; i < 6; i += 1) {
						const delta = sampleX(guess) - x;
						if (Math.abs(delta) < 1e-4) return sampleY(guess);
						const slope = slopeX(guess);
						if (Math.abs(slope) < 1e-6) break;
						guess -= delta / slope;
					}
					let low = 0;
					let high = 1;
					guess = x;
					for (let i = 0; i < 20; i += 1) {
						const value = sampleX(guess);
						if (Math.abs(value - x) < 1e-4) break;
						if (value < x) low = guess;
						else high = guess;
						guess = (low + high) / 2;
					}
					return sampleY(guess);
				};
			}

			const easeOutMotion = cubicBezierOf(0.23, 1, 0.32, 1);

			function menuPlacement(triggerRect, size, viewport) {
				const width = Number(size && size.width) || 0;
				const height = Number(size && size.height) || 0;
				const vw = Number(viewport && viewport.width) || 0;
				const vh = Number(viewport && viewport.height) || 0;
				let left = Number(triggerRect && triggerRect.left) || 0;
				let top = (Number(triggerRect && triggerRect.top) || 0) - height - MENU_GAP;
				if (width > 0) left = clampValue(left, MENU_MARGIN, Math.max(MENU_MARGIN, vw - width - MENU_MARGIN));
				if (height > 0) top = clampValue(top, MENU_MARGIN, Math.max(MENU_MARGIN, vh - height - MENU_MARGIN));
				return { left, top };
			}

			/**
			 * 装配账户菜单主题切换条。
			 * 所有 DOM 副作用、监听与 rAF 都在返回的清理函数里释放。
			 * @param scope - 注入了 theme 服务的客户端上下文。
			 * @returns 清理函数；环境不支持时返回 undefined。
			 */
			function installThemeSwitch(scope) {
				if (typeof window === "undefined" || typeof document === "undefined") return undefined;
				if (typeof MutationObserver === "undefined" || typeof document.querySelector !== "function") return undefined;
				if (!document.body) return undefined;
				const service = scope.theme;
				if (!service || typeof service.getTheme !== "function" || typeof service.setTheme !== "function") return undefined;

				let ui = null;
				let menu = null;
				let trigger = null;
				let rects = [];
				let arena = null;
				let edges = { l: 0, r: 0 };
				let frame = 0;
				let anim = null;
				let drag = null;
				let resizeObserver = null;
				let retries = 0;
				let retryFrame = 0;
				let localWrite = null;

				const nowMs = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());
				const viewportOf = () => ({ width: window.innerWidth || 0, height: window.innerHeight || 0 });
				const reducedMotion = () => {
					try {
						return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches === true;
					} catch (_error) {
						return false;
					}
				};
				const preferenceNow = () => {
					try {
						const snapshot = service.getTheme();
						return snapshot && typeof snapshot.preference === "string" ? snapshot.preference : "system";
					} catch (_error) {
						return "system";
					}
				};
				const indexOfPreference = (value) => {
					const index = THEME_PREFS.indexOf(value);
					return index < 0 ? 0 : index;
				};
				const labelOf = (value) => (value === "system" ? t("themeSystem") : value === "light" ? t("themeLight") : t("themeDark"));
				const widestLabel = () => THEME_PREFS
					.map(labelOf)
					.reduce((wide, label) => (label.length > wide.length ? label : wide), "");

				function buildUi() {
					const root = document.createElement("div");
					root.className = "sp-ts";
					root.setAttribute(SWITCH_ATTR, "");
					root.setAttribute("role", "none");
					const track = document.createElement("div");
					track.className = "sp-ts-track";
					track.setAttribute("role", "radiogroup");
					const thumb = document.createElement("div");
					thumb.className = "sp-ts-thumb";
					thumb.setAttribute("aria-hidden", "true");
					track.appendChild(thumb);
					const slots = THEME_PREFS.map((value) => {
						const slot = document.createElement("span");
						slot.className = "sp-ts-slot";
						slot.setAttribute("role", "radio");
						slot.setAttribute("aria-checked", "false");
						slot.setAttribute("tabindex", "-1");
						slot.setAttribute("data-value", value);
						// 隐形量尺把三段撑成等宽（block + height:0 只贡献宽度）。
						const ghost = document.createElement("span");
						ghost.className = "sp-ts-ghost";
						ghost.setAttribute("aria-hidden", "true");
						const text = document.createElement("span");
						text.className = "sp-ts-text";
						slot.appendChild(ghost);
						slot.appendChild(text);
						track.appendChild(slot);
						return { value, slot, text, ghost };
					});
					root.appendChild(track);
					track.addEventListener("pointerdown", onPointerDown);
					track.addEventListener("pointermove", onPointerMove);
					track.addEventListener("pointerup", onPointerUp);
					track.addEventListener("pointercancel", onPointerCancel);
					track.addEventListener("keydown", onKeyDown);
					track.addEventListener("dragstart", rejectDrag);
					return { root, track, thumb, slots };
				}

				function rejectDrag(event) {
					event.preventDefault();
				}

				function updateLabels() {
					if (!ui) return;
					ui.track.setAttribute("aria-label", t("themeGroup"));
					ui.track.setAttribute("title", t("themeSwitchHint"));
					const widest = widestLabel();
					for (const item of ui.slots) {
						const label = labelOf(item.value);
						item.text.textContent = label;
						item.ghost.textContent = widest;
						item.slot.setAttribute("aria-label", label);
					}
					if (measure()) jumpTo(indexOfPreference(preferenceNow()));
				}

				function paintChecked() {
					const active = indexOfPreference(preferenceNow());
					if (!ui) return active;
					ui.slots.forEach((item, index) => {
						item.slot.setAttribute("aria-checked", index === active ? "true" : "false");
						item.slot.setAttribute("tabindex", index === active ? "0" : "-1");
					});
					return active;
				}

				function paintThumb() {
					if (!ui) return;
					const origin = arena ? arena.origin : 0;
					ui.thumb.style.left = `${(origin + edges.l).toFixed(2)}px`;
					ui.thumb.style.width = `${Math.max(0, edges.r - edges.l).toFixed(2)}px`;
				}

				function measure() {
					if (!ui) return false;
					const box = ui.track.getBoundingClientRect();
					if (!(box.width > 0)) return false;
					const raw = ui.slots.map((item) => {
						const rect = item.slot.getBoundingClientRect();
						return { l: rect.left - box.left, r: rect.right - box.left };
					});
					if (raw.length !== THEME_PREFS.length) return false;
					if (raw.some((rect) => !(rect.r > rect.l + 1))) return false;
					const origin = raw[0].l;
					const width = raw[raw.length - 1].r - origin;
					if (!(width > 0)) return false;
					arena = { origin, width, left: box.left };
					rects = raw.map((rect) => ({ l: rect.l - origin, r: rect.r - origin }));
					return true;
				}

				function setEdges(l, r) {
					edges = { l, r };
					paintThumb();
				}

				function cancelAnimation() {
					if (frame) {
						window.cancelAnimationFrame(frame);
						frame = 0;
					}
					anim = null;
				}

				function scheduleFrame() {
					if (!frame) frame = window.requestAnimationFrame(stepFrame);
				}

				function stepFrame() {
					frame = 0;
					if (!anim) return;
					const progress = anim.duration <= 0 ? 1 : Math.min(1, (nowMs() - anim.start) / anim.duration);
					const eased = anim.ease(progress);
					setEdges(
						anim.from.l + (anim.to.l - anim.from.l) * eased,
						anim.from.r + (anim.to.r - anim.from.r) * eased,
					);
					if (progress >= 1) {
						const done = anim.done;
						anim = null;
						if (done) done();
						return;
					}
					scheduleFrame();
				}

				function animateTo(target, duration, done) {
					const from = { l: edges.l, r: edges.r };
					const to = {
						l: typeof target.l === "number" ? target.l : from.l,
						r: typeof target.r === "number" ? target.r : from.r,
					};
					if (!(duration > 0)) {
						anim = null;
						setEdges(to.l, to.r);
						if (done) done();
						return;
					}
					anim = { from, to, start: nowMs(), duration, ease: easeOutMotion, done };
					scheduleFrame();
				}

				function jumpTo(index) {
					cancelAnimation();
					const target = rects[index];
					if (!target) return;
					setEdges(target.l, target.r);
				}

				function land(from, to, squash) {
					const plan = landPlanOf(from, to, squash);
					const target = plan.lead.edge === "l"
						? { l: plan.lead.value, r: plan.trail.value }
						: { l: plan.trail.value, r: plan.lead.value };
					animateTo(target, LEAD_MS, () => {
						const relax = plan.trail.edge === "l" ? { l: plan.trail.relax } : { r: plan.trail.relax };
						animateTo(relax, RELAX_MS, null);
					});
				}

				function travel(index) {
					if (!measure()) return;
					cancelAnimation();
					const target = rects[index];
					if (!target) return;
					if (reducedMotion()) {
						setEdges(target.l, target.r);
						return;
					}
					const from = { l: edges.l, r: edges.r };
					const dilated = dilateEdgesOf(from, target);
					animateTo(dilated, DILATE_MS, () => land(dilated, target, SQUASH_PX));
				}

				function writePreference(value) {
					if (preferenceNow() === value) return false;
					localWrite = value;
					try {
						service.setTheme(value);
					} catch (_error) {
						localWrite = null;
						return false;
					} finally {
						// 事件若异步到达，标记会残留到下一次外部变更；这里立即回收未消费的标记。
						if (localWrite === value) localWrite = null;
					}
					return true;
				}

				function commit(index) {
					const value = THEME_PREFS[index];
					if (!value) return false;
					if (!writePreference(value)) return false;
					paintChecked();
					return true;
				}

				function focusSlot(index) {
					const item = ui && ui.slots[index];
					if (!item || typeof item.slot.focus !== "function") return;
					try {
						item.slot.focus({ preventScroll: true });
					} catch (_error) {
						item.slot.focus();
					}
				}

				function selectSlot(index) {
					if (!menu || !THEME_PREFS[index]) return;
					if (indexOfPreference(preferenceNow()) === index) {
						jumpTo(index);
						return;
					}
					if (!commit(index)) return;
					travel(index);
					focusSlot(index);
				}

				function slotIndexOf(target) {
					const node = target && typeof target.closest === "function" ? target.closest(".sp-ts-slot") : null;
					if (!node) return -1;
					return THEME_PREFS.indexOf(node.getAttribute("data-value") || "");
				}

				function onPointerDown(event) {
					if (!menu || !ui || drag || event.button !== 0) return;
					if (!measure()) return;
					cancelAnimation();
					const x = event.clientX - arena.left - arena.origin;
					const thumbWidth = edges.r - edges.l;
					drag = {
						id: event.pointerId,
						x0: x,
						slot: slotIndexOf(event.target),
						onThumb: thumbWidth > 0 && x >= edges.l - 1 && x <= edges.r + 1,
						live: false,
						offset: 0,
						width: Math.max(1, thumbWidth),
						history: [[event.timeStamp, x]],
					};
					try {
						ui.track.setPointerCapture(event.pointerId);
					} catch (_error) {
						void 0;
					}
					event.preventDefault();
					focusSlot(indexOfPreference(preferenceNow()));
				}

				function onPointerMove(event) {
					if (!drag || !arena || event.pointerId !== drag.id || !drag.onThumb) return;
					const x = event.clientX - arena.left - arena.origin;
					drag.history = pushSampleOf(drag.history, [event.timeStamp, x]);
					if (!drag.live) {
						if (Math.abs(x - drag.x0) < DEADZONE_PX) return;
						drag.live = true;
						drag.offset = x - edges.l;
						drag.width = Math.max(1, edges.r - edges.l);
					}
					const next = dragEdgesOf(x, drag.offset, arena.width, drag.width);
					setEdges(next.l, next.r);
				}

				function onPointerUp(event) {
					if (!drag || event.pointerId !== drag.id) return;
					const state = drag;
					drag = null;
					try {
						if (ui && typeof ui.track.hasPointerCapture === "function" && ui.track.hasPointerCapture(event.pointerId)) {
							ui.track.releasePointerCapture(event.pointerId);
						}
					} catch (_error) {
						void 0;
					}
					if (!arena) return;
					const x = event.clientX - arena.left - arena.origin;
					if (!state.live) {
						if (state.slot >= 0 && Math.abs(x - state.x0) <= SLOP_PX) selectSlot(state.slot);
						return;
					}
					const velocity = clampValue(velocityOfSamples(state.history, event.timeStamp), -MAX_VELOCITY, MAX_VELOCITY);
					const centers = centersOf(rects);
					const middle = (edges.l + edges.r) / 2;
					const here = nearestIndexOf(centers, middle);
					const resolved = resolveTargetOf(centers, middle, velocity, here < 0 ? 0 : here);
					const target = rects[resolved.target];
					commit(resolved.target);
					if (!target) return;
					if (reducedMotion()) jumpTo(resolved.target);
					else land({ l: edges.l, r: edges.r }, target, resolved.flick ? SQUASH_PX : 0);
					focusSlot(resolved.target);
				}

				function onPointerCancel(event) {
					if (!drag || event.pointerId !== drag.id) return;
					drag = null;
					jumpTo(indexOfPreference(preferenceNow()));
				}

				function onKeyDown(event) {
					if (!menu) return;
					const key = event.key;
					const last = THEME_PREFS.length - 1;
					const active = indexOfPreference(preferenceNow());
					let next = null;
					if (key === "ArrowRight" || key === "ArrowDown") next = Math.min(last, active + 1);
					else if (key === "ArrowLeft" || key === "ArrowUp") next = Math.max(0, active - 1);
					else if (key === "Home") next = 0;
					else if (key === "End") next = last;
					if (next === null) return;
					event.preventDefault();
					// 阻止冒泡到官方菜单的 document 级方向键处理，避免焦点被二次搬动。
					event.stopPropagation();
					selectSlot(next);
				}

				function onThemeChange() {
					const next = preferenceNow();
					const local = localWrite !== null && next === localWrite;
					localWrite = null;
					if (!ui) return;
					paintChecked();
					// 本地点击/拖拽由 travel / land 驱动动画，外部变更直接落位。
					if (!local) jumpTo(indexOfPreference(next));
				}

				function findMenu(node) {
					const viewport = viewportOf();
					const triggerRect = node.getBoundingClientRect();
					const candidates = document.querySelectorAll('[role="menu"]');
					let best = null;
					let bestDistance = Infinity;
					for (const candidate of candidates) {
						if (!candidate || typeof candidate.getBoundingClientRect !== "function") continue;
						if (candidate === ui || (ui && candidate.contains(ui.root))) continue;
						if (candidate.getAttribute(ACCOUNT_MENU_ATTR) !== null) return candidate;
						const rect = candidate.getBoundingClientRect();
						if (!(rect.width > 0) || !(rect.height > 0)) continue;
						const expected = menuPlacement(triggerRect, { width: rect.width, height: rect.height }, viewport);
						const distance = Math.abs(expected.left - rect.left) + Math.abs(expected.top - rect.top);
						if (distance <= MENU_TOLERANCE * 2 && distance < bestDistance) {
							bestDistance = distance;
							best = candidate;
						}
					}
					return best;
				}

				function fixAnchor() {
					if (!menu || !trigger) return;
					let style;
					try {
						style = window.getComputedStyle(menu);
					} catch (_error) {
						return;
					}
					if (!style || style.position !== "fixed") return;
					const rect = menu.getBoundingClientRect();
					const expected = menuPlacement(trigger.getBoundingClientRect(), { width: rect.width, height: rect.height }, viewportOf());
					const top = parseFloat(menu.style.top);
					const left = parseFloat(menu.style.left);
					// 桌面版 Menu 每帧重定位会写出同一个值；旧版本不重定位，这里补一次。
					if (Number.isFinite(top) && Math.abs(top - expected.top) > 1) menu.style.top = `${Math.round(expected.top)}px`;
					if (Number.isFinite(left) && Math.abs(left - expected.left) > 1) menu.style.left = `${Math.round(expected.left)}px`;
				}

				function attach(list) {
					if (!ui) ui = buildUi();
					updateLabels();
					list.insertBefore(ui.root, list.firstChild);
					list.setAttribute(ACCOUNT_MENU_ATTR, "");
					menu = list;
					paintChecked();
					if (measure()) jumpTo(indexOfPreference(preferenceNow()));
					fixAnchor();
					observeResize();
					retries = 0;
				}

				function detach() {
					cancelAnimation();
					if (resizeObserver) {
						try {
							resizeObserver.disconnect();
						} catch (_error) {
							void 0;
						}
						resizeObserver = null;
					}
					drag = null;
					if (ui && ui.root && ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
					if (menu) menu.removeAttribute(ACCOUNT_MENU_ATTR);
					menu = null;
					trigger = null;
					rects = [];
					arena = null;
					edges = { l: 0, r: 0 };
					retries = 0;
					if (retryFrame) {
						window.cancelAnimationFrame(retryFrame);
						retryFrame = 0;
					}
				}

				function observeResize() {
					if (resizeObserver || !ui) return;
					const Observer = typeof ResizeObserver === "function" ? ResizeObserver : undefined;
					if (!Observer) return;
					resizeObserver = new Observer(() => {
						if (!menu) return;
						if (measure()) jumpTo(indexOfPreference(preferenceNow()));
						fixAnchor();
					});
					resizeObserver.observe(ui.track);
				}

				function scan() {
					const node = document.querySelector(LAUNCHER_SELECTOR);
					if (!node || node.getAttribute("aria-expanded") !== "true") {
						detach();
						return;
					}
					trigger = node;
					if (menu && menu.isConnected && ui && menu.contains(ui.root)) return;
					const list = findMenu(node);
					if (!list) {
						scheduleRetry();
						return;
					}
					attach(list);
				}

				function scheduleRetry() {
					if (retryFrame || retries >= MENU_RETRY_LIMIT) return;
					retryFrame = window.requestAnimationFrame(() => {
						retryFrame = 0;
						retries += 1;
						scan();
					});
				}

				function onResize() {
					if (!menu) return;
					if (measure()) jumpTo(indexOfPreference(preferenceNow()));
					fixAnchor();
				}

				const observer = new MutationObserver(scan);
				observer.observe(document.body, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ["aria-expanded"],
				});
				const interval = window.setInterval(scan, 1000);
				window.addEventListener("resize", onResize);
				const offTheme = typeof scope.on === "function" ? scope.on("theme/change", onThemeChange) : undefined;
				const offLocale = scope.locale && typeof scope.locale.subscribe === "function"
					? scope.locale.subscribe(() => updateLabels())
					: undefined;
				scan();

				return () => {
					observer.disconnect();
					window.clearInterval(interval);
					window.removeEventListener("resize", onResize);
					if (retryFrame) {
						window.cancelAnimationFrame(retryFrame);
						retryFrame = 0;
					}
					detach();
					if (typeof offTheme === "function") offTheme();
					if (typeof offLocale === "function") offLocale();
				};
			}

			// 服务就绪后装配；服务缺失时整条功能不出现（另两项功能不受影响）。
			ctx.inject(["theme"], (scope) => {
				scope.effect(() => installThemeSwitch(scope), "dsh-session-plus: theme switcher");
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
