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
		const css = ".php-header{box-sizing:border-box;flex:none;align-items:baseline;gap:6px;padding:6px 10px 5px;margin-bottom:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);display:flex;user-select:none}.php-value{color:var(--dsw-alias-label-primary);font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sp-add-btn{position:fixed;z-index:2147482995;transform:translateX(-50%);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv1);border-radius:999px;align-items:center;padding:5px 12px;font-size:12px;line-height:18px;font-weight:500;cursor:pointer;user-select:none;display:flex}.sp-add-btn:hover{filter:brightness(1.08);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,var(--dsw-alias-border-l2))}";

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

			// —— 功能 1：模型选择菜单提供商头部 ——
			// 尽量窄的增量入口：conversation.input.overlay 列表槽（replaceRisk: none，
			// 现有占用者仅 slash-menu / command-popup）挂一个只做副作用的占位条目；
			// 组件渲染 null，观察/注入/订阅随会话作用域挂载与清理。
			ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
				name: "conversation.input.overlay",
				id: HEADER_ENTRY_ID,
				order: 90,
				label: () => t("providerEntry"),
				locale: NS,
				inject: (sessionId) => {
					// modelDirectories 为可选依赖：缺服务（如部署移除模型选择插件）时静默降级。
					const models = ctx.get("modelDirectories");
					const directory = models === undefined || models === null ? null : models.directoryFor(sessionId);
					return { store: directory === null ? null : directory.store };
				},
			}, ProviderHeader));

			function ProviderHeader(props) {
				const store = props.store;
				react.useEffect(() => {
					if (store === null || store === undefined) return undefined;
					if (typeof document === "undefined") return undefined;

					/** 复制为本地标量字符串，避免在 DOM 上直接持有 live 会话对象。 */
					const labelOf = () => {
						const state = store.getSnapshot();
						const current = state === null || state === undefined ? null : state.current;
						const groups = state === null || state === undefined ? undefined : state.groups;
						return interpolate(t("providerLabel"), { name: resolveProviderLabel(current, groups) });
					};

					/** 模型菜单判定：role=menu 且存在 aria-haspopup=menu 触发器以其 id 为 aria-controls 且展开。 */
					const isModelMenu = (node) => {
						if (!(node instanceof Element)) return false;
						if (node.getAttribute("role") !== "menu") return false;
						const id = node.id;
						if (!id) return false;
						for (const trigger of document.querySelectorAll('[aria-haspopup="menu"]')) {
							if (trigger.getAttribute("aria-controls") === id && trigger.getAttribute("aria-expanded") === "true") return true;
						}
						return false;
					};

					const liveHeaders = new Set();

					const renderHeader = (header) => {
						const value = header.querySelector(`:scope > .php-value`);
						if (value !== null) value.textContent = labelOf();
					};
					const renderAll = () => {
						for (const header of liveHeaders) {
							if (!header.isConnected) {
								liveHeaders.delete(header);
								continue;
							}
							renderHeader(header);
						}
					};

					const ensureHeader = (menu) => {
						let header = menu.querySelector(`:scope > [${HEADER_ATTR}]`);
						if (header === null) {
							header = document.createElement("div");
							header.setAttribute(HEADER_ATTR, "");
							header.className = "php-header";
							header.setAttribute("role", "presentation");
							header.setAttribute("aria-hidden", "true");
							const value = document.createElement("span");
							value.className = "php-value";
							header.appendChild(value);
							menu.prepend(header);
						}
						liveHeaders.add(header);
						renderHeader(header);
						return header;
					};

					const observer = new MutationObserver((mutations) => {
						for (const mutation of mutations) {
							for (const node of mutation.addedNodes) {
								if (isModelMenu(node)) ensureHeader(node);
							}
						}
					});
					observer.observe(document.body, { childList: true, subtree: true });

					// 目录快照变化（首次加载/选择回落）→ 实时刷新全部活动头部。
					const unsubscribe = store.subscribe(renderAll);
					renderAll();

					// 保险：菜单可能被 React 重挂载（外来节点不被 React 跟踪）。
					const interval = window.setInterval(() => {
						for (const menu of document.querySelectorAll('[role="menu"]')) {
							if (isModelMenu(menu)) ensureHeader(menu);
						}
					}, 1000);

					return () => {
						observer.disconnect();
						unsubscribe();
						window.clearInterval(interval);
						liveHeaders.clear();
					};
				}, [store, t]);

				return null;
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

			/** 定位 composer 文本框：从模型菜单触发器（aria-haspopup=menu，位于 composer 工具行）向上找含 textarea 的容器。 */
			function findComposerTextarea() {
				for (const el of document.querySelectorAll('[aria-haspopup="menu"]')) {
					let cur = el;
					for (let i = 0; i < 6 && cur !== null; i += 1, cur = cur.parentElement) {
						const ta = cur.querySelector("textarea");
						if (ta !== null) return ta;
					}
				}
				return null;
			}

			/** better-sidebar 右侧面板：`[data-dsh-panel-host]` 内右对齐视口右缘、顶边贴合、高度可观的面板（排除底部面板与开关簇）。 */
			function betterSidebarRightPanel() {
				const host = document.querySelector("[data-dsh-better-sidebar]");
				if (host === null) return null;
				const layer = host.querySelector("[data-dsh-panel-host]");
				if (layer === null) return null;
				const vw = window.innerWidth;
				for (const child of layer.children) {
					if (!(child instanceof Element)) continue;
					const rect = child.getBoundingClientRect();
					if (rect.width === 0 || rect.height === 0) continue;
					if (Math.abs(rect.right - vw) <= 4 && Math.abs(rect.top) <= 8 && rect.height > 100) return child;
				}
				return null;
			}

			/**
			 * 范围判定（正向区域锚点，替代原几何启发式）：
			 * 仅当选中落在 (1) 聊天消息区（[data-conversation-scroll] 内，composer 文本框等可编辑元素除外）
			 * 或 (2) better-sidebar 右侧面板内 时才展示按钮；设置页/侧栏等其余区域不触发。
			 */
			function inAllowedZone(range) {
				const container = range.commonAncestorContainer;
				const node = container !== null && container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
				if (!(node instanceof Element)) return false;
				if (node.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return false;
				if (node.closest("[data-conversation-scroll]") !== null) return true;
				const panel = betterSidebarRightPanel();
				if (panel !== null) {
					const rect = range.getBoundingClientRect();
					const pr = panel.getBoundingClientRect();
					if (rect.right >= pr.left && rect.left <= pr.right && rect.bottom >= pr.top && rect.top <= pr.bottom) return true;
				}
				return false;
			}

			function SelectionAdd(props) {
				const inputActions = props.inputActions;
				const useInput = typeof props.useInput === "function" ? props.useInput : () => ({ draft: "" });
				// 标准钩子须带选择器调用（同 InputBar 的 useInput((s) => s)）；缺参会让内部 useSelector 抛 "l is not a function"
				const input = useInput((s) => s);
				const [anchor, setAnchor] = react.useState(null);
				const anchorRef = react.useRef(null);
				const buttonRef = react.useRef(null);
				const scrollTimerRef = react.useRef(null);

				if (!inputActions || typeof inputActions.setDraft !== "function") return null;

				const updateAnchor = () => {
					const sel = window.getSelection();
					if (sel === null || sel.isCollapsed || sel.rangeCount === 0) {
						setAnchor(null);
						return;
					}
					const range = sel.getRangeAt(0);
					if (range.toString().trim() === "") {
						setAnchor(null);
						return;
					}
					if (!inAllowedZone(range)) {
						setAnchor(null);
						return;
					}
					const rect = range.getBoundingClientRect();
					if (rect.width === 0 && rect.height === 0) {
						setAnchor(null);
						return;
					}
					const vw = window.innerWidth;
					const vh = window.innerHeight;
					// 选区已完全滚出视口 → 不显示；滚动停止且重新出现在屏幕中时由 updateAnchor 恢复
					if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) {
						setAnchor(null);
						return;
					}
					const left = Math.min(Math.max(rect.left + rect.width / 2, 90), vw - 90);
					const above = rect.top - 8 - 30;
					const flip = above < 8;
					const top = flip ? Math.min(rect.bottom + 8, vh - 38) : Math.max(above, 8);
					const next = { top, left };
					const prev = anchorRef.current;
					if (prev === null || prev.top !== next.top || prev.left !== next.left) {
						anchorRef.current = next;
						setAnchor(next);
					}
				};

				react.useEffect(() => {
					const onSelection = () => updateAnchor();
					const onMouseUp = () => updateAnchor();
					const onShiftKeyUp = (event) => { if (event.key === "Shift") updateAnchor(); };
					const onPointerDown = (event) => {
						if (buttonRef.current !== null && !buttonRef.current.contains(event.target)) setAnchor(null);
					};
					const onScroll = () => {
						// 滚动中隐藏按钮；停止后（防抖 150ms）重新评估选区是否仍在视口内
						setAnchor(null);
						if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
						scrollTimerRef.current = window.setTimeout(() => {
							scrollTimerRef.current = null;
							updateAnchor();
						}, 150);
					};
					const onKeyDown = (event) => { if (event.key === "Escape") setAnchor(null); };
					document.addEventListener("selectionchange", onSelection);
					document.addEventListener("mouseup", onMouseUp);
					document.addEventListener("keyup", onShiftKeyUp);
					document.addEventListener("pointerdown", onPointerDown);
					document.addEventListener("scroll", onScroll, true);
					document.addEventListener("keydown", onKeyDown);
					return () => {
						document.removeEventListener("selectionchange", onSelection);
						document.removeEventListener("mouseup", onMouseUp);
						document.removeEventListener("keyup", onShiftKeyUp);
						document.removeEventListener("pointerdown", onPointerDown);
						document.removeEventListener("scroll", onScroll, true);
						document.removeEventListener("keydown", onKeyDown);
						if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
					};
				}, []);

				const addToConversation = () => {
					const sel = window.getSelection();
					if (sel === null || sel.isCollapsed || sel.rangeCount === 0) {
						setAnchor(null);
						return;
					}
					const text = sel.getRangeAt(0).toString();
					if (text.trim() === "") {
						setAnchor(null);
						return;
					}
					inputActions.setDraft(prependCodeBlock(input.draft, text));
					sel.removeAllRanges();
					setAnchor(null);
					const textarea = findComposerTextarea();
					if (textarea !== null) textarea.focus();
				};

				if (anchor === null) return null;
				return react_dom.createPortal(
					react.createElement("button", {
						ref: buttonRef,
						type: "button",
						className: "sp-add-btn",
						style: { top: anchor.top, left: anchor.left },
						onMouseDown: (event) => event.preventDefault(),
						onClick: addToConversation,
					}, t("addToConversation")),
					document.body
				);
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});