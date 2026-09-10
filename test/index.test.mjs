// dsh-session-plus — 宿主半区挂载冒烟测试（node:test）
//
// 本插件的全部能力都在浏览器半区，宿主半区是刻意保留的空 apply。这三个用例守护的
// 是一条硬约束：宿主行必须继续可挂载 —— dsh-client-modules 只从「宿主 Loader
// entries 中声明了 dsh.client、entry.fiber 存在且未被 disabled」的包发现浏览器半区，
// 删掉宿主半区或让它无法成 fiber，会让提供商头部与「添加至对话」一起静默失效。
import { test } from "node:test";
import assert from "node:assert/strict";
import * as host from "../lib/index.js";

test("宿主半区：导出插件名 dsh-session-plus", () => {
	assert.equal(host.name, "dsh-session-plus");
});

test("宿主半区：导出面精确为 name + apply，且不再声明 inject", () => {
	assert.equal(typeof host.apply, "function");
	assert.equal(host.inject, undefined);
	assert.deepEqual(Object.keys(host).sort(), ["apply", "name"]);
});

test("宿主半区：apply 为空实现，调用不注册任何副作用", () => {
	assert.equal(host.apply({}), undefined);
});
