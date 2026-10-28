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
//   4. 官方模型菜单「推理等级」行的 Codex 风格滑条（v0.6.0，迁自
//      dsh-codex-effort-slider 1.1.3，见 NOTICE.md）。
//   5. 新建会话页「在应用中打开」分体按钮（v0.7.0，v0.7.1 改为浮动定位）：官方把
//      该按钮放在 conversation.session.header.utilities，而空会话（hideChrome）时整行
//      工具区不渲染；这里改从「新会话选项行」席位取会话上下文，再用 portal 把同款分体
//      按钮挂进 body 上的固定定位宿主，始终排在标题栏右侧按钮簇（官方「展开右侧面板」、
//      better-sidebar 兜底切换、awesome-hud 悬浮入口）的最左侧；右侧面板展开或会话
//      没有工作区目录时不显示。
//   6. 通用设置 5 个功能开关（v0.7.0，v0.7.1 起开关样式对齐官方）：注册在官方
//      settings.general.item 席位，紧跟「在使用官方模型 API 时上传 Session Log」行下方；
//      开关本体直接复用官方 primitives 的 Switch（与官方行同一组件、同一份 CSS）。
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

		// 官方 UI 原语（Button / Switch / Tooltip 等）。静态模块由前端提供，其它插件
		// （如 dsh-better-sidebar）同样直接 require；v0.7.1 起「设置 → 通用」里的功能开关
		// 直接复用其中的 Switch，与官方行共用同一个组件和同一份 CSS，样式天然一致。
		// 旧运行时没有该模块时退回自绘开关（CSS 逐条镜像官方，见 styles effect）。
		let primitives = null;
		try {
			primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		} catch (_error) {
			primitives = null;
		}
		const OfficialSwitch = primitives && typeof primitives.Switch === "function" ? primitives.Switch : null;

		const NS = "sessionPlus";
		const HEADER_ENTRY_ID = "provider-header";
		const HEADER_ATTR = "data-model-provider-header";
		const SELECTION_ADD_ID = "selection-add";
		const CSS_TAG = "dsh-session-plus/client.css";
		/** 功能 4 在 conversation.input.right 的注册标识（沿用上游 id，便于对照上游文档）。 */
		const EFFORT_SLIDER_ID = "codex-effort-slider";
		const EFFORT_SLIDER_ORDER = 40;

		// ── 功能开关（v0.7.0）──────────────────────────────────────────────
		// 5 个开关存在浏览器 localStorage（与官方 dsh.sidebar-right.v1、
		// dsh.open-in-app.choice 同一持久化通道）；默认全开，因此升级后行为不变。
		// 读取失败 / JSON 损坏 / 隐私模式下退化为内存态，绝不抛错。
		const FLAGS_STORAGE_KEY = "dsh.session-plus.features.v1";
		const FEATURE_PROVIDER_HEADER = "provider-header";
		const FEATURE_SELECTION_ADD = "selection-add";
		const FEATURE_THEME_SWITCH = "theme-switch";
		const FEATURE_EFFORT_SLIDER = "effort-slider";
		const FEATURE_OPEN_IN_SESSION = "open-in-session";
		const FEATURE_IDS = [FEATURE_PROVIDER_HEADER, FEATURE_SELECTION_ADD, FEATURE_THEME_SWITCH, FEATURE_EFFORT_SLIDER, FEATURE_OPEN_IN_SESSION];
		/** 官方「上传 Session Log」行 order=90、「当前版本」行 order=100，这里占 91..95。 */
		const FEATURE_ROW_ORDER = 91;

		/** 功能开关仓库：localStorage 读写 + 订阅通知。 */
		function createFeatureFlags() {
			const listeners = new Set();
			let state = null;
			const defaults = () => {
				const init = {};
				for (const id of FEATURE_IDS) init[id] = true;
				return init;
			};
			const read = () => {
				const base = defaults();
				try {
					if (typeof window === "undefined" || !window.localStorage) return base;
					const raw = window.localStorage.getItem(FLAGS_STORAGE_KEY);
					if (typeof raw !== "string" || raw === "") return base;
					const parsed = JSON.parse(raw);
					if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return base;
					for (const id of FEATURE_IDS) {
						if (typeof parsed[id] === "boolean") base[id] = parsed[id];
					}
					return base;
				} catch (_error) {
					return base;
				}
			};
			const snapshot = () => {
				if (state === null) state = read();
				return state;
			};
			const persist = () => {
				try {
					if (typeof window === "undefined" || !window.localStorage) return;
					window.localStorage.setItem(FLAGS_STORAGE_KEY, JSON.stringify(snapshot()));
				} catch (_error) {
					// 隐私模式 / 配额不足：仅内存生效。
				}
			};
			const set = (id, enabled) => {
				if (FEATURE_IDS.indexOf(id) < 0) return;
				const next = Object.assign({}, snapshot());
				const value = enabled !== false;
				if (next[id] === value) return;
				next[id] = value;
				state = next;
				persist();
				for (const listener of Array.from(listeners)) {
					try { listener(id, value); } catch (_error) { /* 单个订阅者失败不影响其它订阅者 */ }
				}
			};
			return {
				ids: () => FEATURE_IDS.slice(),
				get: (id) => snapshot()[id] !== false,
				snapshot,
				set,
				toggle: (id) => set(id, !snapshot()[id]),
				subscribe(listener) {
					if (typeof listener !== "function") return () => {};
					listeners.add(listener);
					return () => { listeners.delete(listener); };
				},
				/** 测试用：丢弃内存态，下次读取重新走 localStorage。 */
				reset() { state = null; },
			};
		}
		const featureFlags = createFeatureFlags();
		const featureOn = (id) => featureFlags.get(id);

		/** React 侧订阅单个开关：优先 useSyncExternalStore，老运行时退化为 state+effect。 */
		function useFeatureFlag(id) {
			const getSnapshot = react.useCallback(() => featureFlags.get(id), [id]);
			const subscribe = react.useCallback((listener) => featureFlags.subscribe(() => listener()), []);
			if (typeof react.useSyncExternalStore === "function") {
				return react.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
			}
			const [value, setValue] = react.useState(getSnapshot);
			react.useEffect(() => {
				setValue(getSnapshot());
				return featureFlags.subscribe(() => setValue(getSnapshot()));
			}, [getSnapshot]);
			return value;
		}

		// 离线测试用的内部接缝：开关仓库在 apply 之前即可用；与 open-in-app 相关的
		// 纯逻辑在 apply 末尾并入同一个对象（见 apply 结尾的 Object.assign）。
		exports.__internals = {
			FEATURE_IDS,
			FLAGS_STORAGE_KEY,
			FEATURE_ROW_ORDER,
			createFeatureFlags,
			featureFlags,
			featureOn,
		};

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
			effortSliderLabel: "推理等级",
			effortSliderTitle: "推理等级：{name}",
			effortErrorNotReady: "模型目录尚未就绪，无法写入档位",
			effortErrorDirectory: "模型目录不可用，档位未写入",
			effortErrorTimeout: "档位切换超时，宿主未回报结果（已回滚显示）",
			effortErrorFailed: "档位切换失败",
			// 功能 6：通用设置里的 5 行开关（标题 + 说明）
			featProviderTitle: "模型菜单显示提供商名称",
			featProviderDesc: "在模型选择菜单顶部实时显示当前模型所属的提供商",
			featSelectionTitle: "选中文本加入对话",
			featSelectionDesc: "在聊天内容中选中文字后，用浮动按钮把选中文本以代码块插入输入框开头",
			featThemeTitle: "账户菜单主题快捷切换",
			featThemeDesc: "在账户菜单顶部提供「跟随系统 / 浅色 / 深色」三态切换条",
			featEffortTitle: "推理等级滑条",
			featEffortDesc: "把模型菜单里的「推理等级」行换成可拖动的连续滑条（关闭后恢复官方原生行）",
			featOpenInSessionTitle: "新建会话页「在应用中打开」按钮",
			featOpenInSessionDesc: "在尚未开始对话的新会话页标题栏显示工作区打开按钮；右侧面板展开时自动隐藏",
			// 功能 5：按钮文案与官方应用名（镜像 @deepseek-ai/dsh-client-ui-open-in-app，MIT，见 NOTICE.md）
			openInTitle: "用 {app} 打开",
			openInMore: "更多打开方式",
			openInDefault: "{app}（默认）",
			openInAppsError: "无法获取应用列表",
			openInFailed: "打开失败，请重试",
			openInBusy: "正在打开工作区",
			"app.finder": "访达",
			"app.explorer": "文件资源管理器",
			"app.filemanager": "文件",
			"app.cursor": "Cursor",
			"app.vscode": "VS Code",
			"app.vscodeinsiders": "VS Code Insiders",
			"app.windsurf": "Windsurf",
			"app.zed": "Zed",
			"app.sublimetext": "Sublime Text",
			"app.xcode": "Xcode",
			"app.androidstudio": "Android Studio",
			"app.intellij": "IntelliJ IDEA",
			"app.pycharm": "PyCharm",
			"app.webstorm": "WebStorm",
			"app.phpstorm": "PhpStorm",
			"app.goland": "GoLand",
			"app.rider": "Rider",
			"app.rustrover": "RustRover",
			"app.fork": "Fork",
			"app.sourcetree": "Sourcetree",
			"app.github": "GitHub Desktop",
			"app.tower": "Tower",
			"app.gitkraken": "GitKraken",
			"app.smartgit": "SmartGit",
			"app.sublimemerge": "Sublime Merge",
			"app.ghostty": "Ghostty",
			"app.warp": "Warp",
			"app.iterm": "iTerm2",
			"app.kitty": "kitty",
			"app.terminal": "终端",
			"app.windowsterminal": "Windows Terminal",
			"app.gitbash": "Git Bash",
			"app.gnometerminal": "GNOME Terminal",
			"app.konsole": "Konsole",
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
			effortSliderLabel: "Reasoning effort",
			effortSliderTitle: "Reasoning effort: {name}",
			effortErrorNotReady: "Model directory is not ready; the effort level was not saved.",
			effortErrorDirectory: "Model directory is unavailable; the effort level was not saved.",
			effortErrorTimeout: "Effort switch timed out before the host responded (display rolled back).",
			effortErrorFailed: "Failed to switch the effort level.",
			// Feature 6: the five General-settings switches (title + description)
			featProviderTitle: "Show the provider in the model menu",
			featProviderDesc: "Show the current model's provider at the top of the model selection menu",
			featSelectionTitle: "Add selected text to the conversation",
			featSelectionDesc: "Select text in a chat message, then use the floating button to insert it as a code block at the start of the composer",
			featThemeTitle: "Theme shortcut in the account menu",
			featThemeDesc: "Offer a System / Light / Dark three-state switch at the top of the account menu",
			featEffortTitle: "Reasoning-effort slider",
			featEffortDesc: "Replace the native Reasoning effort row with a draggable continuous slider (turning it off restores the official row)",
			featOpenInSessionTitle: "\"Open in app\" button on the new-session page",
			featOpenInSessionDesc: "Show the workspace opener in the header of a new session that has no messages yet; hidden while the right panel is open",
			// Feature 5: button copy and official application names (mirrors @deepseek-ai/dsh-client-ui-open-in-app, MIT, see NOTICE.md)
			openInTitle: "Open in {app}",
			openInMore: "More ways to open",
			openInDefault: "{app} (default)",
			openInAppsError: "Could not load applications",
			openInFailed: "Could not open. Try again.",
			openInBusy: "Opening workspace",
			"app.finder": "Finder",
			"app.explorer": "File Explorer",
			"app.filemanager": "Files",
			"app.cursor": "Cursor",
			"app.vscode": "VS Code",
			"app.vscodeinsiders": "VS Code Insiders",
			"app.windsurf": "Windsurf",
			"app.zed": "Zed",
			"app.sublimetext": "Sublime Text",
			"app.xcode": "Xcode",
			"app.androidstudio": "Android Studio",
			"app.intellij": "IntelliJ IDEA",
			"app.pycharm": "PyCharm",
			"app.webstorm": "WebStorm",
			"app.phpstorm": "PhpStorm",
			"app.goland": "GoLand",
			"app.rider": "Rider",
			"app.rustrover": "RustRover",
			"app.fork": "Fork",
			"app.sourcetree": "Sourcetree",
			"app.github": "GitHub Desktop",
			"app.tower": "Tower",
			"app.gitkraken": "GitKraken",
			"app.smartgit": "SmartGit",
			"app.sublimemerge": "Sublime Merge",
			"app.ghostty": "Ghostty",
			"app.warp": "Warp",
			"app.iterm": "iTerm2",
			"app.kitty": "kitty",
			"app.terminal": "Terminal",
			"app.windowsterminal": "Windows Terminal",
			"app.gitbash": "Git Bash",
			"app.gnometerminal": "GNOME Terminal",
			"app.konsole": "Konsole",
		};

		// 样式仅使用 Theme provider 已核实的 token（--dsw-alias-*）。
		// .sp-ts-* 为账户菜单顶部的主题切换条；既有的 .php-* / .sp-add-btn 保持原样。
		const css = ".php-header{box-sizing:border-box;flex:none;align-items:baseline;gap:6px;padding:6px 10px 5px;margin-bottom:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);display:flex;user-select:none}.php-value{color:var(--dsw-alias-label-primary);font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sp-add-btn{position:fixed;z-index:2147482995;transform:translateX(-50%);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv1);border-radius:999px;align-items:center;padding:5px 12px;font-size:12px;line-height:18px;font-weight:500;cursor:pointer;user-select:none;display:flex;-webkit-app-region:no-drag}.sp-add-btn:hover{filter:brightness(1.08);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,var(--dsw-alias-border-l2))}" + ".sp-ts{box-sizing:border-box;flex:none;margin:0 0 3px;padding:0 0 3px;border-bottom:.5px solid var(--dsw-alias-border-l2)}.sp-ts-track{position:relative;box-sizing:border-box;display:flex;align-items:stretch;height:32px;padding:3px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);user-select:none;-webkit-user-select:none;touch-action:none}.sp-ts-thumb{position:absolute;top:3px;bottom:3px;left:3px;width:0;border-radius:6px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv1);pointer-events:none}.sp-ts-slot{box-sizing:border-box;position:relative;flex:1 1 0;min-width:0;display:block;padding:0 8px;height:26px;line-height:26px;text-align:center;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;border-radius:6px}.sp-ts-slot[aria-checked=\"true\"]{color:var(--dsw-alias-label-primary);font-weight:500}.sp-ts-slot:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.sp-ts-ghost{display:block;height:0;overflow:hidden;line-height:0;visibility:hidden}.sp-ts-text{pointer-events:none}" + ".sp-set-row{box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}.sp-set-copy{min-width:0}.sp-set-title{font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary)}.sp-set-desc{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}" + ".sp-switch-wrap{display:inline-flex;flex:0 0 auto;align-items:center}" + ".sp-switch{box-sizing:border-box;position:relative;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-border-l3);cursor:pointer}" + ".sp-switch[aria-checked=\"true\"]{background:var(--dsw-alias-brand-primary)}" + ".sp-switch:disabled{cursor:default;opacity:.5}" + ".sp-switch:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:2px}" + ".sp-switch-knob{display:block;width:16px;height:16px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-label-primary-foreground);transition:transform .12s ease}" + ".sp-switch[aria-checked=\"false\"] .sp-switch-knob{background:var(--dsw-alias-switch-thumb)}" + ".sp-switch[aria-checked=\"true\"] .sp-switch-knob{transform:translate(16px)}" + ".sp-hdr-slot{position:fixed;left:0;top:0;z-index:40;display:inline-flex;align-items:center;visibility:hidden;-webkit-app-region:no-drag}.sp-hdr-slot[data-sp-placed]{visibility:visible}" + ".sp-split{box-sizing:border-box;display:inline-flex;align-items:stretch;height:24px;overflow:hidden;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);font-family:var(--dsw-font-family);-webkit-app-region:no-drag}.sp-split-main,.sp-split-more{display:inline-flex;align-items:center;justify-content:center;border:0;background:0 0;color:var(--dsw-alias-label-primary);font-size:11px;line-height:16px;white-space:nowrap;cursor:pointer}.sp-split-main{gap:4px;padding:3px 5px}.sp-split-more{border-left:.5px solid var(--dsw-alias-border-l4);color:var(--dsw-alias-label-secondary);padding:3px 4px 3px 3px}.sp-split-main:hover:not(:disabled),.sp-split-main:focus-visible,.sp-split-more:hover:not(:disabled),.sp-split-more:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.sp-split-main:disabled,.sp-split-more:disabled{cursor:default;opacity:.6}.sp-split-main:focus-visible,.sp-split-more:focus-visible{outline:none}.sp-split-icon{object-fit:contain;flex:none}.sp-split-fallback{display:inline-flex;color:var(--dsw-alias-label-secondary)}" + ".sp-oa-menu{position:fixed;z-index:2147483000;box-sizing:border-box;display:flex;flex-direction:column;min-width:180px;max-height:320px;overflow-y:auto;padding:4px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-overlay);box-shadow:0 8px 24px rgba(0,0,0,.18);-webkit-app-region:no-drag}.sp-oa-item{display:flex;align-items:center;gap:8px;padding:5px 8px;border:0;border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;text-align:left;cursor:pointer}.sp-oa-item:hover:not(:disabled),.sp-oa-item:focus-visible,.sp-oa-item[data-active=\"true\"]{background:var(--dsw-alias-interactive-bg-hover)}.sp-oa-item:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.sp-oa-item:focus-visible{outline:none}.sp-oa-check{display:grid;place-items:center;flex:none;width:14px;height:14px;color:var(--dsw-alias-label-primary)}.sp-oa-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sp-oa-icon{object-fit:contain;flex:none}.sp-oa-err{padding:6px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}" + ".sp-tip{position:fixed;z-index:2147483001;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;max-width:280px;padding:4px 8px;border-radius:var(--dsw-radius-sm);border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);box-shadow:0 4px 16px rgba(0,0,0,.16);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;pointer-events:none;white-space:nowrap}.sp-tip-keys{color:var(--dsw-alias-label-tertiary);font-size:11px}" + ".sp-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483002;box-sizing:border-box;padding:8px 14px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);box-shadow:0 8px 24px rgba(0,0,0,.18);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;pointer-events:none}";

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
				tag.textContent = css + "\n" + effortSliderCss();
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
				// 功能开关（v0.7.0）：关闭时这一 effect 不装配；开关切回时旧 cleanup
				// 先移除已注入的 .php-header，不会残留。
				const featureEnabled = useFeatureFlag(FEATURE_PROVIDER_HEADER);
				react.useEffect(() => {
					if (!featureEnabled) return undefined;
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
				}, [store, t, featureEnabled]);
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
				// 功能开关（v0.7.0）：关闭时下方 effect 直接不装配，选区浮层随之消失。
				const featureEnabled = useFeatureFlag(FEATURE_SELECTION_ADD);
				const useInput = typeof props.useInput === "function" ? props.useInput : () => undefined;
				const input = useInput((state) => state);
				const [anchor, setAnchor] = react.useState(null);
				const ownerRef = react.useRef(null);
				const buttonRef = react.useRef(null);
				const scrollTimerRef = react.useRef(null);
				const latest = react.useRef(null);
				latest.current = { input, actions: props.inputActions, sessionId: props.sessionId };
				const enabled = featureEnabled && typeof props.inputActions?.setDraft === "function" && input !== undefined
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
				/** 上一次挂载过的菜单元素：功能开关关闭后重新打开时，菜单高度已因移除
				 *  切换条而变化，几何反查可能失配；只要那个菜单还开着就直接复用。 */
				let detachedMenu = null;
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

				/** 记得上次的菜单是否仍可直接复用：还连着、仍是菜单、仍可见、且没被别处接管。 */
				function isReusableMenu(candidate) {
					if (!candidate || typeof candidate.getBoundingClientRect !== "function") return false;
					if (candidate.isConnected === false) return false;
					if (candidate.getAttribute("role") !== "menu") return false;
					if (candidate.getAttribute(ACCOUNT_MENU_ATTR) !== null) return false;
					const rect = candidate.getBoundingClientRect();
					return rect.width > 0 && rect.height > 0;
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
					detachedMenu = null;
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
					// 只在真正挂载着菜单时记住它：开关关闭后观察回调会反复进来 detach，
					// 若每次都覆盖就会把这份记忆抹成 null，重新开启时再也找回原菜单。
					if (menu !== null) detachedMenu = menu;
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
					// 功能开关（v0.7.0）：关闭时先拆除已注入的切换条，再停止装配。
					if (!featureOn(FEATURE_THEME_SWITCH)) {
						detach();
						return;
					}
					const node = document.querySelector(LAUNCHER_SELECTOR);
					if (!node || node.getAttribute("aria-expanded") !== "true") {
						detach();
						return;
					}
					trigger = node;
					if (menu && menu.isConnected && ui && menu.contains(ui.root)) return;
					const remembered = isReusableMenu(detachedMenu) ? detachedMenu : null;
					const list = remembered || findMenu(node);
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
				// 功能开关即时生效：切换后重跑一次扫描（关闭时 scan 内部会 detach）。
				const offFlags = featureFlags.subscribe(() => scan());
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
					if (typeof offFlags === "function") offFlags();
				};
			}

			// 服务就绪后装配；服务缺失时整条功能不出现（另两项功能不受影响）。
			ctx.inject(["theme"], (scope) => {
				scope.effect(() => installThemeSwitch(scope), "dsh-session-plus: theme switcher");
			});

			/** 取 vendored 滑条的样式表（统一并进本插件的 style 标签）。 */
			function effortSliderCss() {
				try {
					const list = effortSliderVendor && effortSliderVendor.__internals && effortSliderVendor.__internals.CSS;
					// 上游的 CSS 是已 join 好的字符串；这里同时容忍数组形式，避免以后上游改结构时静默丢样式。
					if (typeof list === "string") return list;
					return Array.isArray(list) ? list.join("\n") : "";
				} catch (_error) {
					return "";
				}
			}

			// —— 功能 4（v0.6.0）：官方模型菜单「推理等级」行的 Codex 风格滑条 ——
			// 迁移自 dsh-codex-effort-slider 1.1.3（MIT，见 NOTICE.md）。它只接管那一行：
			// 加高行、在行尾塞一个容器并把滑条 portal 进去，官方 label/value/chevron 不动。
			// 与功能 1 共用 modelDirectories：该服务缺失时只有滑条不出现，其余功能不受影响。
			ctx.inject(["modelDirectories"], (scope) => {
				scope.effect(() => {
					effortSliderVendor.__internals.__setTranslator((key, params) => interpolate(t(key), params || {}));
					return scope.slots.inject("conversation.input.right", () => scope.slots.register({
						name: "conversation.input.right",
						id: EFFORT_SLIDER_ID,
						order: EFFORT_SLIDER_ORDER,
						label: () => t("effortSliderLabel"),
						locale: NS,
						inject: (sessionId) => ({ sessionId }),
					}, (props) => {
						// 功能开关（v0.7.0）：关闭时卸载 vendored 滑条组件，它自身的
						// cleanup 会把官方「推理等级」行恢复原样。
						const featureEnabled = useFeatureFlag(FEATURE_EFFORT_SLIDER);
						if (!featureEnabled) return null;
						return react.createElement(
							effortSliderVendor.__internals.CodexEffortSlider,
							Object.assign({}, props, { __ctx: scope }),
						);
					}));
				}, "dsh-session-plus: effort slider");
			});

			// —— 功能 6（v0.7.0）：通用设置里的 5 个功能开关 ——
			// 官方「在使用官方模型 API 时上传 Session Log」行 order=90、「当前版本」行
			// order=100，这里用 91..95 紧接在该官方行下方。插槽不存在时 ctx.slots.inject
			// 静默不注册，其余功能不受影响。
			const FEATURE_ROWS = [
				{ id: "session-plus/provider-header", feature: FEATURE_PROVIDER_HEADER, title: "featProviderTitle", desc: "featProviderDesc" },
				{ id: "session-plus/selection-add", feature: FEATURE_SELECTION_ADD, title: "featSelectionTitle", desc: "featSelectionDesc" },
				{ id: "session-plus/theme-switch", feature: FEATURE_THEME_SWITCH, title: "featThemeTitle", desc: "featThemeDesc" },
				{ id: "session-plus/effort-slider", feature: FEATURE_EFFORT_SLIDER, title: "featEffortTitle", desc: "featEffortDesc" },
				{ id: "session-plus/open-in-session", feature: FEATURE_OPEN_IN_SESSION, title: "featOpenInSessionTitle", desc: "featOpenInSessionDesc" },
			];
			for (let rowIndex = 0; rowIndex < FEATURE_ROWS.length; rowIndex += 1) {
				const row = FEATURE_ROWS[rowIndex];
				ctx.slots.inject("settings.general.item", () => ctx.slots.register({
					name: "settings.general.item",
					id: row.id,
					order: FEATURE_ROW_ORDER + rowIndex,
					label: () => t(row.title),
					locale: NS,
					inject: () => ({ featureId: row.feature, titleKey: row.title, descKey: row.desc }),
				}, FeatureToggleRow));
			}

			/**
			 * 通用设置里的一行开关：标题 + 说明 + 右侧开关。
			 * v0.7.1 起开关本体直接复用官方 primitives 的 Switch —— 与「在使用官方模型
			 * API 时上传 Session Log」等官方行是同一个组件、同一份 CSS，样式完全一致；
			 * 旧运行时没有该原语时退回自绘开关（CSS 逐条镜像官方，见 styles effect）。
			 */
			function FeatureToggleRow(props) {
				const featureEnabled = useFeatureFlag(props.featureId);
				const translate = typeof props.t === "function" ? props.t : (key) => key;
				const title = translate(props.titleKey);
				const onChange = (next) => featureFlags.set(props.featureId, next !== false);
				const control = OfficialSwitch
					? react.createElement(OfficialSwitch, { checked: featureEnabled === true, onChange, label: title })
					: react.createElement("button", {
						type: "button",
						role: "switch",
						className: "sp-switch",
						"aria-checked": featureEnabled ? "true" : "false",
						"aria-label": title,
						onClick: () => onChange(!featureEnabled),
					}, react.createElement("span", { className: "sp-switch-knob", "aria-hidden": "true" }));
				return react.createElement("div", { className: "sp-set-row", "data-sp-feature-toggle": props.featureId },
					react.createElement("div", { className: "sp-set-copy" },
						react.createElement("div", { className: "sp-set-title" }, title),
						react.createElement("div", { className: "sp-set-desc" }, translate(props.descKey))),
					react.createElement("span", { className: "sp-switch-wrap", "data-sp-switch": props.featureId }, control));
			}

			// —— 功能 5（v0.7.0，v0.7.1 重做落点）：新建会话页「在应用中打开」分体按钮 ——
			// 官方按钮在 conversation.session.header.utilities 席，而空会话（hideChrome）
			// 时整行工具区不渲染。这里改从「新会话选项行」conversation.hero.options 取会话
			// 上下文，再用 portal 把同款分体按钮挂进 body 上的固定定位宿主：
			// 不再塞进标题栏角落容器（那会挤占其它插件浮动按钮的测量空间），而是按官方
			// 「展开右侧面板」按钮所在行测量，始终排在整簇按钮的最左侧。
			// 数据与行为沿用官方宿主路由，未复制官方代码（视觉参数与文案镜像，见 NOTICE.md）。
			const OPEN_IN_APPS_ROUTE = "/open-in-app/apps";
			const OPEN_IN_ICON_ROUTE = "/open-in-app/icon";
			const OPEN_IN_OPEN_ROUTE = "/open-in-app/open";
			const OPEN_IN_CHOICE_KEY = "dsh.session-plus.open-in-app.v1";
			const OPEN_IN_OFFICIAL_CHOICE_KEY = "dsh.open-in-app.choice";
			const OPEN_IN_ENTRY_ID = "session-plus/open-in-app";
			const OPEN_IN_ENTRY_ORDER = 50;
			const CORNER_SELECTOR = "[data-conversation-header-corner]";
			const PANEL_EXPAND_SELECTOR = "[data-sidebar-right-expand]";
			/** 按钮簇中相邻按钮的间距（官方标题栏按钮 / better-sidebar / awesome-hud 均为 8px）。 */
			const OPEN_IN_CLUSTER_GAP = 8;
			/** 视口左缘安全边距：窗口极窄时按钮仍完整可见。 */
			const OPEN_IN_MIN_LEFT = 12;
			/**
			 * 标题栏右侧按钮簇里可能出现的浮动按钮（均为 position:fixed）。
			 * 本按钮始终排到这些按钮的最左边，因此它们的矩形都要参与「最左」判定。
			 */
			const OPEN_IN_CLUSTER_SELECTORS = [
				// 官方「展开右侧面板」按钮（也是垂直居中的锚点）。
				PANEL_EXPAND_SELECTOR,
				// 面板展开后官方把展开按钮换成收起按钮（本功能此时隐藏，仅作兜底）。
				"[data-sidebar-right-toggle]",
				// dsh-better-sidebar：空白会话页的兜底切换按钮。
				"[data-dsh-dock-fallback]",
				// dsh-awesome-hud：新建会话页右上角悬浮入口。
				"[data-hud-float]",
			];
			/** 官方开启工作区的命令 id（提示里展示它的快捷键）。 */
			const OPEN_IN_SHORTCUT_ID = "workspace.openLocal";
			/** 没有会话槽 props 时的兜底 selector（永不再渲染）。 */
			const NO_SESSIONS = () => undefined;
			const openInApps = createAppsSource();

			/** 应用目录读取源：整页只读一次；失败或为空时按官方行为完全不渲染按钮。 */
			function createAppsSource() {
				const listeners = new Set();
				let status = "idle";
				let apps = [];
				const notify = () => {
					for (const listener of Array.from(listeners)) {
						try { listener(); } catch (_error) { /* 单个订阅者失败不影响其它订阅者 */ }
					}
				};
				const publish = (nextStatus, nextApps) => {
					status = nextStatus;
					apps = nextApps;
					notify();
				};
				return {
					snapshot: () => ({ status, apps }),
					subscribe(listener) {
						if (typeof listener !== "function") return () => {};
						listeners.add(listener);
						return () => { listeners.delete(listener); };
					},
					load() {
						if (status !== "idle") return Promise.resolve();
						status = "loading";
						try {
							if (typeof fetch !== "function") { publish("empty", []); return Promise.resolve(); }
							return fetch(OPEN_IN_APPS_ROUTE, { headers: { accept: "application/json" } })
								.then((response) => (response && response.ok ? response.json() : null))
								.then((payload) => {
									const list = payload && Array.isArray(payload.apps)
										? payload.apps.filter((id) => typeof id === "string" && id.length > 0)
										: [];
									publish(list.length > 0 ? "ready" : "empty", list);
								})
								.catch(() => publish("empty", []));
						} catch (_error) {
							publish("empty", []);
							return Promise.resolve();
						}
					},
					/** 测试用：丢弃缓存，下次 load 重新读路由。 */
					reset() { status = "idle"; apps = []; },
				};
			}

			function useAppsSnapshot(source) {
				const [value, setValue] = react.useState(source.snapshot);
				react.useEffect(() => {
					const sync = () => setValue(source.snapshot());
					sync();
					return source.subscribe(sync);
				}, [source]);
				return value;
			}

			/** 右侧面板是否展开：优先公开服务 ctx.sidebarRight，缺失时用官方展开按钮的可见性反推。 */
			function panelExpandedNow(scope) {
				try {
					const service = scope && scope.sidebarRight;
					if (service && typeof service.isExpanded === "function") return service.isExpanded() === true;
				} catch (_error) { /* 服务不可用，走 DOM 兜底 */ }
				try {
					if (typeof document === "undefined" || typeof document.querySelector !== "function") return false;
					// 标题栏还没挂起来时按「收起」处理，避免首帧误判为展开。
					if (document.querySelector(CORNER_SELECTOR) === null) return false;
					return document.querySelector(PANEL_EXPAND_SELECTOR) === null;
				} catch (_error) {
					return false;
				}
			}

			function usePanelExpanded(scope) {
				const [expanded, setExpanded] = react.useState(() => panelExpandedNow(scope));
				react.useEffect(() => {
					if (typeof window === "undefined") return undefined;
					let alive = true;
					const sync = () => {
						if (!alive) return;
						const next = panelExpandedNow(scope);
						setExpanded((previous) => (previous === next ? previous : next));
					};
					const timer = window.setInterval(sync, 250);
					window.addEventListener("resize", sync);
					document.addEventListener("pointerdown", sync, true);
					sync();
					return () => {
						alive = false;
						window.clearInterval(timer);
						window.removeEventListener("resize", sync);
						document.removeEventListener("pointerdown", sync, true);
					};
				}, [scope]);
				return expanded;
			}

			/** 官方开启工作区命令的快捷键（catalog 缺失时为 null，不显示键位）。 */
			function useShortcutEntry(scope, id) {
				const read = () => {
					try {
						const catalog = scope && scope.shortcuts && scope.shortcuts.catalog;
						const rows = catalog && typeof catalog.getSnapshot === "function" ? catalog.getSnapshot() : null;
						if (!Array.isArray(rows)) return null;
						const entry = rows.find((row) => row && row.id === id);
						if (!entry) return null;
						return { keys: typeof entry.keys === "string" ? entry.keys : "", aria: typeof entry.aria === "string" ? entry.aria : "" };
					} catch (_error) {
						return null;
					}
				};
				const [value, setValue] = react.useState(read);
				react.useEffect(() => {
					let unsubscribe = null;
					try {
						const catalog = scope && scope.shortcuts && scope.shortcuts.catalog;
						if (catalog && typeof catalog.subscribe === "function") {
							const off = catalog.subscribe(() => setValue(read()));
							if (typeof off === "function") unsubscribe = off;
						}
					} catch (_error) { /* 快捷键服务不可用：不显示键位 */ }
					return () => { if (typeof unsubscribe === "function") unsubscribe(); };
				}, [scope]);
				return value;
			}

			function appLabelOf(translate, id) {
				const key = "app." + id;
				const text = translate(key);
				return typeof text === "string" && text !== "" && text !== key ? text : id;
			}

			/** 记住打开方式：自有键；首次从官方键只读继承，绝不改写官方状态。 */
			function readOpenInChoice() {
				try {
					const own = window.localStorage.getItem(OPEN_IN_CHOICE_KEY);
					if (typeof own === "string" && own !== "") return own;
					const shared = window.localStorage.getItem(OPEN_IN_OFFICIAL_CHOICE_KEY);
					if (typeof shared === "string" && shared !== "") {
						try {
							const parsed = JSON.parse(shared);
							if (typeof parsed === "string" && parsed !== "") return parsed;
						} catch (_error) { /* 官方也可能存裸字符串 */ }
						return shared;
					}
				} catch (_error) { /* 存储不可用 */ }
				return "";
			}

			function rememberOpenInChoice(id) {
				try { window.localStorage.setItem(OPEN_IN_CHOICE_KEY, id); } catch (_error) { /* 仅内存生效 */ }
			}

			/** 用官方宿主路由打开一个目录；返回宿主是否确认。 */
			async function requestOpenInApp(appId, path) {
				try {
					if (typeof fetch !== "function") return false;
					const response = await fetch(OPEN_IN_OPEN_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ app: appId, path }),
					});
					return Boolean(response && response.ok);
				} catch (_error) {
					return false;
				}
			}

			/** 按钮可见性的四条与门（抽成纯函数，便于离线覆盖全组合）。 */
			function openInVisible(state) {
				return state.featureEnabled === true
					&& state.host !== null && state.host !== undefined
					&& state.expanded !== true
					&& state.appsStatus === "ready"
					&& typeof state.cwd === "string" && state.cwd !== "";
			}

			/**
			 * 计算固定按钮的落点：始终排在按钮簇最左侧（抽成纯函数，便于离线覆盖）。
			 * @param rows 同一行可见按钮的矩形列表（含官方展开按钮本身）。
			 * @param anchorRect 官方「展开右侧面板」按钮的矩形（垂直居中的基准）。
			 * @param size 自身尺寸（宽高都必须大于 0）。
			 * @returns 视口坐标下的 left/top；锚点或尺寸不可用时返回 null。
			 */
			function placeClusterButton(rows, anchorRect, size) {
				if (!anchorRect || !size) return null;
				if (!(anchorRect.width > 0) || !(anchorRect.height > 0)) return null;
				if (!(size.width > 0) || !(size.height > 0)) return null;
				let left = anchorRect.left;
				for (const rect of Array.isArray(rows) ? rows : []) {
					if (!rect || !(rect.width > 0) || !(rect.height > 0)) continue;
					// 只认与锚点同一行的按钮：跨行的按钮不参与「最左」判定。
					if (rect.bottom <= anchorRect.top || rect.top >= anchorRect.bottom) continue;
					if (rect.left < left) left = rect.left;
				}
				return {
					left: Math.max(OPEN_IN_MIN_LEFT, left - OPEN_IN_CLUSTER_GAP - size.width),
					top: anchorRect.top + (anchorRect.height - size.height) / 2,
				};
			}

			/** 新建会话页的按钮宿主：body 上的固定定位节点 → portal 出分体按钮。 */
			function OpenInSessionButton(props) {
				const featureEnabled = useFeatureFlag(FEATURE_OPEN_IN_SESSION);
				const sessionId = props.sessionId;
				const scope = props.__ctx;
				const useSessions = typeof props.useSessions === "function" ? props.useSessions : NO_SESSIONS;
				const cwd = useSessions((state) => (sessionId === undefined || sessionId === null ? undefined : state?.byId?.[sessionId]?.cwd));
				const shortcut = useShortcutEntry(scope, OPEN_IN_SHORTCUT_ID);
				const expanded = usePanelExpanded(scope);
				const appsState = useAppsSnapshot(openInApps);
				const [host, setHost] = react.useState(null);

				react.useEffect(() => { openInApps.load(); }, []);

				react.useEffect(() => {
					if (!featureEnabled) { setHost(null); return undefined; }
					if (typeof document === "undefined" || typeof document.querySelector !== "function" || !document.body) return undefined;
					/**
					 * v0.7.1 落点：body 上的固定定位，始终排在标题栏右侧按钮簇的最左侧。
					 *
					 * 官方「展开右侧面板」按钮所在的角落容器只作为垂直对齐的锚点，不再把宿主
					 * 塞进容器：同一行里还有其它插件的浮动按钮（dsh-better-sidebar 的兜底切换、
					 * dsh-awesome-hud 的悬浮入口），它们各自按官方锚点自行测量位置；插在流内
					 * 会挤占它们的测量空间，两个插件之间就会互相叠压。固定定位既不参与宿主
					 * 排版，也让我们能按整簇按钮的最左缘落位（8px 间距，窗口再窄也优先留在
					 * 视口内）。
					 */
					let node = null;
					let frame = 0;
					let timer = null;
					let placedLeft = null;
					let placedTop = null;
					let sizeObserver = null;

					/** 回收宿主节点（面板展开 / 页面切走 / 卸载）。 */
					const removeNode = () => {
						if (sizeObserver) {
							sizeObserver.disconnect();
							sizeObserver = null;
						}
						if (node && node.parentNode) node.parentNode.removeChild(node);
						node = null;
						placedLeft = null;
						placedTop = null;
						setHost(null);
					};

					/** 收集参与「最左」判定的同行按钮矩形（含官方展开按钮本身）。 */
					const collectRows = () => {
						const rows = [];
						const seen = new Set();
						const push = (element) => {
							if (!element || element === node || seen.has(element)) return;
							seen.add(element);
							let rect = null;
							try { rect = element.getBoundingClientRect(); } catch (_error) { return; }
							if (!rect || !(rect.width > 0) || !(rect.height > 0)) return;
							rows.push(rect);
						};
						for (const selector of OPEN_IN_CLUSTER_SELECTORS) {
							let list = null;
							try { list = document.querySelectorAll(selector); } catch (_error) { list = null; }
							if (list) for (const element of list) push(element);
						}
						// 角落容器里的官方/其它按钮（未来官方若在同一容器加按钮，也一并让位）。
						let corner = null;
						try { corner = document.querySelector(CORNER_SELECTOR); } catch (_error) { corner = null; }
						if (corner) for (const element of corner.children) push(element);
						return rows;
					};

					const sync = () => {
						frame = 0;
						let anchor = null;
						try { anchor = document.querySelector(PANEL_EXPAND_SELECTOR); } catch (_error) { anchor = null; }
						let anchorRect = null;
						if (anchor && typeof anchor.getBoundingClientRect === "function") {
							try { anchorRect = anchor.getBoundingClientRect(); } catch (_error) { anchorRect = null; }
						}
						// 锚点不在（面板展开 / 页面切走）：按钮没有可依附的标题栏，回收宿主。
						if (!anchorRect || !(anchorRect.width > 0) || !(anchorRect.height > 0)) {
							if (node) removeNode();
							return;
						}
						if (!node) {
							node = document.createElement("span");
							node.className = "sp-hdr-slot";
							node.setAttribute("data-sp-open-in-session", "");
							document.body.appendChild(node);
							if (typeof ResizeObserver === "function") {
								// 按钮本体由 React portal 异步挂进来：尺寸从 0 变大时立即重新测量。
								sizeObserver = new ResizeObserver(() => schedule());
								sizeObserver.observe(node);
							}
							setHost(node);
						}
						let box = null;
						try { box = node.getBoundingClientRect(); } catch (_error) { box = null; }
						// portal 还没渲染出按钮（应用目录未就绪等）：保持隐藏，等尺寸回调再量。
						if (!box || !(box.width > 0) || !(box.height > 0)) return;
						const placement = placeClusterButton(collectRows(), anchorRect, { width: box.width, height: box.height });
						if (!placement) return;
						if (placedLeft === null || Math.abs(placement.left - placedLeft) >= 0.5 || Math.abs(placement.top - placedTop) >= 0.5) {
							node.style.left = placement.left + "px";
							node.style.top = placement.top + "px";
							placedLeft = placement.left;
							placedTop = placement.top;
						}
						// 只有真正落位之后才可见：避免首帧在视口左上角闪一下。
						node.setAttribute("data-sp-placed", "");
					};

					/** 合并到下一帧：别的插件在同一帧里反复改标题栏也不会把测量堆成风暴。 */
					const schedule = () => {
						if (frame) return;
						frame = window.requestAnimationFrame(sync);
					};

					let observer = null;
					if (typeof MutationObserver === "function") {
						// childList 覆盖按钮簇的挂载/卸载；位置变化（侧栏开合、窗口尺寸）另由
						// resize 事件与 500ms 兜底轮询跟上（与这一排按钮的其它插件同一节奏）。
						observer = new MutationObserver(schedule);
						observer.observe(document.body, { childList: true, subtree: true });
					}
					window.addEventListener("resize", schedule);
					timer = window.setInterval(schedule, 500);
					sync();
					return () => {
						if (observer) observer.disconnect();
						if (timer !== null) window.clearInterval(timer);
						window.removeEventListener("resize", schedule);
						if (frame) {
							window.cancelAnimationFrame(frame);
							frame = 0;
						}
						removeNode();
					};
				}, [featureEnabled]);

				const visible = openInVisible({
					featureEnabled,
					host,
					expanded,
					appsStatus: appsState.status,
					cwd,
				});
				if (!visible) return null;
				return react_dom.createPortal(react.createElement(OpenInSplitButton, {
					apps: appsState.apps,
					path: cwd,
					translate: typeof props.t === "function" ? props.t : (key) => key,
					shortcut,
				}), host);
			}

			function OpenInArrowIcon(props) {
				const size = props.size || 13;
				return react.createElement("svg", {
					viewBox: "0 0 16 16", width: size, height: size, "aria-hidden": "true", className: "sp-split-fallback",
				}, react.createElement("path", {
					d: "M5 11 11 5M6.2 5H11v4.8", fill: "none", stroke: "currentColor", strokeWidth: 1.3,
					strokeLinecap: "round", strokeLinejoin: "round",
				}));
			}

			function OpenInChevronIcon() {
				return react.createElement("svg", { viewBox: "0 0 16 16", width: 10, height: 10, "aria-hidden": "true" },
					react.createElement("path", {
						d: "M4 6.4 8 10.2l4-3.8", fill: "none", stroke: "currentColor", strokeWidth: 1.4,
						strokeLinecap: "round", strokeLinejoin: "round",
					}));
			}

			function OpenInCheckIcon() {
				return react.createElement("svg", { viewBox: "0 0 16 16", width: 14, height: 14, "aria-hidden": "true" },
					react.createElement("path", {
						d: "m3.4 8.6 2.9 2.9 6.3-6.4", fill: "none", stroke: "currentColor", strokeWidth: 1.5,
						strokeLinecap: "round", strokeLinejoin: "round",
					}));
			}

			/** 应用图标：加载失败时回退为上箭头字形（图标路由不可用时不至于空白）。 */
			function OpenInAppIcon(props) {
				const [failed, setFailed] = react.useState(false);
				const size = props.size || 13;
				if (!props.source || failed) return react.createElement(OpenInArrowIcon, { size });
				return react.createElement("img", {
					src: props.source, width: size, height: size, className: "sp-split-icon", alt: "",
					draggable: false, "aria-hidden": "true", onError: () => setFailed(true),
				});
			}

			/** 分体按钮本体：主按钮=用当前应用打开，箭头=应用列表（与官方交互一致）。 */
			function OpenInSplitButton(props) {
				const translate = props.translate;
				const [choice, setChoice] = react.useState(readOpenInChoice);
				const [open, setOpen] = react.useState(false);
				const [busy, setBusy] = react.useState(false);
				const [toast, setToast] = react.useState(null);
				const [tip, setTip] = react.useState(null);
				const [menuRect, setMenuRect] = react.useState(null);
				const [activeIndex, setActiveIndex] = react.useState(0);
				const rootRef = react.useRef(null);
				const menuRef = react.useRef(null);
				const seqRef = react.useRef(0);

				const options = props.apps.map((id) => ({ id, label: appLabelOf(translate, id), icon: OPEN_IN_ICON_ROUTE + "/" + id }));
				const preferred = options.find((item) => item.id === choice) || options[0] || null;
				const disabled = busy === true;

				react.useEffect(() => {
					if (toast === null) return undefined;
					const timer = window.setTimeout(() => setToast(null), 3000);
					return () => window.clearTimeout(timer);
				}, [toast]);

				react.useEffect(() => {
					if (!open) return undefined;
					const onPointer = (event) => {
						const root = rootRef.current;
						const menu = menuRef.current;
						if (root && root.contains(event.target)) return;
						if (menu && menu.contains(event.target)) return;
						setOpen(false);
					};
					const onKey = (event) => {
						if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
					};
					document.addEventListener("pointerdown", onPointer, true);
					document.addEventListener("keydown", onKey, true);
					return () => {
						document.removeEventListener("pointerdown", onPointer, true);
						document.removeEventListener("keydown", onKey, true);
					};
				}, [open]);

				if (preferred === null) return null;

				const titleOf = (app) => interpolate(translate("openInTitle"), { app: app ? app.label : "" });
				const primaryLabel = titleOf(preferred);

				const showTip = (text) => {
					const node = rootRef.current;
					if (!node || typeof node.getBoundingClientRect !== "function") return;
					const rect = node.getBoundingClientRect();
					setTip({
						text,
						keys: props.shortcut && props.shortcut.keys ? props.shortcut.keys : "",
						top: rect.bottom + 6,
						left: Math.max(8, Math.min(rect.left, (window.innerWidth || 0) - 288)),
					});
				};
				const hideTip = () => setTip(null);

				const run = async (appId) => {
					if (busy) return;
					setBusy(true);
					const ok = await requestOpenInApp(appId, props.path);
					setBusy(false);
					if (ok) return;
					seqRef.current += 1;
					setToast({ seq: seqRef.current, text: translate("openInFailed") });
				};

				const chooseApp = (appId) => {
					setOpen(false);
					setTip(null);
					setChoice(appId);
					rememberOpenInChoice(appId);
					run(appId);
				};

				const openMenu = () => {
					setTip(null);
					const node = rootRef.current;
					if (node && typeof node.getBoundingClientRect === "function") {
						const rect = node.getBoundingClientRect();
						setMenuRect({ top: rect.bottom + 6, right: Math.max(8, (window.innerWidth || 0) - rect.right) });
					} else {
						setMenuRect({ top: 8, right: 8 });
					}
					const index = options.findIndex((item) => item.id === preferred.id);
					setActiveIndex(index < 0 ? 0 : index);
					setOpen(true);
				};

				const onMenuKeyDown = (event) => {
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						const step = event.key === "ArrowDown" ? 1 : -1;
						setActiveIndex((previous) => (previous + step + options.length) % options.length);
						return;
					}
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						const item = options[activeIndex];
						if (item) chooseApp(item.id);
					}
				};

				const menu = open ? react_dom.createPortal(react.createElement("div", {
					className: "sp-oa-menu",
					role: "menu",
					ref: menuRef,
					"data-sp-open-in-menu": "",
					style: menuRect ? { top: menuRect.top + "px", right: menuRect.right + "px" } : { top: "8px", right: "8px" },
					onKeyDown: onMenuKeyDown,
				}, options.map((item, index) => {
					const selected = item.id === preferred.id;
					return react.createElement("button", {
						key: item.id,
						type: "button",
						role: "menuitemradio",
						className: "sp-oa-item",
						"aria-checked": selected ? "true" : "false",
						"data-active": index === activeIndex ? "true" : undefined,
						"data-sp-open-in-app": item.id,
						onClick: () => chooseApp(item.id),
						onPointerEnter: () => setActiveIndex(index),
					},
					react.createElement("span", { className: "sp-oa-check", "aria-hidden": "true" }, selected ? react.createElement(OpenInCheckIcon, null) : null),
					react.createElement(OpenInAppIcon, { source: item.icon, size: 14 }),
					react.createElement("span", { className: "sp-oa-label" },
						selected ? interpolate(translate("openInDefault"), { app: item.label }) : item.label));
				})), document.body) : null;

				const tooltip = tip === null ? null : react_dom.createPortal(react.createElement("div", {
					className: "sp-tip",
					role: "presentation",
					style: { top: tip.top + "px", left: tip.left + "px" },
				},
				react.createElement("span", null, tip.text),
				tip.keys ? react.createElement("span", { className: "sp-tip-keys" }, tip.keys) : null), document.body);

				const toastNode = toast === null ? null : react_dom.createPortal(react.createElement("div", {
					className: "sp-toast",
					role: "status",
					"data-sp-open-in-toast": "",
				}, toast.text), document.body);

				return react.createElement(react.Fragment, null,
					react.createElement("div", {
						className: "sp-split",
						"data-sp-split": "open-in-app",
						"data-state": disabled ? "busy" : "idle",
						ref: rootRef,
					},
					react.createElement("button", {
						type: "button",
						className: "sp-split-main",
						"aria-label": primaryLabel,
						"aria-keyshortcuts": props.shortcut && props.shortcut.aria ? props.shortcut.aria : undefined,
						disabled,
						onClick: () => { run(preferred.id); },
						onPointerEnter: () => showTip(primaryLabel),
						onPointerLeave: hideTip,
						onFocus: () => showTip(primaryLabel),
						onBlur: hideTip,
					}, react.createElement(OpenInAppIcon, { source: preferred.icon, size: 13 })),
					react.createElement("button", {
						type: "button",
						className: "sp-split-more",
						"aria-haspopup": "menu",
						"aria-expanded": open ? "true" : "false",
						"aria-label": translate("openInMore"),
						disabled,
						onClick: () => { if (open) setOpen(false); else openMenu(); },
						onPointerEnter: () => showTip(translate("openInMore")),
						onPointerLeave: hideTip,
						onFocus: () => showTip(translate("openInMore")),
						onBlur: hideTip,
					}, react.createElement(OpenInChevronIcon, null))),
					menu,
					tooltip,
					toastNode);
			}

			// 席位注册放在组件定义之后，避免 ctx.inject 同步回调时的暂时性死区。
			ctx.slots.inject("conversation.hero.options", () => ctx.slots.register({
				name: "conversation.hero.options",
				id: OPEN_IN_ENTRY_ID,
				order: OPEN_IN_ENTRY_ORDER,
				label: () => t("openInTitle"),
				locale: NS,
				inject: (sessionId) => ({ sessionId, __ctx: ctx }),
			}, OpenInSessionButton));

			// 离线测试接缝：open-in-app 的纯逻辑与路由常量（详见 exports.__internals）。
			Object.assign(exports.__internals, {
				OPEN_IN_APPS_ROUTE,
				OPEN_IN_ICON_ROUTE,
				OPEN_IN_OPEN_ROUTE,
				OPEN_IN_CHOICE_KEY,
				OPEN_IN_OFFICIAL_CHOICE_KEY,
				OPEN_IN_ENTRY_ID,
				OPEN_IN_ENTRY_ORDER,
				OPEN_IN_CLUSTER_GAP,
				OPEN_IN_MIN_LEFT,
				OPEN_IN_CLUSTER_SELECTORS,
				placeClusterButton,
				hasOfficialSwitch: () => OfficialSwitch !== null,
				FEATURE_ROWS,
				openInApps,
				createAppsSource,
				readOpenInChoice,
				rememberOpenInChoice,
				appLabelOf,
				panelExpandedNow,
				openInVisible,
				requestOpenInApp,
			});
		}

		// ───────── vendor: dsh-codex-effort-slider 1.1.3 (MIT) ─────────
		// 功能 4 的客户端核心取自上游 dsh-codex-effort-slider@1.1.3（见 NOTICE.md），
		// 按本次迁移决策只做了最小改造，全部改造点在本段内以「迁移改造」标注：
		//   · 固定「完整」动画与「亮白显示已到达档位」的刻度点；
		//   · 删除右键设置面板、浏览器本地存储设置、逐帧诊断；
		//   · 文案改走宿主注入的 tr() 钩子（宿主未注入时回退上游中文原文）；
		//   · 样式不再自带 <style>，改由本插件的 styles effect 统一安装。
		// 其余行为与上游一致；后续同步上游时可按本段整体替换后重做上述改造。
		const effortSliderVendor = (() => {

    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");
    var ReactDOM = require("react-dom");


    /* 迁移改造：文案解析钩子。宿主未注入时回退到上游中文原文（离线测试也走回退）。 */
    var translator = null;
    function tr(key, fallback, params) {
      try {
        if (typeof translator !== "function") return fallback;
        var text = translator(key, params || null);
        return typeof text === "string" && text.length > 0 ? text : fallback;
      } catch (error) {
        return fallback;
      }
    }

    var PACKAGE_ID = "dsh-codex-effort-slider";
    /** 仍然注册一个（不可见的）插槽条目：它是**每会话**拿到 sessionId 与 ctx 的立足点。 */
    var SLOT_NAME = "conversation.input.right";
    var ENTRY_ID = "codex-effort-slider";
    var ENTRY_ORDER = 40;
    /** 「加高那一栏的上下距离」。 */
    var ROW_PADDING_BLOCK = "10px";
    /** 官方那一行的中文/英文文案（形状锚点之一；认不出就按官方固定顺序取第 2 个 menuitem）。 */
    var EFFORT_ROW_LABELS = ["推理等级", "Effort"];
    /** 拖动期间的写回降频窗口（毫秒）。松手一律立即落地。 */
    var COMMIT_THROTTLE_MS = 120;
    /** 提交后等宿主真实回报的上限；超时回滚并提示，不继续假装已生效。 */
    var COMMIT_DEADLINE_MS = 10000;
    /** 目录解析失败时的退避重试序列（毫秒，累计约 9 秒）。 */
    var RETRY_DELAYS = [60, 240, 540, 960, 1500, 3000, 3000];
    var STYLE_MARKER = PACKAGE_ID;

    /* ── 尺寸与速率常量：**必须声明在 CSS 数组之前**，因为样式表要插值它们 ──
       （踩过一次：CSS 数组先于常量求值，样式里写进去的是 `height:undefinedpx`，
       真机上轨道会塌成 0 高。测试里对轨道高/旋钮直径的断言就是为这个加的。） */
    /** 轨道高度（px）。旋钮直径与它相同 —— 一个"管子里的球"，圆永远是完整的圆。 */
    var TRACK_HEIGHT = 28;
    var KNOB_SIZE = TRACK_HEIGHT;
    /** 旋钮半径。圆心在两端各留出这个半径，圆圈才不会顶出轨道被菜单裁掉。 */
    var KNOB_RADIUS = KNOB_SIZE / 2;
    /** 全局速率倍数（用户要求：所有速度 ×4）。粒子时长 = 基准时长 ÷ (本值 × speedFor)。 */
    var BASE_SPEEDUP = 4;
    /**
     * 星空的**基准横穿时长**（秒，越大越慢）与各星时长浮动（± 这个比例）。
     * 基准对应"位置速率最快的那一档"（speedFor 的上限 `MAX_SPEED_FACTOR = 2`）：MAX 档 1.5s，
     * high 档（1×）3s，左端（0.35×）约 8.6s —— 速度随位置变化这条一直保留。
     * 浮动压到 ±8%（速度差 1.16×）：原来用 0.95~2.05s（速度差 2.16×）时快星会追上慢星成团。
     */
    var STARFIELD_DURATION_MEAN = 1.5;
    var STARFIELD_DURATION_SPREAD = 0.08;
    /** MAX 档星空的亮度/大小下限（1 = 现在的大小与亮度，即上限）。 */
    var STARFIELD_MIN = 0.5;
    /** 黄金比：把 22 颗星的高度与相位按低差异序列铺开（见 buildParticles / starDelayFor）。 */
    var GOLDEN_RATIO = 0.6180339887498949;
    /** 位置速率的上限（= speedFor 的封顶值），用来把"最快那一档"和基准时长对齐。 */
    var MAX_SPEED_FACTOR = 2;
    /** 系统开启「减少动态效果」时，星星时长乘这个倍数（放缓而不是冻住）。 */
    var REDUCED_MOTION_SLOWDOWN = 2.6;
    /** 相位相邻的两颗星，高度至少差这么多"槽"（1 槽 = 4% 轨道高）——防止并成一坨。 */
    var MIN_HEIGHT_SLOTS = 3;
    /** 能量段起点：第二档的刻度位置（4 档模型 → 1/3）。这一段以前是纯蓝，之后才渐入紫色。 */
    var ENERGY_START = 1 / 3;
    /** 颜色锚点：紫出现在这里（4 档模型 → high 档）。 */
    var ENERGY_END = 2 / 3;

    /** 蓝 → 紫 → 深紫（"第一档到第二档为蓝色，再往右逐渐变紫变深"）。 */
    var COLOR_BLUE = [77, 147, 248];
    var COLOR_VIOLET = [147, 51, 234];
    var COLOR_DEEP = [76, 29, 149];
    /**
     * 数值文字（"Max"）用的亮紫终点。
     * 文字不能像填充那样收到深紫（`COLOR_DEEP` 在深色底上几乎看不见），所以另给一个亮端；
     * 但也不能太亮 —— 实测 `#c084fc` 在**浅色主题**下对比度只有 2.6:1（发虚），
     * 所以取中档紫罗兰 `#8b5cf6`：对白底 ≈4.2:1、对深色底（#1b1c20）≈4.0:1，两种主题都读得清。
     */
    var COLOR_TEXT_VIOLET = [139, 92, 246];

    /* ════════════════════════════ 样式 ════════════════════════════ */

    /*
     * 颜色一律走 DSH 自己的设计令牌（`--dsw-*`），浅色/深色自动跟随。
     * 蓝色强调色用 `--dsw-alias-state-business-primary`（深色下 = deepseek-400 #7aaaff），
     * 回退到 blue-450 #4d93f8 —— 也就是参考图里那条轨道的蓝。
     */
    var FILL_RADIUS = "border-radius:" + KNOB_RADIUS + "px 0 0 " + KNOB_RADIUS + "px";
    var CSS = [
      /* 注入进官方那一行的容器：折行到第二行并铺满整行 */
      ".ces-inline{--ces-accent:var(--dsw-alias-state-business-primary,var(--dsw-static-blue-450,#4d93f8));box-sizing:border-box;flex-basis:100%;width:100%;min-width:0}",
      ".ces-track{position:relative;box-sizing:border-box;height:" + TRACK_HEIGHT + "px;margin-top:2px;border-radius:999px;background:var(--dsw-alias-border-l1,rgba(15,17,21,.08));cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}",
      ".ces-track:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--ces-accent));outline-offset:2px}",
      ".ces-fill{position:absolute;top:0;bottom:0;left:0;" + FILL_RADIUS + ";pointer-events:none}",
      ".ces-tick{position:absolute;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:rgba(128,128,128,.30);background:color-mix(in srgb,var(--dsw-alias-label-primary,#0f1115) 26%,transparent);pointer-events:none}",
      ".ces-tick[data-on='1']{background:rgba(255,255,255,.5)}",
      /* 旋钮直径 = 轨道高度（"与滑条同宽"）：圆完整地填满管口，不会出现被裁出的平边。 */
      ".ces-knob{position:absolute;top:50%;width:" + KNOB_SIZE + "px;height:" + KNOB_SIZE + "px;margin:" + (-KNOB_RADIUS) + "px 0 0 " + (-KNOB_RADIUS) + "px;border-radius:50%;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.34),0 0 0 .5px rgba(0,0,0,.06);pointer-events:none}",
      ".ces-error{margin-top:6px;font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary,#e5484d)}",
      /* ── 最高档能量层（纯视觉：紫色星云 + 星尘粒子 + 扫光）─────────────────
         强度由 `--ces-energy`(0..1) 一个变量驱动：外层只做 opacity/box-shadow，
         所以"渐入"是浏览器合成的颜色插值，不需要 JS 逐帧改样式。
         关掉时把粒子动画 `animation-play-state: paused`，不让 22 个隐形元素白烧 GPU。 */
      ".ces-inline[data-energy='1'] .ces-track{box-shadow:0 0 calc(var(--ces-energy,0) * 16px) rgba(168,85,247,.5)}",
      ".ces-inline[data-energy='0'] .ces-star,.ces-inline[data-energy='0'] .ces-energy__sweep{animation-play-state:paused}",
      /* 能量层只覆盖**已填充那一段**（宽度与填充相同）：档位右边没到的部分不显示能量条。
         左端从 0 起、宽度由内联样式给（= 到旋钮圆心），所以它跟着旋钮一起长。 */
      ".ces-energy{position:absolute;top:0;bottom:0;left:0;" + FILL_RADIUS + ";overflow:hidden;pointer-events:none;opacity:var(--ces-energy,0);transition:opacity .2s ease;background:linear-gradient(90deg,#3b1178 0%,#6d28d9 30%,#9333ea 62%,#c084fc 100%)}",
      /* 星星单独一层：**不跟着星云淡入**（否则 high 档会被星云的 0.5 透明度压得看不见）。
         几何与星云层相同（贴着已填充段、圆角裁切），透明度由内联样式给。 */
      ".ces-stars{position:absolute;top:0;bottom:0;left:0;" + FILL_RADIUS + ";overflow:hidden;pointer-events:none;transition:opacity .2s ease}",
      /* 星空（**所有出现粒子的档位都用这一套**）：外层是**整轨宽度**的轨道
         （它自己在做 -100% 的连续横穿），内层圆点的亮度/大小由 --ces-b 决定（越亮越大）。
         残影只在两端淡出，而那两端在可视区外，所以看起来粒子"从不消失"。

         ⚠️ 时长与相位**直接内联**写在元素上（见组件的 animationDuration / animationDelay），
         不走 CSS 变量：实测把 `animation-delay:var(--ces-delay)` 写在样式表里时，
         真宿主里负相位不生效 —— 结果是"一打开所有星星挤在起点，十几秒后才靠速度差散开"。
         `--ces-b`（亮度/大小）只是不参与动画计时的普通变量，留着没问题。 */
      ".ces-star{position:absolute;left:0;right:0;height:3px;margin-top:-1.5px;pointer-events:none;animation-name:ces-star-sweep;animation-timing-function:linear;animation-iteration-count:infinite}",
      ".ces-star__dot{position:absolute;left:100%;top:0;width:3px;height:3px;margin-left:-1.5px;border-radius:50%;background:#fff;box-shadow:0 0 4px rgba(255,255,255,.85);opacity:var(--ces-b,1);transform:scale(var(--ces-b,1))}",
      "@keyframes ces-star-sweep{0%{transform:translate3d(0,0,0);opacity:0}6%{opacity:1}94%{opacity:1}100%{transform:translate3d(-100%,0,0);opacity:0}}",
      ".ces-energy__sweep{position:absolute;inset:0;background:linear-gradient(100deg,transparent 18%,rgba(255,255,255,.30) 50%,transparent 82%);transform:translateX(100%);animation:ces-sweep 2.4s linear infinite}",
      "@keyframes ces-sweep{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}",
      "body[data-ds-dark-theme] .ces-star__dot{background:#f5f3ff;box-shadow:0 0 5px rgba(216,180,254,.95)}",
      /* 系统要求「减少动态效果」时**放缓**而不是冻住：收起扫光。
         星星的放缓在 JS 里算（时长 × REDUCED_MOTION_SLOWDOWN）—— 不走 CSS 媒体查询，
         因为时长现在是内联的，也免得再引入"变量参与动画计时"这类坑。 */
      "@media (prefers-reduced-motion: reduce){.ces-energy{transition:none}.ces-energy__sweep{display:none}}",
      /* 设置面板（挂在 body 上，样式必须是全局的） */
      /* 「已到达档位的刻度点」：dim = 与未到达同色；hidden = 隐藏 */
      ".ces-inline[data-reached-ticks='dim'] .ces-tick[data-on='1']{background:rgba(128,128,128,.30);background:color-mix(in srgb,var(--dsw-alias-label-primary,#0f1115) 26%,transparent)}",
      ".ces-inline[data-reached-ticks='hidden'] .ces-tick[data-on='1']{display:none}",
    ].join("\n");

    /** 把样式挂进文档。加载器会把它认领为「本插件产出的 style」（HMR 卸载时一并清理）。 */
    function installStyles() {
      try {
        if (typeof document === "undefined" || !document.head) return null;
        var existing = document.querySelector('style[data-plugin-css="' + STYLE_MARKER + '"]');
        if (existing) return existing;
        var style = document.createElement("style");
        style.setAttribute("data-plugin-css", STYLE_MARKER);
        style.textContent = CSS;
        document.head.appendChild(style);
        return style;
      } catch (error) {
        /* 样式失败只影响观感，绝不影响功能 */
        return null;
      }
    }

    /* ───────── 实例所有权与档位缓存（上游原有，改为保留下来的最小集合）───────── *
     * 上游把这几项和设置面板写在同一段里；迁移时设置面板整段移除，但这四项是
     * 组件渲染与档位缓存真正依赖的模块级状态，必须原样保留。
     */
    var __cesInstanceSeq = 0;
    var __cesOwnerToken = {};
    var __cesDecided = false;
    var __cesIsOwner = false;
    var __levelsCache = { key: null, levels: [] };
    var __levelsCacheHit = false;

    /* ════════════ 动画模式与诊断（迁移改造：固定「完整」动画）════════════ *
     *
     * 迁移决策：不迁移上游的右键设置面板、浏览器本地存储设置与三档动画切换。
     * 因此这里不再有配置 schema / 读写盘 / 逐帧诊断，只保留调用点需要的三个函数：
     *   · 动画固定为上游默认的「完整」参数（MOTION）；
     *   · 刻度点固定为「亮白显示已到达档位」；
     *   · tracePush 保留为空实现，使上游的调用点零改动。
     */
    function readSettings() { return { motion: "full", reachedTicks: "highlight" }; }
    function motionMode() { return "full"; }
    function motionParamsForMode() { return MOTION; }
    function tracePush() {}

    /* ════════════════════════ 纯函数（可离线单测）════════════════════════ */

    var EMPTY_SNAPSHOT = Object.freeze({
      current: null,
      groups: [],
      failures: [],
      status: "idle",
      pending: null,
      error: null,
      retainedEffort: undefined,
    });

    /** 在目录快照里找到当前模型条目（groups[].models[]）。 */
    function modelOf(state) {
      var current = state && state.current;
      if (!current || typeof current.provider !== "string" || typeof current.model !== "string") return null;
      var groups = state && Array.isArray(state.groups) ? state.groups : [];
      for (var i = 0; i < groups.length; i += 1) {
        var group = groups[i];
        if (!group || group.id !== current.provider) continue;
        var models = Array.isArray(group.models) ? group.models : [];
        for (var j = 0; j < models.length; j += 1) {
          if (models[j] && models[j].id === current.model) return models[j];
        }
      }
      return null;
    }

    /** 当前模型真实可用的档位列表（官方 id + 官方显示名，按目录顺序）。 */
    function levelsOf(state) {
      var model = modelOf(state);
      var efforts = model && model.reasoning && Array.isArray(model.reasoning.efforts) ? model.reasoning.efforts : [];
      var out = [];
      for (var i = 0; i < efforts.length; i += 1) {
        var effort = efforts[i];
        if (!effort || typeof effort.id !== "string" || effort.id.length === 0) continue;
        out.push({
          id: effort.id,
          name: typeof effort.name === "string" && effort.name.length > 0 ? effort.name : effort.id,
        });
      }
      return out;
    }

    /**
     * 解析"本次渲染真正可用的档位列表"：
     *   活列表非空 → 更新缓存并返回它；
     *   活列表为空 → 若缓存属于同一模型（或身份未知），用缓存兜底；否则返回空。
     * 纯函数 + 显式传入缓存，便于单测（见 test/client.test.mjs 第 49 节）。
     */
    function resolveLevels(liveLevels, liveKey, cache) {
      if (liveLevels.length > 0) {
        cache.key = liveKey;
        cache.levels = liveLevels;
        return liveLevels;
      }
      var sameModel = liveKey === null || cache.key === null || liveKey === cache.key;
      if (cache.levels.length > 0 && sameModel) return cache.levels;
      return liveLevels;
    }

    /**
     * 当前**生效**的档位 id：显式设置优先；没设置过就是模型的默认档
     * （与官方 `syncInputs()` 的 `effort = intended.reasoningEffort ?? reasoning.defaultEffort` 同款）。
     */
    function effectiveEffortId(state) {
      var current = state && state.current;
      if (current && typeof current.reasoningEffort === "string" && current.reasoningEffort.length > 0) {
        return current.reasoningEffort;
      }
      var model = modelOf(state);
      var fallback = model && model.reasoning && model.reasoning.defaultEffort;
      return typeof fallback === "string" && fallback.length > 0 ? fallback : null;
    }

    function indexOfLevel(levels, id) {
      if (typeof id !== "string") return -1;
      for (var i = 0; i < levels.length; i += 1) if (levels[i].id === id) return i;
      return -1;
    }

    function clamp01(value) {
      if (!(value > 0)) return 0; // 同时挡住 NaN
      return value > 1 ? 1 : value;
    }

    /** 百分比 → 最近档位下标（滑条连续，档位离散，所以必须吸附）。 */
    function indexFromPct(pct, count) {
      if (count <= 1) return 0;
      return Math.max(0, Math.min(count - 1, Math.round(clamp01(pct) * (count - 1))));
    }

    /** 档位下标 → 该档位在轨道上的百分比（刻度点与旋钮永远对齐）。 */
    function pctFromIndex(index, count) {
      // ⚠️ 只有一档时**直接拉满**（issue #7）：那一档就是"最大"，不是"最左/off"。
      //    count === 0（档位还没就绪）仍返回 0 —— 否则空列表会把旋钮甩到最右。
      if (count <= 0) return 0;
      if (count === 1) return 1;
      var safe = Math.max(0, Math.min(count - 1, index));
      return safe / (count - 1);
    }

    /** 「一档一格」的判定阈值：向前只越过 1/3 档距，向后要退回 2/3（滞回，防抖）。 */
    var DETENT_THIRD = 1 / 3;

    /**
     * 快速动画（Codex 手感）的档位判定（纯函数，便于单测）：
     *   pos   —— 指针在「档位坐标」上的连续位置，0 … count-1（不是百分比）
     *   cur   —— 当前停在第几格
     *   count —— 档位数
     * 规则：pos ≥ cur + 1/3 才向上（拖得快可一次跨多格）；pos ≤ cur − 2/3 才向下；否则不动。
     */
    function detentTargetIndex(pos, cur, count, third) {
      if (count <= 1) return 0;
      var th = (typeof third === "number" && third > 0 && third < 0.5) ? third : 1 / 3;
      var lo = Math.max(0, Math.min(count - 1, typeof cur === "number" ? cur : 0));
      var p = Math.max(0, Math.min(count - 1, pos));
      if (p >= lo + th) return Math.min(count - 1, Math.max(lo + 1, Math.round(p)));
      if (p <= lo - (1 - th)) return Math.max(0, Math.min(lo - 1, Math.round(p)));
      return lo;
    }

    /* ══════════════ 连续运动引擎（刹车预测 + 速度跟踪）══════════════
     *
     * 核心不变量：**目标可以突变，运动状态（位置 x / 速度 v / 加速度 a）不可以。**
     * 用户操作（按下 / 拖动 / 松手 / 键盘）只改 `m.target`，**绝不碰 x / v / a**。
     *
     * 早先几版都在"时长 + 缓动曲线"里打转（200ms ease-in-out → 80ms ease-out →
     * 追赶窗口），怎么调都不对。根因是：CSS transition 在目标变化时**必然重播
     * 一条固定曲线**，做不到"只换目标、不换运动状态"，于是永远在"取消旧动画 →
     * 播新动画"之间切换，视觉上就是"本来在减速突然又开始加速"的割裂感。
     *
     * ── 运动律：两步 ──
     *
     *   第 1 步：**由位置误差算出"期望速度"**（两个映射取小）
     *       v期望 = sign(e) · min( K·|e| , √(2·A·|e|) , vmax )
     *
     *   第 2 步：**由速度差算出加速度**（连续跟踪，不是 bang-bang）
     *       a = clamp(k · (v期望 − v), ±amax)
     *       v = clamp(v + a·dt, ±vmax);   x = x + v·dt
     *
     * ⚠️ **必须同时有那两项，只留刹车曲线会抖振**（实测定论，别重犯）：
     *   `√(2A|e|)` 是 **bang-bang 的切换曲线**，含义是"在**恒力 A 减速**下还能
     *   刹停的速度上限"，它和 `a = ±A` 是**一对**。一旦力律换成连续的
     *   `a = k(v期望 − v)`，就丢掉了"力恒定为 A"这个前提：
     *     · v期望 自身随 e→0 而下降，v 永远追不上一条持续下降的曲线
     *     · 到目标时仍有残速 → 冲过去 → e 变号 → v期望 反向 → 又冲回来
     *   实测只留 `√(2Ae)` 当速度目标：目标 0.5 时 **v 符号翻转 973 次、永不收敛**。
     *
     *   所以 `K·|e|` 才是**为连续力律设计的**位置→速度映射；`√(2A|e|)` 降级为
     *   **上限**（"别快过刹得住的速度"）。两者取小后实测零抖振、全部精确落点。
     *
     * ── 参数（四个旋钮）──
     *   K    = 位置→速度映射增益（1/s）。决定"离目标多远时想跑多快"。
     *   A    = 刹车斜率，只作速度上限。同时决定反向滑行距离 ≈ v²/(2A)。
     *   k    = 速度跟踪增益（1/s）。越大越接近 bang-bang（力陡），越小越柔和。
     *   vmax = 速度上限。
     *
     * 实测标定（真实事件率 125Hz + 帧 60Hz，行程 = 1.0）—— K=20 A=120 k=40 vmax=6：
     *
     *     指标                        本版      弹簧阻尼版   纯 bang-bang
     *     小幅动 10px 后的"弹"        0.28px    7.11px      0.00px
     *     召唤到 1%                   ~200ms    333ms       217ms
     *     过冲（各距离）              ≤0.2px    0.00px      0.00px
     *     各距离精确落点              全部 ✓    全部 ✓      全部 ✓
     *     抖振（v 符号翻转）          0         0           需要 16 子步抑制
     *
     * ⚠️ 两个实测确认"别加"的东西：
     *   1) **不要加加加速度(jmax)限幅**：会拖慢力对"预测切换时机"的响应，
     *      反而把弹从小到大（在 bang-bang 版上实测 0.32 → 1.40px）。
     *   2) **不要加指针速度前馈**：本律只看 x 与 v；叠前馈会把拖动领先放大
     *      （在 bang-bang 版上实测 1.0 → 4.6px）。
     *
     * ⚠️ 边界处理：位置夹住时必须同时把朝外的速度停住，否则会在端点"顶住"抖动。
     */
    var MOTION = {
      K: 20,       // 位置→速度映射增益（1/s）
      A: 120,      // 刹车斜率（pct/s²）：只作速度上限；反向滑行 ≈ v²/(2A)
      k: 40,       // 速度跟踪增益（1/s）
      amax: 240,   // 加速度上限（pct/s²，安全阀）
      vmax: 6,     // 速度上限（pct/s）
      epsX: 0.0015, // 到位判定：位置误差阈值
      epsV: 0.02,   // 到位判定：速度阈值
    };
    /** 「简洁动画」：比完整更干脆，但**必须稳定**（见下方警告）。 */
    var MOTION_REDUCED = {
      K: 40, A: 300, k: 40, amax: 200, vmax: 7,
      epsX: 0.0015, epsV: 0.02,
    };
    /* ⚠️⚠️ 参数稳定性硬约束（issue #12 的真因，别再犯）：
     *
     *   旧参数 { K:120, A:600, k:200, amax:1200, vmax:20 } 会**自激振荡** ✗：
     *   `amax × 每帧时长 = 1200 ÷ 60 = 20`，**正好等于 vmax** →
     *   速度能在一帧内从 +20 翻到 -20 → 位置每帧摆动 ±20/60 = **±0.333** ✗
     *   → 实测就是 issue #12 里"33.6% 前后跳、215 次单帧跳变" ✓（eff 却恒为 0.5 ✗）。
     *
     *   判据：**`amax × (1/60) ≤ 0.5 × vmax`**（60fps 下速度一帧最多变半档），
     *   否则控制器退化成 bang-bang（全速正反打），小幅调整也会抖。
     *   下面三组都满足：
     *     MOTION        amax 240 / 60 = 4    ≤ 0.5 × 6  = 3   ≈ 临界（够用）
     *     MOTION_REDUCED amax 200 / 60 = 3.3 ≤ 0.5 × 7  = 3.5 ✓
     *     MOTION_FAST   amax 300 / 60 = 5    ≤ 0.5 × 10 = 5   ✓
     */
    /**
     * 「快速动画」(fast) —— 复刻 Codex 桌面版的手感（2026-10-17 从 60fps 录屏逐帧量得）：
     *   · **不跟手**：旋钮停在档位格上，不随指针连续移动（见 moveTo 的 fast 分支）；
     *   · 越过「当前格 + 1/3」才切下一格、越过「当前格 − 2/3」才回上一格（滞回，见 detentTargetIndex）；
     *   · 吸附**很快**：实测半条轨道约 67ms（≈4 帧 @60fps）；
     *   · **无回弹**：落点后只留极小残差（视频实测 ≈±1%）。
     * 参数是手算+测试校出来的：vmax 10 / A 500 的刹车距离刚好覆盖，k·amax 让速度一帧最多变 5，
     * 所以小幅移动（0.2→1/3）3 帧到位、半条轨道 4~5 帧到位，**都不过冲**。
     * ⚠️ 别再把 amax/k 调大：a·dt 会接近 vmax，变成 bang-bang → 小幅移动会来回振荡（实测过）。
     */
    var MOTION_FAST = {
      K: 60, A: 500, k: 60, amax: 300, vmax: 10,
      epsX: 0.0015, epsV: 0.02,
    };
    /** 松手落点外推时长（秒）：带着动量滑向它正要去的档位（"快滑跳过中间点"）。
     *  实测：这是指针速度的**连续函数**（v→0 时外推量→0），所以**不需要任何门槛**；
     *  1489 组样本中外推改变落点时 100% 顺着运动方向。速度抖动用 EMA 平滑即可。 */
    /** 松手外推时长（秒）。
     *  ⚠️ 实测诊断结论（两份 trace）：**任何非零外推都可能把落点推到另一档** ——
     *    指针可以停在档位区间内的任何位置（例如 31.3% 属于档位 1），
     *    而 0.04s × 最大指针速度(6/s) = 0.24，远大于"到区间边界的距离"，
     *    于是 releaseIndexFor 落到**档位 0**：滑条滑到 0% 后再跳回本体的 33.3% = 抽搐。
     *    预览页手感好，正是因为它的 vPtr 基本为 0（= 不外推）。
     *    故置 0（灵敏度关闭）；要重新启用惯性，必须先解决"外推不得跨档"。 */
    var RELEASE_PROJECT_S = 0;
    /** 指针速度 EMA 系数：防抖（松手瞬间鼠标微抖会让 vPtr 跳变）。非门槛。 */
    var POINTER_SPEED_EMA = 0.4;
    /**
     * 指针速度的"保鲜期"（秒）：超过这段时间没有新的 pointermove，就认为指针已停。
     * 2 帧 ≈ 33ms —— 足够容忍 60Hz 的 pointermove 间隔，又能及时判定"停住"。
     */
    var POINTER_STALE_S = 2 / 60;
    /** 指针速度陈旧后的衰减时间常数（秒）。30ms 实测：停住后偏移从 13.33% 降到 0.08%。 */
    var POINTER_SPEED_TAU = 0.03;
    /** 单帧 dt 上限（秒）：切标签/卡顿后回来时不要一帧跳一大段。 */
    var MAX_FRAME_DT = 0.05;

    function clampAbs(value, limit) {
      if (value > limit) return limit;
      return value < -limit ? -limit : value;
    }

    /**
     * 运动引擎单步演化（纯函数，原地修改 m，返回 m）。
     * 抽成纯函数是为了让测试能**注入固定 dt 精确断言**（零过冲/精确落点/收敛），
     * 不依赖真实时钟。
     *
     * @param m  { x, v, a, target } —— a 只是"本帧算出的加速度"，便于断言与调试
     * @param dt 秒
     * @param p  参数组（MOTION / MOTION_REDUCED）
     */
    function motionStep(m, dt, p) {
      // 1) 由**位置误差**算出「期望速度」——两个映射取小：
      //    · K·|e|        ：线性"位置→速度"映射，**这是为连续力律设计的**
      //    · √(2·A·|e|)   ：刹车预测上限（"以当前距离最多还能多快"）
      //    · vmax         ：硬上限
      var e = m.target - m.x;
      var vAbs = p.K * Math.abs(e);
      var brake = Math.sqrt(2 * p.A * Math.abs(e));
      if (brake < vAbs) vAbs = brake;
      if (vAbs > p.vmax) vAbs = p.vmax;
      var vDesired = e > 0 ? vAbs : (e < 0 ? -vAbs : 0);
      // 2) 由**速度差**算出加速度（连续跟踪）
      m.a = clampAbs(p.k * (vDesired - m.v), p.amax);
      // 3) 积分
      m.v = clampAbs(m.v + m.a * dt, p.vmax);
      // 3b) **防过冲**（issue #12 的另一半）：这一帧按速度要走出的位移如果已经 ≥ 剩余距离，
      //     说明目标就在这一帧之内 —— 直接精确落在目标上。
      //     否则帧量化会让人冲到目标外侧再弹回来（实测快速档回弹 3.33%，视频里只有 ±1%）。
      if (e !== 0 && Math.abs(m.v * dt) >= Math.abs(e)) {
        m.x = m.target;
        m.v = 0;
        m.a = 0;
        return m;
      }
      var xRaw = m.x + m.v * dt;
      var xClamped = xRaw < 0 ? 0 : (xRaw > 1 ? 1 : xRaw);
      // 4) 边界：位置夹住时**必须同时停住朝外的速度**，否则会在端点顶住抖动
      if (xClamped !== xRaw && ((xClamped === 0 && m.v < 0) || (xClamped === 1 && m.v > 0))) {
        m.v = 0;
        m.a = 0;
      }
      m.x = xClamped;
      // 5) 收口：到位时对齐目标（消除浮点残差，否则帧循环会为 1e-6 一直转）
      if (motionSettled(m, p)) { m.x = m.target; m.v = 0; m.a = 0; }
      return m;
    }

    /** 是否已到位（位置与速度都足够小）→ 可以停掉帧循环，不空转。 */
    function motionSettled(m, p) {
      return Math.abs(m.target - m.x) < p.epsX && Math.abs(m.v) < p.epsV;
    }

    /**
     * 指针速度的**陈旧衰减**（纯函数）。
     *
     * 为什么还需要它：`vPtr` 只在 `pointermove` 里更新，而**指针停下后不再有事件** ——
     * 它会永久冻结在最后一个速度值上。`vPtr` 现在**不参与运动演化**
     * （本版运动律只看 x 与 v，没有前馈项），但**松手落点外推**仍在用它：
     *
     *     落点 = 松手位置 + vPtr × 0.08s
     *
     * 若 vPtr 陈旧，指针明明已经停住，松手却会按旧速度多推一段（实测残留 vPtr=2
     * 会多推 16% 行程、vPtr=3 多推 24%）—— 4 档模型间距 33%，足以**落错档**。
     *
     * 修法：距上次 pointermove 超过 `staleS` 后按 `tau` 指数衰减到 0。
     *
     * ⚠️ 历史：在更早的"弹簧阻尼 + 前馈"版里，陈旧的 vPtr 危害**大得多** ——
     * 前馈项 `2ζω(vPtr − v)` 会变成一个**恒定的力**，把滑块永久推到鼠标一侧
     * （实测停在右侧 13.33%），而且让到位判定永不成立、帧循环空转烧 CPU
     * （实测 2 万帧仍未收敛）。本版运动律不含前馈项，那一整类问题从机理上消失。
     *
     * @param vPtr    上次算出的指针速度
     * @param sinceS  距上次 pointermove 的秒数
     */
    function decayPointerSpeed(vPtr, sinceS, staleS, tau) {
      if (!(sinceS > staleS)) return vPtr;
      return vPtr * Math.exp(-(sinceS - staleS) / tau);
    }

    /**
     * 松手落点：目标位置 + 指针速度 × 外推时长 → 最近档位。
     * 无门槛 —— 外推量随速度连续趋于 0，慢拖天然不受影响。
     */
    function releaseIndexFor(targetPct, vPtr, count) {
      return indexFromPct(clamp01(targetPct + vPtr * RELEASE_PROJECT_S), count);
    }

    /** rAF 适配：真机走 requestAnimationFrame；测试台/无 rAF 环境降级到 setTimeout。
     *  ⚠️ 降级**必须用裸 setTimeout**：实测测试台的 window 桩里没有 setTimeout
     *  （写 window.setTimeout 会 TypeError）；也不能写裸 requestAnimationFrame
     *  （Node 没有这个全局，直接 ReferenceError 让整包挂掉）。 */
    function scheduleFrame(cb) {
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        return { raf: true, id: window.requestAnimationFrame(cb) };
      }
      return { raf: false, id: setTimeout(function () { cb(nowMs()); }, 16) };
    }
    function cancelFrame(handle) {
      if (!handle) return;
      if (handle.raf) {
        if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(handle.id);
        }
      } else {
        clearTimeout(handle.id);
      }
    }
    /** 单调时钟（performance.now 在真机与测试台都可用；退回 Date.now）。 */
    function nowMs() {
      return (typeof performance !== "undefined" && typeof performance.now === "function")
        ? performance.now() : Date.now();
    }

    function errorText(error) {
      if (error === null || error === undefined) return tr("effortErrorFailed", "档位切换失败");
      if (typeof error === "string") return error;
      if (typeof error.message === "string" && error.message.length > 0) return error.message;
      if (typeof error.code === "string" && error.code.length > 0) return error.code;
      return String(error);
    }

    /* ─────────────────── 最高档能量层：参数与强度曲线 ─────────────────── */

    /**
     * 星尘粒子（星星）：**全部由下标算出，不用随机数** —— 每次渲染完全一致、可离线断言。
     *
     * 形态 = 3px 圆点；运动 = 横穿整条轨道（右 → 左），**不消失**、没有上下飘动。
     *
     * 高度与相位**必须用两条互不相关的分配**：
     *   · 相位 = 黄金比低差异序列（任意前缀都铺得开，拖动时逐渐加星也不会挤）；
     *   · 高度 = **随机排列**的等距槽位（哈希排序，确定性），并与相位排名解耦。
     * 早期版本这两者取自同一个数 `frac((i+1)×φ)`，结果"越靠右的星越高"，22 颗排成
     * 一条斜线（用户实测反馈"太规整，再随机一点"；相关系数实测 0.999）。
     * 再挑一个满足最小间隔的盐值：**相位相邻**（会在轨道上一直并排走）的两颗
     * 高度至少差 `MIN_HEIGHT_SLOTS` 槽，避免并成一坨。
     */
    var PARTICLES = (function buildParticles() {
      var count = 22;
      var out = [];
      var i;
      for (i = 0; i < count; i += 1) {
        out.push({ y: 0, phase: (i + 1) * GOLDEN_RATIO % 1 });
      }
      // 相位排名：黄金比序列里排名相邻 = 在轨道上位置相邻
      var byPhase = [];
      for (i = 0; i < count; i += 1) byPhase.push(i);
      byPhase.sort(function (a, b) {
        return out[a].phase - out[b].phase;
      });
      // 高度槽：找一个满足"相位相邻至少差 MIN_HEIGHT_SLOTS 槽"的确定性随机排列
      var slots = null;
      for (var salt = 71; salt < 4000 && slots === null; salt += 1) {
        var candidate = [];
        for (i = 0; i < count; i += 1) candidate.push(i);
        candidate.sort(function (a, b) {
          var ha = starHash01(a, salt);
          var hb = starHash01(b, salt);
          return ha === hb ? a - b : ha - hb;
        });
        var ok = true;
        for (var k = 1; k < count && ok; k += 1) {
          if (Math.abs(candidate[k] - candidate[k - 1]) < MIN_HEIGHT_SLOTS) ok = false;
        }
        if (ok) slots = candidate;
      }
      if (slots === null) {
        // 兜底：步长 5 与 22 互质 → 一定是排列，且相邻槽恒差 5（≥ MIN_HEIGHT_SLOTS）
        slots = [];
        for (i = 0; i < count; i += 1) slots.push(i * 5 % count);
      }
      for (var rank = 0; rank < count; rank += 1) {
        out[byPhase[rank]].y = 8 + (slots[rank] / (count - 1)) * 84;
      }
      return out;
    })();

    /* 颜色常量与 ENERGY_* 都声明在文件上部的「尺寸与速率常量」块里（供 CSS 插值用），
       这里只放纯函数 —— 不要再重复声明，否则会出现"改一处漏一处"的双份真相。 */

    function mixColor(from, to, t) {
      var k = clamp01(t);
      return [
        Math.round(from[0] + (to[0] - from[0]) * k),
        Math.round(from[1] + (to[1] - from[1]) * k),
        Math.round(from[2] + (to[2] - from[2]) * k),
      ];
    }

    function rgbOf(color) {
      return "rgb(" + color[0] + "," + color[1] + "," + color[2] + ")";
    }

    /** 位置 → 填充色（当前点的颜色，也就是渐变右端的颜色）。 */
    function fillColorFor(pct) {
      var t = clamp01(pct);
      if (t <= ENERGY_START) return rgbOf(COLOR_BLUE);
      if (t <= ENERGY_END) return rgbOf(mixColor(COLOR_BLUE, COLOR_VIOLET, (t - ENERGY_START) / (ENERGY_END - ENERGY_START)));
      return rgbOf(mixColor(COLOR_VIOLET, COLOR_DEEP, (t - ENERGY_END) / (1 - ENERGY_END)));
    }

    /**
     * 位置 → 填充层的背景：**左端恒为蓝，右端（旋钮处）是当前位置的颜色**。
     * 于是 high 档自然呈现"左蓝右紫"的渐变，越往右右端越深。
     */
    function fillBackgroundFor(pct) {
      return "linear-gradient(90deg, " + rgbOf(COLOR_BLUE) + ", " + fillColorFor(pct) + ")";
    }

    /**
     * 位置 → **官方那一行数值文字**（"Max"）的颜色。
     *
     * 与能量同源：蓝 → 紫罗兰，越往右越紫（用户要求"Max 的字体颜色能不能改变"）。
     * 刻意**不跟填充末尾的深紫走** —— `COLOR_DEEP` 当文字在深色底上几乎看不见；
     * 文字需要一个亮端，所以终点用 `COLOR_TEXT_VIOLET`。
     *
     * **Off 档返回空串**：不写内联色 = 官方原本的灰（用户要求"off 档两个界面都是灰的"）。
     * 调用方直接 `style.color = valueColorFor(...)`，空串在浏览器里就是"清掉内联色"。
     */
    function valueColorFor(pct, level) {
      if (isOffLevel(level)) return "";
      return rgbOf(mixColor(COLOR_BLUE, COLOR_TEXT_VIOLET, energyFor(pct)));
    }

    /**
     * 是不是"关闭推理"那一档。
     *
     * DeepSeek 的档位表是 id `off` / name `Off`（见 `dsh-llm-deepseek/lib/index.js` 的
     * `REASONING_EFFORTS`），但 id 是 provider 自己的字符串，所以 id 和 name 都认一遍，
     * 并额外接受几个同义写法。认不出就是普通档位（照常着色）。
     */
    function isOffLevel(level) {
      if (!level) return false;
      var candidates = [level.id, level.name];
      for (var i = 0; i < candidates.length; i += 1) {
        if (typeof candidates[i] !== "string") continue;
        var flat = candidates[i].replace(/\s+/g, "").toLowerCase();
        if (flat === "off" || flat === "none" || flat === "关闭" || flat === "无") return true;
      }
      return false;
    }

    /**
     * 位置 → 能量强度 0..1（紫色星云 + 粒子的总强度）。
     * **纯位置驱动，与档位数无关**：第二档以前为 0（保持干净的蓝），之后线性渐入到最高档的 1。
     * 锚点：pct=1/3 → 0；pct=2/3（4 档模型的 high）→ 0.5；pct=1（max）→ 1。
     */
    function energyFor(pct) {
      return clamp01((clamp01(pct) - ENERGY_START) / (1 - ENERGY_START));
    }

    /**
     * 位置 → 粒子速率倍数。
     * 锚点来自实测反馈：**high 档（4 档模型的 2/3 处）= 1×（也就是现在这个速度刚刚好）**，
     * 最高档 = 2×。再往左按同一斜率降速，但设 0.35× 下限，免得左端变成静止。
     */
    function speedFor(pct) {
      return Math.min(2, Math.max(0.35, 3 * clamp01(pct) - 1));
    }

    /** 位置 → 可见粒子数（"粒子效果逐渐出现、变密集"）。 */
    function particleCountFor(pct) {
      return Math.round(energyFor(pct) * PARTICLES.length);
    }

    /* ── 星空：所有出现粒子的档位都用这一套（统一的动画）────────────────────

       运动模型：外层是一条**整轨宽度**的轨道，自己在做 `translate3d(-100%)` 的连续横穿；
       圆点在最右端出生、向左穿出，残影只在两端淡出（而那两端在可视区外）→ **从不消失**。
       每颗的亮度/大小由确定性伪随机给出（越亮越大，0.5~1），速率随**位置**变化（速度变化保留）。 */

    /** 确定性伪随机 [0,1)：不用 Math.random（可离线断言、重渲染不跳变），但看起来是随机的。 */
    function starHash01(index, salt) {
      var value = (index + 1) * salt * 2654435761 % 4294967296;
      return ((value >>> 8) % 1000) / 1000;
    }

    /** 第 index 颗粒子的亮度/大小系数，落在 [STARFIELD_MIN, 1]（越亮越大）。 */
    function starBrightnessFor(index) {
      return STARFIELD_MIN + (1 - STARFIELD_MIN) * starHash01(index, 61);
    }

    /**
     * 第 index 颗粒子横穿整条轨道的时长（s）。
     * **保留速度随位置变化**：以 speedFor 上限（MAX 档）对齐基准时长 ——
     * MAX 档 1.5s、high 档（1×）3s、左端（0.35×）约 8.6s；各星之间只差 ±8%（防追尾成团）。
     */
    function starDurationFor(index, speedFactor) {
      var speed = Math.min(MAX_SPEED_FACTOR, Math.max(0.35, typeof speedFactor === "number" ? speedFactor : MAX_SPEED_FACTOR));
      var spread = 1 - STARFIELD_DURATION_SPREAD + 2 * STARFIELD_DURATION_SPREAD * starHash01(index, 29);
      return STARFIELD_DURATION_MEAN * MAX_SPEED_FACTOR / speed * spread;
    }

    /**
     * 第 index 颗粒子的相位（负延迟，单位 s）。
     *
     * 相位用**黄金比低差异序列**铺开，而且**只跟 index 有关、跟当前显示几颗无关** ——
     * 这一点很关键：如果按 `i / 当前数量` 算，拖动过程中粒子数变化会让每颗已挂载动画的
     * `animation-delay` 被改写，按规范当前进度会按新起始时间重算，整片星空就会抖一下/重排一次。
     * 低差异序列还有个好处：**任意前缀**（前 N 颗）本身就是均匀铺开的。
     */
    function starDelayFor(index, duration) {
      var particle = PARTICLES[index];
      var phase = particle && typeof particle.phase === "number" ? particle.phase : 0;
      var jitter = starHash01(index, 53) * 0.03; // 一点点抖动，避免看起来像整齐的队列
      return -((phase + jitter) % 1) * duration;
    }

    /** 位置 → 可见星星数（"逐渐出现、变密集"）。 */
    function starCountFor(pct) {
      return particleCountFor(pct);
    }

    /**
     * 位置 → **星星层**的不透明度。
     *
     * 星星不能跟着星云一起淡入：星云层的透明度 = 能量强度，high 档只有 0.5，
     * 那么每颗星的实际不透明度会被压到 0.25~0.5，在紫色底上几乎看不见
     * （用户实测反馈："high 档一打开几乎没粒子"）。所以星星层单独给一个下限，
     * 只随能量轻微变化：high 档 0.8、MAX 档 1.0 —— "逐渐出现"交给**粒子数**去表达。
     */
    function starLayerOpacityFor(pct) {
      return 0.6 + 0.4 * energyFor(pct);
    }

    /**
     * 旋钮中心 / 填充终点 / 刻度的水平位置：`半径 + pct × (100% − 直径)`。
     * 这样 pct=0 时圆心正好落在左端圆角内、pct=1 时落在右端圆角内 —— 圆圈永远是完整的圆。
     */
    function knobOffsetOf(pct) {
      var t = Math.round(clamp01(pct) * 10000) / 10000;
      return "calc(" + KNOB_RADIUS + "px + " + t + " * (100% - " + KNOB_RADIUS * 2 + "px))";
    }

    /* ═════════════════ 官方目录访问（每会话一个，永不抛错）═════════════════ */

    /**
     * 每个会话一个访问器。它解决两件真实存在的事：
     *  1. `directoryFor(sessionId)` 在会话作用域/绑定尚未就绪时**按设计抛错**；
     *  2. 目录实例可能被重建（换模型代、连接重置），"抓一次揣着用"会变成永久坏的控件。
     * 所以每次读写都重新解析，解析失败就退避重试；订阅在一次成功解析后建立。
     */
    function createDirectoryAccess(ctx, sessionId, timers) {
      var listeners = new Set();
      var directory = null;
      var unsubscribe = null;
      var last = EMPTY_SNAPSHOT;
      var retryIndex = 0;
      var retryTimer = null;
      var closed = false;
      var lastLoadAt = 0;

      function notify() {
        var current = [];
        listeners.forEach(function (listener) { current.push(listener); });
        for (var i = 0; i < current.length; i += 1) {
          try { current[i](); } catch (error) { /* 单个订阅者抛错不影响其它订阅者 */ }
        }
      }

      function scheduleRetry() {
        if (closed || retryTimer !== null || retryIndex >= RETRY_DELAYS.length) return;
        var delay = RETRY_DELAYS[retryIndex];
        retryIndex += 1;
        retryTimer = timers.set(function () {
          retryTimer = null;
          // 解析成功后要主动通知一次：调用方（uSES）正等着 store 出现。
          if (resolve() !== null) {
            notify();
            return;
          }
          // 还没就绪就继续退避 —— 少了这一句，第一次重试失败后自愈链就永久断掉，
          // 控件会静默失效（这正是要防的那种"一次启动期抖动变成永久坏控件"）。
          scheduleRetry();
        }, delay);
      }

      /** 重新解析一次目录；实例变化时重挂订阅。返回当前目录（可能为 null）。 */
      function resolve() {
        if (closed) return null;
        var fresh = null;
        try {
          fresh = ctx.modelDirectories.directoryFor(sessionId);
        } catch (error) {
          fresh = null;
        }
        if (!fresh || !fresh.store || typeof fresh.store.getSnapshot !== "function") fresh = null;
        if (fresh === directory) return directory;
        if (unsubscribe !== null) {
          try { unsubscribe(); } catch (error) { /* 退订失败不影响新订阅 */ }
          unsubscribe = null;
        }
        directory = fresh;
        if (directory !== null) {
          retryIndex = 0;
          try {
            unsubscribe = typeof directory.store.subscribe === "function" ? directory.store.subscribe(notify) : null;
          } catch (error) {
            unsubscribe = null;
          }
          kickLoad();
        }
        return directory;
      }

      /** 主动拉一次目录（不 load 的话 store 停在 idle，档位列表是空的）。 */
      function kickLoad() {
        if (closed || directory === null || typeof directory.load !== "function") return;
        var now = Date.now();
        if (now - lastLoadAt < 400) return;
        lastLoadAt = now;
        var target = directory;
        try {
          Promise.resolve(target.load()).catch(function () { /* 失败原因由 store 的 error 字段呈现 */ });
        } catch (error) {
          /* load 同步抛：同样交给 store 状态 */
        }
      }

      return {
        getSnapshot: function () {
          if (closed) return EMPTY_SNAPSHOT;
          if (directory === null) {
            resolve();
            if (directory === null) scheduleRetry();
          }
          if (directory !== null) {
            try {
              var value = directory.store.getSnapshot();
              if (value && typeof value === "object") last = value;
            } catch (error) {
              /* 保留上一次快照，绝不把渲染打崩 */
            }
          }
          return last;
        },
        subscribe: function (listener) {
          if (closed) return function () {};
          listeners.add(listener);
          if (directory === null) {
            resolve();
            if (directory === null) scheduleRetry();
          }
          // StrictMode 会订阅/退订各跑一次；退订只清订阅，不永久关闭访问器。
          return function () {
            listeners.delete(listener);
          };
        },
        /** 取当前真正可写的目录（load/select 在调用时重新解析，避免用失效实例）。 */
        directory: function () {
          var fresh = resolve();
          return fresh !== null ? fresh : directory;
        },
        load: kickLoad,
        dispose: function () {
          closed = true;
          listeners.clear();
          if (retryTimer !== null) {
            try { timers.clear(retryTimer); } catch (error) { /* 忽略 */ }
            retryTimer = null;
          }
          if (unsubscribe !== null) {
            try { unsubscribe(); } catch (error) { /* 忽略 */ }
            unsubscribe = null;
          }
          directory = null;
        },
      };
    }

    /* ══════════ 官方菜单那一行的 DOM 桥（只动那一行，fail-open）══════════ */

    function firstSpanText(row) {
      try {
        var spans = row.querySelectorAll("span");
        for (var i = 0; i < spans.length; i += 1) {
          var text = spans[i].textContent;
          if (typeof text === "string" && text.length > 0) return text;
        }
      } catch (error) {
        /* 认不出就算了，调用方会退到结构判定 */
      }
      return "";
    }

    /**
     * 官方那一行右侧的**数值文字**（"Max" / "High"）—— 就是 `.cellValue` 那个 span。
     * 找不到 class 时退到结构：行内最后一个非空文字的 span（数值在标签之后、箭头之前）。
     * 只改它的颜色，文字内容一律不碰。
     */
    function findValueElement(row) {
      if (!row || typeof row.querySelectorAll !== "function") return null;
      try {
        var byClass = row.querySelectorAll("span[class*='cellValue']");
        if (byClass.length > 0) return byClass[byClass.length - 1];
        var spans = row.querySelectorAll("span");
        var found = null;
        for (var i = 0; i < spans.length; i += 1) {
          var text = spans[i].textContent;
          if (typeof text === "string" && text.replace(/\s+/g, "").length > 0) found = spans[i];
        }
        return found;
      } catch (error) {
        return null;
      }
    }

    /**
     * **收起的模型席按钮**（"DeepSeek-V41-Flash  High  ⌄"）里只显示档位名的那一小段文字。
     *
     * 官方渲染它用的是哈希 class（`wq12jW_triggerEffort`，前缀随构建变），靠 class 认迟早会失效，
     * 所以按**文字**认：官方 trigger 里的档位文字就是档位的 `name`，和我们从目录读到的是同一份数据。
     *
     * 传**全部档位名**（而不是只要当前那个）：档位刚切换、官方还没重渲染席按钮时，
     * 文字还是旧档位名 —— 只认当前名字会在那一瞬间"放手"，颜色闪一下。
     * 认不出任何已知档位名就返回 null（fail-open，绝不动别的文字）。
     */
    function findSeatEffort(doc, composer, expectedLabels) {
      if (!doc || !composer || typeof doc.querySelectorAll !== "function") return null;
      var list = typeof expectedLabels === "string" ? [expectedLabels] : expectedLabels;
      if (Object.prototype.toString.call(list) !== "[object Array]") return null;
      var wanted = [];
      for (var n = 0; n < list.length; n += 1) {
        var name = typeof list[n] === "string" ? list[n].replace(/\s+/g, "") : "";
        if (name.length > 0 && wanted.indexOf(name) < 0) wanted.push(name);
      }
      if (wanted.length === 0) return null;
      try {
        var seats = doc.querySelectorAll('button[aria-haspopup="menu"]');
        for (var i = 0; i < seats.length; i += 1) {
          if (!composer.contains(seats[i])) continue;
          var spans = seats[i].querySelectorAll("span");
          for (var j = 0; j < spans.length; j += 1) {
            var text = spans[j].textContent;
            if (typeof text === "string" && wanted.indexOf(text.replace(/\s+/g, "")) >= 0) return spans[j];
          }
        }
      } catch (error) {
        return null;
      }
      return null;
    }

    /**
     * 在自己所属的 composer 里，找到"打开的那颗官方模型席"对应的菜单，再找到推理等级那一行。
     * 全部用官方**语义属性**（aria-haspopup / aria-expanded / aria-controls / role）定位，
     * 不依赖哈希 class —— 官方改样式不会影响这里，改语义才会（那种改动会先在我的测试里炸掉）。
     */
    function findEffortRow(doc, composer) {
      if (!doc || !composer || typeof doc.querySelectorAll !== "function") return null;
      var seats = doc.querySelectorAll('button[aria-haspopup="menu"][aria-expanded="true"]');
      var seat = null;
      for (var i = 0; i < seats.length; i += 1) {
        if (composer.contains(seats[i])) { seat = seats[i]; break; }
      }
      if (seat === null) return null;

      var menuId = typeof seat.getAttribute === "function" ? seat.getAttribute("aria-controls") : null;
      var menu = menuId && typeof doc.getElementById === "function" ? doc.getElementById(menuId) : null;
      if (!menu) return null;

      var items = menu.querySelectorAll('button[role="menuitem"]');
      if (items.length !== 2) return null; // 根面板恰好两行；子面板用的是 menuitemradio
      for (var j = 0; j < items.length; j += 1) {
        var label = firstSpanText(items[j]);
        for (var k = 0; k < EFFORT_ROW_LABELS.length; k += 1) {
          if (label === EFFORT_ROW_LABELS[k]) return items[j];
        }
      }
      // 文案认不出（官方改了措辞/别的语言）就按官方固定顺序：第 2 个 menuitem 是推理等级。
      return items[1];
    }

    /**
     * 监听文档，把滑条容器挂进官方那一行。
     *
     * @param options.doc      宿主 document
     * @param options.win       宿主 window（派发 resize 让官方重测菜单位置）
     * @param options.anchor    () => 本会话在 composer 里的锚点元素（用来判定"哪颗席是我的"）
     * @param options.active    () => boolean，当前是否值得注入（没有档位就不注入，免得白加高）
     * @param options.onChange  (host | null) => void
     */
    function createMenuBridge(options) {
      var doc = options.doc;
      var win = options.win;
      var anchor = options.anchor;
      var active = options.active;
      var onChange = options.onChange;
      if (!doc || typeof doc.createElement !== "function") return null;

      var current = null;
      var seat = null; // 收起态那一行里的档位文字（菜单没打开时也要着色）
      var seatColor = ""; // 组件给的当前颜色：重新抓到元素时立刻补上，不必等下一次渲染
      var observer = null;
      var timer = null;
      var disposed = false;
      var seatLabels = options.seatLabels; // () => string[]，全部已知档位名

      /** 本会话的 composer 容器：从锚点往上找官方给 composer 卡片打的标记。 */
      function composerOf() {
        var node = anchor();
        if (!node) return null;
        var el = node;
        while (el && el.nodeType === 1) {
          if (typeof el.getAttribute === "function" && el.getAttribute("data-composer-card") !== null) return el;
          el = el.parentNode;
        }
        return null;
      }

      /* 迁移改造：本控件没有设置面板，也不响应右键。
         旧版本（dsh-codex-effort-slider）在同源实现里往 document 上装了针对 `.ces-inline`
         的 contextmenu / 长按 / 菜单键监听——只要事件还能走到 document，它们就会在我们的
         滑条上弹出它自己的设置面板。这里在 **window 捕获阶段** 截住落在本滑条内的事件：
         捕获顺序是 window → document，因此必然抢在那些监听之前。同时顺手清掉旧代码可能
         已经创建出来的面板节点（本插件从不创建 `.ces-set`，因此只会命中外来面板）。 */
      var contextGuard = null;
      var panelObserver = null;

      function sweepForeignPanel() {
        try {
          if (!doc || typeof doc.querySelectorAll !== "function") return;
          var stale = doc.querySelectorAll(".ces-set");
          for (var i = 0; i < stale.length; i += 1) {
            var node = stale[i];
            if (node && node.parentNode) node.parentNode.removeChild(node);
          }
        } catch (error) { /* 清理失败不影响滑条 */ }
      }

      function insideOurSlider(target) {
        var host = current !== null ? current.container : null;
        if (!host || !target) return false;
        try {
          return typeof host.contains === "function" && host.contains(target);
        } catch (error) {
          return false;
        }
      }

      function installContextGuard() {
        if (contextGuard !== null || !win || typeof win.addEventListener !== "function") return;
        contextGuard = function (event) {
          try {
            if (!insideOurSlider(event.target)) return;
            if (typeof event.preventDefault === "function") event.preventDefault();
            if (typeof event.stopPropagation === "function") event.stopPropagation();
            if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
            sweepForeignPanel();
          } catch (error) { /* 拦截失败也不能连累滑条 */ }
        };
        win.addEventListener("contextmenu", contextGuard, true);
        // 键盘等效键（Shift+F10 / 菜单键）同样不该弹出别人的面板；方向键等仍交给轨道自己处理。
        win.addEventListener("keydown", function (event) {
          try {
            var isMenuKey = (event.shiftKey && event.key === "F10") || event.key === "ContextMenu";
            if (!isMenuKey) return;
            if (!insideOurSlider(event.target)) return;
            if (typeof event.preventDefault === "function") event.preventDefault();
            if (typeof event.stopPropagation === "function") event.stopPropagation();
            sweepForeignPanel();
          } catch (error) { /* 忽略 */ }
        }, true);
        try {
          var MO = win && (win.MutationObserver || (typeof MutationObserver === "function" ? MutationObserver : null));
          if (typeof MO === "function" && doc && doc.body) {
            panelObserver = new MO(function () { sweepForeignPanel(); });
            panelObserver.observe(doc.body, { childList: true });
          }
        } catch (error) { panelObserver = null; }
      }

      function detach() {
        if (current === null) return;
        var row = current.row;
        var container = current.container;
        try {
          if (container && container.parentNode) container.parentNode.removeChild(container);
        } catch (error) { /* 行可能已经被官方卸载 */ }
        try {
          var previous = current.previous;
          if (row && row.style) {
            row.style.height = previous.height;
            row.style.flexWrap = previous.flexWrap;
            row.style.paddingTop = previous.paddingTop;
            row.style.paddingBottom = previous.paddingBottom;
            row.style.boxShadow = previous.boxShadow;
          }
          // 数值文字（"Max"）的颜色也是我们改的，退出时一并还原
          if (current.value && current.value.style) current.value.style.color = previous.valueColor;
        } catch (error) { /* 还原失败不影响官方菜单自身 */ }
        if (panelObserver !== null) {
          try { panelObserver.disconnect(); } catch (error) { /* 忽略 */ }
          panelObserver = null;
        }
        current = null;
        onChange(null);
      }

      /** 收起的档位文字：还原本来的颜色并忘掉它。 */
      function releaseSeat() {
        if (seat === null) return;
        try {
          if (seat.el && seat.el.style) seat.el.style.color = seat.previousColor;
        } catch (error) { /* 元素可能已被官方卸载 */ }
        seat = null;
      }

      /**
       * 同步收起态的档位文字。
       * 只在**元素换了**（官方重渲染换了节点）或还没抓到时重新抓 —— 文字变了不换元素，
       * 所以档位切换不会造成"还原→再上色"的闪动。
       */
      function syncSeat() {
        var composer = composerOf();
        if (composer === null || active() !== true) { releaseSeat(); return; }
        if (seat !== null && seat.el && doc.documentElement && doc.documentElement.contains(seat.el)) {
          if (seatColor && seat.el.style) seat.el.style.color = seatColor; // 官方清过内联样式就补回来
          return;
        }
        releaseSeat();
        var wanted = typeof seatLabels === "function" ? seatLabels() : null;
        var el = findSeatEffort(doc, composer, wanted);
        if (el === null || !el.style) return;
        seat = { el: el, previousColor: el.style.color || "" };
        if (seatColor) el.style.color = seatColor;
      }

      function scan() {
        if (disposed) return;
        // 收起态的档位文字：跟菜单那一行互相独立，任一处失败都不该拖垮另一处
        try { syncSeat(); } catch (error) { /* 忽略 */ }
        try {
          var composer = composerOf();
          if (composer === null || active() !== true) { detach(); return; }
          // 已经挂好且那一行还在 → 什么都不做
          if (current !== null && current.row && doc.documentElement && doc.documentElement.contains(current.row)) return;

          var row = findEffortRow(doc, composer);
          if (row === null) { detach(); return; }
          detach();

          var value = findValueElement(row);
          var previous = {
            // 真实 DOM 里未设置的内联属性读作 ""，这里统一成同样的语义，还原时才不会写回
            // 字面量 "undefined"（那在浏览器里是无效值，会把我们的加高留在原地）。
            height: row.style.height || "",
            flexWrap: row.style.flexWrap || "",
            paddingTop: row.style.paddingTop || "",
            paddingBottom: row.style.paddingBottom || "",
            boxShadow: row.style.boxShadow || "",
            // 数值文字原来的内联颜色（通常没设过，读作 ""）
            valueColor: value && value.style ? value.style.color || "" : "",
          };
          // 「加高那一栏的上下距离」+ 允许折行，让滑条落到第二行并铺满整行宽度。
          row.style.height = "auto";
          row.style.flexWrap = "wrap";
          row.style.paddingTop = ROW_PADDING_BLOCK;
          row.style.paddingBottom = ROW_PADDING_BLOCK;

          var container = doc.createElement("div");
          container.className = "ces-inline";
          container.setAttribute("data-ces-part", "host");
          row.appendChild(container);

          current = { row: row, container: container, value: value, previous: previous };
          onChange(current);
          installContextGuard();
          sweepForeignPanel();

          // 官方菜单是"测量后固定定位"的，加高后让它重测一次（官方自己在 resize 里重测并夹取）。
          try {
            win.dispatchEvent(new win.Event("resize"));
          } catch (error) { /* 宿主没有 Event 构造器就算了，官方也会在状态变化时重测 */ }
        } catch (error) {
          try { detach(); } catch (inner) { /* 兜到底 */ }
        }
      }

      function start() {
        scan();
        var MO = win && (win.MutationObserver || (typeof MutationObserver === "function" ? MutationObserver : null));
        if (typeof MO === "function") {
          try {
            observer = new MO(function () { scan(); });
            observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
            return;
          } catch (error) {
            observer = null;
          }
        }
        // 没有 MutationObserver 时退化成低频轮询；反正每轮都很便宜。
        if (win && typeof win.setInterval === "function") timer = win.setInterval(scan, 400);
      }

      return {
        scan: scan,
        start: start,
        /** 组件把当前该用的颜色给进来；桥负责在（重新）抓到元素时立刻应用。 */
        setSeatColor: function (color) {
          seatColor = typeof color === "string" ? color : "";
          if (seat !== null && seat.el && seat.el.style) {
            try { seat.el.style.color = seatColor; } catch (error) { /* 忽略 */ }
          }
        },
        dispose: function () {
          disposed = true;
          if (observer !== null) {
            try { observer.disconnect(); } catch (error) { /* 忽略 */ }
            observer = null;
          }
          if (timer !== null) {
            try { win.clearInterval(timer); } catch (error) { /* 忽略 */ }
            timer = null;
          }
          releaseSeat();
          detach();
        },
        host: function () { return current; },
      };
    }

    /* ════════════════════════════ 组件 ════════════════════════════ */

    /**
     * 单组件设计：锚点 + 桥 + 滑条（portal 进官方那一行）都在同一个函数里，
     * 所有 hook 都在同一个实例上，展开/收起不会改变 hook 顺序。
     */
    function CodexEffortSlider(props) {
      var sessionId = typeof props.sessionId === "string" && props.sessionId.length > 0 ? props.sessionId : null;
      var locked = props.locked === true;
      var ctx = props.__ctx;

      /* ⚠️⚠️ 本插件的三种动画**完全不受系统「减少动态效果」影响**（用户明确要求）。
         所以：reducedMotion 恒为 false —— 作者原本的"减少动态 → jumpTo"分支全部成为死代码；
         动画强度只由设置里的 motion 决定（quick = 简洁 / full = 完整 / fast = 快速·Codex 手感）。 */
      /* ⚠️⚠️ 唯一实例守卫 —— 实测这个插件会被**加载两次**（两份模块、两个滑条组件），
         两份引擎的 draft 会渲染进官方同一行、互相打架 → 视觉上"松手乱跳"，
         而且只在**重启**后出现（热重载时只有一份，所以手感正常）。
         只允许第一份活着的实例渲染；其余返回 null。
         ⚠️ Hooks 顺序：判定只做一次且永不改变（__cesDecided），所以每个实例的 Hook 数量恒定。 */
      var __slotWin = (typeof window !== "undefined") ? window : null;
      if (!__cesDecided && __slotWin) {
        __cesDecided = true;
        if (__slotWin.__cesActiveSliderOwner == null) {
          __slotWin.__cesActiveSliderOwner = __cesOwnerToken;
          __cesIsOwner = true;
        }
      } else if (!__slotWin) {
        __cesDecided = true;
        __cesIsOwner = true;
      }
      if (__cesIsOwner) {
        // 只有 owner 会调用这个 effect（非 owner 在下面直接 return null，不调用任何 Hook）
        React.useEffect(function () {
          return function () {
            if (typeof window !== "undefined" && window.__cesActiveSliderOwner === __cesOwnerToken) {
              window.__cesActiveSliderOwner = null;   // 释放，让后来的一份还能接管
            }
          };
        }, []);
      } else {
        return null;
      }

      /** 本组件实例的编号（诊断）。 */
      var __cesInstanceId = (window.__cesInstanceSeq = (window.__cesInstanceSeq || 0) + 1);
      var reducedMotion = false;
      /** 只用于观感（星尘放缓 / 提示文案 / data-motion），取值来自设置。 */
      var effectiveReducedMotion = motionMode() === "quick";

      /** 拖动安全网用的按键状态（pointerup 只挂在轨道上，轨道外松开时会丢事件）。 */
      var buttonDownRef = React.useRef(false);
      /** 当前渲染下的"已生效档位"百分比（循环闭包要读最新值，不能用闭包变量）。 */
      var effectivePctRef = React.useRef(0);
      /** 吸附完成后为等提交追上而多持有显示的帧数（兜底上限）。 */
      var holdFramesRef = React.useRef(0);
      /** 上一次"已写回宿主"的档位下标：拖动时只在**跨过档位边界**的那一刻写一次。 */
      var lastCommittedIndexRef = React.useRef(-1);
      /** 松手提交重试的代次：每次按下拖动就 +1，旧重试立即作废（绝不能覆盖新操作）。 */
      var releaseGenRef = React.useRef(0);
      /** 最近一次**有效**档位下标：档位列表暂时为空时的显示兜底（绝不用 0）。 */
      var lastValidIndexRef = React.useRef(0);
      /** 本次渲染解析出的档位列表：`endDrag` 这类"长寿闭包"必须读 ref，不能读闭包变量。 */
      var levelsRef = React.useRef([]);
      /**
       * 最新一版的 `endDrag`。
       * 窗口级 pointerup 安全网只在**挂载时**绑定一次；如果它直接调用闭包里的 `endDrag`，
       * 用的就永远是**首次渲染**的那份闭包 —— 而首渲染时 `levelCount` 还是 0 ✗，
       * 于是每次松手都走 `release-abort` → 不写回 → 显示交还旧档位 = 用户说的"点一下顿一下"。
       * 诊断证据：`{"k":"endDrag-enter","inst":1,…}` 后面紧跟 `release-abort levelCount=0`。
       */
      var endDragRef = React.useRef(null);
      /** 快速动画的"当前停在第几格"（-1 = 还没对齐过）。 */
      var detentIndexRef = React.useRef(-1);
      React.useEffect(function () {
        if (typeof window === "undefined" || typeof window.addEventListener !== "function") return undefined;
        var stopDrag = function () {
          buttonDownRef.current = false;
          // ⚠️ 必须调用**最新**的 endDrag：这个监听只绑定一次，闭包里的 endDrag 是首渲染的旧版本。
          if (draggingRef.current && typeof endDragRef.current === "function") endDragRef.current();
        };
        window.addEventListener("pointerup", stopDrag, true);
        window.addEventListener("pointercancel", stopDrag, true);
        return function () {
          window.removeEventListener("pointerup", stopDrag, true);
          window.removeEventListener("pointercancel", stopDrag, true);
        };
      }, []);

      var access = React.useMemo(
        function () {
          if (sessionId === null || !ctx) return null;
          return createDirectoryAccess(ctx, sessionId, {
            set: function (fn, delay) { return setTimeout(fn, delay); },
            clear: function (handle) { clearTimeout(handle); },
          });
        },
        [ctx, sessionId],
      );

      React.useEffect(function () {
        return function () {
          if (access !== null) access.dispose();
        };
      }, [access]);

      var subscribe = React.useCallback(
        function (onChange) { return access === null ? function () {} : access.subscribe(onChange); },
        [access],
      );
      var getSnapshot = React.useCallback(
        function () { return access === null ? EMPTY_SNAPSHOT : access.getSnapshot(); },
        [access],
      );
      var state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

      var liveLevels = levelsOf(state);
      // 模型身份：缓存的有效性判断（provider + model 变了就不复用缓存）。
      var liveLevelKey = (state && state.current && typeof state.current.provider === "string" && typeof state.current.model === "string")
        ? state.current.provider + "\u0000" + state.current.model
        : null;
      var levels = resolveLevels(liveLevels, liveLevelKey, __levelsCache);
      // 只在"活列表为空、靠缓存兜底"时记一笔（正常渲染不刷屏）
      var levelsCacheUsed = liveLevels.length === 0 && levels.length > 0;
      if (levelsCacheUsed !== __levelsCacheHit) {
        __levelsCacheHit = levelsCacheUsed;
        tracePush({ k: "levels-cache", hit: levelsCacheUsed, n: levels.length, emptyLive: liveLevels.length === 0 });
      }
      var effectiveId = effectiveEffortId(state);
      var committedIndex = indexOfLevel(levels, effectiveId);
      var levelCount = levels.length;

      var draftState = React.useState(null);
      var draft = draftState[0];
      var setDraft = draftState[1];
      var optimisticState = React.useState(null);
      var optimistic = optimisticState[0];
      var setOptimistic = optimisticState[1];
      var errorState = React.useState(null);
      var errorText_ = errorState[0];
      var setError = errorState[1];
      var busyState = React.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];
      var hostState = React.useState(null);
      var host = hostState[0];
      var setHost = hostState[1];

      var anchorRef = React.useRef(null);
      var trackRef = React.useRef(null);
      var optimisticIdRef = React.useRef(null);
      /** 拖动的"最新位置"放 ref：React 会把同一 tick 的多次 setState 合并，
       *  松手那一帧若从 state 读位置，可能读到上一次渲染的旧值，从而写错档位。 */
      var draftRef = React.useRef(null);
      var commitRef = React.useRef({ timer: null, inFlight: false, queued: null, safetyTimer: null });
      var draggingRef = React.useRef(false);
      var levelCountRef = React.useRef(0);
      var seatNamesRef = React.useRef([]); // 全部已知档位名（认官方席按钮上的那段文字用）
      var bridgeRef = React.useRef(null);
      levelCountRef.current = levelCount;
      // 每次渲染都把"最新"的档位列表与 endDrag 放进 ref（供窗口安全网等长寿闭包读取）
      levelsRef.current = levels;
      endDragRef.current = endDrag;

      /* 桥：找到官方菜单那一行，把滑条容器挂进去 */
      React.useEffect(function () {
        if (sessionId === null || !ctx) return undefined;
        var bridge = createMenuBridge({
          doc: typeof document === "undefined" ? null : document,
          win: typeof window === "undefined" ? null : window,
          anchor: function () { return anchorRef.current; },
          active: function () { return levelCountRef.current > 0; },
          onChange: function (next) { setHost(next); },
          // 收起态那一行显示的档位名（官方 trigger 里的文字就是它）；给全部名字更抗"官方还没重渲染"
          seatLabels: function () { return seatNamesRef.current; },
        });
        if (bridge === null) return undefined;
        bridgeRef.current = bridge;
        bridge.start();
        return function () {
          bridgeRef.current = null;
          bridge.dispose();
        };
      }, [ctx, sessionId]);

      /**
       * 档位是**后到**的（目录 load 完才有 efforts）。那时 DOM 没有任何变化，
       * MutationObserver 不会响，所以这里在档位数变化时主动重扫一次 ——
       * 少了这一句，"目录晚到"会让滑条永远挂不上去（起步期抖动变永久失效）。
       */
      React.useEffect(function () {
        if (bridgeRef.current !== null) bridgeRef.current.scan();
      }, [levelCount]);

      // 乐观值：提交后先按用户选的那一档显示，直到宿主真实回报（或超时回滚）。
      var optimisticId = optimistic !== null && typeof optimistic.id === "string" ? optimistic.id : null;
      var optimisticIndex = optimisticId === null ? -1 : indexOfLevel(levels, optimisticId);

      // **已生效**的档位（乐观值优先，其次真实值）：收起态那一行显示的是它，不是拖动中的草稿。
      // ⚠️ 兜底**绝不能用 0**：档位列表暂时为空/未就绪时，用"最近一次有效档位"。
      //    用 0 会让显示瞬间跳到最左（实测就是"闪回最左边"那一下）。
      if (committedIndex >= 0) lastValidIndexRef.current = committedIndex;
      // 兜底优先级：①最近一次有效档位（且仍落在当前列表范围内）②当前档位数的正中（issue #6 的约定）。
      // 绝不默认 0（0 = 最左 / off，看起来就是"显示错档位"）。
      var midIndex = Math.max(0, Math.min(Math.max(0, levelCount - 1), Math.floor((levelCount - 1) / 2)));
      var lastIdx = lastValidIndexRef.current;
      var fallbackIndex = (typeof lastIdx === "number" && lastIdx >= 0 && lastIdx < levelCount) ? lastIdx : midIndex;
      var effectiveIndex = committedIndex >= 0 ? committedIndex : fallbackIndex;
      if (optimisticIndex >= 0) effectiveIndex = optimisticIndex;
      var effectivePct = pctFromIndex(effectiveIndex, levelCount);
      effectivePctRef.current = effectivePct;
      var effectiveLevel = levels[effectiveIndex] || null;
      // 席按钮上可能出现的是**任意一个档位名**（档位刚切换时官方还没重渲染）
      var seatNames = [];
      for (var n = 0; n < levels.length; n += 1) {
        if (levels[n] && typeof levels[n].name === "string" && levels[n].name.length > 0) seatNames.push(levels[n].name);
      }
      seatNamesRef.current = seatNames;

      // 显示用的档位：拖动中跟着草稿，否则就是已生效那一档。
      var shownIndex = draft !== null ? draft.index : effectiveIndex;
      var shownPct = draft !== null && typeof draft.pct === "number" ? draft.pct : effectivePct;
      // 诊断：万一出现"松手抽搐"，用它一眼看出哪一帧、哪个值跳了
      tracePush({ k: "s", inst: __cesInstanceId, t: (typeof performance !== "undefined" ? Math.round(performance.now()) : 0), shown: Math.round(shownPct * 10000) / 10000, eff: Math.round(effectivePct * 10000) / 10000, draft: draft === null ? null : Math.round(draft.pct * 10000) / 10000, mode: motionMode() });
      var shownLevel = levels[shownIndex] || null;

      // 三个由**位置**连续驱动的量：填充色（蓝→紫→深紫）、能量强度（星云+星星渐入）、位置速率。
      var energy = energyFor(shownPct);
      var energyOn = energy > 0;
      var fillBackground = fillBackgroundFor(shownPct);
      var knobOffset = knobOffsetOf(shownPct);

      // 官方那一行在最高档时描一圈紫边，强度跟着能量走（写内联样式，退出时由桥还原）。
      React.useEffect(function () {
        if (host === null || !host.row || !host.row.style) return;
        host.row.style.boxShadow = energyOn
          ? "inset 0 0 0 1px rgba(168,85,247," + (0.16 + 0.34 * energy).toFixed(2) + ")"
          : "";
      }, [host, energyOn, energy]);

      // 官方那一行的**数值文字**（"Max"）也跟着位置变色：蓝 → 亮紫（用户要求）。
      // 同样写内联、退出时由桥还原；**只改颜色，文字内容一个字都不碰**。
      React.useEffect(function () {
        if (host === null || !host.value || !host.value.style) return;
        host.value.style.color = valueColorFor(shownPct, shownLevel);
      }, [host, shownPct, shownLevel]);

      // **收起态**那一行的档位文字（模型席按钮上的 "High"，菜单没打开时就看得见）也跟着变色。
      // 颜色交给桥保管：官方重渲染换了节点时，桥会在重新抓到的那一刻补上，不必等 React。
      // 注意这里用**已生效**的档位（不是拖动中的草稿）—— 收起态显示的是真实档位。
      React.useEffect(function () {
        if (bridgeRef.current === null) return;
        bridgeRef.current.setSeatColor(valueColorFor(effectivePct, effectiveLevel));
      }, [levelCount, effectivePct, effectiveLevel]);

      // 宿主追上乐观值 → 撤掉乐观态（此后以真实目录为准）。
      React.useEffect(function () {
        if (optimisticId !== null && effectiveId === optimisticId) setOptimistic(null);
      }, [effectiveId, optimisticId]);

      // 超时兜底：宿主迟迟不回报就回滚并说明，不继续假装已生效。
      React.useEffect(function () {
        if (optimisticId === null) return undefined;
        var handle = setTimeout(function () {
          if (optimisticIdRef.current === optimisticId) {
            optimisticIdRef.current = null;
            setOptimistic(null);
            setError(tr("effortErrorTimeout", "档位切换超时，宿主未回报结果（已回滚显示）"));
          }
        }, COMMIT_DEADLINE_MS);
        return function () { clearTimeout(handle); };
      }, [optimisticId]);

      // 组件卸载：清掉降频定时器（否则会在卸载后写一次宿主）。
      React.useEffect(function () {
        return function () {
          var pending = commitRef.current;
          if (pending.timer !== null) {
            clearTimeout(pending.timer);
            pending.timer = null;
          }
          pending.queued = null;
        };
      }, []);

      function currentState() {
        return access === null ? EMPTY_SNAPSHOT : access.getSnapshot();
      }

      function flush() {
        var pending = commitRef.current;
        if (pending.timer !== null) {
          clearTimeout(pending.timer);
          pending.timer = null;
        }
        var levelId = pending.queued;
        pending.queued = null;
        if (pending.safetyTimer !== null) { clearTimeout(pending.safetyTimer); pending.safetyTimer = null; }
        tracePush({ k: "flush", id: levelId });
        if (levelId === null || levelId === undefined || access === null) return;

        var snapshot = currentState();
        var current = snapshot && snapshot.current;
        if (!current || typeof current.provider !== "string" || typeof current.model !== "string") {
          setError(tr("effortErrorNotReady", "模型目录尚未就绪，无法写入档位"));
          return;
        }
        // 发送前再判一次：可能宿主已经把这个档位写好了（去重的第二道闸）。
        if (effectiveEffortId(snapshot) === levelId) { tracePush({ k: "flush-skip", id: levelId, why: "dedupe" }); return; }

        var directory = access.directory();
        if (directory === null || typeof directory.select !== "function") {
          setError(tr("effortErrorDirectory", "模型目录不可用，档位未写入"));
          return;
        }

        pending.inFlight = true;
        optimisticIdRef.current = levelId;
        setOptimistic({ id: levelId });
        setError(null);
        setBusy(true);

        var result;
        try {
          result = directory.select({
            provider: current.provider,
            model: current.model,
            reasoningEffort: levelId,
          });
        } catch (error) {
          result = Promise.reject(error);
        }

        Promise.resolve(result).then(
          function (outcome) {
            pending.inFlight = false;
            tracePush({ k: outcome && outcome.ok === false ? "commit-fail" : "commit-ok" });
            if (outcome && outcome.ok === false) {
              optimisticIdRef.current = null;
              setOptimistic(null);
              setError(errorText(outcome.error));
            }
          },
          function (error) {
            pending.inFlight = false;
            optimisticIdRef.current = null;
            setOptimistic(null);
            setError(errorText(error));
          },
        ).then(function () {
          setBusy(false);
          // 在途合并：拖动期间攒下的最新值在这里补发。
          tracePush({ k: "commit-settle", inFlight: pending.inFlight, queued: pending.queued });
          if (pending.queued !== null) flush();
        });
      }

      /** 请求写回某一档：同档位去重 + 在途合并 + 降频；immediate 用于松手/键盘。 */
      function requestCommit(levelId, immediate) {
        if (levelId === null || levelId === undefined) return;
        var pending = commitRef.current;
        var snapshot = currentState();
        if (effectiveEffortId(snapshot) === levelId && pending.queued === null && !pending.inFlight) return;
        pending.queued = levelId;
        tracePush({ k: "req", id: levelId, imm: immediate === true, inFlight: pending.inFlight, queued: pending.queued });
        if (pending.inFlight) {
          // ⚠️ 不能直接 return：那次在途的收尾可能**已经**跑完了（微任务早于本次同步调用），
          //    排队值就会永远躺在 queued 里没人发 —— 实测 eff 长期不更新就是这么来的。
          //    这里加一个**有界轮询**，直到在途结束并把它发出去。
          if (pending.safetyTimer === null) {
            var armSafety = function () {
              pending.safetyTimer = setTimeout(function () {
                pending.safetyTimer = null;
                if (pending.queued === null) return;
                if (pending.inFlight) { armSafety(); return; }
                tracePush({ k: "safety-flush", id: pending.queued });
                flush();
              }, 50);
            };
            armSafety();
          }
          return;
        }
        if (immediate === true) {
          flush();
          return;
        }
        if (pending.timer !== null) return;
        pending.timer = setTimeout(function () {
          pending.timer = null;
          flush();
        }, COMMIT_THROTTLE_MS);
      }

      /*
       * ── 引擎接线 ──
       * 四个入口（按下 / 拖动 / 松手 / 键盘）**只改 m.target 与 m.vPtr**，
       * 绝不写 m.x / m.v / m.a —— 这是整套模型的命门：
       * 一旦谁重置了运动状态，就退化成"取消旧动画播新动画"，割裂感立刻回来。
       */
      var motionRef = React.useRef(null);
      var frameRef = React.useRef(null);
      var lastTsRef = React.useRef(0);
      var lastPtrPctRef = React.useRef(null);
      /**
       * **上次 pointermove 的时刻**。单独用一个 ref，不能复用 lastTsRef ——
       * 后者是"上一帧的时刻"（帧循环每帧都改它），拿它算指针速度会得到错的 dt；
       * 而衰减判定要的正是"距上次真实指针事件过了多久"。
       */
      var lastPointerAtRef = React.useRef(0);
      /** 松手后"决定的档位"：吸附过程中档位标签要冻结在它上面，不能跟着中间位置跳。 */
      var snapIndexRef = React.useRef(null);

      function motionParams() {
        // 只看设置：「quick」= 简洁动画（紧参数）/「full」= 完整动画（他的松参数）
        return motionParamsForMode();
      }

      /** 懒建引擎：以当前显示位置为起点（**不是**从 0 或从档位点）。 */
      function ensureMotion() {
        if (motionRef.current === null) {
          var x0 = (draftRef.current !== null && typeof draftRef.current.pct === "number")
            ? draftRef.current.pct : shownPct;
          motionRef.current = { x: x0, v: 0, a: 0, target: x0, vPtr: 0 };
        }
        return motionRef.current;
      }

      /** 吸附过程中：档位冻结在决定的那个；拖动中：档位跟着位置走。 */
      function draftIndexFor(m) {
        if (draggingRef.current) return indexFromPct(m.x, levelCount);
        return snapIndexRef.current !== null ? snapIndexRef.current : indexFromPct(m.x, levelCount);
      }

      /**
       * 把引擎当前位置交给引擎之外的一切（四层渲染、能量、刻度都读 draft）。
       *
       * ⚠️ **位置没变就不惊动 React**：拖动期间帧循环现在会常驻（见 startFrames 里
       * 那段"为什么必须继续排下一帧"），如果每帧都无条件 setDraft，就变成
       * "指针按住不动也 60 次/秒重渲染整条滑条"（四层 + 22 个星星节点）——
       * 那是拿一种卡顿换另一种卡顿。所以这里先比一下。
       */
      function publishMotion(m) {
        var next = { pct: m.x, index: draftIndexFor(m) };
        var prev = draftRef.current;
        if (prev !== null && prev.pct === next.pct && prev.index === next.index) return;
        draftRef.current = next;
        setDraft(next);
      }

      /**
       * ⚠️ **引擎必须跟随"已生效档位"的变化**（这是一个真实 bug 的修法）。
       *
       * 场景（用户报的"点一下跳到 max"）：
       *   官方模型菜单是 **pane 状态机**（`root` / `model` / `effort`，见
       *   ui-model-selection 的 ModelSelect.tsx）：点进"推理等级"后 `pane='effort'`，
       *   **root 那一整块被替换掉** —— 我们注入的那一行（含滑条）随之不渲染，
       *   用户在那期间**看不到滑条**，也不可能同时拖动。
       *   选完档位回到 root 时，显示的档位已经变了（`effectivePct` 变了）。
       *
       *   而引擎 `x` 只被"滑条自己的操作"更新 —— 它**不知道**官方改了档位。实测：
       *     1) 滑块拖到 max    → 显示 1.0，引擎 x = 1.0
       *     2) 官方菜单选 low  → 显示 1/3（走 effectivePct），**引擎 x 仍是 1.0**
       *     3) 在滑块里点 max  → target=1.0 而 x 已=1.0 → **一帧内 settled**
       *                          → 显示从 1/3 直接跳成 1.0（瞬移，实测跳变 66.67%）
       *   点"显示位置 low"更明显：引擎从错误的 1.0 起点动画，
       *   会**先瞬移回 max 再往下滑**。
       *
       * 修法：**只有在引擎空闲时**（既不在拖动、也不在吸附 → `draftRef.current === null`）
       * 才把引擎对齐到 `effectivePct`。这样：
       *   · 官方改档（引擎空闲）→ 对齐到新档位 → 不再瞬移
       *   · 用户拖动/吸附中 → `draftRef.current !== null` → **不碰引擎**（用户操作优先）
       *
       * ⚠️ 绝不能把这个对齐放进 `ensureMotion()`：`endDrag()` 里也调用 `ensureMotion()`，
       * 而"快速按下即松手"时 `draftRef.current` 还是 null，那时对齐会把
       * `m.target` 改写成当前档位 → 松手算出的落点变成"原地不动" → **写回丢失**
       * （实测：60 次拖动的写回从 ≥1 次变成 0 次）。对齐必须只在"档位真的变了"时发生。
       */
      React.useEffect(function () {
        var m = motionRef.current;
        if (m === null) return;
        if (draftRef.current !== null) return;   // 拖动/吸附中：用户优先
        m.x = effectivePct;
        m.v = 0;
        m.a = 0;
        m.target = effectivePct;
        m.vPtr = 0;
      }, [effectivePct]);

      /**
       * 启动帧循环（幂等：已在跑就直接返回）。
       * dt 用**真实帧间隔**并夹到 MAX_FRAME_DT，避免切标签回来时一帧跳一大段。
       */
      function startFrames() {
        if (frameRef.current !== null) return;
        lastTsRef.current = nowMs();
        var step = function (ts) {
          frameRef.current = null;   // 诊断：能走到这里通常是卸载/重挂载
          var m = motionRef.current;
          if (m === null) return;
          var p = motionParams();
          var dt = Math.min(MAX_FRAME_DT, Math.max(0.001, (ts - lastTsRef.current) / 1000));
          lastTsRef.current = ts;
          // ⚠️ 每帧先让**陈旧的指针速度**衰减（见 decayPointerSpeed 的注释）：
          // 指针停下后不再有 pointermove，vPtr 若不衰减就会冻结成一个恒定的力，
          // 而且让下面的到位判定永远不成立（循环空转）。
          // 注意这里用**距上次 pointermove 的实际时长**（不是帧间隔 dt）——
          // dt 每帧都被重置成 ~16ms，永远跨不过 33ms 的保鲜期，等于没衰减。
          var sincePointer = (ts - lastPointerAtRef.current) / 1000;
          m.vPtr = decayPointerSpeed(m.vPtr, sincePointer, POINTER_STALE_S, POINTER_SPEED_TAU);
          motionStep(m, dt, p);
          if (motionSettled(m, p)) {
            // 到位：精确落到目标（消除浮点残差）
            m.x = m.target;
            m.v = 0;
            m.a = 0;
            if (draggingRef.current) {
              // ⚠️ 拖动中"到位"只意味着**追上了指针**，不是结束：
              // 手指还在按着，位置必须停在指针处，**不能**清掉 draft
              // （清了就会回落到已生效档位，滑块"自己跳回去"）。
              //
              // ⚠️⚠️ 而且**必须继续排下一帧**，不能在这里 return！
              // 早先在这里 return（想省掉空转），造成"拖动时的瞬间卡顿"：
              //   · 指针移动慢/短暂停顿时，滑块很容易追平 → 循环停
              //   · 下一个 pointermove 再 startFrames() → 那里会重置
              //     `lastTsRef.current = nowMs()`，于是**重启后的第一帧
              //     dt ≈ 0**（被夹到 1ms 下限）→ 那一帧位移为 0
              //   · 实测：指针只挪 0.5% 后循环 7 帧就停；重启第 1 帧位移
              //     0.0000%、第 2 帧才 0.2100% —— 视觉上就是"卡一下再动"
              //   · 快速拖动时滑块一直在追、循环不停，所以**偏偏慢拖才卡**
              // 代价：拖动期间即使指针完全不动也保持 ~0.03ms/帧 的空转，
              //       相对 16.7ms 的帧预算可以忽略。
              publishMotion(m);
              frameRef.current = scheduleFrame(step);
              return;
            }
            // 吸附完成：**只有提交回写真正追上了**，才把控制权交回 effectivePct。
            // ⚠️ 无条件交还时，提交还在路上 → 显示瞬间跳回【旧档位】= 抽搐。
            //    预览页没有这套回写管道，所以它从不跳 —— 这里对齐预览页的效果。
            if (Math.abs(effectivePctRef.current - m.target) > 0.001 && holdFramesRef.current < 45) {
              holdFramesRef.current += 1;   // 仅统计用
              draftRef.current = { pct: m.target, index: snapIndexRef.current };
              publishMotion(m);
              frameRef.current = scheduleFrame(step);
              return;   // 继续持有显示，等提交追上（~0.75s 兜底）
            }
            holdFramesRef.current = 0;
            tracePush({ k: "settle-clear", inst: __cesInstanceId, dragging: draggingRef.current, mX: Math.round(m.x * 10000) / 10000, mTarget: Math.round(m.target * 10000) / 10000 });
            draftRef.current = null;
            snapIndexRef.current = null;
            setDraft(null);
            return; // 停循环，不空转（此时确实没事可做了）
          }
          publishMotion(m);
          frameRef.current = scheduleFrame(step);
        };
        frameRef.current = scheduleFrame(step);
      }

      /** 立即到位（「减少动态效果」下的按下 / 松手 / 键盘：不做补间）。 */
      function jumpTo(targetPct) {
        var m = ensureMotion();
        m.target = targetPct;
        m.x = targetPct;
        m.v = 0;
        m.a = 0;
        m.vPtr = 0;
      }

      function pctAt(clientX) {
        var track = trackRef.current;
        if (!track || typeof track.getBoundingClientRect !== "function") return null;
        var rect = track.getBoundingClientRect();
        // 与视觉几何一致：指针落点映射到"旋钮圆心能到的那一段"，所以拖到最左/最右必定命中端点档位。
        var usable = rect.width - KNOB_RADIUS * 2;
        if (!(usable > 0)) return null;
        return clamp01((clientX - rect.left - KNOB_RADIUS) / usable);
      }

      /** 吞掉事件：滑条在官方的 <button> 里，不能让拖动触发那一行的 onClick（会跳进等级列表）。 */
      function swallow(event) {
        if (event && typeof event.stopPropagation === "function") event.stopPropagation();
      }

      /** 拖动落点：只改 target（**不碰 x/v/a**），并按指针速度更新前馈。 */
      function moveTo(clientX) {
        if (levelCount === 0) return;
        var pct = pctAt(clientX);
        if (pct === null) return;
        var m = ensureMotion();
        // 指针速度（EMA 平滑防抖）：用于前馈 + 松手外推。
        // ⚠️ 时间基准必须用**上次 pointermove 的时刻**（lastPointerAtRef），
        // 不能用 lastTsRef —— 后者是帧循环的帧时刻，两次 pointermove 之间可能夹着
        // 若干帧，拿它算 dt 会把速度算错（实测偏低，导致前馈失效）。
        var now = nowMs();
        var dtPtr = (now - lastPointerAtRef.current) / 1000;
        if (lastPtrPctRef.current !== null && dtPtr > 0.001) {
          var raw = (pct - lastPtrPctRef.current) / dtPtr;
          m.vPtr = m.vPtr * (1 - POINTER_SPEED_EMA) + clampAbs(raw, MOTION.vmax) * POINTER_SPEED_EMA;
        }
        lastPtrPctRef.current = pct;
        lastPointerAtRef.current = now; // ← 记录真实事件时刻（衰减判定也用它）
        // 三种模式的分岔点：只有「快速动画」是**不跟手**的（复刻 Codex，实测如此）。
        var fastMode = motionMode() === "fast";
        if (fastMode) {
          // 不跟手：目标永远是"档位格"，指针只在**越过判定线**时才把档位推进一格
          // （前进 1/3、后退 2/3，滞回；见 detentTargetIndex）。
          // 于是观感 = 旋钮停在格子上，一格一格跳，与 Codex 录屏一致。
          var pos = pct * Math.max(1, levelCount - 1);
          var curDetent = detentIndexRef.current;
          if (!(curDetent >= 0)) curDetent = indexFromPct(m.target, levelCount);
          curDetent = detentTargetIndex(pos, curDetent, levelCount, DETENT_THIRD);
          detentIndexRef.current = curDetent;
          m.target = pctFromIndex(curDetent, levelCount);
        } else {
          m.target = pct; // ← 唯一被改的东西
        }
        // 拖动即切档（"拖到哪档就变成哪一档"）：**只在跨档时**写一次。
        if (levelCount > 0) {
          var nowIndex = fastMode ? detentIndexRef.current : indexFromPct(pct, levelCount);
          if (nowIndex >= 0 && nowIndex !== lastCommittedIndexRef.current) {
            lastCommittedIndexRef.current = nowIndex;
            requestCommit(levels[nowIndex].id, false);
          }
        }
        // ⚠️⚠️ 拖动期间**不写回宿主** —— 逐帧诊断得出的结论，也是唯一能根治"松手抽搐"的做法：
        //   · 拖动期写回会让「已生效档位」在拖动过程中不停变化，而引擎位置是**连续滞后**的，
        //     两者必然不同步；松手把显示交还给 effectivePct 时就会看到一次跳变（实测 10.6% / 66%）。
        //   · 参考实现（Bai-2008 的 1.3.10）把"连续拖动期间写回宿主"降到 **0 次**，原因相同。
        //   · 视觉不依赖写回：拖动中显示的是 draft（引擎位置），"会落到哪一档"由本地纯函数算。
        //   · 写回只发生在真正确定意图的时刻：**松手（endDrag）**、键盘、点击档位。
        // （原实现是 `requestCommit(levels[indexFromPct(pct, levelCount)].id, false)`，
        //   即"每秒约 8 次打宿主"——正是上述不同步的来源。要恢复旧行为把那行加回来即可。）
        if (reducedMotion) {
          // 减少动态：直接到位（仍不发散跳变，因为位置就是目标）
          jumpTo(m.target);
          draftRef.current = { pct: m.target, index: indexFromPct(m.target, levelCount) };
          setDraft(draftRef.current);
          return;
        }
        startFrames();
      }

      function endDrag() {
        tracePush({ k: "endDrag-enter", inst: __cesInstanceId, dragging: draggingRef.current, buttonDown: buttonDownRef.current });
        if (!draggingRef.current) return;
        draggingRef.current = false;
        var m = ensureMotion();
        // ⚠️ 这里**必须**读 ref，不能读闭包变量：
        //    窗口级 pointerup 安全网是"挂载时绑定一次"的长寿闭包，直接读闭包里的
        //    levelCount/levels 会永远停在**首次渲染**（那时 levelCount 还是 0）✗ → 每次松手都
        //    release-abort → 不写回 → 显示交还旧档位 = "点一下顿一下"。
        var levelCountNow = levelCountRef.current;
        var levelsNow = levelsRef.current;
        // 档位列表真的为空（从未就绪）时仍然不能落点：indexFromPct(pct, 0) 恒返回 0。
        if (!(levelCountNow > 0) || !levelsNow || levelsNow.length < levelCountNow) {
          tracePush({ k: "release-abort", why: "levelCount=0", mTarget: Math.round(m.target * 10000) / 10000 });
          return;
        }
        tracePush({ k: "pre-release", mTarget: Math.round(m.target * 10000) / 10000, mX: Math.round(m.x * 10000) / 10000, vPtr: Math.round(m.vPtr * 1000) / 1000, levelCount: levelCountNow, projS: (typeof RELEASE_PROJECT_S === "undefined" ? "undef" : RELEASE_PROJECT_S), idxNow: indexFromPct(m.target, levelCountNow) });
        // 落点决策**与动画无关**：一律按指针速度外推。
        // （曾经让 reduced 分支跳过外推 —— 那是错的：无障碍设置只该改"怎么动"，
        //   不该改"落在哪一档"，否则同一个拖动在两种设置下结果不同。）
        var idx;
        if (motionMode() === "fast") {
          // 快速动画：拖动中目标已经推到格子上，松手不再外推、也不再补一段吸附（与 Codex 一致）。
          idx = detentIndexRef.current >= 0 ? detentIndexRef.current : indexFromPct(m.target, levelCountNow);
          idx = Math.max(0, Math.min(levelCountNow - 1, idx));
          m.vPtr = 0;
          m.target = pctFromIndex(idx, levelCountNow);
        } else {
          idx = releaseIndexFor(m.target, m.vPtr, levelCountNow);
          m.vPtr = 0;
          if (reducedMotion) {
            jumpTo(pctFromIndex(idx, levelCountNow));
          } else {
            // 松手：目标改为档位点，但运动状态（速度）**继承**下来 ——
            // 这样从拖到吸也是连续的，不会重播一段吸附动画。
            m.target = pctFromIndex(idx, levelCountNow);
          }
        }
        snapIndexRef.current = idx;
        // 写回与视觉无关（档位已由指针决定），所以**松手瞬间就发**。
        if (idx >= 0 && idx < levelCountNow) requestCommit(levelsNow[idx].id, true);
        tracePush({ k: "release", idx: idx, x: Math.round(m.x * 10000) / 10000, target: Math.round(m.target * 10000) / 10000, eff: Math.round(effectivePctRef.current * 10000) / 10000, showIdx: snapIndexRef.current });
        if (reducedMotion) {
          draftRef.current = null;
          snapIndexRef.current = null;
          setDraft(null);
          return;
        }
        publishMotion(m);
        startFrames();
      }

      function onTrackPointerDown(event) {
        if (locked || levelCount === 0) return;
        swallow(event);
        draggingRef.current = true;
        buttonDownRef.current = true;
        // 起手时对齐"已写回档位"，避免刚按下就写一次无意义的档位
        lastCommittedIndexRef.current = -1;
        // 快速动画：按下即把"当前格"对齐到指针所在格（点击远处 = 直接跳到那一档）。
        detentIndexRef.current = -1;
        if (motionMode() === "fast") {
          var p0 = pctAt(event.clientX);
          if (p0 !== null && levelCount > 0) detentIndexRef.current = indexFromPct(p0, levelCount);
        }
        holdFramesRef.current = 0;
        releaseGenRef.current += 1;   // 新操作开始：上一次松手的提交重试立即作废
        snapIndexRef.current = null;
        try {
          if (event.currentTarget && typeof event.currentTarget.setPointerCapture === "function" && event.pointerId !== undefined) {
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        } catch (error) { /* 指针捕获失败不影响拖动 */ }
        // 按下 = **召唤**：目标改成指针位置，但 x/v/a 全部保留（不是"抓住滑块"，没有抓取偏移）。
        lastPtrPctRef.current = null;
        moveTo(event.clientX);
      }

      function onTrackPointerMove(event) {
        if (!draggingRef.current) return;
        // 没按着键 ⇒ 不是拖动（松手瞬间的合并事件 / pointerup 丢失的残留状态）。
        // 只忽略、不结束：在这里 endDrag() 会导致"先往左再回正"那种抽搐。
        if (event && event.buttons === 0 && buttonDownRef.current !== true) return;
        swallow(event);
        moveTo(event.clientX);
      }

      function onKeyDown(event) {
        if (locked || levelCount === 0) return;
        var key = event.key;
        var index = draftRef.current !== null ? draftRef.current.index : shownIndex;
        var next = null;
        if (key === "ArrowLeft" || key === "ArrowDown") next = Math.max(0, index - 1);
        else if (key === "ArrowRight" || key === "ArrowUp") next = Math.min(levelCount - 1, index + 1);
        else if (key === "Home") next = 0;
        else if (key === "End") next = levelCount - 1;
        else return; // Escape / Enter / Tab 交给官方菜单自己处理
        swallow(event);
        if (typeof event.preventDefault === "function") event.preventDefault();
        // 键盘改档：同样**只改目标**，运动状态延续（不瞬移）。
        var m = ensureMotion();
        var targetPct = pctFromIndex(next, levelCount);
        if (reducedMotion) {
          jumpTo(targetPct);
          snapIndexRef.current = null;
          draftRef.current = null;
          setDraft(null);
        } else {
          snapIndexRef.current = next;
          m.target = targetPct;
          m.vPtr = 0;
          publishMotion(m);
          startFrames();
        }
        requestCommit(levels[next].id, true);
      }

      // 卸载时必须停掉帧循环，否则组件销毁后还会 setDraft 到已卸载的组件
      // （官方菜单反复开关时就会发生）。
      React.useEffect(function () {
        return function () {
          cancelFrame(frameRef.current);
          frameRef.current = null;
        };
      }, []);

      var trackTitle = shownLevel !== null
        ? tr("effortSliderTitle", "推理等级：{name}", { name: shownLevel.name })
        : tr("effortSliderLabel", "推理等级");

      var tickNodes = [];
      for (var t = 0; t < levelCount; t += 1) {
        tickNodes.push(React.createElement("span", {
          key: "tick-" + levels[t].id,
          className: "ces-tick",
          "data-ces-part": "tick",
          "data-on": t <= shownIndex ? "1" : "0",
          style: { left: knobOffsetOf(pctFromIndex(t, levelCount)) },
        }));
      }

      // 星空：所有出现粒子的档位都用这一套动画（统一的横穿 + 不消失 + 亮度即大小）。
      // 速率随**位置**变化（速度变化保留）：MAX 档 1.5s 横穿，high 档 3s，左端约 8.6s。
      var positionSpeed = speedFor(shownPct);
      var starCount = starCountFor(shownPct);
      var starLayerOpacity = starLayerOpacityFor(shownPct);
      var particleNodes = [];
      for (var s = 0; s < starCount; s += 1) {
        var starBrightness = starBrightnessFor(s);
        // 「减少动态效果」的放缓在 JS 里算（时长是内联的，不走媒体查询覆盖）
        var starDuration = starDurationFor(s, positionSpeed) * (effectiveReducedMotion ? REDUCED_MOTION_SLOWDOWN : 1);
        particleNodes.push(React.createElement(
          "span",
          {
            key: "star-" + s,
            className: "ces-star",
            "data-ces-part": "star",
            style: {
              top: PARTICLES[s].y + "%",
              // ⚠️ 时长与**负相位**必须直接内联：写成 CSS 变量时真宿主里相位不生效，
              //    会出现"一打开星星全挤在起点"（见样式表里的注释）。
              animationDuration: starDuration.toFixed(3) + "s",
              animationDelay: starDelayFor(s, starDuration).toFixed(3) + "s",
            },
          },
          React.createElement("span", {
            className: "ces-star__dot",
            "data-ces-part": "particle",
            // 亮度即大小系数：越亮越大（同时也是不透明度）
            "data-brightness": starBrightness.toFixed(3),
            style: { "--ces-b": starBrightness.toFixed(3) },
          }),
        ));
      }

      var ui = null;
      if (host !== null && host.container && levelCount > 0) {
        ui = ReactDOM.createPortal(
          React.createElement(
            "div",
            {
              className: "ces-inline",
              "data-ces-part": "root",
              "data-energy": energyOn ? "1" : "0",
              "data-motion": effectiveReducedMotion ? "concise" : "full",
              "data-reached-ticks": readSettings().reachedTicks,
              "data-busy": busy ? "1" : "0",
              style: { "--ces-energy": String(energy) },
            },
            React.createElement(
              "div",
              {
                ref: trackRef,
                className: "ces-track",
                "data-ces-part": "track",
                role: "slider",
                tabIndex: locked ? -1 : 0,
                "aria-label": tr("effortSliderLabel", "推理等级"),
                "aria-valuemin": 0,
                "aria-valuemax": Math.max(0, levelCount - 1),
                "aria-valuenow": shownIndex,
                "aria-valuetext": shownLevel !== null ? shownLevel.name : "",
                "aria-disabled": locked ? "true" : undefined,
                title: trackTitle,
                onPointerDown: onTrackPointerDown,
                onPointerMove: onTrackPointerMove,
                onPointerUp: endDrag,
                onPointerCancel: endDrag,
                onKeyDown: onKeyDown,
                onClick: swallow,
              },
              React.createElement("div", {
                className: "ces-fill",
                "data-ces-part": "fill",
                // 填充宽度 = 到旋钮圆心为止（不是整条轨道）；背景是"左蓝 → 当前位置颜色"的渐变。
                style: { width: knobOffset, background: fillBackground },
              }),
              // 能力层（星云 + 扫光）：透明度 = 能量强度，负责"通电"的渐入。
              React.createElement(
                "div",
                { className: "ces-energy", "data-ces-part": "energy", style: { width: knobOffset } },
                React.createElement("div", { className: "ces-energy__sweep", "data-ces-part": "sweep" }),
              ),
              // 星星单独一层：不跟星云淡入（否则 high 档星星被星云的 0.5 透明度压得看不见）。
              React.createElement(
                "div",
                {
                  className: "ces-stars",
                  "data-ces-part": "stars",
                  style: { width: knobOffset, opacity: starLayerOpacity.toFixed(3) },
                },
                particleNodes,
              ),
              tickNodes,
              React.createElement("div", {
                className: "ces-knob",
                "data-ces-part": "knob",
                style: { left: knobOffset },
              }),
            ),
            errorText_ !== null
              ? React.createElement("div", { className: "ces-error", "data-ces-part": "error", role: "status" }, errorText_)
              : null,
          ),
          host.container,
        );
      }

      // 锚点：不可见、不占位，只用来(1)拿住插槽给的 sessionId 上下文 (2)反查自己的 composer。
      return React.createElement("span", {
        ref: anchorRef,
        hidden: true,
        "data-ces-part": "anchor",
        "aria-hidden": "true",
      }, ui);
    }

    /* ════════════════════════════ 插件接线 ════════════════════════════ */

    /**
     * 三个服务都是官方客户端插件已经在用的（slots 不必说；sessions 与 modelDirectories
     * 是 client-ui-model-selection / client-ui-workspace 的既有注入面）。
     * 这里刻意**不**注入 locale / theme：多声明一个可能不存在的服务会让 fiber 停在
     * PENDING，代价远大于省下两行文案。
     *
     * ⚠️ 补充 `remote` / `remote.session`（参考实现的事故 #2）：
     *    接管官方那一席之后，本插件成了 `directoryFor()` 的**唯一调用方** —— Cordis 的服务访问
     *    跟着**调用方 ctx** 走，少声明这两个服务时，目录解析会在"会话作用域/绑定尚未就绪"时长期
     *    失败 → `modelDirectories.directoryFor(sessionId)` 拿不到目录 → **档位列表为空**
     *    （实测 `levelCount = 0`）→ 于是：拖动不开始 / 落点算成第 0 档 / 松手写回被放弃
     *    → 显示交还时跳一大截（用户看到的"松手抽搐 / 乱跳"就是这个）。
     *    诊断证据：`{"k":"release-abort","why":"levelCount=0"}` 出现 4 次。
     */
    var inject = ["slots", "sessions", "modelDirectories", "remote", "remote.session"];

    function apply(ctx) {
      try {
        ctx.slots.inject(SLOT_NAME, function () {
          return ctx.slots.register(
            {
              name: SLOT_NAME,
              id: ENTRY_ID,
              order: ENTRY_ORDER,
              label: function () { return "Reasoning effort"; },
              // 会话 id 的第二条来路（标准 props 一般已经带了；两条都走 props.sessionId）。
              inject: function (sessionId) { return { sessionId: sessionId }; },
            },
            function SlotComponent(props) {
              return React.createElement(CodexEffortSlider, Object.assign({}, props, { __ctx: ctx }));
            },
          );
        });
      } catch (error) {
        // 注册失败只意味着这块控件不出现，绝不能连累宿主输入区。
        try { console.error("[codex-effort-slider] 插槽注册失败，控件不会出现：", error); } catch (e) { /* 忽略 */ }
      }
    }


    exports.apply = apply;
    exports.inject = inject;
    // 离线测试用的接缝（纯函数 + 桥 + 组件本身）。运行时无副作用。
    exports.__internals = {
      /** 迁移改造：宿主把本地化解析器注入进来的唯一入口。 */
      __setTranslator: function (fn) { translator = typeof fn === "function" ? fn : null; },
      CSS: CSS,
      SLOT_NAME: SLOT_NAME,
      ENTRY_ID: ENTRY_ID,
      PARTICLES: PARTICLES,
      ROW_PADDING_BLOCK: ROW_PADDING_BLOCK,
      EFFORT_ROW_LABELS: EFFORT_ROW_LABELS,
      CodexEffortSlider: CodexEffortSlider,
      createMenuBridge: createMenuBridge,
      findEffortRow: findEffortRow,
      firstSpanText: firstSpanText,
      levelsOf: levelsOf,
      resolveLevels: resolveLevels,
      modelOf: modelOf,
      effectiveEffortId: effectiveEffortId,
      indexOfLevel: indexOfLevel,
      indexFromPct: indexFromPct,
      pctFromIndex: pctFromIndex,
      detentTargetIndex: detentTargetIndex,
      DETENT_THIRD: DETENT_THIRD,
      energyFor: energyFor,
      speedFor: speedFor,
      particleCountFor: particleCountFor,
      starCountFor: starCountFor,
      starLayerOpacityFor: starLayerOpacityFor,
      starBrightnessFor: starBrightnessFor,
      starDurationFor: starDurationFor,
      starDelayFor: starDelayFor,
      starHash01: starHash01,
      STARFIELD_DURATION_MEAN: STARFIELD_DURATION_MEAN,
      STARFIELD_DURATION_SPREAD: STARFIELD_DURATION_SPREAD,
      STARFIELD_MIN: STARFIELD_MIN,
      GOLDEN_RATIO: GOLDEN_RATIO,
      MAX_SPEED_FACTOR: MAX_SPEED_FACTOR,
      REDUCED_MOTION_SLOWDOWN: REDUCED_MOTION_SLOWDOWN,
      readSettings: readSettings,
      motionMode: motionMode,
      motionParamsForMode: motionParamsForMode,
      tracePush: tracePush,
      MIN_HEIGHT_SLOTS: MIN_HEIGHT_SLOTS,
      fillColorFor: fillColorFor,
      fillBackgroundFor: fillBackgroundFor,
      valueColorFor: valueColorFor,
      isOffLevel: isOffLevel,
      findValueElement: findValueElement,
      findSeatEffort: findSeatEffort,
      knobOffsetOf: knobOffsetOf,
      KNOB_RADIUS: KNOB_RADIUS,
      KNOB_SIZE: KNOB_SIZE,
      TRACK_HEIGHT: TRACK_HEIGHT,
      BASE_SPEEDUP: BASE_SPEEDUP,
      ENERGY_START: ENERGY_START,
      ENERGY_END: ENERGY_END,
      clamp01: clamp01,
      installStyles: installStyles,
      // ── 连续运动引擎（导出是为了让测试能注入固定 dt 精确断言）──
      MOTION: MOTION,
      MOTION_REDUCED: MOTION_REDUCED,
      MOTION_FAST: MOTION_FAST,
      RELEASE_PROJECT_S: RELEASE_PROJECT_S,
      POINTER_SPEED_EMA: POINTER_SPEED_EMA,
      POINTER_STALE_S: POINTER_STALE_S,
      POINTER_SPEED_TAU: POINTER_SPEED_TAU,
      motionStep: motionStep,
      motionSettled: motionSettled,
      decayPointerSpeed: decayPointerSpeed,
      releaseIndexFor: releaseIndexFor,
      clampAbs: clampAbs,
    };
			return module.exports;
		})();

		exports.__effortSlider = effortSliderVendor.__internals;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
