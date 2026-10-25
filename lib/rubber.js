// dsh-session-plus — Rubber Segment 纯数学与几何（无 DOM 依赖）
//
// 移植自 react-bits 的 RubberSegment（https://reactbits.dev/micro/rubber-segment）：
// 保留其“滑块先跨段拉伸、再收缩落位”的两段动效与拖拽边缘橡皮筋算法，
// 但去掉 motion/react 依赖，改为纯数值计算，由 lib/client.js 用 rAF 驱动。
//
// 注意：ModuleLoader bundle 自包含，不支持包内 import，lib/client.js 内有等价的
// 镜像实现；两处必须同步修改。本文件由 test/rubber.test.mjs 保护。

/** 动效与交互常量（时间单位毫秒，距离单位像素）。 */
export const RUBBER = Object.freeze({
	/** 拉伸阶段占位时长（秒），与 react-bits DILATE 一致。 */
	DILATE: 0.19,
	/** 拉伸到落位的交接延时（秒），与 react-bits HANDOFF 一致。 */
	HANDOFF: 0.15,
	/** 主轴落位时长。 */
	LEAD_MS: 300,
	/** 拖尾回弹时长。 */
	TRAIL_RELAX_MS: 160,
	/** 判定为甩动的速度阈值。 */
	FLICK: 110,
	/** 速度上限。 */
	MAX_VELOCITY: 2000,
	/** 按下后开始拖动的最小位移。 */
	DEADZONE: 4,
	/** 判定为点击（而非拖动）的最大位移。 */
	SLOP: 10,
	/** 橡皮筋阻尼系数。 */
	RUBBER_FACTOR: 0.55,
	/** 速度采样时间窗。 */
	VELOCITY_WINDOW_MS: 100,
	/** 速度采样历史上限。 */
	HISTORY_LIMIT: 8,
	/** 拉伸比例（100 = 完全覆盖起止两段）。 */
	DEFAULT_STRETCH: 100,
	/** 落位挤压像素。 */
	DEFAULT_SQUASH: 3,
	/** 甩动投影强度。 */
	DEFAULT_GLIDE: 75,
	/** 主轴缓动曲线（react-bits EASE_OUT）。 */
	EASE_OUT: [0.23, 1, 0.32, 1],
});

/** 控件视觉尺寸。 */
export const STYLE = Object.freeze({
	height: 32,
	radius: 9,
	inset: 3,
	thumbRadius: 6,
	font: 12,
	pad: 8,
});

/** 三态主题偏好的展示顺序（与产品要求一致）。 */
export const THEME_PREFERENCES = Object.freeze(["system", "light", "dark"]);

/** 把数值收敛到 [min, max]。 */
export function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

/**
 * 橡皮筋位移：拖动越过边界时按 react-bits 的阻尼公式减缓。
 * @param over - 越过边界的距离（正数）。
 * @param dim - 拖拽方向的可用尺寸。
 * @returns 实际跟随距离。
 */
export function rubberBand(over, dim) {
	if (!(dim > 0) || !(over > 0)) return 0;
	const r = RUBBER.RUBBER_FACTOR;
	return (over * dim * r) / (dim + r * Math.abs(over));
}

/**
 * 甩动速度投影：把速度换算成落点偏移，glide 越大越远。
 * @param velocity - 像素/秒。
 * @param glide - 投影强度（默认 75）。
 * @returns 落点相对当前位置的偏移像素。
 */
export function project(velocity, glide = RUBBER.DEFAULT_GLIDE) {
	const d = 1 - 0.1 * Math.pow(0.05, glide / 100);
	if (!(d > 0) || d >= 1) return 0;
	return ((velocity / 1000) * d) / (1 - d);
}

/**
 * 由指针采样历史计算瞬时速度。
 * @param history - `[时间戳, 局部 x]` 采样数组。
 * @param now - 释放时刻的时间戳。
 * @returns 像素/秒；样本不足或时间差过小时为 0。
 */
export function velocityOf(history, now) {
	const recent = history.filter(([time]) => now - time <= RUBBER.VELOCITY_WINDOW_MS);
	if (recent.length < 2) return 0;
	const [t0, x0] = recent[0];
	const [t1, x1] = recent[recent.length - 1];
	if (!(t1 - t0 >= 8)) return 0;
	return ((x1 - x0) / (t1 - t0)) * 1000;
}

/** 追加采样并保留最近 limit 条。 */
export function pushSample(history, sample, limit = RUBBER.HISTORY_LIMIT) {
	const next = [...history, sample];
	return next.length > limit ? next.slice(next.length - limit) : next;
}

/**
 * 取距离 x 最近的槽位下标；距离相等时保留更靠前的槽位。
 * @param centers - 各槽位中心点。
 * @param x - 目标位置。
 * @returns 槽位下标；空数组返回 -1。
 */
export function nearestSlot(centers, x) {
	if (!Array.isArray(centers) || centers.length === 0) return -1;
	let best = 0;
	for (let i = 1; i < centers.length; i += 1) {
		if (Math.abs(centers[i] - x) < Math.abs(centers[best] - x)) best = i;
	}
	return best;
}

/** 槽位矩形 → 中心点数组。 */
export function slotCenters(slots) {
	return slots.map((slot) => (slot.l + slot.r) / 2);
}

/**
 * 按下并移动后计算滑块左右边缘（含边缘橡皮筋）。
 * @param input.x - 指针相对轨道的 x。
 * @param input.offset - 按下点相对滑块左边缘的偏移。
 * @param input.width - 轨道内可用宽度。
 * @param input.thumbWidth - 当前滑块宽度。
 * @returns `{ l, r }` 滑块左右边缘。
 */
export function dragEdges({ x, offset, width, thumbWidth }) {
	const maxLeft = Math.max(0, width - thumbWidth);
	const left = x - offset;
	if (left < 0) return { l: 0, r: Math.max(0, thumbWidth - rubberBand(-left, thumbWidth)) };
	if (left > maxLeft) return { l: Math.min(width, maxLeft + rubberBand(left - maxLeft, thumbWidth)), r: width };
	return { l: left, r: left + thumbWidth };
}

/**
 * 拖拽释放后的目标段（含甩动投影与越界步进）。
 * @param input.centers - 各槽位中心点。
 * @param input.x - 释放时滑块中心。
 * @param input.velocity - 释放速度。
 * @param input.from - 当前段下标。
 * @param input.count - 段数。
 * @returns `{ target, flick }`。
 */
export function resolveTarget({ centers, x, velocity, from, count, glide = RUBBER.DEFAULT_GLIDE }) {
	const index = Math.min(Math.max(0, Math.floor(count) - 1), Math.max(0, Math.floor(count) - 1));
	const target0 = nearestSlot(centers, x + project(velocity, glide));
	const flick = Math.abs(velocity) > RUBBER.FLICK;
	let target = target0;
	if (flick && target0 === from) target = clamp(target0 + Math.sign(velocity), 0, Math.max(0, index));
	return { target, flick };
}

/**
 * 拉伸阶段的边缘目标：向起止两段的并集扩张。
 * @param from - 起始段矩形。
 * @param to - 目标段矩形。
 * @param stretch - 拉伸比例（100 = 完全张开）。
 * @returns `{ l, r }`。
 */
export function dilateEdges(from, to, stretch = RUBBER.DEFAULT_STRETCH) {
	const u = clamp(stretch, 0, 100) / 100;
	return {
		l: to.l + (Math.min(from.l, to.l) - to.l) * u,
		r: to.r + (Math.max(from.r, to.r) - to.r) * u,
	};
}

/**
 * 落位计划：主轴边缘先到、拖尾边缘越过 squash 后再回弹。
 * @param from - 落位前的滑块矩形。
 * @param to - 目标段矩形。
 * @param squash - 挤压像素。
 * @returns `{ dir, lead, trail }`，lead/trail 各含 edge 与 value，trail 另含 relax。
 */
export function landPlan(from, to, squash = RUBBER.DEFAULT_SQUASH) {
	const dir = Math.sign((to.l + to.r) / 2 - (from.l + from.r) / 2) || 1;
	const amount = Math.max(0, squash);
	if (dir > 0) {
		return {
			dir,
			lead: { edge: "r", value: to.r },
			trail: { edge: "l", value: to.l + dir * amount, relax: to.l },
		};
	}
	return {
		dir,
		lead: { edge: "l", value: to.l },
		trail: { edge: "r", value: to.r + dir * amount, relax: to.r },
	};
}

/**
 * 三次贝塞尔缓动求值器（与 CSS cubic-bezier 同解）。
 * @returns `(t: number) => number`，t 与返回值均在 [0, 1]。
 */
export function cubicBezier(x1, y1, x2, y2) {
	const ax = 3 * x1 - 3 * x2 + 1;
	const bx = 3 * x2 - 6 * x1;
	const cx = 3 * x1;
	const ay = 3 * y1 - 3 * y2 + 1;
	const by = 3 * y2 - 6 * y1;
	const cy = 3 * y1;
	const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
	const sampleY = (t) => ((ay * t + by) * t + cy) * t;
	const sampleDX = (t) => (3 * ax * t + 2 * bx) * t + cx;
	return (x) => {
		if (!(x > 0)) return 0;
		if (x >= 1) return 1;
		let t = x;
		for (let i = 0; i < 6; i += 1) {
			const dx = sampleX(t) - x;
			if (Math.abs(dx) < 1e-4) return sampleY(t);
			const slope = sampleDX(t);
			if (Math.abs(slope) < 1e-6) break;
			t -= dx / slope;
		}
		let lo = 0;
		let hi = 1;
		t = x;
		for (let i = 0; i < 20; i += 1) {
			const value = sampleX(t);
			if (Math.abs(value - x) < 1e-4) break;
			if (value < x) lo = t;
			else hi = t;
			t = (lo + hi) / 2;
		}
		return sampleY(t);
	};
}

/** 主轴缓动（react-bits EASE_OUT）。 */
export const easeOut = cubicBezier(...RUBBER.EASE_OUT);
