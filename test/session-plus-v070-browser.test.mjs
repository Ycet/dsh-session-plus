import test from 'node:test';
import assert from 'node:assert/strict';
import { browserAvailable, v070Harness } from './helpers/browser-harness.mjs';

// v0.7.x 浏览器验收：
//   1) 新建会话页（空会话）出现「在应用中打开」分体按钮：body 上的固定定位，
//      始终排在官方「展开右侧面板」/ better-sidebar / awesome-hud 这几个按钮的最左侧，
//      与它们保持 8px 间距且不重叠；有消息后（hero 卸载）按钮消失。
//   2) 右侧面板展开时隐藏、收起后恢复。
//   3) 主按钮 / 应用菜单的宿主请求与偏好记忆。
//   4) 通用设置 5 行开关的位置、顺序、即时生效，且开关复用官方 Switch（样式逐项一致）。
//   5) 打开失败弹 Toast。
const options = { skip: !browserAvailable, timeout: 30000 };

test('空会话页：固定定位在按钮簇最左侧，与 better-sidebar / awesome-hud 按钮不重叠', options, async () => {
	const fixture = await v070Harness();
	try {
		const { page } = fixture;
		await page.waitForSelector('[data-sp-open-in-session][data-sp-placed] .sp-split');
		assert.equal(await page.locator('.sp-split').count(), 1);

		const placement = await page.evaluate(() => {
			const nodes = {
				host: document.querySelector('[data-sp-open-in-session]'),
				corner: document.getElementById('corner'),
				expand: document.querySelector('[data-sidebar-right-expand]'),
				fallback: document.querySelector('[data-dsh-dock-fallback]'),
				hud: document.querySelector('[data-hud-float]'),
			};
			const rects = {};
			for (const [key, node] of Object.entries(nodes)) {
				rects[key] = node === null ? null : node.getBoundingClientRect().toJSON();
			}
			const overlaps = (left, right) => left !== null && right !== null
				&& left.left < right.right && right.left < left.right && left.top < right.bottom && right.top < left.bottom;
			const neighbours = ['expand', 'fallback', 'hud'].filter(key => rects[key] !== null);
			return {
				hasHost: nodes.host !== null,
				parentIsBody: nodes.host !== null && nodes.host.parentElement === document.body,
				position: nodes.host === null ? null : getComputedStyle(nodes.host).position,
				placed: nodes.host !== null && nodes.host.hasAttribute('data-sp-placed'),
				inCorner: nodes.host !== null && nodes.corner !== null && nodes.corner.contains(nodes.host),
				rects,
				neighbours,
				overlaps: neighbours.filter(key => overlaps(rects.host, rects[key])),
				leftOfAll: neighbours.every(key => rects.host.right <= rects[key].left - 7.5),
				expandStillThere: document.querySelectorAll('[data-sidebar-right-expand]').length,
			};
		});
		assert.equal(placement.hasHost, true);
		assert.equal(placement.parentIsBody, true, '宿主必须挂在 body 上（不参与标题栏排版）');
		assert.equal(placement.position, 'fixed', '宿主必须是固定定位，不再挤占标题栏流内空间');
		assert.equal(placement.placed, true, '落位成功后才可见（避免首帧闪到视口左上角）');
		assert.equal(placement.inCorner, false, '宿主不再塞进标题栏角落容器');
		assert.ok(placement.neighbours.length >= 3, `应至少量到三个邻居按钮，实测 ${JSON.stringify(placement.neighbours)}`);
		assert.deepEqual(placement.overlaps, [], '不得与任何邻居按钮重叠');
		assert.equal(placement.leftOfAll, true, '必须排在整簇按钮最左侧（8px 间距）');
		assert.equal(placement.expandStillThere, 1);

		const centered = await page.evaluate(() => {
			const host = document.querySelector('[data-sp-open-in-session]').getBoundingClientRect();
			const expand = document.querySelector('[data-sidebar-right-expand]').getBoundingClientRect();
			return Math.abs((host.top + host.height / 2) - (expand.top + expand.height / 2));
		});
		assert.ok(centered <= 1, `垂直方向应与官方按钮居中对齐，实测偏差 ${centered}px`);

		assert.equal(await page.locator('.sp-split-main img.sp-split-icon').count(), 1, '图标应来自 /open-in-app/icon 路由');
		assert.equal(await page.locator('.sp-split-main').getAttribute('aria-label'), '用 访达 打开');
		assert.equal(await page.locator('.sp-split-more').getAttribute('aria-label'), '更多打开方式');
		assert.deepEqual(fixture.errors, []);
	} finally { await fixture.close(); }
});

test('其它插件按钮消失后：仍紧贴剩余按钮簇最左侧', options, async () => {
	const fixture = await v070Harness();
	try {
		const { page } = fixture;
		await page.waitForSelector('[data-sp-open-in-session][data-sp-placed] .sp-split');
		await page.evaluate(() => fixture.setStubs(false));
		await page.waitForFunction(() => document.querySelector('[data-dsh-dock-fallback]') === null);
		// 位置由 mutation 回调和 500ms 兜底轮询跟上；这里等几何关系成立。
		await page.waitForFunction(() => {
			const host = document.querySelector('[data-sp-open-in-session]');
			const expand = document.querySelector('[data-sidebar-right-expand]');
			if (!host || !expand) return false;
			return Math.abs(expand.getBoundingClientRect().left - 8 - host.getBoundingClientRect().right) <= 1.5;
		});
		assert.deepEqual(fixture.errors, []);
	} finally { await fixture.close(); }
});

test('有消息后 hero 卸载：按钮消失、官方控件保留；回到空会话又出现', options, async () => {
	const fixture = await v070Harness();
	try {
		const { page } = fixture;
		await page.waitForSelector('.sp-split');
		await page.evaluate(() => fixture.removeHero());
		await page.waitForSelector('.sp-split', { state: 'detached' });
		assert.equal(await page.locator('[data-sidebar-right-expand]').count(), 1, '官方控件不受影响');
		assert.equal(await page.locator('[data-sp-open-in-session]').count(), 0, '宿主节点必须一起回收');
		await page.evaluate(() => fixture.restoreHero());
		await page.waitForSelector('.sp-split');
		assert.deepEqual(fixture.errors, []);
	} finally { await fixture.close(); }
});

test('右侧面板展开时隐藏，收起后立即恢复', options, async () => {
	const fixture = await v070Harness();
	try {
		const { page } = fixture;
		await page.waitForSelector('.sp-split');
		await page.evaluate(() => fixture.setPanel(true));
		await page.waitForSelector('.sp-split', { state: 'detached' });
		assert.equal(await page.locator('[data-sidebar-right-expand]').count(), 0, '官方展开按钮此时也不在');
		await page.evaluate(() => fixture.setPanel(false));
		await page.waitForSelector('.sp-split');
		assert.deepEqual(fixture.errors, []);
	} finally { await fixture.close(); }
});

test('主按钮调用官方打开路由；应用菜单可切换并记住选择', options, async () => {
	const fixture = await v070Harness();
	try {
		const { page } = fixture;
		await page.waitForSelector('.sp-split');
		await page.locator('.sp-split-main').click();
		await page.waitForFunction(() => window.fixture.opens.length === 1);
		const first = await page.evaluate(() => window.fixture.opens[0]);
		assert.deepEqual(first, { app: 'finder', path: '/Users/Project/workspace' });

		await page.locator('.sp-split-more').click();
		await page.waitForSelector('.sp-oa-menu');
		assert.equal(await page.locator('.sp-oa-item').count(), 2);
		assert.equal(await page.locator('[data-sp-open-in-app="finder"]').getAttribute('aria-checked'), 'true');
		assert.match(await page.locator('[data-sp-open-in-app="finder"]').textContent(), /访达（默认）/);
		await page.locator('[data-sp-open-in-app="vscode"]').click();
		await page.waitForFunction(() => window.fixture.opens.length === 2);
		const second = await page.evaluate(() => window.fixture.opens[1]);
		assert.equal(second.app, 'vscode');
		assert.equal(await page.evaluate(() => window.localStorage.getItem('dsh.session-plus.open-in-app.v1')), 'vscode');
		// 偏好已改写：重开菜单时 vscode 是默认项；主按钮图标/提示也随之改变。
		await page.locator('.sp-split-more').click();
		await page.waitForSelector('.sp-oa-menu');
		assert.equal(await page.locator('[data-sp-open-in-app="vscode"]').getAttribute('aria-checked'), 'true');
		assert.equal(await page.locator('.sp-split-main').getAttribute('aria-label'), '用 VS Code 打开');
		await page.keyboard.press('Escape');
		await page.waitForSelector('.sp-oa-menu', { state: 'detached' });
		assert.deepEqual(fixture.errors, []);
	} finally { await fixture.close(); }
});

test('打开失败时弹出 Toast，并在数秒后自动消失', options, async () => {
	const fixture = await v070Harness();
	try {
		const { page } = fixture;
		await page.waitForSelector('.sp-split');
		await page.evaluate(() => fixture.setOpenFails(true));
		await page.locator('.sp-split-main').click();
		await page.waitForSelector('[data-sp-open-in-toast]');
		assert.equal(await page.locator('[data-sp-open-in-toast]').textContent(), '打开失败，请重试');
		await page.waitForSelector('[data-sp-open-in-toast]', { state: 'detached', timeout: 6000 });
		assert.deepEqual(fixture.errors, []);
	} finally { await fixture.close(); }
});

test('通用设置：5 行开关排在官方 Session Log 行之后、版本行之前，切换即时生效', options, async () => {
	const fixture = await v070Harness();
	try {
		const { page } = fixture;
		await page.waitForSelector('[data-sp-feature-toggle]');
		assert.equal(await page.locator('#settings [data-sp-feature-toggle]').count(), 5);
		const layout = await page.evaluate(() => [...document.querySelectorAll('#settings > *')]
			.map(node => node.id || node.dataset.spFeatureToggle || 'unknown'));
		assert.deepEqual(layout, [
			'row-session-log',
			'provider-header',
			'selection-add',
			'theme-switch',
			'effort-slider',
			'open-in-session',
			'row-version',
		], '5 行开关必须紧接官方「上传 Session Log」行下方');

		const switches = await page.evaluate(() => [...document.querySelectorAll('[data-sp-switch]')].map(node => {
			const control = node.querySelector('[role="switch"]');
			return [node.dataset.spSwitch, control, control === null ? null : control.getAttribute('aria-checked')];
		}).map(([id, control, checked]) => [id, checked, control === null ? null : control.className]));
		assert.deepEqual(switches.map(([id]) => id), ['provider-header', 'selection-add', 'theme-switch', 'effort-slider', 'open-in-session']);
		for (const [, checked, className] of switches) {
			assert.equal(checked, 'true', '默认全部开启');
			assert.match(className, /switch/, '开关必须使用官方 Switch 的样式类');
		}

		// 关闭「新建会话页按钮」→ 标题栏按钮立即消失；重新打开立即回来。
		const toggle = page.locator('[data-sp-switch="open-in-session"] [role="switch"]');
		await toggle.click();
		await page.waitForSelector('.sp-split', { state: 'detached' });
		assert.equal(await page.evaluate(() => window.fixture.flags()['open-in-session']), false);
		assert.equal(await page.evaluate(() => JSON.parse(window.localStorage.getItem('dsh.session-plus.features.v1'))['open-in-session']), false);
		assert.equal(await toggle.getAttribute('aria-checked'), 'false');
		await toggle.click();
		await page.waitForSelector('.sp-split');
		assert.equal(await toggle.getAttribute('aria-checked'), 'true');
		assert.deepEqual(fixture.errors, []);
	} finally { await fixture.close(); }
});

test('通用设置：开关复用官方 Switch，计算样式与官方参考件逐项一致', options, async () => {
	const fixture = await v070Harness();
	try {
		const { page } = fixture;
		await page.waitForSelector('#official-switch-ref [role="switch"]');
		assert.equal(await page.evaluate(() => window.fixture.hasOfficialSwitch()), true, '必须命中官方 primitives.Switch');
		const differences = await page.evaluate(() => {
			const pick = (node) => {
				const style = getComputedStyle(node);
				const thumb = node.firstElementChild === null ? null : getComputedStyle(node.firstElementChild);
				return {
					width: style.width, height: style.height, padding: style.padding, borderWidth: style.borderWidth,
					borderRadius: style.borderRadius, backgroundColor: style.backgroundColor,
					cornerShape: style.cornerShape,
					thumbWidth: thumb === null ? null : thumb.width,
					thumbHeight: thumb === null ? null : thumb.height,
					thumbRadius: thumb === null ? null : thumb.borderRadius,
					thumbBackground: thumb === null ? null : thumb.backgroundColor,
					thumbTransform: thumb === null ? null : thumb.transform,
				};
			};
			const reference = pick(document.querySelector('#official-switch-ref [role="switch"]'));
			return [...document.querySelectorAll('[data-sp-switch] [role="switch"]')].map((node) => {
				const style = pick(node);
				return Object.keys(reference)
					.filter(key => style[key] !== reference[key])
					.map(key => `${key}: ${style[key]} ≠ ${reference[key]}`);
			});
		});
		for (const diff of differences) assert.deepEqual(diff, [], `开关样式必须与官方一致：${diff.join('；')}`);
		assert.deepEqual(fixture.errors, []);
	} finally { await fixture.close(); }
});
