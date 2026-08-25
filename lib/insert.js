// dsh-session-plus — 纯函数：选中文本 → 开头插入代码块的草稿拼接。
//
// 供 Node 单测（test/insert.test.mjs）使用。浏览器半区（lib/client.js）中
// 内联了同一实现的镜像（ModuleLoader bundle 自包含、不支持包内 import）；
// 修改本文件时请同步修改 client.js 中的 codeFence / prependCodeBlock，
// 保持一致。
//
// 决策（阶段二已确认）：
//   1. 代码块必须置于输入框开头；输入框已有内容时也置于开头；
//   3. 代码块后空一行再接原有内容；
//   4. 无语言标注（裸围栏）；
//   7. 选中文本含反引号围栏时自动换用更长围栏，保证 markdown 不破裂；
//   8. 不限制长度。

/**
 * 计算代码块围栏：长度必须大于文本内任意连续反引号串，最少 3 个。
 * @param {string} text 选中的原文
 * @returns {string} 围栏字符串（如 "```" 或 "````"）
 */
export function codeFence(text) {
	const runs = String(text).match(/`+/g) ?? [];
	let maxRun = 0;
	for (const run of runs) {
		if (run.length > maxRun) maxRun = run.length;
	}
	return "`".repeat(Math.max(3, maxRun + 1));
}

/**
 * 把选中文本拼成“置于开头”的完整草稿：
 *   围栏\n文本\n围栏[ \n\n + 原有草稿 ]
 * @param {string} draft 当前草稿（空串/undefined 视为无内容）
 * @param {string} text 选中的原文
 * @returns {string} 新草稿
 */
export function prependCodeBlock(draft, text) {
	const fence = codeFence(text);
	const block = `${fence}\n${text}\n${fence}`;
	if (draft === undefined || draft === null || draft === "") return block;
	return `${block}\n\n${draft}`;
}