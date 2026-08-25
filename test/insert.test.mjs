// dsh-session-plus — 选中文本开头插入代码块纯函数单测（node --test）
import { test } from "node:test";
import assert from "node:assert/strict";
import { codeFence, prependCodeBlock } from "../lib/insert.js";

test("codeFence：无反引号时返回三个反引号", () => {
	assert.equal(codeFence("hello"), "```");
	assert.equal(codeFence(""), "```");
});

test("codeFence：文本含三个反引号时升级为四个", () => {
	assert.equal(codeFence("a ``` b"), "````");
});

test("codeFence：按最长连续反引号串加一", () => {
	assert.equal(codeFence("``````"), "`".repeat(7));
	assert.equal(codeFence("` `` `` `"), "```");
});

test("prependCodeBlock：空草稿直接返回代码块", () => {
	assert.equal(prependCodeBlock("", "hello"), "```\nhello\n```");
	assert.equal(prependCodeBlock(undefined, "hello"), "```\nhello\n```");
	assert.equal(prependCodeBlock(null, "hello"), "```\nhello\n```");
});

test("prependCodeBlock：已有草稿时块在前、空行分隔、原文保留在后", () => {
	assert.equal(prependCodeBlock("existing", "hello"), "```\nhello\n```\n\nexisting");
	assert.equal(prependCodeBlock("第一行\n第二行", "X"), "```\nX\n```\n\n第一行\n第二行");
});

test("prependCodeBlock：多行选中文本原样保留", () => {
	assert.equal(prependCodeBlock("", "a\nb\nc"), "```\na\nb\nc\n```");
});

test("prependCodeBlock：含围栏的文本使用更长围栏且渲染不破裂", () => {
	assert.equal(prependCodeBlock("", "a ``` b"), "````\na ``` b\n````");
	assert.equal(prependCodeBlock("rest", "a ``` b"), "````\na ``` b\n````\n\nrest");
});

test("prependCodeBlock：文本末尾紧跟换行时闭合围栏仍独立成行", () => {
	assert.equal(prependCodeBlock("", "abc\n"), "```\nabc\n\n```");
});