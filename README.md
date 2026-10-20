# OpenClaw Sender 浏览器扩展

[English](README.en.md) | 中文

把网页内容一键发送给本地 [OpenClaw](https://github.com/openclaw/openclaw) 网关处理：抓取正文 → 弹窗选择常用工具 / 模型 / 提示词 → 流式回复，支持多轮对话。

## 功能

- **抓取网页**：点工具栏图标或右键菜单（`发送整个页面` / `发送选中内容`），自动提取正文（article/main/正文容器等选择器，最多 8000 字）
- **常用工具**：自由提问 / 总结全文 / 提炼要点 / 翻译中英 / 提取关键词 / 代码审查，点一下自动填好提示词，可再修改
- **模型对话**：下拉框实时拉取网关模型列表，支持 `openclaw/main`（主会话）、`openclaw/chat`、`openclaw/kimi` 等
- **提示词输入**：自定义指令，留空则用工具模板
- **流式回复**：回复逐字显示，支持在同一窗口继续追问，一键复制
- **设置**：弹窗右上角 ⚙️ 可改网关地址和 token（存 chrome.storage.local）

## 安装

1. 本地运行 OpenClaw 网关（默认 `http://localhost:18789`）
2. 复制 `config.example.js` 为 `config.js`，把 `DEFAULT_TOKEN` 换成你的网关 token（config.js 已被 .gitignore 忽略，不会误提交）
3. 打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择本文件夹
4. 重新加载/更新扩展后，点击卡片上的 ↻ 刷新让新代码生效

## 目录结构

```
openclaw-sender/
├── manifest.json     # MV3 清单
├── background.js     # 右键菜单、抓取、流式网关请求（service worker）
├── dialog.html/js    # 发送对话框窗口
├── config.js         # 本机配置（不入库）
├── config.example.js # 配置模板
├── icon.png
└── legacy/
    └── openclaw-bridge/   # 旧版插件（已废弃，仅存档）
```

## 常见问题与修复记录

| 问题 | 原因 | 修复 |
|---|---|---|
| `Invalid model` | 网关 OpenAI 兼容接口只认 `openclaw` / `openclaw/<agentId>`，不能写 `moonshot/kimi-k2.6` 这种 provider/model | 模型名统一用 `openclaw/<agentId>` |
| `String contains non ISO-8859-1 code point` | token 被截断显示成 `2ebf43…e27a`，中间的 `…` 是真实字符，HTTP 头不允许非拉丁字符 | 用完整 48 位 token；代码加自愈：非法 token（非纯十六进制）一律忽略并回退默认值，更新时自动清理 |
| `HTTP 429 TPD rate limit` | Moonshot（Kimi）API 每日 token 额度用尽 | 换 `openclaw/chat`（deepseek 独立额度）或等次日重置；注意每次请求约消耗 1 万 token（agent 自带上下文） |
| 右键发送无反馈 | manifest 缺 `notifications` 权限 | 已补权限 |
| 更新后右键菜单报错 | `onInstalled` 每次更新触发，重复 `contextMenus.create` 抛 duplicate id | 先 `removeAll` 再创建 |
| 弹窗选中内容按钮永远禁用 | 弹窗打开瞬间页面选中已丢失 | 改为点击时通过 `executeScript` 实时读取 |

## 技术说明

- MV3 service worker；`activeTab` + `scripting` 按需注入提取逻辑，不常驻 content script
- 流式请求走 `chrome.runtime.connect` port 通道，失败自动回退非流式
- 页面内容暂存用 `chrome.storage.session`（浏览器关闭即清）

## License

[MIT](LICENSE) © 2026 litterburger
