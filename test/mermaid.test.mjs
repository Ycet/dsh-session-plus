// dsh-session-plus — mermaid 纯逻辑镜像（lib/mermaid.js）离线测试。
//
// bundle 内是同一套逻辑的另一份实现（ModuleLoader bundle 无法 import 本地模块），
// 这里断言镜像行为；浏览器侧的真实渲染链路由 test/mermaid-browser.test.mjs 覆盖。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	MERMAID_CACHE_CAP,
	cacheKey,
	messageOf,
	paletteFromTokens,
	repairSvgMarkup,
	sanitizeSvg,
	shouldRenderFence,
	svgFileName,
	themeKeyFromPalette,
	trimCache,
} from "../lib/mermaid.js";

test("门控：关闭开关 / 流式输出 / 空代码块都不渲染", () => {
	assert.equal(shouldRenderFence({ enabled: true, streaming: false, code: "flowchart LR\nA-->B" }), true);
	assert.equal(shouldRenderFence({ enabled: false, streaming: false, code: "flowchart LR" }), false);
	assert.equal(shouldRenderFence({ enabled: true, streaming: true, code: "flowchart LR" }), false);
	assert.equal(shouldRenderFence({ enabled: true, streaming: false, code: "" }), false);
	assert.equal(shouldRenderFence({ enabled: true, streaming: false, code: "   \n\t " }), false);
	assert.equal(shouldRenderFence({ enabled: true, streaming: false, code: 42 }), false);
	assert.equal(shouldRenderFence(null), false);
});

test("主题变量：alias token 映射齐全，缺失时按浅/深色回落", () => {
	const tokens = {
		"--dsw-alias-bg-base": "#101010",
		"--dsw-alias-bg-layer-1": "#1c1c1c",
		"--dsw-alias-bg-layer-2": "#242424",
		"--dsw-alias-label-primary": "#ededed",
		"--dsw-alias-border-l1": "#3a3a3a",
	};
	const palette = paletteFromTokens({ read: (token) => tokens[token] ?? "", scheme: "dark", fontFamily: "Inter, sans-serif" });
	assert.equal(palette.scheme, "dark");
	assert.equal(palette.variables.background, "#101010");
	assert.equal(palette.variables.primaryColor, "#1c1c1c");
	assert.equal(palette.variables.primaryTextColor, "#ededed");
	assert.equal(palette.variables.lineColor, "#3a3a3a");
	assert.equal(palette.variables.nodeBorder, "#3a3a3a");
	assert.equal(palette.variables.secondaryColor, "#242424");
	assert.equal(palette.variables.fontFamily, "Inter, sans-serif");
	assert.equal(palette.variables.fontSize, "13px");

	// 空 token / 读取抛错：一律回落，不抛异常。
	const blank = paletteFromTokens({ read: () => "", scheme: "light" });
	assert.equal(blank.scheme, "light");
	assert.equal(blank.variables.background, "#FFFFFF");
	assert.equal(blank.variables.fontFamily, "system-ui, -apple-system, sans-serif");
	const broken = paletteFromTokens({ read: () => { throw new Error("boom"); } });
	assert.equal(broken.variables.primaryTextColor, "#1A1A1A");
	assert.equal(paletteFromTokens(undefined).scheme, "light");
});

test("主题指纹：同一主题稳定，token 变化即失效", () => {
	const read = (token) => ({ "--dsw-alias-bg-base": "#fff", "--dsw-alias-bg-layer-1": "#fff", "--dsw-alias-label-primary": "#111", "--dsw-alias-border-l1": "#eee", "--dsw-alias-bg-layer-2": "#f5f5f5" })[token] ?? "";
	const first = themeKeyFromPalette(paletteFromTokens({ read, scheme: "light" }));
	const second = themeKeyFromPalette(paletteFromTokens({ read, scheme: "light" }));
	assert.equal(first, second);
	const themed = themeKeyFromPalette(paletteFromTokens({ read: (token) => (token === "--dsw-alias-bg-base" ? "#fafafa" : read(token)), scheme: "light" }));
	assert.notEqual(first, themed);
	assert.notEqual(first, themeKeyFromPalette(paletteFromTokens({ read, scheme: "dark" })));
});

test("清洗 SVG：去掉脚本与事件属性，补齐命名空间", () => {
	const dirty = '<svg viewBox="0 0 10 10"><script>alert(1)</script><g onload="alert(2)" onclick="x()"><a xlink:href="javascript:alert(3)">x</a></g></svg>';
	const cleaned = sanitizeSvg(dirty);
	assert.equal(cleaned.includes("<script"), false);
	assert.equal(cleaned.includes("onload"), false);
	assert.equal(cleaned.includes("onclick"), false);
	assert.equal(cleaned.includes("javascript:"), false);
	assert.equal(cleaned.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), true);

	const already = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"></svg>';
	assert.equal(sanitizeSvg(already), already);
	assert.equal(sanitizeSvg(""), "");
	assert.equal(sanitizeSvg(null), "");
});

test("清洗 SVG：裸空元素补自闭合，下载的 .svg 才能被 XML 解析", () => {
	const svg = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">第一行<br>第二行<br >第三行</div></foreignObject></svg>';
	const cleaned = sanitizeSvg(svg);
	assert.equal(cleaned.includes("<br>"), false);
	assert.equal(cleaned.includes("<br >"), false);
	assert.equal(cleaned.includes("<br/>"), true);
	assert.equal(cleaned.includes("第一行<br/>第二行<br/>第三行"), true);
});

test("清洗 SVG：HTML 实体转数字实体，裸 & 转义", () => {
	const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>A&nbsp;B</text><text>C & D</text><text>E&amp;F</text></svg>';
	const cleaned = sanitizeSvg(svg);
	assert.equal(cleaned.includes("&nbsp;"), false);
	assert.equal(cleaned.includes("&#160;"), true);
	assert.equal(cleaned.includes("C &amp; D"), true);
	assert.equal(cleaned.includes("E&amp;F"), true);
	assert.equal(repairSvgMarkup(cleaned), cleaned);
});

test("清洗 SVG：镜像修复器对已合法输入保持不变", () => {
	const legal = '<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="1" height="1"/></g></svg>';
	assert.equal(repairSvgMarkup(legal), legal);
	assert.equal(repairSvgMarkup(""), "");
	assert.equal(repairSvgMarkup(undefined), "");
});

test("下载文件名：本地时间戳格式固定", () => {
	const name = svgFileName(new Date(2026, 10, 27, 9, 5, 7));
	assert.equal(name, "mermaid-20261127-090507.svg");
	assert.match(svgFileName(undefined), /^mermaid-\d{8}-\d{6}\.svg$/);
	assert.match(svgFileName(new Date("nope")), /^mermaid-\d{8}-\d{6}\.svg$/);
});

test("缓存键与裁剪：不同主题/代码不复用，超出上限丢最旧", () => {
	assert.notEqual(cacheKey("A", "light|1"), cacheKey("A", "dark|1"));
	assert.notEqual(cacheKey("A", "light|1"), cacheKey("B", "light|1"));
	assert.equal(cacheKey(undefined, "light"), "light\u0000");

	const map = new Map();
	for (let index = 0; index < MERMAID_CACHE_CAP + 5; index += 1) map.set(`k${index}`, index);
	trimCache(map, MERMAID_CACHE_CAP);
	assert.equal(map.size, MERMAID_CACHE_CAP);
	assert.equal(map.has("k0"), false);
	assert.equal(map.has("k4"), false);
	assert.equal(map.has("k5"), true);
	assert.equal(trimCache(map, MERMAID_CACHE_CAP), map);
	assert.equal(trimCache(null, 3), null);
});

test("错误摘要：压缩空白、限长，空值安全", () => {
	assert.equal(messageOf(null), "");
	assert.equal(messageOf(undefined), "");
	assert.equal(messageOf("  bad   syntax \n here "), "bad syntax here");
	assert.equal(messageOf(new Error("Parse error on line 2")), "Parse error on line 2");
	const long = messageOf("x".repeat(500));
	assert.equal(long.length, 300);
	assert.equal(long.endsWith("..."), true);
});
