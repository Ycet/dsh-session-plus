// dsh-session-plus — v0.7.0「新建会话页 / 在应用中打开」按钮的离线测试（node:test）
//
// 这个功能复用官方宿主路由（GET /open-in-app/apps、GET /open-in-app/icon/<id>、
// POST /open-in-app/open）但不复制官方代码；因此这里锁定的是**协议契约与可见性
// 判定**：路由常量、请求体、失败降级、四条可见性条件、面板展开判定、偏好记忆。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLIENT_PATH = fileURLToPath(new URL("../lib/client.js", import.meta.url));

function fakeStorage(initial = {}) {
	const map = new Map(Object.entries(initial));
	return {
		map,
		getItem: (key) => (map.has(key) ? map.get(key) : null),
		setItem: (key, value) => { map.set(key, String(value)); },
		removeItem: (key) => { map.delete(key); },
	};
}

/** 可编程的 document 替身：querySelector 的返回值由测试直接控制。 */
function fakeDocument() {
	const doc = {
		found: { corner: null, expand: null },
		querySelector(selector) {
			if (selector === "[data-conversation-header-corner]") return doc.found.corner;
			if (selector === "[data-sidebar-right-expand]") return doc.found.expand;
			return null;
		},
		createElement: () => ({ dataset: {}, classList: { add() {} }, appendChild() {}, remove() {}, setAttribute() {}, style: {} }),
		head: { appendChild() {} },
		body: {},
	};
	return doc;
}

/** 加载 bundle 并执行 apply()，返回 __internals 与注册面。 */
function setup({ storage, doc } = {}) {
	const source = readFileSync(CLIENT_PATH, "utf8");
	let definition = null;
	const windowStub = { __ModuleLoader__: { load: (def) => { definition = def; } } };
	if (storage !== undefined) windowStub.localStorage = storage;
	const documentStub = doc ?? fakeDocument();
	new Function("window", "document", source)(windowStub, documentStub);
	assert.notEqual(definition, null);
	const reactStub = new Proxy({}, { get: () => () => null });
	const mod = definition.factory((name) => (name === "react" ? reactStub : { createPortal: () => null }));

	const registrations = [];
	const locales = [];
	const ctx = {
		effect: (fn) => { const cleanup = fn(); return cleanup; },
		on: () => () => {},
		locale: {
			register: (ns, dicts) => { locales.push({ ns, ...dicts }); return () => {}; },
			bind: () => (key) => key,
			subscribe: () => () => {},
		},
		slots: {
			inject: (_name, fn) => fn(),
			register: (spec) => { registrations.push(spec); return () => {}; },
		},
		inject: (keys, fn) => {
			if (Array.isArray(keys) && (keys.includes("modelDirectories") || keys.includes("theme"))) return;
			fn(ctx);
		},
		get: (name) => ctx[name],
	};
	ctx.theme = { getTheme: () => ({ preference: "system" }), setTheme: () => {} };
	mod.apply(ctx);
	return { mod, internals: mod.__internals, registrations, locales, ctx, windowStub, documentStub };
}

/** 安装一个 fetch 替身，返回调用记录。 */
function stubFetch(handler) {
	const calls = [];
	const previous = globalThis.fetch;
	globalThis.fetch = async (url, init) => {
		calls.push({ url, init });
		return handler(url, init);
	};
	return { calls, restore: () => { globalThis.fetch = previous; } };
}

function jsonResponse(payload, ok = true) {
	return { ok, status: ok ? 200 : 500, json: async () => payload };
}

test("注册面：hero.options 席位 id / order / locale / label 固定", () => {
	const { registrations, internals } = setup({ storage: fakeStorage() });
	const hero = registrations.filter((spec) => spec.name === "conversation.hero.options");
	assert.equal(hero.length, 1);
	assert.equal(hero[0].id, internals.OPEN_IN_ENTRY_ID);
	assert.equal(hero[0].order, internals.OPEN_IN_ENTRY_ORDER);
	assert.equal(hero[0].order, 50);
	assert.equal(hero[0].locale, "sessionPlus");
	assert.equal(typeof hero[0].label, "function");
});

test("注册面：inject 透传 sessionId 与宿主 ctx（面板展开判定要用）", () => {
	const { registrations, ctx } = setup({ storage: fakeStorage() });
	const hero = registrations.find((spec) => spec.name === "conversation.hero.options");
	const face = hero.inject("session-1");
	assert.equal(face.sessionId, "session-1");
	assert.equal(face.__ctx, ctx);
});

test("路由契约：三个官方宿主路由与官方实现保持一致", () => {
	const { internals } = setup({ storage: fakeStorage() });
	assert.equal(internals.OPEN_IN_APPS_ROUTE, "/open-in-app/apps");
	assert.equal(internals.OPEN_IN_ICON_ROUTE, "/open-in-app/icon");
	assert.equal(internals.OPEN_IN_OPEN_ROUTE, "/open-in-app/open");
});

test("偏好记忆：自有键优先于官方键，且两种官方写法都能继承", () => {
	const raw = setup({ storage: fakeStorage({ "dsh.open-in-app.choice": "cursor" }) }).internals;
	assert.equal(raw.readOpenInChoice(), "cursor");

	const json = setup({ storage: fakeStorage({ "dsh.open-in-app.choice": JSON.stringify("vscode") }) }).internals;
	assert.equal(json.readOpenInChoice(), "vscode");

	const own = setup({ storage: fakeStorage({ "dsh.open-in-app.choice": "cursor", "dsh.session-plus.open-in-app.v1": "zed" }) }).internals;
	assert.equal(own.readOpenInChoice(), "zed");

	const empty = setup({ storage: fakeStorage() }).internals;
	assert.equal(empty.readOpenInChoice(), "");
});

test("偏好记忆：写入只碰自有键，绝不改写官方状态", () => {
	const storage = fakeStorage({ "dsh.open-in-app.choice": "cursor" });
	const { internals } = setup({ storage });
	internals.rememberOpenInChoice("warp");
	assert.equal(storage.map.get("dsh.session-plus.open-in-app.v1"), "warp");
	assert.equal(storage.map.get("dsh.open-in-app.choice"), "cursor");
});

test("偏好记忆：storage 抛错时不抛异常", () => {
	const storage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
	const { internals } = setup({ storage });
	assert.equal(internals.readOpenInChoice(), "");
	assert.doesNotThrow(() => internals.rememberOpenInChoice("vscode"));
});

test("应用目录：读取成功时过滤非字符串项、状态 ready，并只读一次", async () => {
	const { internals } = setup({ storage: fakeStorage() });
	const source = internals.createAppsSource();
	const fetcher = stubFetch(() => Promise.resolve(jsonResponse({ apps: ["finder", "vscode", 42, "", null] })));
	try {
		await source.load();
		assert.deepEqual(source.snapshot(), { status: "ready", apps: ["finder", "vscode"] });
		await source.load();
		assert.equal(fetcher.calls.length, 1, "整页只读一次");
		assert.equal(fetcher.calls[0].url, "/open-in-app/apps");
		assert.equal(fetcher.calls[0].init.headers.accept, "application/json");
	} finally {
		fetcher.restore();
	}
});

test("应用目录：空列表 / 非 2xx / 请求失败都降级为 empty（不渲染按钮）", async () => {
	for (const handler of [
		() => Promise.resolve(jsonResponse({ apps: [] })),
		() => Promise.resolve(jsonResponse({ apps: ["finder"] }, false)),
		() => Promise.reject(new Error("offline")),
		() => Promise.resolve(jsonResponse({ nope: true })),
	]) {
		const { internals } = setup({ storage: fakeStorage() });
		const source = internals.createAppsSource();
		const fetcher = stubFetch(handler);
		try {
			await source.load();
			assert.deepEqual(source.snapshot(), { status: "empty", apps: [] });
		} finally {
			fetcher.restore();
		}
	}
});

test("应用目录：订阅者收到状态变化，reset 后可重新读取", async () => {
	const { internals } = setup({ storage: fakeStorage() });
	const source = internals.createAppsSource();
	let notifications = 0;
	const off = source.subscribe(() => { notifications += 1; });
	const fetcher = stubFetch(() => Promise.resolve(jsonResponse({ apps: ["finder"] })));
	try {
		await source.load();
		assert.equal(notifications, 1);
		off();
		source.reset();
		await source.load();
		assert.equal(notifications, 1, "退订后不再收到通知");
	} finally {
		fetcher.restore();
	}
});

test("打开动作：POST 到官方路由，请求体为 {app, path}", async () => {
	const { internals } = setup({ storage: fakeStorage() });
	const fetcher = stubFetch(() => Promise.resolve({ ok: true, status: 200 }));
	try {
		const ok = await internals.requestOpenInApp("finder", "/tmp/workspace");
		assert.equal(ok, true);
		assert.equal(fetcher.calls[0].url, "/open-in-app/open");
		assert.equal(fetcher.calls[0].init.method, "POST");
		assert.equal(fetcher.calls[0].init.headers["content-type"], "application/json");
		assert.deepEqual(JSON.parse(fetcher.calls[0].init.body), { app: "finder", path: "/tmp/workspace" });
	} finally {
		fetcher.restore();
	}
});

test("打开动作：非 2xx 与网络抛错都返回 false（外层据此弹 Toast）", async () => {
	const { internals } = setup({ storage: fakeStorage() });
	const failed = stubFetch(() => Promise.resolve({ ok: false, status: 500 }));
	try {
		assert.equal(await internals.requestOpenInApp("finder", "/tmp/w"), false);
	} finally {
		failed.restore();
	}
	const thrown = stubFetch(() => Promise.reject(new Error("boom")));
	try {
		assert.equal(await internals.requestOpenInApp("finder", "/tmp/w"), false);
	} finally {
		thrown.restore();
	}
});

test("应用名：已知 id 走词典，未知 id 回退裸 id", () => {
	const { internals, locales } = setup({ storage: fakeStorage() });
	const t = (key) => locales[0].zh[key] ?? key;
	assert.equal(internals.appLabelOf(t, "finder"), "访达");
	assert.equal(internals.appLabelOf(t, "mystery-app"), "mystery-app");
	// 未注册的键让 translate 原样返回键名时同样回退，避免菜单出现 "app.xxx"。
	const passthrough = (key) => key;
	assert.equal(internals.appLabelOf(passthrough, "finder"), "finder");
});

test("可见性：四条与门全满足才渲染，任一不满足都不渲染", () => {
	const { internals } = setup({ storage: fakeStorage() });
	const base = { featureEnabled: true, host: {}, expanded: false, appsStatus: "ready", cwd: "/tmp/w" };
	assert.equal(internals.openInVisible(base), true);
	assert.equal(internals.openInVisible({ ...base, featureEnabled: false }), false, "开关关闭");
	assert.equal(internals.openInVisible({ ...base, host: null }), false, "标题栏锚点未就绪");
	assert.equal(internals.openInVisible({ ...base, expanded: true }), false, "右侧面板展开");
	assert.equal(internals.openInVisible({ ...base, appsStatus: "loading" }), false, "应用目录未就绪");
	assert.equal(internals.openInVisible({ ...base, appsStatus: "empty" }), false, "应用目录为空");
	assert.equal(internals.openInVisible({ ...base, cwd: "" }), false, "会话没有工作区目录");
	assert.equal(internals.openInVisible({ ...base, cwd: undefined }), false, "cwd 缺失");
});

test("面板展开判定：优先读取 ctx.sidebarRight 服务", () => {
	const { internals } = setup({ storage: fakeStorage() });
	assert.equal(internals.panelExpandedNow({ sidebarRight: { isExpanded: () => true } }), true);
	assert.equal(internals.panelExpandedNow({ sidebarRight: { isExpanded: () => false } }), false);
});

test("面板展开判定：服务缺席或抛错时用官方展开按钮的可见性反推", () => {
	const doc = fakeDocument();
	const { internals } = setup({ storage: fakeStorage(), doc });
	// 标题栏还没挂起来：按收起处理，避免首帧误判。
	assert.equal(internals.panelExpandedNow({}), false);
	doc.found.corner = {};
	doc.found.expand = {};
	assert.equal(internals.panelExpandedNow({}), false, "展开按钮在 → 面板收起");
	doc.found.expand = null;
	assert.equal(internals.panelExpandedNow({}), true, "展开按钮不在 → 面板已展开");
	assert.equal(internals.panelExpandedNow({ sidebarRight: { isExpanded() { throw new Error("boom"); } } }), true, "服务抛错也要回退到 DOM");
});

// ── v0.7.1 落点：始终排在按钮簇最左侧（纯几何计算） ──────────────────────
const rect = (left, top, width, height) => ({
	left, top, right: left + width, bottom: top + height, width, height,
});

test("落点：排在整簇按钮最左侧，与最左按钮保持 8px 间距", () => {
	const { internals } = setup({ storage: fakeStorage() });
	const anchor = rect(900, 10, 28, 28);
	const rows = [
		anchor,
		rect(820, 10, 28, 28), // better-sidebar 兜底切换
		rect(760, 10, 28, 28), // awesome-hud 悬浮入口（本轮最左）
	];
	const placed = internals.placeClusterButton(rows, anchor, { width: 70, height: 24 });
	assert.equal(internals.OPEN_IN_CLUSTER_GAP, 8);
	assert.equal(placed.left, 760 - 8 - 70, "左侧必须紧贴最左按钮左侧 8px");
	assert.equal(placed.top, 10 + (28 - 24) / 2, "垂直方向与官方按钮居中对齐");
});

test("落点：只有官方展开按钮时贴其左侧 8px", () => {
	const { internals } = setup({ storage: fakeStorage() });
	const anchor = rect(900, 10, 28, 28);
	const placed = internals.placeClusterButton([anchor], anchor, { width: 70, height: 24 });
	assert.equal(placed.left, 900 - 8 - 70);
});

test("落点：跨行按钮不参与最左判定", () => {
	const { internals } = setup({ storage: fakeStorage() });
	const anchor = rect(900, 10, 28, 28);
	const rows = [anchor, rect(20, 300, 28, 28)]; // 视口别处（如底部）的按钮
	const placed = internals.placeClusterButton(rows, anchor, { width: 70, height: 24 });
	assert.equal(placed.left, 900 - 8 - 70);
});

test("落点：窗口极窄时贴住视口左缘（不小于 12px）", () => {
	const { internals } = setup({ storage: fakeStorage() });
	const anchor = rect(30, 10, 28, 28);
	const placed = internals.placeClusterButton([anchor], anchor, { width: 70, height: 24 });
	assert.equal(internals.OPEN_IN_MIN_LEFT, 12);
	assert.equal(placed.left, 12);
});

test("落点：锚点或自身尺寸不可用时返回 null（调用方据此不落位）", () => {
	const { internals } = setup({ storage: fakeStorage() });
	const anchor = rect(900, 10, 28, 28);
	assert.equal(internals.placeClusterButton([anchor], null, { width: 70, height: 24 }), null);
	assert.equal(internals.placeClusterButton([anchor], rect(0, 0, 0, 0), { width: 70, height: 24 }), null);
	assert.equal(internals.placeClusterButton([anchor], anchor, { width: 0, height: 24 }), null);
});

test("落点：按钮簇选择器覆盖 better-sidebar 与 awesome-hud 的浮动入口", () => {
	const { internals } = setup({ storage: fakeStorage() });
	assert.ok(internals.OPEN_IN_CLUSTER_SELECTORS.includes("[data-sidebar-right-expand]"));
	assert.ok(internals.OPEN_IN_CLUSTER_SELECTORS.includes("[data-dsh-dock-fallback]"));
	assert.ok(internals.OPEN_IN_CLUSTER_SELECTORS.includes("[data-hud-float]"));
	// 离线环境没有官方 primitives：开关退回自绘；浏览器夹具里再断言官方 Switch 生效。
	assert.equal(internals.hasOfficialSwitch(), false);
});
