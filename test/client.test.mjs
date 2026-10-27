// dsh-session-plus — 浏览器半区注册面回归测试（node:test）
//
// 守护「只移除打开工作区，不破坏另外两项功能」，并在 v0.5.0 后同时守护新增的
// 第三项功能（账户菜单主题切换）：在最小 stub 环境里加载 lib/client.js
// （ModuleLoader bundle）并真正执行一次 apply()，把注册面固定下来。
// 任何误删共享基建（locale 词典键、conversation.input.overlay 席位、样式 effect、
// 客户端 inject）都会在这里失败；被移除功能的注册点若复活同样会失败。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLIENT_PATH = fileURLToPath(new URL("../lib/client.js", import.meta.url));

/** 在最小 stub 环境里加载 bundle 并执行 apply()，返回观测到的注册面。 */
function loadClient({ modelService = true, themeService = true } = {}) {
	const source = readFileSync(CLIENT_PATH, "utf8");
	let definition = null;
	const windowStub = { __ModuleLoader__: { load: (def) => { definition = def; } } };
	const documentStub = {
		createElement: () => ({ dataset: {}, textContent: "", remove() {} }),
		head: { appendChild() {} },
	};
	new Function("window", "document", source)(windowStub, documentStub);
	assert.notEqual(definition, null, "lib/client.js 必须通过 __ModuleLoader__.load 注册自身");

	const reactStub = new Proxy({}, { get: () => () => null });
	const mod = definition.factory((name) => (name === "react" ? reactStub : { createPortal: () => null }));

	const seen = { effects: [], slotInjects: [], registrations: [], locales: [] };
	const ctx = {
		effect: (fn, name) => { seen.effects.push(name); return fn(); },
		on: () => () => {},
		locale: {
			register: (ns, dicts) => {
				seen.locales.push([ns, Object.keys(dicts.zh).sort(), Object.keys(dicts.en).sort()]);
				return () => {};
			},
			bind: () => () => "",
			subscribe: () => () => {},
		},
		slots: {
			inject: (name, fn) => { seen.slotInjects.push(name); return fn(); },
			register: (spec) => { seen.registrations.push([spec.name, spec.id, spec.order]); return () => {}; },
		},
		get: () => undefined,
	};
	ctx.inject = (keys, fn) => {
		// 主题切换按服务可用性装配：服务缺失时整条功能不部署（另两项功能不受影响）。
		if (Array.isArray(keys) && keys.includes("theme")) { if (themeService) fn(ctx); return; }
		if (modelService) fn(ctx);
	};
	ctx.modelDirectories = { directoryFor: () => null };
	ctx.theme = { getTheme: () => ({ preference: "system" }), setTheme: () => {} };
	mod.apply(ctx);
	return { definition, mod, seen };
}

test("浏览器半区：bundle id 与客户端 inject 保持不变", () => {
	const { definition, mod } = loadClient();
	assert.equal(definition.id, "dsh-session-plus");
	assert.deepEqual(mod.inject, ["slots", "locale"]);
	assert.equal(typeof mod.apply, "function");
});

test("浏览器半区：六处功能注册齐全（3 个功能席位 + 5 个设置行 + 1 个新会话按钮）", () => {
	const { seen } = loadClient();
	assert.deepEqual(seen.slotInjects, [
		"conversation.input.overlay",
		"conversation.input.overlay",
		"conversation.input.right",
		"settings.general.item",
		"settings.general.item",
		"settings.general.item",
		"settings.general.item",
		"settings.general.item",
		"conversation.hero.options",
	]);
	assert.deepEqual(seen.registrations, [
		["conversation.input.overlay", "provider-header", 90],
		["conversation.input.overlay", "selection-add", 91],
		["conversation.input.right", "codex-effort-slider", 40],
		["settings.general.item", "session-plus/provider-header", 91],
		["settings.general.item", "session-plus/selection-add", 92],
		["settings.general.item", "session-plus/theme-switch", 93],
		["settings.general.item", "session-plus/effort-slider", 94],
		["settings.general.item", "session-plus/open-in-session", 95],
		["conversation.hero.options", "session-plus/open-in-app", 50],
	]);
});

test("浏览器半区：设置行 order 全部落在官方上传行（90）与版本行（100）之间", () => {
	const { seen } = loadClient();
	const rows = seen.registrations.filter(([slot]) => slot === "settings.general.item");
	assert.equal(rows.length, 5, "必须有 5 个功能开关行");
	for (const [, , order] of rows) {
		assert.ok(order > 90 && order < 100, `设置行 order ${order} 必须紧跟官方上传 Session Log 行之后`);
	}
});

test("浏览器半区：locale 词典、样式 effect 与主题切换 effect 均已装配", () => {
	const { seen } = loadClient();
	assert.deepEqual(seen.effects, [
		"dsh-session-plus: dictionaries",
		"dsh-session-plus: styles",
		"dsh-session-plus: theme switcher",
		"dsh-session-plus: effort slider",
	]);
	const expected = [
		"addToConversation",
		"app.androidstudio",
		"app.cursor",
		"app.explorer",
		"app.filemanager",
		"app.finder",
		"app.fork",
		"app.ghostty",
		"app.gitbash",
		"app.github",
		"app.gitkraken",
		"app.gnometerminal",
		"app.goland",
		"app.intellij",
		"app.iterm",
		"app.kitty",
		"app.konsole",
		"app.phpstorm",
		"app.pycharm",
		"app.rider",
		"app.rustrover",
		"app.smartgit",
		"app.sourcetree",
		"app.sublimemerge",
		"app.sublimetext",
		"app.terminal",
		"app.tower",
		"app.vscode",
		"app.vscodeinsiders",
		"app.warp",
		"app.webstorm",
		"app.windowsterminal",
		"app.windsurf",
		"app.xcode",
		"app.zed",
		"effortErrorDirectory",
		"effortErrorFailed",
		"effortErrorNotReady",
		"effortErrorTimeout",
		"effortSliderLabel",
		"effortSliderTitle",
		"featEffortDesc",
		"featEffortTitle",
		"featOpenInSessionDesc",
		"featOpenInSessionTitle",
		"featProviderDesc",
		"featProviderTitle",
		"featSelectionDesc",
		"featSelectionTitle",
		"featThemeDesc",
		"featThemeTitle",
		"openInAppsError",
		"openInBusy",
		"openInDefault",
		"openInFailed",
		"openInMore",
		"openInTitle",
		"providerEntry",
		"providerLabel",
		"themeDark",
		"themeGroup",
		"themeLight",
		"themeSwitchHint",
		"themeSystem",
		"themeUnavailable",
	];
	assert.deepEqual(seen.locales, [["sessionPlus", expected, expected]]);
});

test("浏览器半区：会话头部与 shell.overlay 的注册已彻底移除", () => {
	const { seen } = loadClient();
	const surface = JSON.stringify(seen);
	for (const gone of ["shell.overlay", "conversation.session.header.utilities", "open-workspace"]) {
		assert.equal(surface.includes(gone), false, `${gone} 不应再出现在注册面中`);
	}
});

/** 不依赖 modelDirectories / theme 服务的注册面（设置行 + 新会话按钮）。 */
const SERVICE_FREE_ROWS = [
	["settings.general.item", "session-plus/provider-header", 91],
	["settings.general.item", "session-plus/selection-add", 92],
	["settings.general.item", "session-plus/theme-switch", 93],
	["settings.general.item", "session-plus/effort-slider", 94],
	["settings.general.item", "session-plus/open-in-session", 95],
	["conversation.hero.options", "session-plus/open-in-app", 50],
];

test("模型目录服务不存在时只降级提供商头部，选文功能仍注册", () => {
	const { seen } = loadClient({ modelService: false });
	assert.deepEqual(seen.registrations, [["conversation.input.overlay", "selection-add", 91], ...SERVICE_FREE_ROWS]);
});

test("主题服务不存在时整条主题切换不装配，其余功能不受影响", () => {
	const { seen } = loadClient({ themeService: false });
	assert.deepEqual(seen.effects, [
		"dsh-session-plus: dictionaries",
		"dsh-session-plus: styles",
		"dsh-session-plus: effort slider",
	]);
	assert.deepEqual(seen.registrations, [
		["conversation.input.overlay", "provider-header", 90],
		["conversation.input.overlay", "selection-add", 91],
		["conversation.input.right", "codex-effort-slider", 40],
		...SERVICE_FREE_ROWS,
	]);
});

test("模型目录服务不存在时滑条与提供商头部都不装配，选文与主题切换照常", () => {
	const { seen } = loadClient({ modelService: false });
	assert.deepEqual(seen.registrations, [["conversation.input.overlay", "selection-add", 91], ...SERVICE_FREE_ROWS]);
	assert.deepEqual(seen.effects, [
		"dsh-session-plus: dictionaries",
		"dsh-session-plus: styles",
		"dsh-session-plus: theme switcher",
	]);
});

test("功能开关不依赖任何可选服务：两个服务都缺席时 5 个设置行仍注册", () => {
	const { seen } = loadClient({ modelService: false, themeService: false });
	const rows = seen.registrations.filter(([slot]) => slot === "settings.general.item");
	assert.equal(rows.length, 5, "设置行必须与服务可用性解耦，否则用户无法再打开功能");
	assert.equal(seen.registrations.some(([slot]) => slot === "conversation.hero.options"), true);
});

test("v0.6.0 迁入的滑条不含被移除的设置面板与 vendored 本地存储", () => {
	const { mod } = loadClient();
	const vendor = mod.__effortSlider;
	assert.equal(typeof vendor, "object", "必须导出 __effortSlider 供离线测试使用");
	const removed = ["writeSettings", "normalizeSettings", "schemaDefaults", "dumpTrace", "traceClear", "installSettingsUi", "openSettingsPanel", "SETTINGS_SCHEMA", "SETTINGS_KEY", "SETTINGS_EVENT"];
	assert.deepEqual(Object.keys(vendor).filter((key) => removed.includes(key)), [], "被移除的设置/诊断接缝不得再导出");
	const source = readFileSync(CLIENT_PATH, "utf8");
	// 设置面板整段不迁移：这些标识符不得再出现。
	for (const gone of ["滑条设置", "复制诊断", "SETTINGS_SCHEMA", "openSettingsPanel", "ces-set__"]) {
		assert.equal(source.includes(gone), false, `${gone} 不应再出现在产物里`);
	}
	// v0.7.0 起 localStorage 只服务于「功能开关」；vendored 滑条段内仍不得出现。
	const vendorStart = source.indexOf("const effortSliderVendor = (() => {");
	const vendorEnd = source.indexOf("exports.__effortSlider");
	assert.ok(vendorStart > 0 && vendorEnd > vendorStart, "vendored 滑条段必须可定位");
	assert.equal(source.slice(vendorStart, vendorEnd).includes("localStorage"), false, "vendored 滑条段不得使用本地存储");
	// 但必须保留「右键不弹面板」的拦截器：旧版本残留的 document 级监听不得把面板弹到我们滑条上。
	assert.ok(source.includes("stopImmediatePropagation"), "需要 window 捕获阶段的右键拦截器");
});
