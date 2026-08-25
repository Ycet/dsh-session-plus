# dsh-session-plus

会话增强插件：会话头部「打开工作区」一键直达 + 模型选择菜单顶部展示当前提供商，聊天体验再进一步。

[![中文](https://img.shields.io/badge/简体中文-red?style=for-the-badge)](README.md)
[![EN](https://img.shields.io/badge/English-blue?style=for-the-badge)](README_en.md)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![DSH](https://img.shields.io/badge/DSH-0.1.1--rc.2-blue?style=for-the-badge)

> 本插件由 `dsh-open-workspace`（打开工作区）与 `dsh-model-provider-header`（模型提供商头部）合并更名而来，两个功能合二为一。

## ✨ 功能

### 1️⃣ 打开工作区

| 特性 | 说明 |
|---|---|
| 一键打开工作区 | 聊天界面右上角新增图标按钮，位于 Session log 下载按钮左侧 |
| 平台自适应图标 | macOS 显示 Finder 图标、Windows / Linux 显示文件夹图标（纯图标、无文字）；图标为插件包内资产，随安装分发并由 host 提供 |
| 平台原生支持 | macOS `open` · Windows `explorer` · Linux `xdg-open` 兜底 |
| 正确的工作区口径 | 解析当前会话的 `session.header.cwd`（与会话 bash 工作目录完全一致） |
| 结果反馈 | 右下角 toast：仅在失败时说明原因（成功打开不打扰，样式与 dsh-my-plugins 一致） |
| 安全防护 | host API 仅接受回环/受信主机 + 同源请求；浏览器只传 sessionId，路径由服务端解析 |

### 2️⃣ 模型提供商头部

| 特性 | 说明 |
|---|---|
| 菜单头部展示 | 在模型选择菜单最上方注入「提供商：xxx」说明行，一眼看清当前请求走哪家 |
| 显示名优先 | 使用模型目录中的提供商显示名（与菜单内分组标题一致），目录缺失时回退原始 provider id |
| 实时跟随 | 菜单打开期间订阅会话模型目录，切换模型/提供商后头部即时更新 |
| 空态占位 | 目录尚未加载出选中时显示「—」，加载完成后自动变为提供商名 |
| 双语文案 | 随界面语言自动切换（中文 / English） |
| 只读无侵扰 | 纯展示、不可交互、不可聚焦，不触碰自带菜单的行为与样式；`/model` 弹出选择器保持原样 |

## 🚀 快速开始

### 1. 安装

```bash
cd <absolute-path-to-plugin> && pnpm install
dsh plugin --profile web add dsh-session-plus@link:<absolute-path-to-plugin>
```

### 2. 重启并验证

安装的是 bundle 层插件，需重启 `dsh web` 后生效：

```bash
# 终端 Ctrl+C 停止后重新启动
npm exec @deepseek-ai/dsh web
```

重启后打开任意会话：右上角出现「打开工作区」图标按钮（Session log 按钮左侧）；点击输入框模型选择按钮，菜单顶部显示当前提供商。

## 📖 使用说明

### 打开工作区

- **按钮位置**：会话页头部右上角工具区，紧邻 Session log 下载按钮的左侧。
- **图标语义**：macOS 显示访达风格图标；Windows / Linux 显示文件夹图标。
- **成功**：不弹出提示——访达 / 文件资源管理器已打开即视为反馈。
- **失败**：右下角红色提示并说明原因（会话不存在、会话无工作区记录、工作区目录已被删除、命令失败等）。
- **防抖**：请求进行中按钮禁用，避免重复弹出多个文件管理器窗口。

### 模型提供商头部

- **位置**：模型选择菜单最顶端（菜单开启即出现）。
- **内容**：`提供商：<显示名>`；目录缺失该提供商时显示原始 id；未加载出选中时显示「—」。
- **实时性**：打开期间切换模型/提供商，头部立即刷新；关闭菜单即消失，下次开启重新注入。
- **不影响**：模型列表滚动、推理等级、键盘导航均不受影响；`/model` 弹出选择器无注入。

### 支持范围

- DSH：`0.1.1-rc.2`（当前 web profile）
- 平台：macOS / Windows（Linux 通过 `xdg-open` 兜底）
- 浏览器：本机现代 Chrome / Safari / Edge（浏览器与 `dsh web` 需在同一台机器上）

### 升级 / 回滚

- 升级：client 层改动刷新页面或 HMR 即生效；bundle / host 层改动需重启 `dsh web`。
- 回滚：

```bash
dsh plugin --profile web remove dsh-session-plus
# 重启 dsh web 完成卸载
```

## 🧪 测试

```bash
npm test
```

- host 侧纯函数单元测试：平台命令映射、请求信任校验、工作区路径解析、Windows 退出码容错。
- 提供商名解析测试：显示名优先 / 缺失回退原始 id / 空态占位符 / 空分组与空名称容错。

## 🗂 项目结构

```text
dsh-session-plus/
├── lib/
│   ├── client.js   # 浏览器半区：按钮 + toast + 模型菜单提供商头部（单 bundle）
│   ├── index.js    # host 半区：/session-plus/api 打开工作区 API + 资产路由
│   └── label.js    # 提供商名解析纯函数（可单测）
├── assets/icons/   # finder.png / folder.svg 平台图标
├── test/           # index.test.mjs（host） + label.test.mjs（纯函数）
├── cordis.patch.yml
└── package.json
```

## 📄 许可证

[MIT](LICENSE)