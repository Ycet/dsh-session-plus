// dsh-session-plus — 纯函数：选中文本 → 开头插入代码块的草稿拼接。
//
// 供 Node 单测（test/insert.test.mjs）使用。浏览器半区（lib/client.js）中
// 内联了同一实现的镜像（ModuleLoader bundle 自包含、不支持包内 import）；
// 修改本文件时请同步修改 client.js 中的 codeFence / prependCodeBlock，
// 保持一致。
//
// 决策（阶段二已确认 + 后续修正）：
//   1. 代码块必须置于输入框开头；输入框已有内容时也置于开头；
//   3. 代码块后空一行再接原有内容；
//   4. 无语言标注（裸围栏）；
//   7.（修正）围栏一律为三个反引号 "```"——产品要求只展示 ```，绝不显示 ```` 等更长围栏；
//      选中文本内含 ``` 时可能影响该代码块自身的 markdown 渲染，属已知限制；
//   8. 不限制长度。

/**
 * 代码块围栏：固定返回三个反引号（产品要求，不随文本内容升级围栏长度）。
 * @returns {string} 恒为 "```"
 */
export function codeFence() {
	return "```";
}

/**
 * 把选中文本拼成“置于开头”的完整草稿：
 *   围栏\n文本\n围栏[ \n\n + 原有草稿 ]
 * @param {string} draft 当前草稿（空串/undefined 视为无内容）
 * @param {string} text 选中的原文
 * @returns {string} 新草稿
 */
export function prependCodeBlock(draft, text) {
	const fence = codeFence();
	const block = `${fence}\n${text}\n${fence}`;
	if (draft === undefined || draft === null || draft === "") return block;
	return `${block}\n\n${draft}`;
}