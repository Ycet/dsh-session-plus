// dsh-session-plus — 浏览器半区注册面回归测试（node:test）
//
// 守护「只移除打开工作区，不破坏另外两项功能」：在最小 stub 环境里加载
// lib/client.js（ModuleLoader bundle）并真正执行一次 apply()，把注册面固定下来。
// 任何误删共享基建（locale 词典键、conversation.input.overlay 席位、样式 effect、
// 客户端 inject）都会在这里失败；被移除功能的注册点若复活同样会失败。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLIENT_PATH = fileURLToPath(new URL("../lib/client.js", import.meta.url));

/** 在最小 stub 环境里加载 bundle 并执行 apply()，返回观测到的注册面。 */
function loadClient() {
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
		locale: {
			register: (ns, dicts) => {
				seen.locales.push([ns, Object.keys(dicts.zh).sort(), Object.keys(dicts.en).sort()]);
				return () => {};
			},
			bind: () => () => "",
		},
		slots: {
			inject: (name, fn) => { seen.slotInjects.push(name); return fn(); },
			register: (spec) => { seen.registrations.push([spec.name, spec.id, spec.order]); return () => {}; },
		},
		get: () => undefined,
	};
	mod.apply(ctx);
	return { definition, mod, seen };
}

test("浏览器半区：bundle id 与客户端 inject 保持不变", () => {
	const { definition, mod } = loadClient();
	assert.equal(definition.id, "dsh-session-plus");
	assert.deepEqual(mod.inject, ["slots", "locale"]);
	assert.equal(typeof mod.apply, "function");
});

test("浏览器半区：仅剩 conversation.input.overlay 两条注册（功能二、三的席位）", () => {
	const { seen } = loadClient();
	assert.deepEqual(seen.slotInjects, ["conversation.input.overlay", "conversation.input.overlay"]);
	assert.deepEqual(seen.registrations, [
		["conversation.input.overlay", "provider-header", 90],
		["conversation.input.overlay", "selection-add", 91],
	]);
});

test("浏览器半区：locale 词典与样式 effect 未被破坏", () => {
	const { seen } = loadClient();
	assert.deepEqual(seen.effects, ["dsh-session-plus: dictionaries", "dsh-session-plus: styles"]);
	const expected = ["addToConversation", "providerEntry", "providerLabel"];
	assert.deepEqual(seen.locales, [["sessionPlus", expected, expected]]);
});

test("浏览器半区：会话头部与 shell.overlay 的注册已彻底移除", () => {
	const { seen } = loadClient();
	const surface = JSON.stringify(seen);
	for (const gone of ["shell.overlay", "conversation.session.header.utilities", "open-workspace"]) {
		assert.equal(surface.includes(gone), false, `${gone} 不应再出现在注册面中`);
	}
});
