import test from 'node:test';
import assert from 'node:assert/strict';
import { browserAvailable, accountExtrasHarness } from './helpers/browser-harness.mjs';

const options = { skip: !browserAvailable, timeout: 30000 };

/** 读取齿轮、语言行与主题条的状态快照。 */
async function readState(page) {
	return page.evaluate(() => {
		const dialog = document.querySelector('[role="dialog"][data-shortcut-modal="settings"]');
		const menu = document.querySelector('[role="menu"]');
		const row = document.querySelector('[data-sp-language-row]');
		const flyout = document.querySelector('[data-sp-language-menu]');
		const gear = document.querySelector('[data-sp-settings-gear]');
		const strip = document.querySelector('[data-sp-theme-switch]');
		const name = row ? row.querySelector('.sp-lang-name') : null;
		const items = [...document.querySelectorAll('[role="menu"] button[role="menuitem"]')];
		return {
			gearCount: document.querySelectorAll('[data-sp-settings-gear]').length,
			gearDisplay: gear ? window.getComputedStyle(gear).display : null,
			gearIcon: Boolean(gear && gear.querySelector('svg')),
			gearRowMarked: Boolean(document.querySelector('[data-sp-account-row]')),
			gearCollapsed: (() => {
				const marked = document.querySelector('[data-sp-account-row]');
				return marked ? marked.getAttribute('data-sp-collapsed') : null;
			})(),
			menuOpen: Boolean(menu),
			rowCount: document.querySelectorAll('[data-sp-language-row]').length,
			rowName: name ? name.textContent : null,
			rowIsFirstItem: row ? items[0] === row : false,
			rowFollowedBySettings: row ? Boolean(row.nextElementSibling && /设置/.test(row.nextElementSibling.textContent || '')) : false,
			flyoutCount: document.querySelectorAll('[data-sp-language-menu]').length,
			flyoutItems: flyout
				? [...flyout.querySelectorAll('button[role="menuitemradio"]')].map(item => ({
					label: item.textContent,
					locale: item.getAttribute('data-locale'),
					checked: item.getAttribute('aria-checked'),
				}))
				: [],
			dialogOpen: Boolean(dialog),
			themeSlots: strip
				? [...strip.querySelectorAll('.sp-ts-slot')].map(slot => ({
					value: slot.getAttribute('data-value'),
					icons: slot.querySelectorAll('svg').length,
					text: slot.querySelectorAll('.sp-ts-text').length,
					label: slot.getAttribute('aria-label'),
				}))
				: [],
		};
	});
}

test('设置齿轮：账户行右侧常驻官方图标按钮，点击经外壳 store 句柄直达「通用设置」', options, async () => {
	const fixture = await accountExtrasHarness();
	try {
		const { page } = fixture;
		await page.waitForSelector('[data-sp-settings-gear]');
		const before = await readState(page);
		assert.equal(before.gearCount, 1, '账户行只应有一个齿轮');
		assert.equal(before.gearIcon, true, '齿轮应渲染官方图标（精灵或内置兜底）');
		assert.equal(before.gearRowMarked, true, '账户行应被标记，供 CSS 给触发器让位');
		assert.equal(before.menuOpen, false, '齿轮常驻，不依赖菜单展开');

		await page.click('[data-sp-settings-gear]');
		const after = await readState(page);
		assert.equal(await page.evaluate(() => fixture.openedSection()), 'general', '齿轮应直接打开「通用设置」');
		assert.equal(after.dialogOpen, true, '设置面板应随之打开');
		assert.equal(await page.evaluate(() => fixture.isOpen()), false, '走 store 路径时不应顺带展开账户菜单');
		assert.deepEqual(fixture.errors, []);
	} finally {
		await fixture.close();
	}
});

test('设置齿轮：外壳 store 句柄不可用时退化为「账户菜单 → 设置」', options, async () => {
	const fixture = await accountExtrasHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => fixture.storeEnabled(false));
		await page.waitForSelector('[data-sp-settings-gear]');
		await page.click('[data-sp-settings-gear]');
		await page.waitForFunction(() => fixture.isOpen());
		await page.waitForFunction(() => fixture.selected() === 'settings', null, { timeout: 5000 });
		assert.equal(await page.evaluate(() => fixture.selected()), 'settings', '降级路径应点击官方「设置」项');
		assert.deepEqual(fixture.errors, []);
	} finally {
		await fixture.close();
	}
});

test('设置齿轮：侧栏收起（data-collapsed）时隐藏', options, async () => {
	const fixture = await accountExtrasHarness();
	try {
		const { page } = fixture;
		await page.waitForSelector('[data-sp-settings-gear]');
		await page.evaluate(() => fixture.setWide(false));
		await page.waitForFunction(() => {
			const marked = document.querySelector('[data-sp-account-row]');
			const gear = document.querySelector('[data-sp-settings-gear]');
			return marked && marked.getAttribute('data-sp-collapsed') === 'true' && window.getComputedStyle(gear).display === 'none';
		});
		const state = await readState(page);
		assert.equal(state.gearCollapsed, 'true');
		assert.equal(state.gearDisplay, 'none', '收起态齿轮必须不可见');
		await page.evaluate(() => fixture.setWide(true));
		await page.waitForFunction(() => window.getComputedStyle(document.querySelector('[data-sp-settings-gear]')).display !== 'none');
		assert.deepEqual(fixture.errors, []);
	} finally {
		await fixture.close();
	}
});

test('语言行：紧贴「设置」上方，显示当前语言名，浮层列全部语言并勾选当前项', options, async () => {
	const fixture = await accountExtrasHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => fixture.open());
		await page.waitForSelector('[data-sp-language-row]');
		const state = await readState(page);
		assert.equal(state.rowCount, 1);
		assert.equal(state.rowName, '中文', '未切换时应显示当前语言的原生名');
		assert.equal(state.rowIsFirstItem, true, '语言行应排在官方「设置」之上');
		assert.equal(state.rowFollowedBySettings, true, '语言行之后紧邻官方「设置」项');

		await page.click('[data-sp-language-row]');
		await page.waitForSelector('[data-sp-language-menu]');
		const opened = await readState(page);
		assert.equal(opened.flyoutCount, 1);
		assert.deepEqual(opened.flyoutItems.map(item => item.locale), ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']);
		assert.deepEqual(opened.flyoutItems.map(item => item.checked), ['true', 'false', 'false', 'false', 'false', 'false', 'false', 'false']);

		await page.click('[data-sp-language-menu] button[data-locale="en"]');
		await page.waitForFunction(() => fixture.activeLocale() === 'en');
		const chosen = await readState(page);
		assert.equal(chosen.flyoutCount, 0, '选完应收起浮层');
		assert.equal(chosen.menuOpen, true, '账户菜单应保持打开');
		assert.equal(chosen.rowName, 'English', '语言切换后行内应跟随新语言');
		assert.deepEqual(fixture.errors, []);
	} finally {
		await fixture.close();
	}
});

test('功能开关：关闭语言行 / 齿轮后各自即时消失', options, async () => {
	const fixture = await accountExtrasHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => fixture.open());
		await page.waitForSelector('[data-sp-language-row]');

		await page.evaluate(() => fixture.setFlag('account-language', false));
		await page.waitForFunction(() => !document.querySelector('[data-sp-language-row]'));
		assert.equal((await readState(page)).rowCount, 0);

		await page.evaluate(() => fixture.setFlag('settings-gear', false));
		await page.waitForFunction(() => !document.querySelector('[data-sp-settings-gear]'));
		assert.equal((await readState(page)).gearCount, 0);
		assert.equal(await page.evaluate(() => document.querySelectorAll('[data-sp-account-row]').length), 0, '关闭后应撤掉账户行标记');
		assert.deepEqual(fixture.errors, []);
	} finally {
		await fixture.close();
	}
});

test('主题切换：三态文字改为官方主题图标，尺寸与选中态不变', options, async () => {
	const fixture = await accountExtrasHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => fixture.open());
		await page.waitForSelector('[data-sp-theme-switch]');
		const state = await readState(page);
		assert.deepEqual(state.themeSlots.map(slot => slot.value), ['system', 'light', 'dark']);
		assert.deepEqual(state.themeSlots.map(slot => slot.icons), [1, 1, 1], '三个槽位应各有一个官方图标');
		assert.deepEqual(state.themeSlots.map(slot => slot.text), [0, 0, 0], '图标模式下不再渲染文字');
		for (const slot of state.themeSlots) assert.ok(slot.label && slot.label.length > 0, '图标模式必须保留可读的无障碍名称');
		assert.deepEqual(fixture.errors, []);
	} finally {
		await fixture.close();
	}
});
