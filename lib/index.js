// dsh-session-plus — host half（原 dsh-open-workspace，功能不变，路由随插件更名）
// 「打开工作区」：POST /session-plus/api/open {sessionId}
// 在操作系统文件管理器（macOS Finder / Windows Explorer / Linux xdg-open）
// 中打开该会话的工作区根目录（session.header.cwd）。
// 资产：GET /session-plus/assets/<file> 提供包内图标（finder.png / folder.svg），
// 供浏览器按钮按平台加载；路径基于本包安装位置解析，任何安装方式（link/npm/GitHub）都可用。
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runNativeCommand } from "@deepseek-ai/dsh-native-command";

export const name = "dsh-session-plus";
export const inject = ["webServer"];

const PREFIX = "/session-plus/api";
const ASSET_PREFIX = "/session-plus/assets";
const ASSET_TYPES = Object.freeze({ "finder.png": "image/png", "folder.svg": "image/svg+xml" });
const ASSETS_DIR = fileURLToPath(new URL("../assets/icons/", import.meta.url));

/**
 * 白名单解析包内资产：文件名必须命中列表（天然防路径穿越），
 * 返回绝对路径与 Content-Type。
 */
export function assetFileFor(fileName) {
	const contentType = ASSET_TYPES[fileName];
	if (!contentType) throw new Error(`unknown asset: ${fileName}`);
	return { path: join(ASSETS_DIR, fileName), contentType };
}

/** 平台 → 打开目录所用的 {command, args}。不支持的平台抛错。 */
export function openCommandFor(platform, cwd) {
	if (platform === "darwin") return { command: "open", args: [cwd] };
	if (platform === "win32") return { command: "explorer", args: [cwd] };
	if (platform === "linux") return { command: "xdg-open", args: [cwd] };
	throw new Error(`unsupported platform: ${platform}`);
}

/** Host 是否为回环地址（127/8 与 IPv6 回环）。 */
export function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** 浏览器信任围栏：Host 回环或受信 + 同源；拒绝跨站请求。 */
export function isTrustedRequest(req, ctx) {
	const host = req.headers.host;
	if (typeof host !== "string") return false;
	const hostname = host.replace(/^\[/, "").split(":")[0];
	if (!isLoopbackHostname(hostname)) {
		const trusted = ctx.get("webRuntime")?.trustedHosts;
		if (!Array.isArray(trusted) || !trusted.some((value) => value.split(":")[0] === hostname || value === host)) return false;
	}
	if (req.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = req.headers.origin;
	if (origin === undefined) return true;
	try { return new URL(origin).host === host; } catch { return false; }
}

/** 从 session store 解析会话的工作区根目录（cwd）。异常携带用户可读原因。 */
export function resolveWorkspacePath(sessions, sessionId) {
	if (typeof sessionId !== "string" || sessionId.length === 0) throw new Error("缺少会话 id");
	if (sessions === undefined || sessions === null) throw new Error("会话服务不可用");
	const session = sessions.get(sessionId);
	if (session === undefined) throw new Error(`找不到会话 ${sessionId}`);
	const cwd = session?.header?.cwd;
	if (typeof cwd !== "string" || cwd.length === 0) throw new Error("该会话没有工作区记录");
	if (!isAbsolute(cwd)) throw new Error(`会话工作区路径不是绝对路径：${cwd}`);
	return cwd;
}

/** 目录必须存在且为目录，否则抛错。 */
export async function assertDirectory(cwd) {
	const info = await stat(cwd).catch(() => null);
	if (info === null || !info.isDirectory()) throw new Error(`工作区目录不存在：${cwd}`);
	return true;
}

/**
 * 在操作系统文件管理器中打开目录。
 * win32 的 `explorer` 存在“成功也返回退出码 1”的已知怪癖：目录确实存在时视为成功。
 */
export async function openInFileManager(cwd, platform = process.platform, runner = runNativeCommand) {
	const { command, args } = openCommandFor(platform, cwd);
	try {
		await runner(command, args, undefined);
	} catch (error) {
		if (platform === "win32" && error?.code === 1 && await assertDirectory(cwd).catch(() => false)) return true;
		throw new Error(`打开目录失败（${command}）：${error instanceof Error ? error.message : String(error)}`);
	}
	return true;
}

function writeJson(res, status, value) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
	res.end(JSON.stringify(value));
}

function readJsonBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let bytes = 0;
		req.on("data", (chunk) => {
			bytes += chunk.length;
			if (bytes > 64 * 1024) { reject(new Error("request body too large")); req.destroy(); return; }
			chunks.push(chunk);
		});
		req.on("end", () => {
			try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch (error) { reject(error); }
		});
		req.on("error", reject);
	});
}

/**
 * 插件主体：注册「打开工作区」API 与包内资产路由。
 * - open: 解析 sessionId → cwd → 平台命令打开目录（安全：仅回环/受信 host + 同源；浏览器只传 sessionId）
 * - assets: 只读白名单图标文件（GET），供浏览器按钮按平台加载
 */
export function apply(ctx) {
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: ASSET_PREFIX,
		handler: async (req, res) => {
			if (req.method !== "GET") { writeJson(res, 405, { ok: false, error: "method not allowed" }); return; }
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const name = pathname.startsWith(`${ASSET_PREFIX}/`) ? pathname.slice(ASSET_PREFIX.length + 1) : "";
			let asset;
			try { asset = assetFileFor(name); } catch (error) {
				writeJson(res, 404, { ok: false, error: error instanceof Error ? error.message : String(error) });
				return;
			}
			try {
				const data = await readFile(asset.path);
				res.writeHead(200, { "content-type": asset.contentType, "cache-control": "public, max-age=3600" });
				res.end(data);
			} catch (error) {
				writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
			}
		}
	}), "dsh-session-plus: asset route");
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: PREFIX,
		handler: async (req, res) => {
			if (!isTrustedRequest(req, ctx)) { writeJson(res, 403, { ok: false, error: "forbidden" }); return; }
			if (req.method !== "POST") { writeJson(res, 405, { ok: false, error: "method not allowed" }); return; }
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith(`${PREFIX}/`) ? pathname.slice(PREFIX.length + 1) : "";
			try {
				if (method !== "open") { writeJson(res, 404, { ok: false, error: `unknown method ${method}` }); return; }
				const payload = await readJsonBody(req);
				const sessions = ctx.get("sessions");
				const cwd = resolveWorkspacePath(sessions, payload.sessionId);
				await assertDirectory(cwd);
				await openInFileManager(cwd);
				writeJson(res, 200, { ok: true, path: cwd });
			} catch (error) {
				writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
			}
		}
	}), "dsh-session-plus: open api");
}