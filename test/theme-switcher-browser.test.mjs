import test from 'node:test';
import assert from 'node:assert/strict';
import { browserAvailable, themeHarness } from './helpers/browser-harness.mjs';

const options = { skip: !browserAvailable, timeout: 30000 };

/** 读取账户菜单与主题切换条的完整状态快照。 */
async function readState(page) {
	return page.evaluate(() => {
		const strip = document.querySelector('[data-sp-theme-switch]');
		const menu = document.querySelector('[role="menu"]');
		const trigger = document.querySelector('#launcher [aria-haspopup="menu"]');
		const thumb = strip ? strip.querySelector('.sp-ts-thumb') : null;
		const slots = strip
			? [...strip.querySelectorAll('.sp-ts-slot')].map(element => {
				const rect = element.getBoundingClientRect();
				return {
					value: element.getAttribute('data-value'),
					checked: element.getAttribute('aria-checked'),
					tabindex: element.getAttribute('tabindex'),
					left: rect.left,
					right: rect.right,
				};
			})
			: [];
		const thumbRect = thumb ? thumb.getBoundingClientRect() : null;
		return {
			hasStrip: Boolean(strip),
			firstChild: Boolean(menu && strip && menu.firstElementChild === strip),
			menuBottom: menu ? menu.getBoundingClientRect().bottom : null,
			triggerTop: trigger ? trigger.getBoundingClientRect().top : null,
			expanded: trigger ? trigger.getAttribute('aria-expanded') : null,
			slots,
			thumb: thumbRect ? { left: thumbRect.left, right: thumbRect.right } : null,
			activeRole: document.activeElement ? document.activeElement.getAttribute('role') : null,
			activeValue: document.activeElement ? document.activeElement.getAttribute('data-value') : null,
			activeText: document.activeElement ? document.activeElement.textContent : null,
			stripButtons: strip ? strip.querySelectorAll('button').length : -1,
			menuButtons: menu ? menu.querySelectorAll('button:not(:disabled)').length : -1,
		};
	});
}

test('主题切换：注入到账户菜单最上方，面板仍贴着触发器，首个焦点仍是「设置」', options, async () => {
	const fixture = await themeHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => fixture.open());
		await page.waitForSelector('[data-sp-theme-switch]');
		const state = await readState(page);
		assert.equal(state.hasStrip, true, '账户菜单里应出现主题切换条');
		assert.equal(state.firstChild, true, '切换条必须是弹层的首个子节点（位于「设置」之上）');
		assert.equal(state.expanded, 'true');
		assert.ok(
			Math.abs(state.menuBottom - (state.triggerTop - 4)) <= 2,
			`插入后弹层底边仍应贴住触发器顶边：${state.menuBottom} vs ${state.triggerTop - 4}`,
		);
		assert.deepEqual(state.slots.map(slot => slot.value), ['system', 'light', 'dark']);
		assert.deepEqual(state.slots.map(slot => slot.checked), ['true', 'false', 'false']);
		// 官方 Menu 的 autofocus 与方向键都基于 button:not(:disabled)，切换条刻意不含 button。
		assert.equal(state.stripButtons, 0, '切换条不得包含 button，避免进入菜单的 autofocus/方向键序列');
		assert.equal(state.menuButtons, 3, '菜单自身的按钮集合必须保持不变');

		// 其它 role=menu 的弹层（非账户菜单）不能被注入。
		const stray = await page.evaluate(() => {
			const menu = document.createElement('div');
			menu.id = 'unrelated-menu';
			menu.setAttribute('role', 'menu');
			menu.style.cssText = 'position:fixed;left:600px;top:600px;width:160px;height:120px';
			menu.innerHTML = '<button role="menuitem">其它</button>';
			document.body.appendChild(menu);
			const count = menu.querySelectorAll('[data-sp-theme-switch]').length;
			menu.remove();
			return count;
		});
		assert.equal(stray, 0, '其它弹层不应被误注入');
		assert.deepEqual(fixture.errors, []);
	} finally {
		await fixture.close();
	}
});

test('主题切换：点击「深色」只写一次、菜单保持打开、选中态同步', options, async () => {
	const fixture = await themeHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => fixture.open());
		await page.waitForSelector('[data-sp-theme-switch]');
		await page.locator('[data-sp-theme-switch] [data-value="dark"]').click();
		await page.waitForFunction(() => fixture.preference() === 'dark');
		const state = await readState(page);
		assert.equal(await page.evaluate(() => fixture.writes()), 1, '一次点击只应写一次主题');
		assert.equal(state.expanded, 'true', '点击切换条不应关闭菜单');
		assert.equal(state.hasStrip, true);
		assert.deepEqual(state.slots.map(slot => slot.checked), ['false', 'false', 'true']);
		assert.equal(state.activeValue, 'dark', '焦点应落到新选中的分段');
		assert.deepEqual(fixture.errors, []);
	} finally {
		await fixture.close();
	}
});

test('主题切换：拖拽滑块跨两段落定，只提交一次', options, async () => {
	const fixture = await themeHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => fixture.open());
		await page.waitForSelector('[data-sp-theme-switch]');
		const box = await page.locator('[data-sp-theme-switch] .sp-ts-track').boundingBox();
		const y = box.y + box.height / 2;
		await page.mouse.move(box.x + box.width / 6, y);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width * 5 / 6, y, { steps: 12 });
		await page.mouse.up();
		await page.waitForFunction(() => fixture.preference() === 'dark');
		const state = await readState(page);
		assert.equal(await page.evaluate(() => fixture.writes()), 1, '拖拽落定只应提交一次');
		assert.equal(state.slots[2].checked, 'true');
		assert.equal(state.expanded, 'true', '拖拽不应关闭菜单');
		assert.equal(state.hasStrip, true);
		assert.deepEqual(fixture.errors, []);
	} finally {
		await fixture.close();
	}
});

test('主题切换：方向键在控件内切换且焦点跟随', options, async () => {
	const fixture = await themeHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => fixture.open());
		await page.waitForSelector('[data-sp-theme-switch]');
		await page.locator('[data-sp-theme-switch] [data-value="system"]').focus();
		await page.keyboard.press('ArrowRight');
		await page.waitForFunction(() => fixture.preference() === 'light');
		const state = await readState(page);
		assert.equal(state.activeValue, 'light', '方向键切换后焦点应落到新分段');
		assert.equal(state.expanded, 'true');
		await page.keyboard.press('End');
		await page.waitForFunction(() => fixture.preference() === 'dark');
		assert.equal((await readState(page)).slots[2].checked, 'true', 'End 应跳到末段');
		assert.deepEqual(fixture.errors, []);
	} finally {
		await fixture.close();
	}
});

test('主题切换：Escape 关闭菜单后控件移除，重开重新注入并保留选中态', options, async () => {
	const fixture = await themeHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => fixture.open());
		await page.waitForSelector('[data-sp-theme-switch]');
		await page.locator('[data-sp-theme-switch] [data-value="dark"]').click();
		await page.waitForFunction(() => fixture.preference() === 'dark');
		await page.locator('[data-sp-theme-switch] [data-value="dark"]').focus();
		await page.keyboard.press('Escape');
		await page.waitForSelector('[data-sp-theme-switch]', { state: 'detached' });
		assert.equal(await page.locator('[data-sp-theme-switch]').count(), 0, '菜单关闭后控件必须移除');

		await page.evaluate(() => fixture.open());
		await page.waitForSelector('[data-sp-theme-switch]');
		const state = await readState(page);
		assert.equal(state.hasStrip, true);
		assert.equal(state.firstChild, true);
		assert.deepEqual(state.slots.map(slot => slot.checked), ['false', 'false', 'true'], '重开时应回显当前偏好');
		assert.deepEqual(fixture.errors, []);
	} finally {
		await fixture.close();
	}
});

test('主题切换：外部改主题（如官方外观行）时选中态跟随，且不产生额外写入', options, async () => {
	const fixture = await themeHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => fixture.open());
		await page.waitForSelector('[data-sp-theme-switch]');
		const before = await page.evaluate(() => fixture.writes());
		await page.evaluate(() => fixture.setExternal('light'));
		await page.waitForFunction(() => document.querySelector('[data-sp-theme-switch] [data-value="light"]')?.getAttribute('aria-checked') === 'true');
		const state = await readState(page);
		assert.deepEqual(state.slots.map(slot => slot.checked), ['false', 'true', 'false']);
		assert.equal(await page.evaluate(() => fixture.writes()), before, '外部变更不应反过来触发写入');
		assert.deepEqual(fixture.errors, []);
	} finally {
		await fixture.close();
	}
});

test('主题切换：prefers-reduced-motion 下一帧内直接落位', options, async () => {
	const fixture = await themeHarness();
	try {
		const { page } = fixture;
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.evaluate(() => fixture.open());
		await page.waitForSelector('[data-sp-theme-switch]');
		await page.locator('[data-sp-theme-switch] [data-value="dark"]').click();
		await page.waitForFunction(() => fixture.preference() === 'dark');
		await page.waitForTimeout(30);
		const state = await readState(page);
		const target = state.slots[2];
		assert.ok(state.thumb, '滑块必须存在');
		assert.ok(Math.abs(state.thumb.left - target.left) <= 1, '减弱动效时滑块应立即到位');
		assert.ok(Math.abs(state.thumb.right - target.right) <= 1);
		assert.deepEqual(fixture.errors, []);
	} finally {
		await fixture.close();
	}
});

// v0.7.0 功能开关：账户菜单的三态切换条也要能被通用设置即时关掉/打开。
test('功能开关：关闭「账户菜单主题快捷切换」后三态条即时移除，重开恢复', options, async () => {
	const fixture = await themeHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => fixture.open());
		await page.waitForSelector('[data-sp-theme-switch]');
		await page.evaluate(() => fixture.setFlag('theme-switch', false));
		await page.waitForSelector('[data-sp-theme-switch]', { state: 'detached' });
		// 菜单本身保持打开：只移除我们注入的那一段。
		assert.equal(await page.evaluate(() => window.fixture.isOpen()), true);
		await page.evaluate(() => fixture.setFlag('theme-switch', true));
		await page.waitForSelector('[data-sp-theme-switch]');
		await fixture.page.waitForFunction(() => document.querySelector('[data-sp-theme-switch]')?.parentElement?.firstElementChild?.hasAttribute('data-sp-theme-switch'));
		assert.deepEqual(fixture.errors, []);
	} finally { await fixture.close(); }
});
