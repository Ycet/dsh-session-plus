import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// 浏览器验收夹具：使用验收环境提供的官方前端 React / primitives 与真实 Menu 原语，
// 不复制其 DOM 实现。所有请求由本地拦截处理，既不访问账户，也不启动 Host 或调用模型。
export const browserAvailable = Boolean(process.env.SESSION_PLUS_TEST_RUNTIME && process.env.SESSION_PLUS_TEST_PLAYWRIGHT);

/**
 * 把官方前端入口裁到 boot 之前，并导出静态模块表（React / primitives 等）。
 * 入口标识在不同构建里会改名，因此按语义匹配而不是硬编码函数名。
 */
function patchFrontend(frontend) {
  const boot = frontend.match(/const\s+(\w+)\s*=\s*globalThis\.dshDesktopBoot/);
  const builtins = frontend.match(/staticModules:\s*(\w+)\(\)/);
  if (!boot || !builtins) throw new Error('官方前端测试入口已变化，请重新核对运行时');
  const cut = frontend.indexOf(boot[0]);
  return `${frontend.slice(0, cut)}\nwindow.testBuiltins=${builtins[1]}();`;
}

/** 读取运行时资源并启动一个已注入官方前端骨架的页面。 */
async function launch() {
  const runtime = process.env.SESSION_PLUS_TEST_RUNTIME;
  const assets = join(runtime, 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets');
  const entry = readdirSync(assets).find(name => /^index-.*\.js$/.test(name));
  if (!entry) throw new Error('官方前端入口不存在，请重新核对运行时');
  const frontend = patchFrontend(readFileSync(join(assets, entry), 'utf8'));
  // 官方样式表必须一起注入：Menu 的 position:fixed / 主题 token / 菜单间距都来自它，
  // 否则弹层会退化为正常文档流，几何反查自然失效。
  const styles = readdirSync(assets)
    .filter(name => name.endsWith('.css'))
    .map(name => readFileSync(join(assets, name), 'utf8'))
    .join('\n');
  const { chromium } = createRequire(import.meta.url)(process.env.SESSION_PLUS_TEST_PLAYWRIGHT);
  const browser = await chromium.launch({ headless: true,
    ...(process.env.SESSION_PLUS_TEST_BROWSER ? { executablePath: process.env.SESSION_PLUS_TEST_BROWSER } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name === 'frontend.js') return route.fulfill({ contentType: 'text/javascript', body: frontend });
    if (/^vendor-.*\.js$/.test(name)) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(assets, name), 'utf8') });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body><div id="test-root"></div></body></html>' });
  });
  await page.goto('http://session-plus.test/');
  if (styles) await page.addStyleTag({ content: styles });
  await page.addScriptTag({ type: 'module', url: 'http://session-plus.test/frontend.js' });
  await page.waitForFunction(() => window.testBuiltins);
  const client = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8');
  return { browser, page, errors, assets, client };
}

/**
 * 夹具体渲染失败时先关掉浏览器再抛出，避免测试进程被残留浏览器拖住。
 */
async function withCloseOnFailure(browser, promise) {
  try {
    return await promise;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// —— 夹具一：模型菜单提供商头部 + 选中文本 ——
export async function browserHarness() {
  const { browser, page, errors, client } = await launch();
  const runtime = process.env.SESSION_PLUS_TEST_RUNTIME;
  const model = readFileSync(join(runtime, 'node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js'), 'utf8')
    .replace('exports.apply = apply;', 'exports.ModelSelect = ModelSelect; exports.apply = apply;');
  await withCloseOnFailure(browser, page.evaluate(({ model, client }) => {
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
            h('div', { 'data-slot': 'conversation.input.model' }, h(ModelSelect, { available: true, locked: false, directory: directories.get(id), load() {}, select() { return Promise.resolve({ ok: true }); }, t: modelText, renderSlot: () => null })))));
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
  }, { model, client }));
  return { page, errors, close: () => browser.close() };
}

// —— 夹具二：账户菜单（真实 Menu 原语）+ 主题服务 ——
export async function themeHarness() {
  const { browser, page, errors, client } = await launch();
  await withCloseOnFailure(browser, page.evaluate(({ client }) => {
    const builtins = window.testBuiltins;
    const primitives = builtins['@deepseek-ai/dsh-client-ui-primitives'];
    if (!primitives || !primitives.Menu) throw new Error('官方 Menu 原语不可用');
    const React = builtins.react, h = React.createElement;
    const modules = new Map();
    window.__ModuleLoader__ = { load: definition => modules.set(definition.id, definition.factory(name => builtins[name])) };
    (0, eval)(client);

    const labels = {
      themeGroup: '主题',
      themeSystem: '跟随系统',
      themeLight: '浅色',
      themeDark: '深色',
      themeSwitchHint: '切换界面主题',
      themeUnavailable: '主题服务不可用',
      providerEntry: '模型提供商',
      providerLabel: '提供商：{name}',
      addToConversation: '添加至对话',
    };
    let preference = 'system';
    let writes = 0;
    const listeners = new Set();
    const snapshot = () => ({
      preference,
      active: { id: 'light', colorScheme: 'light', tokens: {} },
      themes: [],
      fontSizes: {},
      fontFamilies: {},
      revision: writes,
    });
    const theme = {
      getTheme: snapshot,
      setTheme(next) {
        if (!['system', 'light', 'dark'].includes(next)) throw new Error(`unknown theme: ${next}`);
        if (next === preference) return;
        preference = next;
        writes += 1;
        for (const listener of listeners) listener(snapshot());
      },
    };
    const disposers = [];
    const ctx = {
      effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') disposers.push(cleanup); return cleanup; },
      on(name, fn) {
        if (name !== 'theme/change') return () => {};
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      inject(keys, fn) { if (keys.includes('theme') || keys.includes('modelDirectories')) fn(ctx); },
      locale: { register: () => () => {}, bind: () => key => labels[key] ?? key, subscribe: () => () => {} },
      slots: { inject: () => {}, register: () => () => {} },
      modelDirectories: { directoryFor: () => null },
      theme,
      get(name) { return ctx[name]; },
    };
    modules.get('dsh-session-plus').apply(ctx);

    const root = builtins['react-dom/client'].createRoot(document.getElementById('test-root'));
    let open = false;
    let renderApp = () => {};
    function App() {
      return h('div', {
        id: 'launcher',
        'data-slot': 'settings.launcher',
        style: { position: 'fixed', left: '16px', bottom: '16px' },
      }, h(primitives.Menu, {
        open,
        side: 'top',
        portal: true,
        autoFocus: true,
        onClose: () => setOpen(false),
        onSelect: () => {},
        items: [
          { id: 'settings', label: '设置' },
          { id: 'contact', label: '意见反馈' },
          { id: 'signout', label: '退出登录' },
        ],
        anchor: h('button', {
          type: 'button',
          id: 'account-trigger',
          'aria-label': '账号菜单',
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          onClick: () => setOpen(!open),
          style: { width: '150px', height: '48px', borderRadius: '10px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer' },
        }, 'Ycet'),
      }));
    }
    const render = () => { builtins['react-dom'].flushSync(() => root.render(h(App))); };
    renderApp = render;
    const setOpen = value => { open = value; renderApp(); };

    window.fixture = {
      errors: [],
      open: () => setOpen(true),
      close: () => setOpen(false),
      isOpen: () => open,
      preference: () => preference,
      writes: () => writes,
      setExternal(next) {
        if (next === preference) return;
        preference = next;
        for (const listener of listeners) listener(snapshot());
      },
      unmount() {
        builtins['react-dom'].flushSync(() => root.unmount());
        for (const dispose of disposers.reverse()) dispose();
      },
    };
    render();
  }, { client }));
  return { page, errors, close: () => browser.close() };
}
