import test from 'node:test';
import assert from 'node:assert/strict';
import { browserAvailable, mermaidHarness } from './helpers/browser-harness.mjs';

const options = { skip: !browserAvailable, timeout: 30000 };

/** 读取 mermaid fence 层的 DOM 快照。 */
async function readState(page) {
	return page.evaluate(() => {
		const figure = document.querySelector('figure.sp-mmd');
		const source = document.querySelector('figure.sp-mmd-source');
		const svg = document.querySelector('figure.sp-mmd svg');
		const hint = document.querySelector('.sp-mmd-hint');
		const pre = document.querySelector('pre[data-stub-code]');
		const buttons = [...document.querySelectorAll('figure.sp-mmd .sp-mmd-btn')].map(button => ({
			label: button.getAttribute('aria-label'),
			text: button.textContent,
			pressed: button.getAttribute('aria-pressed'),
			disabled: button.disabled === true,
		}));
		return {
			figureCount: document.querySelectorAll('figure.sp-mmd').length,
			hasSourceFigure: Boolean(source),
			hasCodeBlock: Boolean(pre),
			codeText: pre ? pre.textContent : null,
			svgStub: svg ? svg.getAttribute('data-stub') : null,
			svgText: svg ? svg.textContent : null,
			hintText: hint ? hint.textContent : null,
			buttons,
			rootMarkup: figure ? figure.className : null,
		};
	});
}

test('mermaid：流式期间保留代码块，结束后替换为 SVG，chunk 只加载一次', options, async () => {
	const fixture = await mermaidHarness();
	try {
		const { page } = fixture;
		await page.waitForSelector('pre[data-stub-code]');
		const streaming = await page.evaluate(() => ({
			registered: window.fixture.fenceRegistered(),
			chunkCalls: window.fixture.chunkCalls(),
			figures: document.querySelectorAll('figure.sp-mmd').length,
			code: document.querySelector('pre[data-stub-code]').textContent,
		}));
		assert.equal(streaming.registered, true, '应在 conversation.chat.markdown.fence 注册 key=mermaid 的层');
		assert.equal(streaming.figures, 0, '流式期间不应渲染图表');
		assert.equal(streaming.chunkCalls, 0, '流式期间不应加载 mermaid chunk');
		assert.match(streaming.code, /flowchart LR/, '流式期间应透出官方代码块');

		await page.evaluate(() => window.fixture.setStreaming(false));
		await page.waitForSelector('figure.sp-mmd svg');
		const settled = await readState(page);
		assert.equal(settled.figureCount, 1, '结束后应替换为一张图表');
		assert.equal(settled.hasCodeBlock, false, '图表态不应再显示代码块');
		assert.equal(settled.svgStub, '1', '应渲染第一次生成的 SVG');
		assert.equal(settled.buttons.length, 3, '图表态工具条应有源码/复制/下载三个按钮');
		assert.deepEqual(settled.buttons.map(button => button.label), ['源码', '复制 mermaid 源码', '下载 SVG']);
		assert.equal(settled.buttons[2].disabled, false, '渲染完成后下载按钮应可用');

		const calls = await page.evaluate(() => ({ chunk: window.fixture.chunkCalls(), render: window.fixture.renderCalls() }));
		assert.equal(calls.chunk, 1, 'chunk 只应加载一次');
		assert.equal(calls.render, 1, '同一段代码只应渲染一次');

		// 第二张图复用同一个 chunk，验证单例缓存没有重复下载。
		await page.evaluate(() => window.fixture.setCode('flowchart TD\n  C-->D'));
		await page.waitForFunction(() => document.querySelector('figure.sp-mmd svg')?.getAttribute('data-stub') === '2');
		const again = await page.evaluate(() => ({ chunk: window.fixture.chunkCalls(), render: window.fixture.renderCalls() }));
		assert.equal(again.chunk, 1, '第二张图不应重复加载 chunk');
		assert.equal(again.render, 2, '第二张图应进入渲染队列');
		assert.equal(fixture.errors.length, 0, `页面不应有未捕获异常：${fixture.errors.join(' | ')}`);
	} finally {
		await fixture.close();
	}
});

test('mermaid：可在图表与源码之间来回切换', options, async () => {
	const fixture = await mermaidHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => window.fixture.setStreaming(false));
		await page.waitForSelector('figure.sp-mmd svg');
		await page.click('figure.sp-mmd button[aria-label="源码"]');
		await page.waitForSelector('figure.sp-mmd-source pre[data-stub-code]');
		const source = await readState(page);
		assert.equal(source.hasSourceFigure, true, '切到源码态应使用 .sp-mmd-source');
		assert.equal(source.hasCodeBlock, true, '源码态应透出官方代码块');
		assert.equal(source.svgStub, null, '源码态不应残留 SVG');
		assert.equal(source.hintText, null, '主动切源码不应显示错误提示');
		assert.deepEqual(source.buttons.map(button => button.label), ['mermaid 图表', '复制 mermaid 源码'], '源码态只留切换与复制两个按钮');

		await page.click('figure.sp-mmd-source button[aria-label="mermaid 图表"]');
		await page.waitForSelector('figure.sp-mmd svg');
		const chart = await readState(page);
		assert.equal(chart.hasSourceFigure, false, '应切回图表态');
		assert.equal(chart.svgStub, '1', '切回后复用已渲染的 SVG');
	} finally {
		await fixture.close();
	}
});

test('mermaid：点击图表打开放大浮层，Esc 关闭', options, async () => {
	const fixture = await mermaidHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => window.fixture.setStreaming(false));
		await page.waitForSelector('figure.sp-mmd svg');
		await page.click('figure.sp-mmd .sp-mmd-view');
		await page.waitForSelector('.sp-mmd-lightbox');
		const opened = await page.evaluate(() => {
			const dialog = document.querySelector('.sp-mmd-lightbox');
			return {
				role: dialog ? dialog.getAttribute('role') : null,
				modality: dialog ? dialog.getAttribute('aria-modal') : null,
				hasSvg: Boolean(document.querySelector('.sp-mmd-lightbox-stage svg[data-stub]')),
				buttons: [...document.querySelectorAll('.sp-mmd-lightbox .sp-mmd-btn')].map(button => button.textContent),
			};
		});
		assert.equal(opened.role, 'dialog', '放大浮层应是 dialog');
		assert.equal(opened.modality, 'true', '放大浮层应是模态');
		assert.equal(opened.hasSvg, true, '浮层内应复制同一张 SVG');
		assert.deepEqual(opened.buttons, ['−', '100%', '+', '✕'], '浮层工具条应是缩小/比例/放大/关闭');

		await page.keyboard.press('Escape');
		await page.waitForFunction(() => document.querySelector('.sp-mmd-lightbox') === null);
	} finally {
		await fixture.close();
	}
});

test('mermaid：复制按钮写入剪贴板并短暂显示已复制', options, async () => {
	const fixture = await mermaidHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => window.fixture.setStreaming(false));
		await page.waitForSelector('figure.sp-mmd svg');
		await page.click('figure.sp-mmd button[aria-label="复制 mermaid 源码"]');
		await page.waitForFunction(() => window.__copied !== null);
		const copied = await page.evaluate(() => window.__copied);
		assert.match(copied, /flowchart LR/, '复制的应是 mermaid 源码');
		await page.waitForFunction(() => document.querySelector('figure.sp-mmd button[aria-label="复制 mermaid 源码"]')?.textContent === '已复制');
	} finally {
		await fixture.close();
	}
});

test('mermaid：语法错误回落代码块并给出提示', options, async () => {
	const fixture = await mermaidHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => {
			window.fixture.setCode('BROKEN diagram');
			window.fixture.setStreaming(false);
		});
		await page.waitForSelector('figure.sp-mmd-source .sp-mmd-hint');
		const state = await readState(page);
		assert.equal(state.hasSourceFigure, true, '失败时应显示源码态');
		assert.equal(state.hasCodeBlock, true, '失败时应保留官方代码块');
		assert.equal(state.hintText, '图表渲染失败，已显示源码', '应给出一行失败提示');
		assert.equal(state.buttons.some(button => button.label === 'mermaid 图表'), false, '失败态不提供图表按钮');
		assert.equal(state.buttons.some(button => button.label === '复制 mermaid 源码'), true, '失败态仍可复制源码');
	} finally {
		await fixture.close();
	}
});

test('mermaid：chunk 加载失败时回落代码块并提示', options, async () => {
	const fixture = await mermaidHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => {
			window.fixture.failChunk(true);
			window.fixture.setStreaming(false);
		});
		await page.waitForSelector('figure.sp-mmd-source .sp-mmd-hint');
		const state = await page.evaluate(() => ({
			hint: document.querySelector('.sp-mmd-hint').textContent,
			hasCode: Boolean(document.querySelector('pre[data-stub-code]')),
		}));
		assert.equal(state.hasCode, true, 'chunk 不可用时必须保留代码块');
		assert.equal(state.hint, '图表渲染失败，已显示源码', '加载失败也走统一的失败提示');
		assert.equal(fixture.errors.length, 0, `chunk 失败不应产生未捕获异常：${fixture.errors.join(' | ')}`);
	} finally {
		await fixture.close();
	}
});

test('mermaid：主题变化清空缓存并按新主题重绘', options, async () => {
	const fixture = await mermaidHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => window.fixture.setStreaming(false));
		await page.waitForSelector('figure.sp-mmd svg');
		const before = await page.evaluate(() => ({ render: window.fixture.renderCalls(), stub: document.querySelector('figure.sp-mmd svg').getAttribute('data-stub') }));
		assert.equal(before.stub, '1');
		await page.evaluate(() => window.fixture.themeChange());
		await page.waitForFunction(() => document.querySelector('figure.sp-mmd svg')?.getAttribute('data-stub') === '2');
		const after = await page.evaluate(() => ({ render: window.fixture.renderCalls(), init: window.fixture.initializeCalls() }));
		assert.equal(after.render, before.render + 1, '主题变化应为旧缓存失效并重绘');
		assert.ok(after.init >= 2, '每次渲染前都应重新 initialize 主题变量');
	} finally {
		await fixture.close();
	}
});

test('mermaid：关闭「功能 8」开关后回到代码块且不再加载 chunk', options, async () => {
	const fixture = await mermaidHarness();
	try {
		const { page } = fixture;
		await page.evaluate(() => window.fixture.setStreaming(false));
		await page.waitForSelector('figure.sp-mmd svg');
		await page.evaluate(() => window.fixture.setFlag('mermaid-diagram', false));
		await page.waitForFunction(() => document.querySelector('figure.sp-mmd') === null);
		const off = await page.evaluate(() => ({
			flags: window.fixture.flags(),
			hasCode: Boolean(document.querySelector('pre[data-stub-code]')),
			chunk: window.fixture.chunkCalls(),
		}));
		assert.equal(off.flags['mermaid-diagram'], false, '开关应写入功能状态');
		assert.equal(off.hasCode, true, '关闭开关后应显示官方代码块');
		await page.evaluate(() => window.fixture.setCode('flowchart TB\n  E-->F'));
		await page.waitForTimeout(60);
		const after = await page.evaluate(() => ({ chunk: window.fixture.chunkCalls(), figures: document.querySelectorAll('figure.sp-mmd').length }));
		assert.equal(after.figures, 0, '关闭开关后不应再生成图表');
		assert.equal(after.chunk, off.chunk, '关闭开关后不应再触发 chunk 加载');
	} finally {
		await fixture.close();
	}
});
