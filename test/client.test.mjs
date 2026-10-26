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

test("浏览器半区：四项功能各自的插槽注册齐全", () => {
	const { seen } = loadClient();
	assert.deepEqual(seen.slotInjects, [
		"conversation.input.overlay",
		"conversation.input.overlay",
		"conversation.input.right",
	]);
	assert.deepEqual(seen.registrations, [
		["conversation.input.overlay", "provider-header", 90],
		["conversation.input.overlay", "selection-add", 91],
		["conversation.input.right", "codex-effort-slider", 40],
	]);
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
		"effortErrorDirectory",
		"effortErrorFailed",
		"effortErrorNotReady",
		"effortErrorTimeout",
		"effortSliderLabel",
		"effortSliderTitle",
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

test("模型目录服务不存在时只降级提供商头部，选文功能仍注册", () => {
	const { seen } = loadClient({ modelService: false });
	assert.deepEqual(seen.registrations, [["conversation.input.overlay", "selection-add", 91]]);
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
	]);
});

test("模型目录服务不存在时滑条与提供商头部都不装配，选文与主题切换照常", () => {
	const { seen } = loadClient({ modelService: false });
	assert.deepEqual(seen.registrations, [["conversation.input.overlay", "selection-add", 91]]);
	assert.deepEqual(seen.effects, [
		"dsh-session-plus: dictionaries",
		"dsh-session-plus: styles",
		"dsh-session-plus: theme switcher",
	]);
});

test("v0.6.0 迁入的滑条不含被移除的设置面板与本地存储", () => {
	const { mod } = loadClient();
	const vendor = mod.__effortSlider;
	assert.equal(typeof vendor, "object", "必须导出 __effortSlider 供离线测试使用");
	const removed = ["writeSettings", "normalizeSettings", "schemaDefaults", "dumpTrace", "traceClear", "installSettingsUi", "openSettingsPanel", "SETTINGS_SCHEMA", "SETTINGS_KEY", "SETTINGS_EVENT"];
	assert.deepEqual(Object.keys(vendor).filter((key) => removed.includes(key)), [], "被移除的设置/诊断接缝不得再导出");
	const source = readFileSync(CLIENT_PATH, "utf8");
	// 设置面板与本地存储整段不迁移：这些标识符不得再出现。
	for (const gone of ["localStorage", "滑条设置", "复制诊断", "SETTINGS_SCHEMA", "openSettingsPanel", "ces-set__"]) {
		assert.equal(source.includes(gone), false, `${gone} 不应再出现在产物里`);
	}
	// 但必须保留「右键不弹面板」的拦截器：旧版本残留的 document 级监听不得把面板弹到我们滑条上。
	assert.ok(source.includes("stopImmediatePropagation"), "需要 window 捕获阶段的右键拦截器");
});
