// dsh-model-provider-header — 纯函数：把会话模型目录快照解析为头部要显示的提供商名。
//
// 供 Node 单测（test/label.test.mjs）使用。浏览器半区（lib/client.js）中
// 内联了同一实现的镜像（ModuleLoader bundle 自包含、不支持包内 import）；
// 修改本文件时请同步修改 client.js 中的 resolveProviderLabel，保持一致。
//
// 显示策略（需求决策 #3/#8）：
//   1. current 为 null（目录尚未加载出选中）→ 占位符 "—"
//   2. groups 中 id === current.provider 的组 → 使用其显示名 group.name
//   3. 否则（目录缺失该提供商，如 routable 但未广告）→ 回退原始 provider id

/** @param {unknown} current 会话当前选中（ModelSelection | null）
 *  @param {unknown} groups 已加载的提供商分组（ModelProviderGroup[]）
 *  @returns {string} 头部要展示的提供商名称 */
export function resolveProviderLabel(current, groups) {
  if (current === null || current === undefined || typeof current.provider !== "string") {
    return "—";
  }
  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (
        group !== null &&
        typeof group === "object" &&
        group.id === current.provider &&
        typeof group.name === "string" &&
        group.name.length > 0
      ) {
        return group.name;
      }
    }
  }
  return current.provider;
}