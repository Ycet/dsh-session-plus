// dsh-open-workspace — browser half（ModuleLoader bundle）
// 会话头部右上角「打开工作区」纯图标按钮：macOS 显示包内资产 finder.png、Windows/Linux 显示 folder.svg；
// 图标经 host 资产路由（/open-workspace/assets）加载，失败回退内联 SVG；
// 点击 → host 在系统文件管理器中打开当前会话工作区根目录；失败经右下角 toast 提示（样式与 dsh-my-plugins 一致），成功不提示。
window.__ModuleLoader__.load({
	id: "dsh-open-workspace",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");

		const NS = "open-workspace";
		const PREFIX = "/open-workspace/api";
		const ASSET_PATH = "/open-workspace/assets";
		const BUTTON_ID = "open-workspace";
		const TOAST_ID = "open-workspace-toasts";

		const zh = {
			label: "打开工作区",
			toastFailed: "打开失败：{detail}"
		};
		const en = {
			label: "Open workspace",
			toastFailed: "Failed to open: {detail}"
		};

		const css = ".ow-button{border:1px solid var(--dsw-alias-border-l2);width:32px;height:32px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:18px;justify-content:center;align-items:center;gap:4px;padding:0;font-size:13px;line-height:20px;display:inline-flex}.ow-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.ow-button:disabled{color:var(--dsw-alias-label-dimmed);cursor:wait}.ow-button svg,.ow-button .ow-icon{flex:none}.ow-icon{width:16px;height:16px;pointer-events:none}.ow-toastRoot{pointer-events:none;position:fixed;inset:0;z-index:2147482990}.ow-toastStack{pointer-events:none;position:absolute;bottom:10px;right:10px;max-width:min(420px,calc(100vw - 36px));display:flex;flex-direction:column;gap:8px}.ow-toast{box-shadow:var(--dsw-shadow-lv1);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:9px;padding:10px 12px;font-size:13px;line-height:19px}.ow-toast[data-kind=error]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 65%,var(--dsw-alias-border-l2));color:var(--dsw-alias-state-error-primary)}.ow-toast[data-kind=success]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 55%,var(--dsw-alias-border-l2))}";
		const tagId = "dsh-open-workspace/client.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-open-workspace";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

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

		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-open-workspace: dictionaries");
			const t = ctx.locale.bind(NS);

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

			/** 右下角 toast 层：样式与 dsh-my-plugins 一致，2 秒自动消失。 */
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

			/** 头部工具按钮：busy 期间禁用；成功静默（访达/资源管理器已打开即反馈），失败 toast 说明原因。 */
			function OpenWorkspaceButton(props) {
				const [busy, setBusy] = react.useState(false);
				const open = async () => {
					if (busy) return;
					setBusy(true);
					try {
						await call("open", { sessionId: props.sessionId });
					} catch (error) {
						toast(interpolate(t("toastFailed"), { detail: String(error instanceof Error ? error.message : error) }), "error");
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
					"aria-label": t("label"),
					title: t("label"),
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
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});