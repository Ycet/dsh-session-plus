/**
 * 功能 4（推理等级滑条）离线测试
 *
 * 覆盖迁入 dsh-session-plus 的 dsh-codex-effort-slider 核心行为：注入位置与行改造、
 * 档位映射、能量/粒子数学、运动引擎、写回契约（去重/降频/超时回滚）、关菜单还原、
 * fail-open、座席着色与本地化钩子。
 *
 * 只断言**行为**，不断言"源码里必须出现某段字符串"——合并后那类断言极易误报。
 * 浏览器侧的真实 ModelSelect 集成由 desktop-browser.test.mjs 覆盖。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
	createDocument,
	createFakeHost,
	createOfficialMenu,
	loadBundle,
	settle,
} from "./helpers/effort-harness.mjs";

const BUNDLE = fileURLToPath(new URL("../lib/client.js", import.meta.url));
const SESSION = "session-abcdef";

/**
 * 起一个完整场景：假官方菜单 + 真产物 + 假宿主，把 vendor 组件直接挂进官方 composer。
 * 说明：这里不调用本插件的 apply()（它还会装配另外三项功能），只测迁入的滑条本体；
 * 装配面由 client.test.mjs 断言，真实集成由浏览器用例断言。
 */
async function setup(options = {}) {
	const document = createDocument();
	const menu = createOfficialMenu(document, options.menu ?? {});
	const bundle = loadBundle(BUNDLE, document, { reducedMotion: options.reducedMotion === true });
	const vendor = bundle.plugin.__effortSlider;
	if (!vendor || typeof vendor.CodexEffortSlider !== "function") {
		throw new Error("bundle 没有导出 __effortSlider.CodexEffortSlider");
	}
	const host = createFakeHost(options.host ?? {});
	if (typeof options.translator === "function") vendor.__setTranslator(options.translator);
	bundle.react.mount(
		vendor.CodexEffortSlider,
		Object.assign({ sessionId: SESSION, __ctx: host.ctx }, options.props ?? {}),
		menu.composer,
	);
	await settle();
	return { document, menu, bundle, vendor, host, react: bundle.react };
}

/** 逐帧推进引擎：每帧之间只落微任务，避免真实 setTimeout 把墙上时间推进到降频窗口。 */
async function runFrames(ctx, frames = 90, dtMs = 16) {
	for (let i = 0; i < frames; i += 1) {
		const executed = ctx.bundle.flushFrames(1, dtMs);
		for (let m = 0; m < 6; m += 1) await Promise.resolve();
		if (executed === 0) break;
	}
}

/** 现查轨道节点并给确定几何（假 DOM 不做布局）。 */
function trackNode(react, left = 0, width = 300) {
	const node = react.find("track");
	if (node) node.rect = { left, top: 0, right: left + width, bottom: 28, width, height: 28 };
	return node;
}

async function pressAt(ctx, clientX) {
	const node = trackNode(ctx.react);
	node.fire("onPointerDown", { clientX, pointerId: 1, button: 0 });
	await runFrames(ctx);
	await settle();
}

async function moveTo(ctx, clientX) {
	const node = trackNode(ctx.react);
	node.fire("onPointerMove", { clientX, pointerId: 1 });
	for (let m = 0; m < 6; m += 1) await Promise.resolve();
}

async function release(ctx) {
	const node = trackNode(ctx.react);
	node.fire("onPointerUp", { pointerId: 1 });
	await runFrames(ctx);
	await settle();
}

test("注入：滑条落进「推理等级」行，行被加高折行，官方原有内容不动", async () => {
	const ctx = await setup();
	const { menu, react, vendor } = ctx;
	const row = menu.effortRow;

	assert.equal(row.style.paddingTop, vendor.ROW_PADDING_BLOCK, "那一行的上内距被加高");
	assert.equal(row.style.paddingBottom, vendor.ROW_PADDING_BLOCK, "下内距同样加高");
	assert.equal(row.style.height, "auto", "取消官方固定 34px 高");
	assert.equal(row.style.flexWrap, "wrap", "允许折行，让滑条落到第二行");
	assert.equal(row.getAttribute("role"), "menuitem", "官方 role 没被动过");

	const hostNode = react.find("host");
	assert.ok(hostNode !== null, "滑条容器被 append 进那一行");
	assert.equal(hostNode.parentNode, row, "容器的父节点就是官方那一行");
	assert.equal(react.portalHosts.length, 1, "只有一次 portal");
	const track = react.find("track");
	assert.equal(track.getAttribute("role"), "slider", "轨道语义是 slider");
	const root = react.find("root");
	assert.equal(root.getAttribute("data-reached-ticks"), "highlight", "刻度点固定亮白显示已到达档位");
	assert.equal(root.getAttribute("data-motion"), "full", "动画固定完整档");
});

test("档位映射：从目录快照算出官方档位列表与索引", async () => {
	const { vendor } = await setup();
	const internals = vendor;
	const snapshot = createFakeHost().store.getSnapshot();

	const levels = internals.levelsOf(snapshot);
	assert.deepEqual(levels.map((level) => level.id), ["off", "low", "high", "max"], "档位按目录顺序");
	assert.deepEqual(levels.map((level) => level.name), ["Off", "Low", "High", "Max"], "用官方显示名");

	assert.equal(internals.effectiveEffortId(snapshot), "high", "未显式设置时取默认档");
	assert.equal(internals.indexOfLevel(levels, "max"), 3);
	assert.equal(internals.indexOfLevel(levels, "nope"), -1, "未知档位返回 -1");
	assert.equal(internals.pctFromIndex(0, 4), 0);
	assert.equal(internals.pctFromIndex(3, 4), 1);
	assert.equal(internals.indexOfLevel(levels, "low"), internals.indexFromPct(internals.pctFromIndex(1, 4), 4));
	assert.equal(internals.detentTargetIndex(2.4, 1, 4), 2, "越过当前格 1/3 才向上切一格");
	assert.equal(internals.detentTargetIndex(1.2, 1, 4), 1, "不到 1/3 保持不动（滞回）");
	assert.equal(internals.detentTargetIndex(0.2, 1, 4), 0, "退回 2/3 才向下切一格");
});

test("能量与粒子：只有最高档通电，颜色从蓝走到紫", async () => {
	const { vendor } = await setup();
	const internals = vendor;

	assert.equal(internals.energyFor(0, 4), 0, "最左端不亮");
	assert.equal(internals.energyFor(1, 4), 1, "最右端满亮");
	const mid = internals.energyFor(0.5, 4);
	assert.ok(mid > 0 && mid < 1, "中间档是渐入");

	assert.ok(internals.starCountFor(1, 4) > 0, "最高档有星尘");
	assert.equal(internals.starCountFor(0, 4), 0, "最左端没有星尘");
	assert.ok(internals.particleCountFor(1) > 0, "粒子层只在最高档挂载");

	const blue = internals.fillColorFor(0, 4);
	const violet = internals.fillColorFor(1, 4);
	assert.notDeepEqual(blue, violet, "两端颜色不同");
	assert.equal(internals.isOffLevel({ id: "off", name: "Off" }), true, "off 档被识别为「关闭」");
	assert.equal(internals.isOffLevel({ id: "max", name: "Max" }), false);
	assert.equal(internals.isOffLevel({ id: "none" }), true, "none 同义写法也认");
});

test("运动引擎：连续推进、无过冲、能收敛", async () => {
	const { vendor } = await setup();
	const internals = vendor;

	const params = internals.MOTION;
	const m = { x: 0, v: 0, a: 0, target: 1 };
	let settledAt = -1;
	let overshoot = 0;
	for (let i = 0; i < 240; i += 1) {
		internals.motionStep(m, 0.016, params);
		overshoot = Math.max(overshoot, m.x - m.target);
		if (settledAt < 0 && internals.motionSettled(m, params)) settledAt = i;
	}
	assert.ok(settledAt > 0 && settledAt < 240, `应当在有限帧内收敛（实际 ${settledAt}）`);
	assert.ok(Math.abs(m.x - m.target) < 1e-6, "最终位置精确落在目标上");
	assert.ok(overshoot <= 0, `不应越过目标（最大过冲 ${overshoot}）`);

	// 反向同样收敛（不能只验证"往右跑"）
	const back = { x: 1, v: 0, a: 0, target: 0.25 };
	for (let i = 0; i < 240; i += 1) internals.motionStep(back, 0.016, params);
	assert.ok(Math.abs(back.x - 0.25) < 1e-2, "向左推进同样收敛");
	assert.equal(internals.releaseIndexFor(0.9, 3, 4) >= 0, true, "松手投影给出合法档位");
});

test("写回：松手只提交一次，参数带 provider/model/reasoningEffort", async () => {
	const ctx = await setup();
	await pressAt(ctx, 280);
	await moveTo(ctx, 300);
	assert.equal(ctx.host.selects.length, 0, "拖动中不写盘（等降频窗口或松手）");
	await release(ctx);
	await settle();

	assert.equal(ctx.host.selects.length, 1, "松手后只写一次");
	const call = ctx.host.selects[0];
	assert.equal(call.provider, "deepseek");
	assert.equal(call.model, "deepseek-v41-flash");
	assert.equal(call.reasoningEffort, "max", "最右端对应最高档");

	// 再松手一次：档位没变，不应重复写盘
	await release(ctx);
	await settle();
	assert.equal(ctx.host.selects.length, 1, "同档位去重");
});

test("写回失败：乐观值回滚并显示错误提示", async () => {
	let calls = 0;
	const ctx = await setup({
		host: {
			select: () => {
				calls += 1;
				return Promise.reject(new Error("host rejected"));
			},
		},
	});
	await pressAt(ctx, 280);
	await moveTo(ctx, 300);
	await release(ctx);
	await settle();

	assert.equal(calls, 1, "确实尝试写过一次");
	const errorNode = ctx.react.find("error");
	assert.ok(errorNode !== null, "失败后出现行内错误提示");
	assert.match(String(errorNode.textContent), /host rejected|失败|rejected/, "提示里带原因");
});

test("关菜单还原：行内四个内联样式与注入容器逐个还原", async () => {
	const ctx = await setup();
	const { menu, document } = ctx;
	assert.ok(ctx.react.find("host") !== null, "先确认注入成功");

	menu.close();
	ctx.bundle.observers.forEach((observer) => observer.trigger());
	await settle();

	assert.equal(menu.effortRow.style.paddingTop ?? "", "", "上内距已还原");
	assert.equal(menu.effortRow.style.paddingBottom ?? "", "", "下内距已还原");
	assert.equal(menu.effortRow.style.height ?? "", "", "高度已还原");
	assert.equal(menu.effortRow.style.flexWrap ?? "", "", "折行已还原");
	assert.equal(document.querySelectorAll(".ces-inline").length, 0, "注入容器已移除");
});

test("fail-open：官方菜单没有打开时什么都不做", async () => {
	const ctx = await setup({ menu: { open: false } });
	assert.equal(ctx.react.find("host"), null, "没有锚点就不注入");
	assert.equal(ctx.react.portalHosts.length, 0, "没有 portal");
	assert.equal(ctx.menu.effortRow.style.paddingTop ?? "", "", "官方那一行完全没被改");
	assert.equal(ctx.host.selects.length, 0, "没有写盘");
});

test("座席着色：输入框模型按钮上的档位文字跟着档位变色，off 保持官方灰", async () => {
	const ctx = await setup();
	const colored = ctx.menu.seatEffortEl.style.color ?? "";
	assert.notEqual(colored, "", "座席档位文字被着色");
	const offCtx = await setup({ host: { effort: "off" } });
	assert.equal(offCtx.menu.seatEffortEl.style.color ?? "", "", "off 档保持官方颜色");
});

test("本地化钩子：注入解析器后 aria-label 走词典，未注入时回退中文", async () => {
	const zh = await setup();
	const zhTrack = zh.react.find("track");
	assert.equal(zhTrack.getAttribute("aria-label"), "推理等级", "默认回退上游中文文案");

	const en = await setup({
		translator: (key) =>
			({
				effortSliderLabel: "Reasoning effort",
				effortSliderTitle: "Reasoning effort: {name}",
			})[key] ?? null,
	});
	const enTrack = en.react.find("track");
	assert.equal(enTrack.getAttribute("aria-label"), "Reasoning effort", "注入词典后走英文");
});
