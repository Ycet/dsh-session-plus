// dsh-session-plus — 选中文本开头插入代码块纯函数单测（node --test）
import { test } from "node:test";
import assert from "node:assert/strict";
import { codeFence, prependCodeBlock } from "../lib/insert.js";

test("codeFence：恒为三个反引号（产品要求，不随文本升级）", () => {
	assert.equal(codeFence(), "```");
	assert.equal(codeFence("hello"), "```");
	assert.equal(codeFence("a ``` b"), "```");
	assert.equal(codeFence("``````"), "```");
});

test("prependCodeBlock：空草稿返回代码块且末尾留空行", () => {
	assert.equal(prependCodeBlock("", "hello"), "```\nhello\n```\n");
	assert.equal(prependCodeBlock(undefined, "hello"), "```\nhello\n```\n");
	assert.equal(prependCodeBlock(null, "hello"), "```\nhello\n```\n");
});

test("prependCodeBlock：已有草稿时块在前、空行分隔、原文保留在后、整体末尾留空行", () => {
	assert.equal(prependCodeBlock("existing", "hello"), "```\nhello\n```\n\nexisting\n");
	assert.equal(prependCodeBlock("第一行\n第二行", "X"), "```\nX\n```\n\n第一行\n第二行\n");
});

test("prependCodeBlock：多行选中文本原样保留", () => {
	assert.equal(prependCodeBlock("", "a\nb\nc"), "```\na\nb\nc\n```\n");
});

test("prependCodeBlock：含围栏的文本仍用三个反引号（渲染可能受影响，属已知限制）", () => {
	assert.equal(prependCodeBlock("", "a ``` b"), "```\na ``` b\n```\n");
	assert.equal(prependCodeBlock("rest", "a ``` b"), "```\na ``` b\n```\n\nrest\n");
});

test("prependCodeBlock：文本末尾紧跟换行时闭合围栏仍独立成行，末尾留空行", () => {
	assert.equal(prependCodeBlock("", "abc\n"), "```\nabc\n\n```\n");
});

test("prependCodeBlock：原有草稿已以换行结尾时不重复追加", () => {
	assert.equal(prependCodeBlock("existing\n", "X"), "```\nX\n```\n\nexisting\n");
});