# NOTICE

本仓库的部分代码包含第三方作品。以下声明按各自许可证要求保留。

---

## dsh-codex-effort-slider

- **来源**：npm 包 `dsh-codex-effort-slider`，版本 `1.1.3`
- **使用位置**：`lib/client.js` 中标注为 `vendor: dsh-codex-effort-slider 1.1.3 (MIT)` 的段落，以及据此改写而来的 `test/helpers/effort-harness.mjs`（离线测试台）与 `test/effort-slider.test.mjs`
- **改动说明**：按本仓库的迁移决策做了最小改造——动画固定为上游的「完整」档、刻度点固定为「亮白显示已到达档位」；删除上游的右键设置面板、浏览器本地存储设置与逐帧诊断；文案改由本仓库的 zh/en 词典解析；样式并入本插件统一的 `<style>` 标签。其余行为与上游一致。
- **许可证**：MIT

```text
MIT License

Copyright (c) 2026 dsh-codex-effort-slider contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## @deepseek-ai/dsh-client-ui-open-in-app（DeepSeek Harness）

- **来源**：DeepSeek Harness 官方客户端包 `@deepseek-ai/dsh-client-ui-open-in-app`（宿主侧路由实现在 `@deepseek-ai/dsh-host-open-in-app`），随 DSH 桌面版 `0.2.1-rc.3` 核对
- **使用位置**：`lib/client.js` 中「功能 5：新建会话页『在应用中打开』按钮」一节，以及 `test/open-in-app.test.mjs` / `test/session-plus-v070-browser.test.mjs` 相关用例
- **使用方式**：**未复制其源代码**。本仓库只是
  1. 镜像其分体按钮的视觉参数（`.5px` 边框、`--dsw-radius-sm`、24px 高、图标 13px、箭头分隔线），
  2. 镜像其按钮文案（`open.title` / `path.more` / `path.appDefault` / `path.appsError` / `path.openError`）与 34 个应用显示名，
  3. 复用其宿主 HTTP 路由契约（`GET /open-in-app/apps`、`GET /open-in-app/icon/<id>`、`POST /open-in-app/open`），
  4. 只读继承其浏览器偏好键 `dsh.open-in-app.choice` 作为默认应用初值（不改写）。
- **许可证**：MIT

```text
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## @deepseek-ai/dsh-client-ui-primitives（DeepSeek Harness）

- **来源**：DeepSeek Harness 官方客户端原语包 `@deepseek-ai/dsh-client-ui-primitives`，随 DSH 桌面版 `0.2.1-rc.3` 核对
- **使用位置**：`lib/client.js` 中「功能 6：通用设置开关」的 `FeatureToggleRow`（v0.7.1 起），以及 `test/session-plus-v070-browser.test.mjs` 的样式比对用例
- **使用方式**：**运行时直接 `require` 官方原语并渲染其 `Switch` 组件**（与官方「在使用官方模型 API 时上传 Session Log」行同一个组件、同一份 CSS），未复制其源代码；仅在原语不可用的旧运行时退回自绘开关，该兜底样式的几何与 token 参考官方 `Switch.module.css`（36×20 轨道、16px 圆形滑块、`corner-shape:round`）。
- **许可证**：MIT（文本同上，Copyright (c) 2026 DeepSeek）
