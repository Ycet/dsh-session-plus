// dsh-session-plus — 账户菜单弹层锚定与识别（纯几何，无 DOM 依赖）
//
// DSH 的 Menu 原语（@deepseek-ai/dsh-client-ui-primitives）在 side="top"、
// align="start" 时把 portal 弹层放在 `触发器.top - 弹层高 - 4`，并夹在视口
// 12px 边距内；账户菜单没有 aria-controls，只能用这套几何关系反查它。
//
// 注意：ModuleLoader bundle 自包含，不支持包内 import，lib/client.js 内有等价的
// 镜像实现；两处必须同步修改。本文件由 test/account-menu.test.mjs 保护。

/** 视口边距，与 Menu 原语的 MARGIN 一致。 */
export const MARGIN = 12;

/** 触发器与弹层之间的间距，与 Menu 原语一致。 */
export const GAP = 4;

/** 几何匹配的容差（像素）。 */
export const TOLERANCE = 4;

const clamp = (value, min, max) => Math.min(Math.max(min, value), max);

/**
 * 按 Menu 的 side="top" / align="start" 规则计算弹层应有的位置。
 * @param triggerRect - 触发器（账户按钮）的矩形。
 * @param listSize - 弹层内容尺寸。
 * @param viewport - 视口尺寸。
 * @returns `{ left, top }`（position: fixed 坐标）。
 */
export function anchorPlacement(triggerRect, listSize, viewport) {
	const margin = MARGIN;
	const width = Number(listSize?.width) || 0;
	const height = Number(listSize?.height) || 0;
	const vw = Number(viewport?.width) || 0;
	const vh = Number(viewport?.height) || 0;
	let left = Number(triggerRect?.left) || 0;
	let top = (Number(triggerRect?.top) || 0) - height - GAP;
	if (width > 0) left = clamp(left, margin, Math.max(margin, vw - width - margin));
	if (height > 0) top = clamp(top, margin, Math.max(margin, vh - height - margin));
	return { left, top };
}

/**
 * 判断某个 portal 弹层是否正是这条触发器的菜单。
 * @param triggerRect - 触发器矩形。
 * @param listRect - 候选弹层矩形。
 * @param viewport - 视口尺寸。
 * @param tolerance - 容差，默认 4px。
 * @returns 命中为 true。
 */
export function matchesAnchor(triggerRect, listRect, viewport, tolerance = TOLERANCE) {
	const expected = anchorPlacement(triggerRect, { width: listRect?.width, height: listRect?.height }, viewport);
	return Math.abs(expected.left - (Number(listRect?.left) || 0)) <= tolerance
		&& Math.abs(expected.top - (Number(listRect?.top) || 0)) <= tolerance;
}

/**
 * 插入内容后弹层变高时的自校正 top（兼容不做每帧重定位的旧版 Menu）。
 * @param triggerTop - 触发器顶边。
 * @param listHeight - 插入后的弹层高度。
 * @param viewport - 视口尺寸。
 * @returns 修正后的 top。
 */
export function fallbackTop(triggerTop, listHeight, viewport) {
	const height = Number(listHeight) || 0;
	const vh = Number(viewport?.height) || 0;
	return clamp((Number(triggerTop) || 0) - height - GAP, MARGIN, Math.max(MARGIN, vh - height - MARGIN));
}
