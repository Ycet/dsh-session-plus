// dsh-session-plus — 账户菜单锚定与识别纯几何单测（node --test）
import { test } from "node:test";
import assert from "node:assert/strict";
import { GAP, MARGIN, TOLERANCE, anchorPlacement, fallbackTop, matchesAnchor } from "../lib/account-menu.js";

const viewport = { width: 1200, height: 800 };

test("常量与 Menu 原语一致：边距 12、间距 4、容差 4", () => {
	assert.equal(MARGIN, 12);
	assert.equal(GAP, 4);
	assert.equal(TOLERANCE, 4);
});

test("anchorPlacement：side=top / align=start 时左对齐触发器、顶边为触发器顶减去弹层高与间距", () => {
	const placement = anchorPlacement({ left: 40, top: 700, width: 160, height: 40 }, { width: 200, height: 180 }, viewport);
	assert.deepEqual(placement, { left: 40, top: 516 });
});

test("anchorPlacement：空间不足时夹在视口 12px 边距内", () => {
	const below = anchorPlacement({ left: 40, top: 120, width: 160, height: 40 }, { width: 200, height: 300 }, viewport);
	assert.equal(below.top, MARGIN, "上方放不下时贴到上边距");
	const right = anchorPlacement({ left: 1180, top: 700, width: 160, height: 40 }, { width: 200, height: 180 }, viewport);
	assert.equal(right.left, viewport.width - 200 - MARGIN, "右侧放不下时向左收");
	const tall = anchorPlacement({ left: 40, top: 700, width: 160, height: 40 }, { width: 200, height: 900 }, viewport);
	assert.equal(tall.top, MARGIN, "弹层比视口还高时仍保持上边距");
});

test("anchorPlacement：缺失尺寸时退回触发器位置，不产生 NaN", () => {
	const placement = anchorPlacement({ left: 30, top: 600 }, {}, viewport);
	assert.deepEqual(placement, { left: 30, top: 596 });
	const empty = anchorPlacement({}, { width: 100, height: 100 }, {});
	assert.deepEqual(empty, { left: MARGIN, top: MARGIN });
});

test("matchesAnchor：按 Menu 的落点判定，容差内接受、超出拒绝", () => {
	const trigger = { left: 40, top: 700, width: 160, height: 40 };
	const list = { left: 40, top: 516, width: 200, height: 180 };
	assert.equal(matchesAnchor(trigger, list, viewport), true);
	assert.equal(matchesAnchor(trigger, { ...list, left: 44 }, viewport), true, "左侧 4px 内仍在容差");
	assert.equal(matchesAnchor(trigger, { ...list, left: 45 }, viewport), false, "左侧 5px 超出容差");
	assert.equal(matchesAnchor(trigger, { ...list, top: 520 }, viewport), true, "上侧 4px 内仍在容差");
	assert.equal(matchesAnchor(trigger, { ...list, top: 521 }, viewport), false, "上侧 5px 超出容差");
	assert.equal(matchesAnchor(trigger, { left: 400, top: 516, width: 200, height: 180 }, viewport), false, "另一个菜单不会被误认");
});

test("fallbackTop：插入内容变高后重算顶边，并夹在视口内", () => {
	assert.equal(fallbackTop(700, 180, viewport), 516);
	assert.equal(fallbackTop(700, 1800, viewport), MARGIN);
	assert.equal(fallbackTop(20, 100, viewport), MARGIN, "空间不足时贴到上边距");
	assert.equal(fallbackTop(0, 0, {}), MARGIN, "空视口也返回有限值");
});
