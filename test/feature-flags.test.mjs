// dsh-session-plus — v0.7.0 功能开关仓库的离线测试（node:test）
//
// 覆盖：默认全开、localStorage 持久化与容错、订阅通知去重、5 个设置行的
// 功能映射与文案键完整性。这些用例不需要真实 DOM / React：开关仓库与设置行
// 元数据都在 bundle 的 __internals 接缝上。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLIENT_PATH = fileURLToPath(new URL("../lib/client.js", import.meta.url));

/** 最小 localStorage 替身（可预置内容）。 */
function fakeStorage(initial = {}) {
	const map = new Map(Object.entries(initial));
	return {
		map,
		getItem: (key) => (map.has(key) ? map.get(key) : null),
		setItem: (key, value) => { map.set(key, String(value)); },
		removeItem: (key) => { map.delete(key); },
	};
}

/** battery 里让 setItem 抛错的替身（隐私模式/配额不足）。 */
function throwingStorage() {
	return {
		getItem: () => null,
		setItem: () => { throw new Error("QuotaExceededError"); },
		removeItem: () => {},
	};
}

/** 在最小 stub 环境里加载 bundle（不执行 apply，只看开关仓库与元数据）。 */
function loadBundle({ storage, extraWindow = {} } = {}) {
	const source = readFileSync(CLIENT_PATH, "utf8");
	let definition = null;
	const windowStub = { __ModuleLoader__: { load: (def) => { definition = def; } }, ...extraWindow };
	if (storage !== undefined) windowStub.localStorage = storage;
	const documentStub = {
		createElement: () => ({ dataset: {}, textContent: "", remove() {} }),
		head: { appendChild() {} },
	};
	new Function("window", "document", source)(windowStub, documentStub);
	assert.notEqual(definition, null, "lib/client.js 必须通过 __ModuleLoader__.load 注册自身");
	const reactStub = new Proxy({}, { get: () => () => null });
	const mod = definition.factory((name) => (name === "react" ? reactStub : { createPortal: () => null }));
	return { mod, windowStub, definition };
}

/** 执行一次 apply，返回注册面（含 settings.general.item 的条目）。 */
function applyWithCapture({ storage } = {}) {
	const { mod } = loadBundle({ storage });
	const seen = { locales: [], registrations: [], effects: [] };
	const ctx = {
		effect: (fn, name) => { seen.effects.push(name); const cleanup = fn(); return cleanup; },
		on: () => () => {},
		locale: {
			register: (ns, dicts) => { seen.locales.push({ ns, zh: dicts.zh, en: dicts.en }); return () => {}; },
			bind: () => (key) => key,
			subscribe: () => () => {},
		},
		slots: {
			inject: (name, fn) => fn(),
			register: (spec) => { seen.registrations.push(spec); return () => {}; },
		},
		modelDirectories: { directoryFor: () => null },
		inject: (keys, fn) => {
			// 只跑无必选服务的分支：modelDirectories / theme 的装配在 client.test.mjs 覆盖。
			if (Array.isArray(keys) && (keys.includes("modelDirectories") || keys.includes("theme"))) return;
			fn(ctx);
		},
		get: (name) => ctx[name],
	};
	ctx.theme = { getTheme: () => ({ preference: "system" }), setTheme: () => {} };
	mod.apply(ctx);
	return { mod, seen };
}

test("开关：默认 5 项全开", () => {
	const { mod } = loadBundle({ storage: fakeStorage() });
	const internals = mod.__internals;
	assert.deepEqual(internals.FEATURE_IDS, [
		"provider-header",
		"selection-add",
		"theme-switch",
		"effort-slider",
		"open-in-session",
	]);
	assert.deepEqual(internals.featureFlags.snapshot(), {
		"provider-header": true,
		"selection-add": true,
		"theme-switch": true,
		"effort-slider": true,
		"open-in-session": true,
	});
});

test("开关：写入落到 localStorage 的固定键上，并可被新实例读回", () => {
	const storage = fakeStorage();
	const { mod } = loadBundle({ storage });
	mod.__internals.featureFlags.set("theme-switch", false);
	const stored = JSON.parse(storage.map.get(mod.__internals.FLAGS_STORAGE_KEY));
	assert.equal(stored["theme-switch"], false);
	assert.equal(stored["provider-header"], true);

	// 新实例（模拟重新打开页面）读回同一状态。
	const second = loadBundle({ storage });
	assert.equal(second.mod.__internals.featureFlags.get("theme-switch"), false);
	assert.equal(second.mod.__internals.featureFlags.get("effort-slider"), true);
});

test("开关：只缺部分键时缺的按默认开启", () => {
	const storage = fakeStorage({ "dsh.session-plus.features.v1": JSON.stringify({ "effort-slider": false }) });
	const { mod } = loadBundle({ storage });
	const flags = mod.__internals.featureFlags;
	assert.equal(flags.get("effort-slider"), false);
	assert.equal(flags.get("provider-header"), true);
	assert.equal(flags.get("open-in-session"), true);
});

test("开关：JSON 损坏 / 非对象 / 非法值一律退回默认，不抛错", () => {
	for (const raw of ["{oops", "null", "[1,2]", '"text"', "42", '{"theme-switch":"no"}']) {
		const storage = fakeStorage({ "dsh.session-plus.features.v1": raw });
		const { mod } = loadBundle({ storage });
		assert.deepEqual(mod.__internals.featureFlags.snapshot(), {
			"provider-header": true,
			"selection-add": true,
			"theme-switch": true,
			"effort-slider": true,
			"open-in-session": true,
		}, `损坏内容 ${raw} 必须退回默认`);
	}
});

test("开关：localStorage 写入抛错时仍立即生效（仅内存）", () => {
	const { mod } = loadBundle({ storage: throwingStorage() });
	const flags = mod.__internals.featureFlags;
	assert.doesNotThrow(() => flags.set("selection-add", false));
	assert.equal(flags.get("selection-add"), false);
});

test("开关：没有 localStorage 时也能读写（内存态）", () => {
	const { mod } = loadBundle({});
	const flags = mod.__internals.featureFlags;
	flags.set("open-in-session", false);
	assert.equal(flags.get("open-in-session"), false);
	assert.equal(flags.get("effort-slider"), true);
});

test("开关：未知 id 被忽略，且不产生写入", () => {
	const storage = fakeStorage();
	const { mod } = loadBundle({ storage });
	const flags = mod.__internals.featureFlags;
	flags.set("not-a-feature", false);
	assert.equal(storage.map.has(mod.__internals.FLAGS_STORAGE_KEY), false);
	assert.equal(flags.get("not-a-feature"), true);
});

test("开关：订阅收到 (id, value)，同值重复写入不重复通知，退订后静默", () => {
	const { mod } = loadBundle({ storage: fakeStorage() });
	const flags = mod.__internals.featureFlags;
	const events = [];
	const off = flags.subscribe((id, value) => events.push([id, value]));
	flags.set("effort-slider", false);
	flags.set("effort-slider", false);
	flags.set("effort-slider", true);
	assert.deepEqual(events, [["effort-slider", false], ["effort-slider", true]]);
	off();
	flags.set("effort-slider", false);
	assert.equal(events.length, 2);
});

test("开关：toggle 取反，reset 后重新从 localStorage 读取", () => {
	const storage = fakeStorage();
	const { mod } = loadBundle({ storage });
	const flags = mod.__internals.featureFlags;
	flags.toggle("provider-header");
	assert.equal(flags.get("provider-header"), false);
	storage.setItem(mod.__internals.FLAGS_STORAGE_KEY, JSON.stringify({ "provider-header": true }));
	flags.reset();
	assert.equal(flags.get("provider-header"), true);
});

test("设置行：5 行与 5 个功能一一对应、order 递增、文案键中英齐备", () => {
	const { mod, seen } = applyWithCapture({ storage: fakeStorage() });
	const rows = mod.__internals.FEATURE_ROWS;
	assert.equal(rows.length, 5);
	assert.deepEqual(rows.map((row) => row.feature), mod.__internals.FEATURE_IDS, "开关顺序必须与功能清单一致");

	const settings = seen.registrations.filter((spec) => spec.name === "settings.general.item");
	assert.equal(settings.length, 5);
	assert.deepEqual(settings.map((spec) => spec.id), rows.map((row) => row.id));
	assert.deepEqual(settings.map((spec) => spec.order), [91, 92, 93, 94, 95]);
	for (const spec of settings) assert.equal(spec.locale, "sessionPlus");

	const dicts = seen.locales[0];
	for (const row of rows) {
		for (const key of [row.title, row.desc]) {
			assert.equal(typeof dicts.zh[key], "string", `zh 缺少 ${key}`);
			assert.equal(typeof dicts.en[key], "string", `en 缺少 ${key}`);
			assert.notEqual(dicts.zh[key], "", `zh 的 ${key} 不能为空`);
		}
	}
});

test("设置行：open-in-app 按钮文案与官方应用名键中英齐备", () => {
	const { seen } = applyWithCapture({ storage: fakeStorage() });
	const { zh, en } = seen.locales[0];
	const required = ["openInTitle", "openInMore", "openInDefault", "openInAppsError", "openInFailed", "openInBusy"];
	for (const key of required) {
		assert.equal(typeof zh[key], "string", `zh 缺少 ${key}`);
		assert.equal(typeof en[key], "string", `en 缺少 ${key}`);
	}
	// 官方目录里的 34 个应用 id 都必须有中英文名，否则菜单会退回裸 id。
	const appIds = ["finder", "explorer", "filemanager", "cursor", "vscode", "vscodeinsiders", "windsurf", "zed",
		"sublimetext", "xcode", "androidstudio", "intellij", "pycharm", "webstorm", "phpstorm", "goland", "rider",
		"rustrover", "fork", "sourcetree", "github", "tower", "gitkraken", "smartgit", "sublimemerge", "ghostty",
		"warp", "iterm", "kitty", "terminal", "windowsterminal", "gitbash", "gnometerminal", "konsole"];
	for (const id of appIds) {
		assert.equal(typeof zh[`app.${id}`], "string", `zh 缺少 app.${id}`);
		assert.equal(typeof en[`app.${id}`], "string", `en 缺少 app.${id}`);
	}
});
