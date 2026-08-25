// dsh-model-provider-header — 提供商名解析纯函数单测（node --test）
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProviderLabel } from "../lib/label.js";

test("目录显示名优先：命中 groups 中的组时返回其 name", () => {
  const groups = [
    { id: "deepseek", name: "DeepSeek", models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }] },
    { id: "openai", name: "OpenAI", models: [] },
  ];
  assert.equal(resolveProviderLabel({ provider: "deepseek", model: "deepseek-chat" }, groups), "DeepSeek");
  assert.equal(resolveProviderLabel({ provider: "openai", model: "gpt-4o" }, groups), "OpenAI");
});

test("目录缺失回退原始 provider id（routable 但未广告的组）", () => {
  const groups = [{ id: "deepseek", name: "DeepSeek", models: [] }];
  assert.equal(resolveProviderLabel({ provider: "my-custom-route", model: "x" }, groups), "my-custom-route");
});

test("current 为 null 时返回占位符 —", () => {
  assert.equal(resolveProviderLabel(null, [{ id: "deepseek", name: "DeepSeek", models: [] }]), "—");
});

test("current 缺失 provider 字段时返回占位符 —", () => {
  assert.equal(resolveProviderLabel({ model: "x" }, []), "—");
  assert.equal(resolveProviderLabel(undefined, undefined), "—");
});

test("groups 未提供或为空时回退原始 provider id", () => {
  assert.equal(resolveProviderLabel({ provider: "deepseek", model: "x" }, undefined), "deepseek");
  assert.equal(resolveProviderLabel({ provider: "deepseek", model: "x" }, []), "deepseek");
});

test("组名称为空字符串时视为缺失，回退原始 id", () => {
  assert.equal(resolveProviderLabel({ provider: "deepseek", model: "x" }, [{ id: "deepseek", name: "", models: [] }]), "deepseek");
});