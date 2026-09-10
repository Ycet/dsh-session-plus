// dsh-session-plus — host half（最小宿主行）
//
// 本插件的全部能力都在浏览器半区（lib/client.js）：模型选择菜单的「提供商」头部、
// 选中文本 → 添加至对话。宿主侧没有任何行为，但这个空 apply 必须保留：
//
//   dsh-client-modules 只从「宿主 Loader entries 中声明了 dsh.client、entry.fiber
//   存在且未被 disabled」的包发现并组装浏览器半区 —— 见其 processOne 的跳过分支
//   `entry.fiber === void 0 || entry.disabled`。删除本文件、或让这一行 disabled /
//   无法成 fiber，都会让上述两项功能一起静默失效。
//
// 上游 @deepseek-ai/dsh-client-ui-open-in-app 的 node 半边同样是空 apply，
// 原因相同：空 apply 让插件出现在宿主侧的插件名册上，浏览器半区则由 package.json
// 的 dsh.client 声明被扫描组装。
//
// 历史：v0.3.x 的「打开工作区」功能（原生命令执行 API + 图标资产路由 + 平台图标）
// 已于 v0.4.0 随功能移除一并删除；该能力现由 DSH 内置的 Open In… 提供。
export const name = "dsh-session-plus";

/** 宿主插件体：本表面插件无宿主侧行为。 */
export function apply() {}
