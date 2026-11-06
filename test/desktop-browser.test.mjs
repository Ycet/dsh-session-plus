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
    assert.equal(await page.locator('[data-model-provider-header]').count(), 0);
    assert.equal(await page.evaluate(() => [...fixture.directories.values()].reduce((sum, directory) => sum + directory.listeners.size, 0)), 0);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('推理等级滑条：注入官方那一行、加高折行并铺满第二行', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    await page.locator('#main [aria-haspopup="menu"]').click();
    await page.waitForSelector('.ces-track');
    const shape = await page.evaluate(() => {
      const track = document.querySelector('.ces-track');
      const row = track.closest('[role="menuitem"]');
      const rect = track.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return {
        rowRole: row.getAttribute('role'),
        height: row.style.height,
        flexWrap: row.style.flexWrap,
        spans: row.querySelectorAll('span').length,
        svg: row.querySelectorAll('svg').length,
        sliderRole: track.getAttribute('role'),
        trackWidth: Math.round(rect.width),
        rowWidth: Math.round(rowRect.width),
        reachedTicks: document.querySelector('[data-ces-part="root"]')?.getAttribute('data-reached-ticks'),
      };
    });
    assert.equal(shape.rowRole, 'menuitem');
    assert.equal(shape.height, 'auto');
    assert.equal(shape.flexWrap, 'wrap');
    assert.ok(shape.spans >= 2, '官方 label / value 仍在');
    assert.equal(shape.svg, 1, '官方 chevron 仍在');
    assert.equal(shape.sliderRole, 'slider');
    assert.ok(shape.trackWidth > shape.rowWidth * 0.8, `滑条应铺满整行（轨道 ${shape.trackWidth} / 行 ${shape.rowWidth}）`);
    assert.equal(shape.reachedTicks, 'highlight');
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('推理等级滑条：拖到最右端写回最高档，且只写一次', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    await page.locator('#main [aria-haspopup="menu"]').click();
    await page.waitForSelector('.ces-track');
    // 档位来自目录快照的异步解析：等它渲染出档位名再拖，否则拖动会被 levelCount=0 守卫挡掉。
    await page.waitForFunction(() => {
      const track = document.querySelector('.ces-track');
      return !!track && (track.getAttribute('aria-valuetext') ?? '') !== '';
    });
    // 滑条被 portal 到菜单所在的行里，菜单本身 portal 在 body 上，因此不能按 #main 限定。
    const box = await page.locator('.ces-track').boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(() => window.fixture.selects.length > 0);
    const result = await page.evaluate(() => ({
      selects: window.fixture.selects.map(call => ({ provider: call.provider, model: call.model, effort: call.reasoningEffort })),
      stillAttached: document.querySelectorAll('.ces-track').length,
      menuOpen: !!document.querySelector('[role="menu"][aria-label="模型选择"]'),
      now: document.querySelector('.ces-track')?.getAttribute('aria-valuenow'),
    }));
    // 拖动中的降频窗口可能先写一次，松手再落定；所有写回都必须指向同一档（最高档）。
    assert.deepEqual([...new Set(result.selects.map(item => item.effort))], ['max'], `写回的档位必须一致：${JSON.stringify(result.selects)}`);
    assert.equal(result.selects[0].provider, 'main');
    assert.equal(result.now, '3', '滑条停在最后一档');
    assert.equal(result.stillAttached, 1);
    assert.equal(result.menuOpen, true, '写回后菜单保持打开');
    // 同档位去重：静置后不应再产生新的写回。
    const before = result.selects.length;
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.fixture.selects.length), before, '同档位不再重复写盘');
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('推理等级滑条：关菜单后还原那一行的内联样式并移除注入容器', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    await page.locator('#main [aria-haspopup="menu"]').click();
    await page.waitForSelector('.ces-track');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('.ces-inline').length === 0);
    const restored = await page.evaluate(() => {
      const seat = document.querySelector('#main [aria-haspopup="menu"]');
      seat.click();
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
        const row = [...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent.includes('推理等级'));
        resolve({ height: row?.style.height ?? '', flexWrap: row?.style.flexWrap ?? '', paddingTop: row?.style.paddingTop ?? '' });
      })));
    });
    assert.equal(restored.paddingTop, '10px', '重新打开后再次注入');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('.ces-inline').length === 0);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('推理等级滑条：键盘 End / ArrowLeft 切换档位并写回', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    await page.locator('#main [aria-haspopup="menu"]').click();
    await page.waitForSelector('.ces-track');
    await page.waitForFunction(() => (document.querySelector('.ces-track')?.getAttribute('aria-valuetext') ?? '') !== '');
    await page.locator('.ces-track').focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => window.fixture.selects.length > 0);
    const atEnd = await page.evaluate(() => ({ now: document.querySelector('.ces-track').getAttribute('aria-valuenow'), last: window.fixture.selects.at(-1).reasoningEffort }));
    assert.equal(atEnd.now, '3', 'End 跳到最后一档');
    assert.equal(atEnd.last, 'max');
    const before = await page.evaluate(() => window.fixture.selects.length);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(count => window.fixture.selects.length > count, before);
    const afterLeft = await page.evaluate(() => ({ now: document.querySelector('.ces-track').getAttribute('aria-valuenow'), last: window.fixture.selects.at(-1).reasoningEffort }));
    assert.equal(afterLeft.now, '2');
    assert.equal(afterLeft.last, 'high', '左方向键退一档并写回 high');
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('推理等级滑条：右键不会弹出任何设置面板（拦截 document 上的同类监听）', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    // 模拟"旧版本残留 / 同源实现"在 document 捕获阶段装的右键监听，并放一个已有面板节点。
    await page.evaluate(() => {
      window.__foreignContextMenu = 0;
      document.addEventListener('contextmenu', () => { window.__foreignContextMenu += 1; }, true);
      const stale = document.createElement('div');
      stale.className = 'ces-set';
      stale.textContent = '滑条设置';
      document.body.appendChild(stale);
    });
    await page.locator('#main [aria-haspopup="menu"]').click();
    await page.waitForSelector('.ces-track');
    await page.locator('.ces-track').click({ button: 'right' });
    await page.waitForTimeout(150);
    const result = await page.evaluate(() => ({
      foreign: window.__foreignContextMenu,
      panels: document.querySelectorAll('.ces-set').length,
      track: document.querySelectorAll('.ces-track').length,
    }));
    assert.equal(result.panels, 0, '外来设置面板必须被清掉');
    assert.equal(result.foreign, 0, '右键事件不能走到 document 上的同类监听');
    assert.equal(result.track, 1, '滑条本身不受影响');
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('推理等级滑条：模型没有推理档位时不注入（fail-open）', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    await page.evaluate(() => fixture.setReasoning('main', null));
    await page.locator('#main [aria-haspopup="menu"]').click();
    await page.waitForSelector('[role="menu"][aria-label="模型选择"]');
    assert.equal(await page.locator('.ces-inline').count(), 0);
    assert.equal(await page.locator('[role="menuitem"]').count(), 1, '该模型只有「模型」一行');
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

// ── v0.7.0 功能开关：既有功能必须能被通用设置里的开关即时关掉、再即时打开 ──

test('功能开关：关闭「模型菜单显示提供商」后头部消失，重开立即恢复', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    await page.locator('#main [aria-haspopup="menu"]').click();
    await page.waitForSelector('[data-model-provider-header]');
    await page.evaluate(() => fixture.setFlag('provider-header', false));
    await page.waitForFunction(() => document.querySelector('[data-model-provider-header]') === null);
    assert.deepEqual(await page.evaluate(() => fixture.flags()), {
      'provider-header': false, 'theme-switch': true, 'effort-slider': true, 'open-in-session': true,
    });
    await page.evaluate(() => fixture.setFlag('provider-header', true));
    await page.waitForSelector('[data-model-provider-header]');
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('功能开关：关闭「推理等级滑条」后滑条与行内改样一起还原，重开恢复', options, async () => {
  const fixture = await browserHarness();
  try {
    const { page } = fixture;
    await page.locator('#main [aria-haspopup="menu"]').click();
    await page.waitForSelector('.ces-track');
    const injected = await page.evaluate(() => {
      const row = document.querySelector('.ces-track').closest('[role="menuitem"]');
      return { height: row.style.height, flexWrap: row.style.flexWrap, container: document.querySelectorAll('.ces-inline').length };
    });
    assert.equal(injected.height, 'auto');
    assert.equal(injected.flexWrap, 'wrap');
    assert.ok(injected.container >= 1, '滑条容器已注入（菜单可能是 group+menu 两层，数量不固定）');

    await page.evaluate(() => fixture.setFlag('effort-slider', false));
    await page.waitForFunction(() => document.querySelectorAll('.ces-track').length === 0
      && document.querySelectorAll('.ces-inline').length === 0);
    const restored = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[role="menuitem"]')];
      const row = rows.find(candidate => /推理等级|Effort/.test(candidate.textContent));
      return row ? { height: row.style.height, flexWrap: row.style.flexWrap, paddingTop: row.style.paddingTop } : null;
    });
    assert.notEqual(restored, null, '官方推理等级行必须还在');
    assert.equal(restored.height, '', '关闭后行高还原');
    assert.equal(restored.flexWrap, '', '关闭后折行还原');
    assert.equal(restored.paddingTop, '', '关闭后内边距还原');

    await page.evaluate(() => fixture.setFlag('effort-slider', true));
    await page.waitForSelector('.ces-track');
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});
