// dsh-session-plus — Rubber Segment 纯数学单测（node --test）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	RUBBER,
	easeOut,
	cubicBezier,
	dilateEdges,
	dragEdges,
	landPlan,
	nearestSlot,
	project,
	pushSample,
	resolveTarget,
	rubberBand,
	slotCenters,
	velocityOf,
} from "../lib/rubber.js";

test("rubberBand：非正输入归零，正输入单调且小于原始位移", () => {
	assert.equal(rubberBand(0, 100), 0);
	assert.equal(rubberBand(-10, 100), 0);
	assert.equal(rubberBand(10, 0), 0);
	const small = rubberBand(10, 100);
	const large = rubberBand(40, 100);
	assert.ok(small > 0 && small < 10, "阻尼后位移必须小于原始位移");
	assert.ok(large > small && large < 40, "越界越多跟随越多，但仍小于原始位移");
});

test("project：速度为 0 时无投影，glide 越大投影越远且符号跟随速度", () => {
	assert.equal(project(0), 0);
	const slow = project(200);
	const fast = project(200, 100);
	assert.ok(fast > slow, "glide 越大投影越远");
	assert.ok(project(-200) < 0, "负速度向负方向投影");
	assert.ok(Number.isFinite(project(200, 0)), "glide 为 0 时仍是有限值");
});

test("velocityOf：样本不足或时间差过小时返回 0，否则按窗口内首尾换算", () => {
	assert.equal(velocityOf([], 1000), 0);
	assert.equal(velocityOf([[900, 0]], 1000), 0);
	assert.equal(velocityOf([[995, 0], [999, 8]], 1000), 0, "时间差小于 8ms 不采样");
	assert.equal(velocityOf([[900, 0], [1000, 100]], 1000), 1000, "100px/100ms = 1000px/s");
	// 窗口外的样本被忽略，只剩一个可用样本。
	assert.equal(velocityOf([[100, 0], [1000, 50]], 1000), 0);
});

test("pushSample：超出上限时保留最近的样本", () => {
	let history = [];
	for (let i = 0; i < RUBBER.HISTORY_LIMIT + 3; i += 1) history = pushSample(history, [i, i * 10]);
	assert.equal(history.length, RUBBER.HISTORY_LIMIT);
	assert.equal(history[history.length - 1][0], RUBBER.HISTORY_LIMIT + 2);
	assert.equal(pushSample([[1, 1]], [2, 2])[1][0], 2);
});

test("nearestSlot：取最近中心，距离相等时取靠前槽位，空数组返回 -1", () => {
	assert.equal(nearestSlot([], 0), -1);
	assert.equal(nearestSlot([10, 50, 90], 20), 0);
	assert.equal(nearestSlot([10, 50, 90], 45), 1);
	assert.equal(nearestSlot([10, 50, 90], 75), 2);
	assert.equal(nearestSlot([20, 40], 30), 0, "距离相等时保留靠前槽位");
});

test("slotCenters：把左右边缘换算成中心点", () => {
	assert.deepEqual(slotCenters([{ l: 0, r: 10 }, { l: 10, r: 30 }]), [5, 20]);
});

test("dragEdges：轨道内正常跟手，左越界固定左边缘，右越界固定右边缘", () => {
	const middle = dragEdges({ x: 60, offset: 10, width: 120, thumbWidth: 40 });
	assert.deepEqual(middle, { l: 50, r: 90 });

	const leftOver = dragEdges({ x: -20, offset: 10, width: 120, thumbWidth: 40 });
	assert.equal(leftOver.l, 0);
	assert.ok(leftOver.r > 0 && leftOver.r < 40, "左越界时右边缘被橡皮筋压缩");

	const rightOver = dragEdges({ x: 200, offset: 10, width: 120, thumbWidth: 40 });
	assert.equal(rightOver.r, 120);
	assert.ok(rightOver.l > 80 && rightOver.l <= 120, "右越界时左边缘被橡皮筋推后但不越过轨道");
});

test("resolveTarget：无甩动时取最近段，甩动会带投影并越界时夹紧", () => {
	const centers = [20, 60, 100];
	assert.equal(resolveTarget({ centers, x: 30, velocity: 0, from: 0, count: 3 }).target, 0);
	assert.equal(resolveTarget({ centers, x: 95, velocity: 0, from: 0, count: 3 }).target, 2);
	// 200px/s 的甩动投影约 19px：58 → 77，最近仍是第 2 段（下标 1），因此向速度方向步进一段。
	const flick = resolveTarget({ centers, x: 58, velocity: 200, from: 1, count: 3 });
	assert.equal(flick.flick, true);
	assert.equal(flick.target, 2, "甩动但仍在当前段时向速度方向步进一段");
	assert.equal(resolveTarget({ centers, x: 100, velocity: 200, from: 2, count: 3 }).target, 2, "末段无法继续右移");
	assert.equal(resolveTarget({ centers, x: 20, velocity: -200, from: 0, count: 3 }).target, 0, "首段无法继续左移");
	assert.equal(resolveTarget({ centers, x: 95, velocity: 0, from: 0, count: 0 }).target, 2, "段数为 0 时不抛错");
});

test("dilateEdges：100 拉伸覆盖起止两段并集，0 拉伸等于目标段", () => {
	const from = { l: 0, r: 40 };
	const to = { l: 80, r: 120 };
	assert.deepEqual(dilateEdges(from, to, 100), { l: 0, r: 120 });
	assert.deepEqual(dilateEdges(from, to, 0), { l: 80, r: 120 });
	const half = dilateEdges(from, to, 50);
	assert.ok(half.l < 80 && half.r === 120, "半程只张开拖尾侧");
});

test("landPlan：向右移动时主轴为右边缘、拖尾左边缘先越冲再回弹", () => {
	const plan = landPlan({ l: 0, r: 40 }, { l: 80, r: 120 }, 3);
	assert.equal(plan.dir, 1);
	assert.deepEqual(plan.lead, { edge: "r", value: 120 });
	assert.equal(plan.trail.edge, "l");
	assert.equal(plan.trail.value, 83);
	assert.equal(plan.trail.relax, 80);

	const back = landPlan({ l: 80, r: 120 }, { l: 0, r: 40 }, 3);
	assert.equal(back.dir, -1);
	assert.deepEqual(back.lead, { edge: "l", value: 0 });
	assert.equal(back.trail.edge, "r");
	assert.equal(back.trail.value, 37);
	assert.equal(back.trail.relax, 40);

	const zero = landPlan({ l: 0, r: 10 }, { l: 0, r: 10 }, 3);
	assert.equal(zero.dir, 1, "无位移时默认向右，避免除零");
});

test("cubicBezier / easeOut：端点精确、先快后慢、单调不回退", () => {
	assert.equal(easeOut(0), 0);
	assert.equal(easeOut(1), 1);
	assert.ok(easeOut(0.5) > 0.5, "ease-out 在中间应超过线性");
	assert.ok(easeOut(-1) === 0 && easeOut(2) === 1, "越界输入被夹紧");
	let previous = 0;
	for (let i = 1; i <= 20; i += 1) {
		const value = easeOut(i / 20);
		assert.ok(value >= previous, "缓动函数必须单调");
		previous = value;
	}
	const linear = cubicBezier(0.5, 0.5, 0.5, 0.5);
	assert.ok(Math.abs(linear(0.25) - 0.25) < 0.02, "对称控制点应近似线性");
});
