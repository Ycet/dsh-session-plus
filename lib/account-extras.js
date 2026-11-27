// 账户行设置齿轮与账户菜单语言行的纯逻辑镜像。
// 与 lib/client.js 内的实现保持同样的判定规则，但刻意不碰 DOM：
// 这样在没有浏览器的环境里也能覆盖「语言快照清洗」「导航下标定位」「收起态判定」等易错分支。
// 修改这里时请同步修改 lib/client.js 中对应的函数，二者必须给出相同结果。

/**
 * 清洗 locale 快照：只保留 id 与原生名都非空的条目，并保持官方给出的顺序。
 * @param {{ active?: unknown, locales?: unknown }} snapshot
 * @returns {{ active: string, options: Array<{ id: string, label: string }> }}
 */
export function localeState(snapshot) {
	const empty = { active: '', options: [] };
	if (!snapshot || typeof snapshot !== 'object') return empty;
	const list = Array.isArray(snapshot.locales) ? snapshot.locales : [];
	const options = list
		.filter(item => item && typeof item.id === 'string' && item.id && typeof item.label === 'string' && item.label)
		.map(item => ({ id: item.id, label: item.label }));
	const active = typeof snapshot.active === 'string' ? snapshot.active : '';
	return { active, options };
}

/**
 * 取某个语言的展示名（原生名）。
 * @param {Array<{ id: string, label: string }>} options
 * @param {string} id
 * @returns {string}
 */
export function localeLabel(options, id) {
	if (!Array.isArray(options)) return '';
	for (const option of options) if (option && option.id === id) return option.label;
	return '';
}

/**
 * 按 order 升序（相同 order 保持注册顺序）排列设置分区，返回目标分区的下标。
 * 官方设置面板的导航按钮就是这个顺序，插件需要靠它点到「通用设置」。
 * @param {Array<{ id?: unknown, order?: unknown, index?: number }>} sections
 * @param {string} id
 * @returns {number} 找不到时返回 -1
 */
export function navIndex(sections, id) {
	if (!Array.isArray(sections)) return -1;
	const rows = sections
		.map((entry, index) => {
			const options = entry && entry.options ? entry.options : entry || {};
			const rowId = typeof options.id === 'string' ? options.id : '';
			const order = typeof options.order === 'number' ? options.order : Number.POSITIVE_INFINITY;
			return rowId ? { id: rowId, order, index: typeof options.index === 'number' ? options.index : index } : null;
		})
		.filter(Boolean)
		.sort((a, b) => (a.order === b.order ? a.index - b.index : a.order - b.order));
	return rows.findIndex(row => row.id === id);
}

/**
 * 侧栏是否处于收起态：官方账户行用 data-collapsed="true" 标记。
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
export function isCollapsed(value) {
	return value === 'true';
}
