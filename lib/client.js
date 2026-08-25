// dsh-session-plus — browser half（ModuleLoader bundle）
//
// 功能：
//   1. 会话头部「打开工作区」纯图标按钮（原 dsh-open-workspace）：macOS 显示包内资产
//      finder.png、Windows/Linux 显示 folder.svg；图标经 host 资产路由
//      （/session-plus/assets）加载，失败回退内联 SVG；点击 → host 在系统文件管理器中
//      打开当前会话工作区根目录；失败 toast 提示（样式与 dsh-my-plugins 一致），成功不提示。
//   2. 模型选择菜单顶部「提供商：xxx」头部（原 dsh-model-provider-header）：菜单识别基于
//      a11y 契约（role="menu" + 触发器 aria-haspopup="menu"/aria-controls 配对 +
//      aria-expanded="true"）；数据来自会话共享目录 ctx.modelDirectories；store 订阅
//      实现打开期间实时跟随；1s interval 保险在菜单被 React 重挂载后重新注入；
//      /model 指令打开的 popupSelect 弹出器不做任何注入。
//   3. 选中文本 → 添加至对话（v0.3.0）：在聊天消息区选中文本时，选区上方居中显示
//      「添加至对话」悬浮按钮；点击后把选中文本以 markdown 代码块插入输入框开头
//      （已有内容也置于开头，块后空一行；围栏一律为 ```，不随文本内容升级）。
window.__ModuleLoader__.load({
	id: "dsh-session-plus",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");

		const NS = "sessionPlus";
		const PREFIX = "/session-plus/api";
		const ASSET_PATH = "/session-plus/assets";
		const BUTTON_ID = "open-workspace";
		const TOAST_ID = "open-workspace-toasts";
		const HEADER_ENTRY_ID = "provider-header";
		const HEADER_ATTR = "data-model-provider-header";
		const SELECTION_ADD_ID = "selection-add";
		const CSS_TAG = "dsh-session-plus/client.css";

		const zh = {
			openLabel: "打开工作区",
			openFailed: "打开失败：{detail}",
			providerEntry: "模型提供商",
			providerLabel: "提供商：{name}",
			addToConversation: "添加至对话",
		};
		const en = {
			openLabel: "Open workspace",
			openFailed: "Failed to open: {detail}",
			providerEntry: "Model provider",
			providerLabel: "Provider: {name}",
			addToConversation: "Add to conversation",
		};

		// 样式仅使用 Theme provider 已核实的 token（--dsw-alias-*）。
		const css = ".ow-button{border:1px solid var(--dsw-alias-border-l2);width:32px;height:32px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:18px;justify-content:center;align-items:center;gap:4px;padding:0;font-size:13px;line-height:20px;display:inline-flex}.ow-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.ow-button:disabled{color:var(--dsw-alias-label-dimmed);cursor:wait}.ow-button svg,.ow-button .ow-icon{flex:none}.ow-icon{width:16px;height:16px;pointer-events:none}.ow-toastRoot{pointer-events:none;position:fixed;inset:0;z-index:2147482990}.ow-toastStack{pointer-events:none;position:absolute;bottom:10px;right:10px;max-width:min(420px,calc(100vw - 36px));display:flex;flex-direction:column;gap:8px}.ow-toast{box-shadow:var(--dsw-shadow-lv1);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:9px;padding:10px 12px;font-size:13px;line-height:19px}.ow-toast[data-kind=error]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 65%,var(--dsw-alias-border-l2));color:var(--dsw-alias-state-error-primary)}.ow-toast[data-kind=success]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 55%,var(--dsw-alias-border-l2))}.php-header{box-sizing:border-box;flex:none;align-items:baseline;gap:6px;padding:6px 10px 5px;margin-bottom:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);display:flex;user-select:none}.php-value{color:var(--dsw-alias-label-primary);font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sp-add-btn{position:fixed;z-index:2147482995;transform:translateX(-50%);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv1);border-radius:999px;align-items:center;padding:5px 12px;font-size:12px;line-height:18px;font-weight:500;cursor:pointer;user-select:none;display:flex}.sp-add-btn:hover{filter:brightness(1.08);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,var(--dsw-alias-border-l2))}";

		function call(method, payload) {
			return fetch(`${PREFIX}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload ?? {}) }).then(async (response) => {
				const body = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
				if (!response.ok || body.ok !== true) throw new Error(typeof body.error === "string" ? body.error : body.error?.message || `HTTP ${response.status}`);
				return body;
			});
		}
		function interpolate(template, values) { return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? ""); }

		/** 浏览器与 host 同机（本机访问），UA 平台探测足够可靠。 */
		function platform() {
			const raw = String(navigator.userAgentData?.platform ?? navigator.platform ?? "");
			if (/mac/i.test(raw)) return "mac";
			if (/win/i.test(raw)) return "win";
			return "linux";
		}

		/** 仿 macOS Finder 图标（蓝色圆角方块 + 笑脸）。 */
		function FinderIcon() {
			return react.createElement("svg", { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": "true" },
				react.createElement("rect", { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2.5, fill: "#2BA7F0" }),
				react.createElement("rect", { x: 3, y: 3.5, width: 10, height: 9, rx: 2.2, fill: "#FFFFFF" }),
				react.createElement("rect", { x: 4.8, y: 7, width: 1.5, height: 2.4, rx: 0.7, fill: "#2BA7F0" }),
				react.createElement("rect", { x: 9.7, y: 7, width: 1.5, height: 2.4, rx: 0.7, fill: "#2BA7F0" }),
				react.createElement("path", { d: "M5.2 11.3 Q8 13.4 10.8 11.3", fill: "none", stroke: "#2BA7F0", "stroke-width": 1.2, "stroke-linecap": "round" })
			);
		}

		/** 文件夹图标（Windows 资源管理器 / Linux 风格，描边跟随主题色）。 */
		function FolderIcon() {
			return react.createElement("svg", { viewBox: "0 0 16 16", width: 16, height: 16, fill: "none", stroke: "currentColor", "stroke-width": 1.3, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
				react.createElement("path", { d: "M2 4.8a1.3 1.3 0 0 1 1.3-1.3h2.1l1.1 1.4h5.2A1.3 1.3 0 0 1 13 6.2h-9A1.3 1.3 0 0 1 2.7 4.9z" }),
				react.createElement("path", { d: "M2.3 6.2h11.4l-1.2 5a1.3 1.3 0 0 1-1.3 1H4.8a1.3 1.3 0 0 1-1.3-1z" })
			);
		}

		/** 浏览器侧 Host 基址（与官方 session-log-export 同款 null-origin 兜底）。 */
		function hostBase() {
			const origin = globalThis.location?.origin;
			return origin !== undefined && origin !== "null" ? origin : "http://dsh.internal";
		}

		/** 平台图标：mac 加载 finder.png、win/linux 加载 folder.svg（host 资产路由），加载失败回退内联 SVG。 */
		function PlatformIcon(props) {
			const [failed, setFailed] = react.useState(false);
			const os = props.os;
			if (failed) {
				return os === "mac" ? react.createElement(FinderIcon, null) : react.createElement(FolderIcon, null);
			}
			const src = `${hostBase()}${ASSET_PATH}/${os === "mac" ? "finder.png" : "folder.svg"}`;
			return react.createElement("img", { className: "ow-icon", src, width: 16, height: 16, alt: "", "aria-hidden": "true", onError: () => setFailed(true) });
		}

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
			if (draft === undefined || draft === null || draft === "") return block;
			return `${block}\n\n${draft}`;
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

			// —— 功能 1：右下角 toast ——
			let toastState = { toasts: [] };
			const listeners = new Set();
			const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
			const publish = () => { for (const listener of [...listeners]) listener(toastState); };
			const toast = (message, kind = "success") => {
				const id = `${Date.now()}-${Math.random()}`;
				toastState = { toasts: [...toastState.toasts, { id, message, kind }] };
				publish();
				window.setTimeout(() => {
					toastState = { toasts: toastState.toasts.filter((item) => item.id !== id) };
					publish();
				}, 2000);
			};

			function ToastLayer() {
				const [state, setState] = react.useState(() => toastState);
				react.useEffect(() => subscribe((next) => setState(next)), []);
				return react_dom.createPortal(
					react.createElement("div", { className: "ow-toastRoot" },
						react.createElement("div", { className: "ow-toastStack", "aria-live": "polite" },
							state.toasts.map((item) => react.createElement("div", { className: "ow-toast", "data-kind": item.kind, key: item.id }, item.message)))),
					document.body
				);
			}

			/** 功能 1：头部工具按钮；busy 期间禁用；成功静默，失败 toast 说明原因。 */
			function OpenWorkspaceButton(props) {
				const [busy, setBusy] = react.useState(false);
				const open = async () => {
					if (busy) return;
					setBusy(true);
					try {
						await call("open", { sessionId: props.sessionId });
					} catch (error) {
						toast(interpolate(t("openFailed"), { detail: String(error instanceof Error ? error.message : error) }), "error");
					} finally {
						setBusy(false);
					}
				};
				const icon = react.createElement(PlatformIcon, { os: platform() });
				return react.createElement("button", {
					type: "button",
					className: "ow-button",
					disabled: busy,
					"aria-busy": busy,
					"aria-label": t("openLabel"),
					title: t("openLabel"),
					onClick: open
				}, icon);
			}

			ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: TOAST_ID, order: 90 }, () => react.createElement(ToastLayer, null)));
			ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: BUTTON_ID,
				order: -10,
				locale: NS
			}, OpenWorkspaceButton));

			// —— 功能 2：模型选择菜单提供商头部 ——
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

			// —— 功能 3：选中文本 → 添加至对话 ——
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

			/** 范围判定：选中须落在聊天消息区（非可编辑元素、水平位于 composer 列内、位于文本框上方）。 */
			function inChatArea(range) {
				const container = range.commonAncestorContainer;
				const node = container !== null && container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
				if (!(node instanceof Element)) return false;
				if (node.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return false;
				const textarea = findComposerTextarea();
				if (textarea === null) return false;
				const tr = textarea.getBoundingClientRect();
				if (tr.width === 0) return false;
				const rect = range.getBoundingClientRect();
				if (rect.right < tr.left || rect.left > tr.right) return false;
				if (rect.bottom > tr.top) return false;
				return true;
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
					if (!inChatArea(range)) {
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