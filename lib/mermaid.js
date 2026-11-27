// dsh-session-plus — mermaid 流程图渲染的纯逻辑镜像。
//
// 说明：浏览器半区 lib/client.js 是一个手写的 ModuleLoader bundle，无法 import 本地模块，
// 因此这里保留一份与 bundle 内逻辑逐条对齐的纯函数实现，供 node --test 离线断言
// （与 lib/account-menu.js、lib/rubber.js、lib/account-extras.js 同样做法）。
// 改动时请两处同步：本文件 + lib/client.js 的对应函数。

/** 渲染结果缓存上限（与 bundle 内 MERMAID_CACHE_CAP 一致）。 */
export const MERMAID_CACHE_CAP = 40;

/**
 * 是否该把这段 fence 渲染成图。
 * 关闭开关、流式输出中、空代码块都保持官方原代码块。
 */
export function shouldRenderFence(input) {
	if (!input || input.enabled !== true) return false;
	if (input.streaming === true) return false;
	const code = typeof input.code === "string" ? input.code.trim() : "";
	return code.length > 0;
}

/** 单个 CSS 变量的取值：空值/非字符串一律回落默认值。 */
function pickToken(read, token, fallback) {
	let value = "";
	try {
		value = String(read(token) ?? "").trim();
	} catch (_error) {
		value = "";
	}
	return value === "" ? fallback : value;
}

/**
 * 把 DSH 主题的 alias token 映射成 mermaid themeVariables。
 * @param {{ read: (token: string) => string, scheme?: string, fontFamily?: string }} input
 * @returns {{ scheme: "light"|"dark", variables: Record<string, string> }}
 */
export function paletteFromTokens(input) {
	const options = input || {};
	const read = typeof options.read === "function" ? options.read : () => "";
	const scheme = options.scheme === "dark" ? "dark" : "light";
	const fontFamily = typeof options.fontFamily === "string" && options.fontFamily.trim() !== ""
		? options.fontFamily
		: "system-ui, -apple-system, sans-serif";
	const line = pickToken(read, "--dsw-alias-border-l1", scheme === "dark" ? "#3A3A3A" : "#E5E5E5");
	const variables = {
		background: pickToken(read, "--dsw-alias-bg-base", scheme === "dark" ? "#111111" : "#FFFFFF"),
		primaryColor: pickToken(read, "--dsw-alias-bg-layer-1", scheme === "dark" ? "#1C1C1C" : "#FFFFFF"),
		primaryTextColor: pickToken(read, "--dsw-alias-label-primary", scheme === "dark" ? "#EDEDED" : "#1A1A1A"),
		primaryBorderColor: line,
		lineColor: line,
		nodeBorder: line,
		secondaryColor: pickToken(read, "--dsw-alias-bg-layer-2", scheme === "dark" ? "#242424" : "#F5F5F5"),
		tertiaryColor: pickToken(read, "--dsw-alias-bg-layer-2", scheme === "dark" ? "#242424" : "#F5F5F5"),
		clusterBkg: pickToken(read, "--dsw-alias-bg-layer-2", scheme === "dark" ? "#242424" : "#F5F5F5"),
		clusterBorder: line,
		edgeLabelBackground: pickToken(read, "--dsw-alias-bg-base", scheme === "dark" ? "#111111" : "#FFFFFF"),
		textColor: pickToken(read, "--dsw-alias-label-primary", scheme === "dark" ? "#EDEDED" : "#1A1A1A"),
		fontFamily: fontFamily,
		fontSize: "13px",
	};
	return { scheme, variables };
}

/** 主题指纹：preference/scheme 不变但 token 变了（自定义主题）也要重绘。 */
export function themeKeyFromPalette(palette) {
	if (!palette || typeof palette !== "object") return "light|";
	const scheme = palette.scheme === "dark" ? "dark" : "light";
	const variables = palette.variables || {};
	return [
		scheme,
		variables.background,
		variables.primaryColor,
		variables.primaryTextColor,
		variables.primaryBorderColor,
		variables.lineColor,
		variables.secondaryColor,
	].join("|");
}

/** 渲染缓存键：同一张图在同一主题下只渲染一次。 */
export function cacheKey(code, themeKey) {
	return `${themeKey}\u0000${typeof code === "string" ? code : ""}`;
}

/** 裁剪缓存：超出上限时按插入顺序丢最旧的条目。 */
export function trimCache(map, cap) {
	const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : MERMAID_CACHE_CAP;
	if (!map || typeof map.keys !== "function") return map;
	while (map.size > limit) {
		const oldest = map.keys().next();
		if (oldest.done) break;
		map.delete(oldest.value);
	}
	return map;
}

/** HTML 空元素：SVG 文件是 XML，必须写成自闭合，否则外部打开会报 tag mismatch。 */
export const SVG_VOID_TAGS = "area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr";

/** XML 只认 lt/gt/amp/quot/apos；mermaid 的 foreignObject 里常出现 &nbsp; 等 HTML 实体。 */
const SVG_ENTITY_MAP = {
	nbsp: "&#160;",
	hellip: "&#8230;",
	mdash: "&#8212;",
	ndash: "&#8211;",
	lsquo: "&#8216;",
	rsquo: "&#8217;",
	ldquo: "&#8220;",
	rdquo: "&#8221;",
};

/**
 * 让 mermaid 输出的 SVG 变成合法 XML：裸空元素补自闭合、HTML 实体转数字实体、裸 & 转义。
 * @param {string} svg
 * @returns {string}
 */
export function repairSvgMarkup(svg) {
	const text = typeof svg === "string" ? svg : svg === null || svg === undefined ? "" : String(svg);
	const pattern = new RegExp("<(" + SVG_VOID_TAGS + ")((?:\\s[^<>]*?)?)\\s*/?>", "gi");
	return text
		.replace(pattern, (match, tag, attrs) => `<${tag}${attrs ? attrs.replace(/\s+$/, "") : ""}/>`)
		.replace(/&(nbsp|hellip|mdash|ndash|lsquo|rsquo|ldquo|rdquo);/gi, (match, name) => SVG_ENTITY_MAP[String(name).toLowerCase()])
		.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
}

/**
 * 清洗 mermaid 产出的 SVG：去掉脚本与事件属性，补齐命名空间。
 * mermaid 自身在 securityLevel:"strict" 下已做消毒，这里是纵深防御。
 */
export function sanitizeSvg(svg) {
	const text = typeof svg === "string" ? svg : "";
	if (text.trim() === "") return "";
	const cleaned = text
		.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
		.replace(/<script\b[^>]*\/?>/gi, "")
		.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
		.replace(/(href|xlink:href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, "");
	const namespaced = /^<svg\b/i.test(cleaned) && !/\sxmlns\s*=/i.test(cleaned.slice(0, cleaned.indexOf(">") + 1))
		? cleaned.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
		: cleaned;
	return repairSvgMarkup(namespaced);
}

/** 下载文件名：mermaid-YYYYMMDD-HHmmss.svg（本地时间）。 */
export function svgFileName(now) {
	const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
	const pad = (value, width = 2) => String(value).padStart(width, "0");
	const ymd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
	const hms = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
	return `mermaid-${ymd}-${hms}.svg`;
}

/** 错误信息抽取：用于工具条/提示的 title，限长避免撑爆布局。 */
export function messageOf(error) {
	if (error === null || error === undefined) return "";
	const raw = typeof error === "string" ? error : typeof error.message === "string" ? error.message : String(error);
	const text = raw.trim().replace(/\s+/g, " ");
	return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}
