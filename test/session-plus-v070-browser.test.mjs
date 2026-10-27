import test from 'node:test';
import assert from 'node:assert/strict';
import { browserAvailable, v070Harness } from './helpers/browser-harness.mjs';

// v0.7.0 浏览器验收：
//   1) 新建会话页（空会话）标题栏出现「在应用中打开」分体按钮，位置紧贴官方
//      「展开右侧面板」按钮左侧；有消息后（hero 卸载）只剩官方控件。
//   2) 右侧面板展开时隐藏、收起后恢复。
//   3) 主按钮 / 应用菜单的宿主请求与偏好记忆。
//   4) 通用设置 5 行开关的位置、顺序与即时生效。
//   5) 打开失败弹 Toast。
const options = { skip: !browserAvailable, timeout: 30000 };

test('空会话页：按钮插在「展开右侧面板」按钮正前方，图标走官方图标路由', options, async () => {
	const fixture = await v070Harness();
	try {
		const { page } = fixture;
		await page.waitForSelector('.sp-split');
		assert.equal(await page.locator('.sp-split').count(), 1);
		// 位置：必须是「标题栏右侧那组按钮」的最左侧一个（在别的插件按钮与官方
		// 展开按钮之前），而不是夹在它们中间。
		const placement = await page.evaluate(() => {
			const host = document.querySelector('[data-sp-open-in-session]');
			const corner = document.getElementById('corner');
			return {
				hasHost: host !== null,
				inCorner: host !== null && host.parentElement === corner,
				isFirst: host !== null && corner.firstElementChild === host,
				nextId: host !== null && host.nextElementSibling ? host.nextElementSibling.id : null,
				expandStillThere: document.querySelectorAll('[data-sidebar-right-expand]').length,
			};
		});
		assert.equal(placement.hasHost, true);
		assert.equal(placement.inCorner, true);
		assert.equal(placement.isFirst, true, '按钮必须排在这组按钮的最左侧');
		assert.equal(placement.nextId, 'other-pane', '左侧间距之后才轮到其它插件的按钮');
		assert.equal(placement.expandStillThere, 1);

		assert.equal(await page.locator('.sp-split-main img.sp-split-icon').count(), 1, '图标应来自 /open-in-app/icon 路由');
		assert.equal(await page.locator('.sp-split-main').getAttribute('aria-label'), '用 访达 打开');
		assert.equal(await page.locator('.sp-split-more').getAttribute('aria-label'), '更多打开方式');
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

		const switches = await page.evaluate(() => [...document.querySelectorAll('[data-sp-switch]')]
			.map(node => [node.dataset.spSwitch, node.getAttribute('aria-checked'), node.getAttribute('role')]));
		assert.deepEqual(switches.map(([id]) => id), ['provider-header', 'selection-add', 'theme-switch', 'effort-slider', 'open-in-session']);
		for (const [, checked, role] of switches) {
			assert.equal(role, 'switch');
			assert.equal(checked, 'true', '默认全部开启');
		}

		// 关闭「新建会话页按钮」→ 标题栏按钮立即消失；重新打开立即回来。
		await page.locator('[data-sp-switch="open-in-session"]').click();
		await page.waitForSelector('.sp-split', { state: 'detached' });
		assert.equal(await page.evaluate(() => window.fixture.flags()['open-in-session']), false);
		assert.equal(await page.evaluate(() => JSON.parse(window.localStorage.getItem('dsh.session-plus.features.v1'))['open-in-session']), false);
		assert.equal(await page.locator('[data-sp-switch="open-in-session"]').getAttribute('aria-checked'), 'false');
		await page.locator('[data-sp-switch="open-in-session"]').click();
		await page.waitForSelector('.sp-split');
		assert.equal(await page.locator('[data-sp-switch="open-in-session"]').getAttribute('aria-checked'), 'true');
		assert.deepEqual(fixture.errors, []);
	} finally { await fixture.close(); }
});
