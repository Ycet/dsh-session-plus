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
