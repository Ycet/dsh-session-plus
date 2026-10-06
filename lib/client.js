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
		};
		const en = {
			providerEntry: "Model provider",
			providerLabel: "Provider: {name}",
			addToConversation: "Add to conversation",
		};

		// 样式仅使用 Theme provider 已核实的 token（--dsw-alias-*）。
		const css = ".php-header{box-sizing:border-box;flex:none;align-items:baseline;gap:6px;padding:6px 10px 5px;margin-bottom:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);display:flex;user-select:none}.php-value{color:var(--dsw-alias-label-primary);font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sp-add-btn{position:fixed;z-index:2147482995;transform:translateX(-50%);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv1);border-radius:999px;align-items:center;padding:5px 12px;font-size:12px;line-height:18px;font-weight:500;cursor:pointer;user-select:none;display:flex;-webkit-app-region:no-drag}.sp-add-btn:hover{filter:brightness(1.08);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,var(--dsw-alias-border-l2))}";

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

		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
