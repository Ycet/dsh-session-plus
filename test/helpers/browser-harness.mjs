import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

export const browserAvailable = Boolean(process.env.SESSION_PLUS_TEST_RUNTIME && process.env.SESSION_PLUS_TEST_PLAYWRIGHT);

// 使用验收环境提供的官方前端 React / primitives 与真实模型菜单，不复制其 DOM 实现。
// 所有请求由本地夹具拦截，既不访问账户，也不启动 Host 或调用模型。
export async function browserHarness() {
  const runtime = process.env.SESSION_PLUS_TEST_RUNTIME;
  const assets = join(runtime, 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets');
  const entry = readdirSync(assets).find(name => /^index-.*\.js$/.test(name));
  let frontend = readFileSync(join(assets, entry), 'utf8');
  const boot = frontend.indexOf('const fo=globalThis.dshDesktopBoot');
  if (boot < 0 || !frontend.includes('function rM()')) throw new Error('官方前端测试入口已变化，请重新核对运行时');
  frontend = frontend.slice(0, boot) + '\nwindow.testBuiltins=rM();';
  const model = readFileSync(join(runtime, 'node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js'), 'utf8')
    .replace('exports.apply = apply;', 'exports.ModelSelect = ModelSelect; exports.apply = apply;');
  const client = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8');
  const { chromium } = createRequire(import.meta.url)(process.env.SESSION_PLUS_TEST_PLAYWRIGHT);
  const browser = await chromium.launch({ headless: true,
    ...(process.env.SESSION_PLUS_TEST_BROWSER ? { executablePath: process.env.SESSION_PLUS_TEST_BROWSER } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(3000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name === 'frontend.js') return route.fulfill({ contentType: 'text/javascript', body: frontend });
    if (/^vendor-.*\.js$/.test(name)) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(assets, name), 'utf8') });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body><div id="test-root"></div></body></html>' });
  });
  await page.goto('http://session-plus.test/');
  await page.addScriptTag({ type: 'module', url: 'http://session-plus.test/frontend.js' });
  await page.waitForFunction(() => window.testBuiltins);
  await page.evaluate(({ model, client }) => {
    const builtins = window.testBuiltins;
    const React = builtins.react, h = React.createElement;
    const modules = new Map();
    window.__ModuleLoader__ = { load: definition => modules.set(definition.id, definition.factory(name => builtins[name])) };
    (0, eval)(model); (0, eval)(client);
    const store = value => {
      const listeners = new Set();
      return { getSnapshot: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
        set(next) { value = next; for (const fn of listeners) fn(); }, listeners };
    };
    const registrations = new Map(), disposers = [];
    const input = new Map(), directories = new Map();
    const ctx = {
      effect(fn) { const cleanup = fn(); if (cleanup) disposers.push(cleanup); },
      inject(_keys, fn) { fn(ctx); },
      locale: { register() { return () => {}; }, bind: () => key => key === 'providerLabel' ? '提供商：{name}' : key === 'addToConversation' ? '添加至对话' : key },
      slots: { inject(_name, fn) { fn(); }, register(spec, Component) { registrations.set(spec.id, { spec, Component }); return () => registrations.delete(spec.id); } },
      modelDirectories: { directoryFor(id) { return { store: directories.get(id) }; } },
      get(name) { return ctx[name]; },
    };
    modules.get('dsh-session-plus').apply(ctx);
    const ModelSelect = modules.get('@deepseek-ai/dsh-client-ui-model-selection').ModelSelect;
    const root = builtins['react-dom/client'].createRoot(document.getElementById('test-root'));
    const state = provider => ({ current: { provider, model: 'test' }, groups: [{ id: provider, name: provider.toUpperCase(), models: [{ id: 'test', name: 'Test model' }] }], failures: [], pending: null, status: 'ready', retainedEffort: undefined });
    const modelText = key => ({ 'menu.model': '模型', 'menu.effort': '推理等级', 'trigger.aria': 'Test model', 'menu.aria': '模型选择' }[key] ?? key);
    function Composer({ id, legacy }) {
      const inputStore = input.get(id);
      const useInput = selector => selector(React.useSyncExternalStore(inputStore.subscribe, inputStore.getSnapshot));
      const inputActions = { setDraft: draft => inputStore.set({ draft }) };
      return h('section', { id, 'data-slot': 'conversation.content', style: { position: 'relative', width: '520px', display: 'inline-block', verticalAlign: 'top' } },
        h('div', { 'data-conversation-scroll': '', style: { minHeight: '260px', paddingTop: '100px' } },
          h('p', { id: `${id}-message` }, `${id} 消息文本`),
          h('div', { 'data-slot': 'conversation.composer.bar', 'data-composer-card': '' },
            h('div', { 'data-slot': 'conversation.input.overlay' }, [...registrations.values()].map(({ spec, Component }) =>
              h(Component, { ...spec.inject?.(id), key: spec.id, sessionId: id, useInput, inputActions }))),
            legacy ? h('textarea', { id: `${id}-input`, defaultValue: '草稿' }) : h('div', { id: `${id}-input`, 'data-composer-input': '', contentEditable: true, suppressContentEditableWarning: true }, '草稿'),
            h('div', { 'data-slot': 'conversation.input.model' }, h(ModelSelect, { available: true, locked: false, directory: directories.get(id), load() {}, select() { return Promise.resolve({ ok: true }); }, t: modelText })))));
    }
    window.fixture = {
      input, directories, errors: [],
      render(ids = ['main'], legacy = false) {
        for (const id of ids) { if (!input.has(id)) input.set(id, store({ draft: '原有草稿' })); if (!directories.has(id)) directories.set(id, store(state(id))); }
        builtins['react-dom'].flushSync(() => root.render(h(React.Fragment, null, ids.map(id => h(Composer, { key: id, id, legacy })))));
      },
      select(id) {
        const range = document.createRange(); range.selectNodeContents(document.getElementById(id));
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      },
      setProvider(id, provider) { directories.get(id).set(state(provider)); },
      unmount() { builtins['react-dom'].flushSync(() => root.unmount()); for (const dispose of disposers.reverse()) dispose(); },
    };
    window.fixture.render();
  }, { model, client });
  return { page, errors, close: () => browser.close() };
}
