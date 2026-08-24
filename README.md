# dsh-open-workspace

DSH 会话头部「打开工作区」按钮：在访达（macOS）或文件资源管理器（Windows）中一键打开当前会话的工作区根目录。

[![中文](https://img.shields.io/badge/简体中文-red?style=for-the-badge)](README.md)
[![EN](https://img.shields.io/badge/English-blue?style=for-the-badge)](README_en.md)

![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)

## ✨ 功能

| 特性 | 说明 |
|---|---|
| 一键打开工作区 | 聊天界面右上角新增图标按钮，位于 Session log 下载按钮左侧 |
| 平台自适应图标 | macOS 显示 Finder 图标、Windows / Linux 显示文件夹图标（纯图标、无文字）；图标为插件包内资产，随安装分发并由 host 提供 |
| 平台原生支持 | macOS `open` · Windows `explorer` · Linux `xdg-open` 兜底 |
| 正确的工作区口径 | 解析当前会话的 `session.header.cwd`（与会话 bash 工作目录完全一致） |
| 结果反馈 | 右下角 toast：仅在失败时说明原因（成功打开不打扰，样式与 dsh-my-plugins 一致） |
| 安全防护 | host API 仅接受回环/受信主机 + 同源请求；浏览器只传 sessionId，路径由服务端解析 |

## 🚀 快速开始

### 1. 安装

```bash
cd <absolute-path-to-plugin> && pnpm install
dsh plugin --profile web add dsh-open-workspace@link:<absolute-path-to-plugin>
```

### 2. 重启并验证

安装的是 bundle 层插件，需重启 `dsh web` 后生效：

```bash
# 终端 Ctrl+C 停止后重新启动
npm exec @deepseek-ai/dsh web
```

重启后打开任意会话：右上角出现图标按钮（在 **Session log** 按钮左侧），点击即在访达 / 文件资源管理器中打开该会话的工作区根目录。

## 📖 使用说明

- **按钮位置**：会话页头部右上角工具区，紧邻 Session log 下载按钮的左侧。
- **图标语义**：macOS 显示访达风格图标；Windows / Linux 显示文件夹图标。
- **成功**：不弹出提示——访达 / 文件资源管理器已打开即视为反馈。
- **失败**：右下角红色提示并说明原因（会话不存在、会话无工作区记录、工作区目录已被删除、命令失败等）。
- **防抖**：请求进行中按钮禁用，避免重复弹出多个文件管理器窗口。

### 支持范围

- DSH：`0.1.1-rc.2`（当前 web profile）
- 平台：macOS / Windows（Linux 通过 `xdg-open` 兜底）
- 浏览器：本机现代 Chrome / Safari / Edge（浏览器与 `dsh web` 需在同一台机器上）

### 升级 / 回滚

- 升级：client 层改动刷新页面或 HMR 即生效；bundle / host 层改动需重启 `dsh web`。
- 回滚：

```bash
dsh plugin --profile web remove dsh-open-workspace
# 重启 dsh web 完成卸载
```

## 🧪 测试

```bash
npm test
```

host 侧纯函数单元测试（平台命令映射、请求信任校验、工作区路径解析、Windows 退出码容错）。

## 📄 许可证

[MIT](LICENSE)