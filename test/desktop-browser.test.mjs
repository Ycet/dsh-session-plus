import test from 'node:test';
import assert from 'node:assert/strict';
import { browserAvailable, browserHarness } from './helpers/browser-harness.mjs';

const options = { skip: !browserAvailable, timeout: 30000 };
test('官方模型菜单首屏为 group 时展示提供商；切换提供商实时刷新且不污染其他菜单', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    await page.evaluate(() => fixture.directories.get('main').set({ ...fixture.directories.get('main').getSnapshot(), current: null }));
    await page.locator('#main [aria-haspopup="menu"]').click();
    await page.waitForSelector('[role="group"][aria-label="模型选择"]');
    await page.waitForSelector('[data-model-provider-header]');
    assert.equal(await page.locator('[data-model-provider-header]').textContent(), '提供商：—');
    await page.evaluate(() => fixture.setProvider('main', 'updated'));
    await page.waitForFunction(() => document.querySelector('[data-model-provider-header]')?.textContent === '提供商：UPDATED');
    await page.evaluate(() => {
      const trigger = document.createElement('button'); trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-controls', 'other-menu');
      const menu = document.createElement('div'); menu.id = 'other-menu'; menu.setAttribute('role', 'menu'); document.body.append(trigger, menu);
    });
    assert.equal(await page.locator('#other-menu [data-model-provider-header]').count(), 0);
    await page.evaluate(() => fixture.unmount());
    assert.equal(await page.locator('[data-model-provider-header]').count(), 0);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('双会话选文只写入所属草稿，富文本编辑器恢复焦点', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    await page.evaluate(() => { fixture.render(['main', 'side']); fixture.select('side-message'); });
    await page.waitForSelector('.sp-add-btn');
    assert.equal(await page.locator('.sp-add-btn').count(), 1);
    await page.locator('.sp-add-btn').click();
    const result = await page.evaluate(() => ({ main: fixture.input.get('main').getSnapshot().draft, side: fixture.input.get('side').getSnapshot().draft, focus: document.activeElement.id }));
    assert.equal(result.main, '原有草稿');
    assert.equal(result.side, '```\nside 消息文本\n```\n\n原有草稿\n');
    assert.equal(result.focus, 'side-input');
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('隐藏后在相同位置重新选中仍显示；滚动停止恢复；旧 textarea 保留兼容', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    await page.evaluate(() => { fixture.render(['main'], true); fixture.select('main-message'); });
    await page.waitForSelector('.sp-add-btn');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.sp-add-btn', { state: 'detached' });
    await page.evaluate(() => fixture.select('main-message'));
    await page.waitForSelector('.sp-add-btn');
    const hidden = await page.evaluate(() => {
      testBuiltins['react-dom'].flushSync(() => document.dispatchEvent(new Event('scroll')));
      return document.querySelector('.sp-add-btn') === null;
    });
    assert.equal(hidden, true);
    await page.waitForSelector('.sp-add-btn');
    await page.locator('.sp-add-btn').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'main-input');
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('主会话与侧会话模型菜单各用自己的目录，卸载后解除订阅', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    await page.evaluate(() => fixture.render(['main', 'side']));
    await page.locator('#main [aria-haspopup="menu"]').evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('[data-model-provider-header]')?.textContent === '提供商：MAIN');
    await page.locator('#side [aria-haspopup="menu"]').evaluate(button => button.click());
    // 官方菜单在焦点离开时关闭；顺序打开也能抓住两个全局 observer 串用目录的问题。
    await page.waitForFunction(() => document.querySelector('[data-model-provider-header]')?.textContent === '提供商：SIDE');
    await page.evaluate(() => fixture.setProvider('main', 'changed-main'));
    assert.equal(await page.locator('[data-model-provider-header]').textContent(), '提供商：SIDE');
    await page.evaluate(() => fixture.unmount());
    assert.equal(await page.locator('[data-model-provider-header], .sp-add-btn').count(), 0);
    assert.equal(await page.evaluate(() => [...fixture.directories.values()].reduce((sum, directory) => sum + directory.listeners.size, 0)), 0);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('官方右侧预览发送到所属主会话；隐藏面板、其他会话预览和编辑区不触发', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    await page.evaluate(() => {
      fixture.render(['main', 'side']);
      const panel = document.createElement('div'); panel.id = 'preview'; panel.dataset.sidebarRightSession = 'main'; panel.setAttribute('data-sidebar-right-open', '');
      panel.style.cssText = 'position:fixed;right:0;top:200px;width:200px'; panel.textContent = '预览文本'; document.body.append(panel);
      fixture.select('preview');
    });
    await page.waitForSelector('.sp-add-btn');
    assert.equal(await page.locator('.sp-add-btn').count(), 1);
    await page.locator('.sp-add-btn').click();
    assert.equal(await page.evaluate(() => fixture.input.get('main').getSnapshot().draft), '```\n预览文本\n```\n\n原有草稿\n');
    assert.equal(await page.evaluate(() => fixture.input.get('side').getSnapshot().draft), '原有草稿');
    for (const kind of ['closed', 'hidden', 'other', 'editor', 'outside', 'cross', 'crossEditor']) {
      const count = await page.evaluate(kind => {
        const panel = document.getElementById('preview');
        panel.dataset.sidebarRightSession = kind === 'other' ? 'unknown' : 'main';
        panel.toggleAttribute('data-sidebar-right-open', kind !== 'closed'); panel.hidden = kind === 'hidden';
        const outside = document.createElement('p'); outside.id = 'outside'; outside.textContent = '设置页文字'; document.body.append(outside);
        testBuiltins['react-dom'].flushSync(() => {
          if (kind === 'cross' || kind === 'crossEditor') {
            const range = document.createRange(); range.setStart(document.getElementById('main-message').firstChild, 0);
            range.setEnd(kind === 'crossEditor' ? document.getElementById('main-input').firstChild : outside.firstChild, 2);
            const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
          } else fixture.select(kind === 'editor' ? 'main-input' : kind === 'outside' ? 'outside' : 'preview');
        });
        return document.querySelectorAll('.sp-add-btn').length;
      }, kind);
      assert.equal(count, 0, kind);
    }
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('Windows 工具栏避开原生标题栏；禁止向不可编辑或提交中的输入框写入', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-windows-titlebar', '');
      document.documentElement.style.setProperty('--dsh-frame-chrome-top', '40px');
      document.querySelector('#main [data-conversation-scroll]').style.paddingTop = '0';
      document.getElementById('main-message').style.margin = '42px 0 0'; fixture.select('main-message');
    });
    await page.waitForSelector('.sp-add-btn');
    const geometry = await page.locator('.sp-add-btn').evaluate(button => ({ top: button.getBoundingClientRect().top, region: getComputedStyle(button).webkitAppRegion }));
    assert.ok(geometry.top >= 48);
    assert.equal(geometry.region, 'no-drag');
    for (const kind of ['readonly', 'submitting', 'adjudicating']) {
      const count = await page.evaluate(kind => {
        document.getElementById('main-input').contentEditable = kind === 'readonly' ? 'false' : 'true';
        testBuiltins['react-dom'].flushSync(() => fixture.input.get('main').set({ draft: '原有草稿', phase: kind }));
        testBuiltins['react-dom'].flushSync(() => fixture.select('main-message'));
        return document.querySelectorAll('.sp-add-btn').length;
      }, kind);
      assert.equal(count, 0, kind);
      assert.equal(await page.evaluate(() => fixture.input.get('main').getSnapshot().draft), '原有草稿');
    }
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});
