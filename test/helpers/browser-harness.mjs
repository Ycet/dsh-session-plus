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
    /** 功能 4（推理等级滑条）的写回记录：每次 directory.select 的入参都收在这里。 */
    const selects = [];
    const directoryCache = new Map();
    const input = new Map(), directories = new Map();
    const ctx = {
      effect(fn) { const cleanup = fn(); if (cleanup) disposers.push(cleanup); },
      inject(_keys, fn) { fn(ctx); },
      locale: { register() { return () => {}; }, bind: () => key => ({
        providerLabel: '提供商：{name}',
        addToConversation: '添加至对话',
        effortSliderLabel: '推理等级',
        effortSliderTitle: '推理等级：{name}',
        effortErrorNotReady: '模型目录尚未就绪，无法写入档位',
        effortErrorDirectory: '模型目录不可用，档位未写入',
        effortErrorTimeout: '档位切换超时，宿主未回报结果（已回滚显示）',
        effortErrorFailed: '档位切换失败',
      }[key] ?? key) },
      slots: { inject(_name, fn) { fn(); }, register(spec, Component) { registrations.set(spec.id, { spec, Component }); return () => registrations.delete(spec.id); } },
      modelDirectories: {
        directoryFor(id) {
          // 同一会话必须返回**同一个对象**：滑条按身份比较决定是否重挂订阅。
          if (!directoryCache.has(id)) {
            directoryCache.set(id, {
              store: directories.get(id),
              load() { return Promise.resolve(directories.get(id).getSnapshot()); },
              select(selection) {
                selects.push(selection);
                const snapshot = directories.get(id).getSnapshot();
                directories.get(id).set({ ...snapshot, current: { ...snapshot.current, reasoningEffort: selection.reasoningEffort } });
                return Promise.resolve({ ok: true });
              },
            });
          }
          return directoryCache.get(id);
        },
      },
      get(name) { return ctx[name]; },
    };
    const plusModule = modules.get('dsh-session-plus');
    plusModule.apply(ctx);
    /** v0.7.0 功能开关：供用例在页面内翻转，验证即时生效与残留回收。 */
    const setFlag = (id, value) => plusModule.__internals.featureFlags.set(id, value);
    const ModelSelect = modules.get('@deepseek-ai/dsh-client-ui-model-selection').ModelSelect;
    const root = builtins['react-dom/client'].createRoot(document.getElementById('test-root'));
    const EFFORTS = [{ id: 'off', name: 'Off' }, { id: 'low', name: 'Low' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }];
    // reasoning 为 null 时模拟"该模型没有推理档位"，用于验证滑条 fail-open（不注入）。
    const state = (provider, reasoning = { defaultEffort: 'high', efforts: EFFORTS }) => ({
      current: { provider, model: 'test' },
      groups: [{ id: provider, name: provider.toUpperCase(), models: [{ id: 'test', name: 'Test model', ...(reasoning === null ? {} : { reasoning }) }] }],
      failures: [], pending: null, status: 'ready', retainedEffort: undefined,
    });
    const modelText = key => ({ 'menu.model': '模型', 'menu.effort': '推理等级', 'trigger.aria': 'Test model', 'menu.aria': '模型选择' }[key] ?? key);
    const bySlot = slotName => [...registrations.values()].filter(entry => entry.spec.name === slotName);
    function Composer({ id, legacy }) {
      const inputStore = input.get(id);
      const useInput = selector => selector(React.useSyncExternalStore(inputStore.subscribe, inputStore.getSnapshot));
      const inputActions = { setDraft: draft => inputStore.set({ draft }) };
      return h('section', { id, 'data-slot': 'conversation.content', style: { position: 'relative', width: '520px', display: 'inline-block', verticalAlign: 'top' } },
        h('div', { 'data-conversation-scroll': '', style: { minHeight: '260px', paddingTop: '100px' } },
          h('p', { id: `${id}-message` }, `${id} 消息文本`),
          h('div', { 'data-slot': 'conversation.composer.bar', 'data-composer-card': '' },
            h('div', { 'data-slot': 'conversation.input.overlay' }, bySlot('conversation.input.overlay').map(({ spec, Component }) =>
              h(Component, { ...spec.inject?.(id), key: spec.id, sessionId: id, useInput, inputActions }))),
            h('div', { 'data-slot': 'conversation.input.right' }, bySlot('conversation.input.right').map(({ spec, Component }) =>
              h(Component, { ...spec.inject?.(id), key: spec.id, sessionId: id, useInput, inputActions }))),
            legacy ? h('textarea', { id: `${id}-input`, defaultValue: '草稿' }) : h('div', { id: `${id}-input`, 'data-composer-input': '', contentEditable: true, suppressContentEditableWarning: true }, '草稿'),
            h('div', { 'data-slot': 'conversation.input.model' }, h(ModelSelect, { available: true, locked: false, directory: directories.get(id), load() {}, select() { return Promise.resolve({ ok: true }); }, t: modelText, renderSlot: () => null })))));
    }
    window.fixture = {
      input, directories, errors: [], selects,
      setFlag,
      flags: () => plusModule.__internals.featureFlags.snapshot(),
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
      /** 切换当前模型是否带推理档位（reasoning = null 表示没有）。 */
      setReasoning(id, reasoning = null) { directories.get(id).set(state('deepseek', reasoning === null ? null : { defaultEffort: 'high', efforts: reasoning })); },
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
    const plusModule2 = modules.get('dsh-session-plus');
    plusModule2.apply(ctx);
    const setFlag = (id, value) => plusModule2.__internals.featureFlags.set(id, value);

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
      setFlag,
      flags: () => plusModule2.__internals.featureFlags.snapshot(),
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

// —— 夹具三：v0.7.0 新会话页「在应用中打开」按钮 + 通用设置 5 行开关 ——
/** 1×1 透明 PNG：让图标的 <img> 真正加载成功，从而验证图标路径而不是回退字形。 */
const ICON_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

export async function v070Harness() {
  const { browser, page, errors, client } = await launch();
  // 官方图标路由由 Host 提供；这里给一个真实图片响应，避免 <img> 走 onError 回退。
  await page.route('**/open-in-app/icon/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: ICON_PNG }));
  await withCloseOnFailure(browser, page.evaluate(({ client }) => {
    const builtins = window.testBuiltins;
    const React = builtins.react;
    const h = React.createElement;
    const modules = new Map();
    window.__ModuleLoader__ = { load: definition => modules.set(definition.id, definition.factory(name => builtins[name])) };
    (0, eval)(client);

    const labels = {
      openInTitle: '用 {app} 打开',
      openInMore: '更多打开方式',
      openInDefault: '{app}（默认）',
      openInAppsError: '无法获取应用列表',
      openInFailed: '打开失败，请重试',
      openInBusy: '正在打开工作区',
      'app.finder': '访达',
      'app.vscode': 'VS Code',
      'app.warp': 'Warp',
      featProviderTitle: '模型菜单显示提供商名称',
      featProviderDesc: '在模型选择菜单顶部实时显示当前模型所属的提供商',
      featSelectionTitle: '选中文本加入对话',
      featSelectionDesc: '在聊天内容中选中文字后，用浮动按钮把选中文本以代码块插入输入框开头',
      featThemeTitle: '账户菜单主题快捷切换',
      featThemeDesc: '在账户菜单顶部提供三态切换条',
      featEffortTitle: '推理等级滑条',
      featEffortDesc: '把模型菜单里的推理等级行换成可拖动的连续滑条',
      featOpenInSessionTitle: '新建会话页「在应用中打开」按钮',
      featOpenInSessionDesc: '在尚未开始对话的新会话页标题栏显示工作区打开按钮',
    };
    const t = key => labels[key] ?? key;

    const store = value => {
      const listeners = new Set();
      return { getSnapshot: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
        set(next) { value = next; for (const fn of listeners) fn(); } };
    };
    const sessions = store({ byId: { hero: { cwd: '/Users/Project/workspace' } } });

    const registrations = [];
    const disposers = [];
    const opens = [];
    const fetchCalls = [];
    let panelOpen = false;
    let openFails = false;
    const appsList = ['finder', 'vscode'];

    window.fetch = async (url, init) => {
      const path = String(url);
      fetchCalls.push({ path, method: (init && init.method) || 'GET' });
      if (path.indexOf('/open-in-app/apps') >= 0) {
        return { ok: true, status: 200, json: async () => ({ apps: appsList }) };
      }
      if (path.indexOf('/open-in-app/open') >= 0) {
        opens.push(JSON.parse(init.body));
        return { ok: openFails !== true, status: openFails === true ? 500 : 200 };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };

    const ctx = {
      effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') disposers.push(cleanup); return cleanup; },
      on: () => () => {},
      locale: { register: () => () => {}, bind: () => key => labels[key] ?? key, subscribe: () => () => {} },
      slots: {
        inject: (_name, fn) => fn(),
        register(spec, Component) {
          const entry = { spec, Component };
          registrations.push(entry);
          return () => { const index = registrations.indexOf(entry); if (index >= 0) registrations.splice(index, 1); };
        },
      },
      sidebarRight: { isExpanded: () => panelOpen },
      // 只装配不依赖 modelDirectories 的部分：本夹具不渲染模型菜单。
      inject: (keys, fn) => { if (Array.isArray(keys) && keys.includes('modelDirectories')) return; fn(ctx); },
      get: name => ctx[name],
    };
    ctx.theme = { getTheme: () => ({ preference: 'system' }), setTheme: () => {} };
    const plus = modules.get('dsh-session-plus');
    plus.apply(ctx);
    const setFlag = (id, value) => plus.__internals.featureFlags.set(id, value);

    const bySlot = name => registrations.filter(entry => entry.spec.name === name);
    let showHero = true;

    function Header() {
      return h('header', { id: 'header', 'data-slot': 'conversation.session.header' },
        h('div', { id: 'left-group' },
          h('button', { type: 'button', id: 'other-1', 'aria-label': 'other one' }, '1'),
          h('button', { type: 'button', id: 'other-2', 'aria-label': 'other two' }, '2')),
        // 模拟真实环境：这一组里还可能有别的插件（dsh-better-sidebar）的按钮，
        // 官方「展开右侧面板」是其中最后一个；面板展开时整组隐藏。
        h('div', { id: 'corner', 'data-conversation-header-corner': '' },
          panelOpen ? null : h('button', { type: 'button', id: 'other-pane', 'aria-label': 'add pane' }, 'pane'),
          panelOpen ? null : h('button', {
            type: 'button', id: 'expand', 'data-sidebar-right-expand': '', 'aria-label': 'Open right sidebar',
            onClick: () => { panelOpen = true; render(); },
          }, 'panel')));
    }

    function Hero() {
      return h('div', { id: 'hero', 'data-slot': 'conversation.hero.options' },
        bySlot('conversation.hero.options').map(({ spec, Component }) => h(Component, {
          ...(spec.inject ? spec.inject('hero') : {}), key: spec.id, sessionId: 'hero', t,
          useSessions: selector => selector(sessions.getSnapshot()),
        })));
    }

    function Settings() {
      // 真实设置页把 settings.general.item 的全部登记按 order 统一排序后再渲染，
      // 因此这里也把两条官方行（90 = 上传 Session Log、100 = 当前版本）混进同一个
      // 列表里排序，才能验证我们那 5 行确实落在两者之间。
      const rows = bySlot('settings.general.item').map(({ spec, Component }) => ({
        order: spec.order,
        node: h(Component, { ...(spec.inject ? spec.inject() : {}), key: spec.id, t }),
      }));
      const entries = [
        { order: 90, node: h('div', { id: 'row-session-log', 'data-official-row': 'session-log' }, 'Session Log') },
        { order: 100, node: h('div', { id: 'row-version', 'data-official-row': 'version' }, 'Version') },
        ...rows,
      ].sort((left, right) => left.order - right.order);
      return h('div', { id: 'settings' }, entries.map(entry => entry.node));
    }

    const root = builtins['react-dom/client'].createRoot(document.getElementById('test-root'));
    const render = () => {
      builtins['react-dom'].flushSync(() => root.render(h(React.Fragment, null, h(Header), showHero ? h(Hero) : null, h(Settings))));
    };

    window.fixture = {
      errors: [],
      opens,
      fetchCalls,
      setFlag,
      flags: () => plus.__internals.featureFlags.snapshot(),
      setPanel(open) { panelOpen = open === true; render(); },
      isPanelOpen: () => panelOpen,
      removeHero() { showHero = false; render(); },
      restoreHero() { showHero = true; render(); },
      setOpenFails(value) { openFails = value === true; },
      unmount() { builtins['react-dom'].flushSync(() => root.unmount()); for (const dispose of disposers.reverse()) dispose(); },
    };
    render();
  }, { client }));
  return { page, errors, close: () => browser.close() };
}
