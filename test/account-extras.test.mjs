import test from 'node:test';
import assert from 'node:assert/strict';
import { localeState, localeLabel, navIndex, isCollapsed } from '../lib/account-extras.js';

const officialLocales = [
	{ id: 'zh', label: '中文' },
	{ id: 'en', label: 'English' },
	{ id: 'ja', label: '日本語' },
	{ id: 'es', label: 'Español' },
	{ id: 'fr', label: 'Français' },
	{ id: 'de', label: 'Deutsch' },
	{ id: 'ru', label: 'Русский' },
	{ id: 'pt', label: 'Português' },
];

test('语言快照：保持官方顺序，只丢弃缺 id 或缺原生名的条目', () => {
	const state = localeState({
		active: 'ja',
		locales: [officialLocales[0], { id: '', label: '无名' }, { id: 'xx' }, null, officialLocales[1], officialLocales[2]],
	});
	assert.equal(state.active, 'ja');
	assert.deepEqual(state.options, [officialLocales[0], officialLocales[1], officialLocales[2]]);
});

test('语言快照：缺失、非法或空对象一律退化为空状态，不抛错', () => {
	for (const input of [undefined, null, 'zh', 42, {}, { locales: 'nope' }]) {
		assert.deepEqual(localeState(input), { active: '', options: [] });
	}
	const partial = localeState({ locales: officialLocales });
	assert.equal(partial.active, '', 'active 缺失时按空串处理');
	assert.equal(partial.options.length, 8);
});

test('语言名：命中返回原生名，未命中返回空串', () => {
	assert.equal(localeLabel(officialLocales, 'pt'), 'Português');
	assert.equal(localeLabel(officialLocales, 'ko'), '');
	assert.equal(localeLabel(undefined, 'zh'), '');
	assert.equal(localeLabel([{ id: 'zh', label: '' }], 'zh'), '');
});

test('导航下标：按 order 排序，相同 order 保持注册顺序', () => {
	const sections = [
		{ options: { id: 'account', order: 0 } },
		{ options: { id: 'general', order: 10 } },
		{ options: { id: 'models', order: 20 } },
	];
	assert.equal(navIndex(sections, 'general'), 1);
	assert.equal(navIndex(sections, 'account'), 0);
	assert.equal(navIndex(sections, 'missing'), -1);

	const tied = [
		{ options: { id: 'late', order: 5 } },
		{ options: { id: 'early', order: 5 } },
		{ options: { id: 'first', order: 1 } },
	];
	assert.equal(navIndex(tied, 'first'), 0);
	assert.equal(navIndex(tied, 'late'), 1);
	assert.equal(navIndex(tied, 'early'), 2);

	assert.equal(navIndex([{ options: { id: 'general' } }], 'general'), 0, '缺 order 时仍能定位');
	assert.equal(navIndex(null, 'general'), -1);
});

test('收起态：只有字符串 "true" 算收起', () => {
	assert.equal(isCollapsed('true'), true);
	for (const value of ['false', '', null, undefined, true]) assert.equal(isCollapsed(value), false);
});
