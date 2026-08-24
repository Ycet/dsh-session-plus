// dsh-open-workspace — host 纯函数单元测试（node:test）
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openCommandFor, isTrustedRequest, resolveWorkspacePath, openInFileManager, assetFileFor } from "../lib/index.js";

const CWD = fileURLToPath(new URL("..", import.meta.url));

test("openCommandFor 映射三个平台", () => {
	assert.deepEqual(openCommandFor("darwin", "/a"), { command: "open", args: ["/a"] });
	assert.deepEqual(openCommandFor("win32", "C:\\a"), { command: "explorer", args: ["C:\\a"] });
	assert.deepEqual(openCommandFor("linux", "/a"), { command: "xdg-open", args: ["/a"] });
});

test("openCommandFor 不支持平台抛错", () => {
	assert.throws(() => openCommandFor("freebsd", "/a"), /unsupported platform: freebsd/);
});

test("resolveWorkspacePath 正常解析 header.cwd", () => {
	const sessions = { get: (id) => (id === "session-1" ? { header: { cwd: CWD } } : undefined) };
	assert.equal(resolveWorkspacePath(sessions, "session-1"), CWD);
});

test("resolveWorkspacePath 缺 sessionId 抛错", () => {
	assert.throws(() => resolveWorkspacePath({}, ""), /缺少会话 id/);
	assert.throws(() => resolveWorkspacePath({}, undefined), /缺少会话 id/);
});

test("resolveWorkspacePath 会话服务不可用抛错", () => {
	assert.throws(() => resolveWorkspacePath(undefined, "session-1"), /会话服务不可用/);
});

test("resolveWorkspacePath 找不到会话抛错", () => {
	assert.throws(() => resolveWorkspacePath({ get: () => undefined }, "missing"), /找不到会话 missing/);
});

test("resolveWorkspacePath 无 cwd 抛错", () => {
	assert.throws(() => resolveWorkspacePath({ get: () => ({ header: {} }) }, "session-1"), /没有工作区记录/);
});

test("resolveWorkspacePath 非绝对路径抛错", () => {
	assert.throws(() => resolveWorkspacePath({ get: () => ({ header: { cwd: "relative/path" } }) }, "session-1"), /不是绝对路径/);
});

test("isTrustedRequest 放行回环 + 无 Origin", () => {
	const req = { headers: { host: "127.0.0.1:3080" } };
	const ctx = { get: () => undefined };
	assert.equal(isTrustedRequest(req, ctx), true);
});

test("isTrustedRequest 放行 localhost + 同源 Origin", () => {
	const req = { headers: { host: "localhost:3080", origin: "http://localhost:3080" } };
	assert.equal(isTrustedRequest(req, { get: () => undefined }), true);
});

test("isTrustedRequest 跨源 Origin 拒绝", () => {
	const req = { headers: { host: "localhost:3080", origin: "http://evil.example" } };
	assert.equal(isTrustedRequest(req, { get: () => undefined }), false);
});

test("isTrustedRequest 跨站 sec-fetch-site 拒绝", () => {
	const req = { headers: { host: "localhost:3080", "sec-fetch-site": "cross-site" } };
	assert.equal(isTrustedRequest(req, { get: () => undefined }), false);
});

test("isTrustedRequest 非回环 host 且无受信声明拒绝", () => {
	const req = { headers: { host: "dsh.example.com" } };
	assert.equal(isTrustedRequest(req, { get: () => undefined }), false);
});

test("isTrustedRequest 非回环 host 命中受信列表放行", () => {
	const req = { headers: { host: "dsh.example.com", origin: "http://dsh.example.com" } };
	const ctx = { get: () => ({ trustedHosts: ["dsh.example.com"] }) };
	assert.equal(isTrustedRequest(req, ctx), true);
});

test("isTrustedRequest 缺 host 头拒绝", () => {
	assert.equal(isTrustedRequest({ headers: {} }, { get: () => undefined }), false);
});

test("openInFileManager darwin 调用 open 成功", async () => {
	let called = null;
	const runner = async (command, args) => { called = { command, args }; };
	await openInFileManager(CWD, "darwin", runner);
	assert.deepEqual(called, { command: "open", args: [CWD] });
});

test("openInFileManager 命令失败抛携因错误", async () => {
	const runner = async () => { throw new Error("boom"); };
	await assert.rejects(() => openInFileManager(CWD, "darwin", runner), /打开目录失败（open）：boom/);
});

test("openInFileManager win32 退出码 1 但目录存在视为成功", async () => {
	const runner = async () => { throw Object.assign(new Error("fail"), { code: 1 }); };
	assert.equal(await openInFileManager(CWD, "win32", runner), true);
});

test("openInFileManager win32 目录不存在时仍报错", async () => {
	const runner = async () => { throw Object.assign(new Error("fail"), { code: 1 }); };
	await assert.rejects(() => openInFileManager("/nonexistent/nope-xyz", "win32", runner), /打开目录失败（explorer）/);
});

test("assetFileFor 解析 finder.png 且文件存在", () => {
	const asset = assetFileFor("finder.png");
	assert.equal(asset.contentType, "image/png");
	assert.ok(asset.path.endsWith(join("assets", "icons", "finder.png")));
	assert.equal(existsSync(asset.path), true);
});

test("assetFileFor 解析 folder.svg 且文件存在", () => {
	const asset = assetFileFor("folder.svg");
	assert.equal(asset.contentType, "image/svg+xml");
	assert.ok(asset.path.endsWith(join("assets", "icons", "folder.svg")));
	assert.equal(existsSync(asset.path), true);
});

test("assetFileFor 未知文件名（含路径穿越尝试）抛错", () => {
	assert.throws(() => assetFileFor("hack.png"), /unknown asset/);
	assert.throws(() => assetFileFor("../lib/index.js"), /unknown asset/);
	assert.throws(() => assetFileFor(""), /unknown asset/);
});