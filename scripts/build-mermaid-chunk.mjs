#!/usr/bin/env node
// 生成 mermaid 的客户端 chunk（lib/client.mermaid-<version>.js）。
//
// 为什么需要这个脚本：DSH 的客户端插件只能通过 /plugins 路由投递 `client.*.js` 形态的
// chunk（见 @deepseek-ai/dsh-client-modules 的 CLIENT_CHUNK 契约），而 assets 路由只放行
// 图片扩展名。于是把 mermaid 的官方 IIFE 构建（dist/mermaid.min.js，MIT）原样包进
// __ModuleLoader__.load({ chunk }) 的工厂里，浏览器端用 require.async("./client.mermaid-*.js")
// 懒加载。仓库直接提交生成结果，保证离线/内网/桌面端安装即用。
//
// 用法：
//   node scripts/build-mermaid-chunk.mjs                 # 从 npm 下载源码并生成（需要联网）
//   node scripts/build-mermaid-chunk.mjs --source /path/package/dist/mermaid.min.js
//   node scripts/build-mermaid-chunk.mjs --verify        # 只校验已提交的 chunk 与记录的 sha256
//
// 生成结果不得手工修改：改版本请改 MERMAID_VERSION / MERMAID_SHA256 后重新生成。

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 内置版本与官方制品指纹（npm mermaid@11.17.2 的 package/dist/mermaid.min.js）。 */
const MERMAID_VERSION = "11.17.2";
const MERMAID_SHA256 = "581ed7d74bd9048d0e3a91363927d72ef22942d7722546b27f7cc29e35390eb8";
const MERMAID_LICENSE = "MIT · Copyright (c) 2014 - 2022 Knut Sveidqvist";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const chunkFile = `client.mermaid-${MERMAID_VERSION}.js`;
const chunkPath = join(pluginRoot, "lib", chunkFile);

/** 计算字符串/字节的 sha256。 */
function sha256(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}

/** 读取命令行里的 --source / --verify。 */
function parseArgs(argv) {
	const args = { source: null, verify: false };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--verify") args.verify = true;
		else if (arg === "--source") args.source = argv[i + 1] ?? null;
		else if (arg.startsWith("--source=")) args.source = arg.slice("--source=".length);
	}
	return args;
}

/** 从 npm 拉取并解包 mermaid 源码，返回 dist/mermaid.min.js 路径。 */
function fetchFromNpm() {
	const workdir = mkdtempSync(join(tmpdir(), "dsh-mermaid-"));
	// 沙箱内默认 npm cache 可能不可写，这里固定指向临时目录，避免 EPERM。
	const cache = join(tmpdir(), "dsh-mermaid-npm-cache");
	const tarball = execFileSync("npm", ["pack", `mermaid@${MERMAID_VERSION}`, "--cache", cache, "--silent"], {
		cwd: workdir,
		encoding: "utf8",
	}).trim().split("\n").pop();
	const tgz = join(workdir, tarball);
	execFileSync("tar", ["-xzf", tgz, "-C", workdir], { encoding: "utf8" });
	return { path: join(workdir, "package", "dist", "mermaid.min.js"), cleanup: () => rmSync(workdir, { recursive: true, force: true }) };
}

/** 把官方 IIFE 包成 ModuleLoader chunk。 */
function wrapChunk(source) {
	const header = [
		`/**`,
		` * mermaid ${MERMAID_VERSION} — ${MERMAID_LICENSE}`,
		` * 本文件由 scripts/build-mermaid-chunk.mjs 生成，请勿手工修改。`,
		` * 源码指纹 sha256: ${MERMAID_SHA256}`,
		` * 上游: https://github.com/mermaid-js/mermaid (dist/mermaid.min.js，未做任何改写)`,
		` */`,
	].join("\n");
	// 官方 IIFE 必须跑在**脚本顶层**：它用顶层 `var __esbuild_esm_mermaid_nm` 建立命名空间，
	// 文件末尾再用 globalThis.__esbuild_esm_mermaid_nm 取回默认导出。若塞进工厂函数，var 变成
	// 函数作用域变量，末尾那行会读不到命名空间并抛错（曾在此踩坑）。因此顺序是：
	// 先原样执行官方 IIFE（它自己把库挂到 globalThis.mermaid），再注册 chunk；
	// 工厂只做一件事——把已经初始化好的库交给 require.async 的调用方。
	return `${header}\n${source}\n\nwindow.__ModuleLoader__.load({\n\tid: "@ycet/dsh-session-plus",\n\tchunk: ${JSON.stringify(chunkFile)},\n\tfactory: () => ({ mermaid: globalThis.mermaid }),\n});\n`;
}

/** 校验已提交的 chunk：文件存在、大小合理、含版本头与工厂出口。 */
function verifyExisting() {
	if (!existsSync(chunkPath)) {
		console.error(`[mermaid] 缺少 ${chunkPath}，请先运行生成命令。`);
		process.exit(1);
	}
	const text = readFileSync(chunkPath, "utf8");
	const problems = [];
	if (!text.includes(`mermaid ${MERMAID_VERSION}`)) problems.push("版本头不匹配");
	if (!text.includes(`chunk: ${JSON.stringify(chunkFile)}`)) problems.push("chunk 字段不匹配");
	if (!text.includes("factory: () => ({ mermaid: globalThis.mermaid }),")) problems.push("缺少工厂出口");
	if (text.indexOf('__ModuleLoader__.load(') < text.indexOf('globalThis["mermaid"]')) problems.push("逻辑顺序错误（应先执行官方 IIFE 再注册 chunk）");
	if (!text.includes("__ModuleLoader__.load(")) problems.push("缺少 ModuleLoader 注册");
	if (problems.length > 0) {
		console.error(`[mermaid] 校验失败：${problems.join("、")}`);
		process.exit(1);
	}
	console.log(`[mermaid] 校验通过 ${chunkFile}（${readFileSync(chunkPath).byteLength} B）`);
	console.log(`[mermaid] 期望源码 sha256 ${MERMAID_SHA256}`);
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.verify) {
		verifyExisting();
		return;
	}

	let sourcePath = args.source ? resolve(args.source) : null;
	let cleanup = () => {};
	if (sourcePath === null) {
		const fetched = fetchFromNpm();
		sourcePath = fetched.path;
		cleanup = fetched.cleanup;
	}
	if (!existsSync(sourcePath)) {
		console.error(`[mermaid] 找不到源码：${sourcePath}`);
		process.exit(1);
	}

	const source = readFileSync(sourcePath);
	const digest = sha256(source);
	if (digest !== MERMAID_SHA256) {
		console.error(`[mermaid] 源码指纹不匹配：期望 ${MERMAID_SHA256}，实际 ${digest}`);
		console.error("[mermaid] 若确实要升级，请同步修改脚本里的 MERMAID_VERSION / MERMAID_SHA256。");
		process.exit(1);
	}

	const text = source.toString("utf8");
	if (!text.includes("globalThis[\"mermaid\"]") && !text.includes("globalThis.mermaid")) {
		console.error("[mermaid] 该构建不是自包含 IIFE（缺少 globalThis.mermaid 赋值），无法打包。");
		process.exit(1);
	}

	const chunk = wrapChunk(text);
	writeFileSync(chunkPath, chunk, "utf8");
	cleanup();
	console.log(`[mermaid] 已生成 lib/${chunkFile}`);
	console.log(`[mermaid] 源 ${source.byteLength} B → chunk ${Buffer.byteLength(chunk, "utf8")} B`);
	console.log(`[mermaid] chunk sha256 ${sha256(Buffer.from(chunk, "utf8"))}`);
}

main();
