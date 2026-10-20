# OpenClaw Sender Browser Extension

English | [中文](README.md)

Send web page content to your local [OpenClaw](https://github.com/openclaw/openclaw) gateway in one click: extract the main text → pick a tool / model / prompt in a popup → get a streamed reply, with multi-turn conversation support.

## Features

- **Page capture**: click the toolbar icon or use the context menu (`发送整个页面` "Send whole page" / `发送选中内容` "Send selection"); the main text is extracted automatically (article/main/content-container selectors, up to 8000 characters)
- **Quick tools**: Free question / Summarize / Key points / Translate CN↔EN / Extract keywords / Code review — one click fills in the prompt, which you can still edit
- **Model chat**: the dropdown fetches the gateway's model list live; supports `openclaw/main` (main session), `openclaw/chat`, `openclaw/kimi`, etc.
- **Prompt input**: custom instructions; leave empty to use the tool template
- **Streaming replies**: replies appear token by token; keep asking follow-ups in the same window; one-click copy
- **Settings**: the ⚙️ in the popup's top-right lets you change the gateway URL and token (stored in chrome.storage.local)

## Install

1. Run the OpenClaw gateway locally (default `http://localhost:18789`)
2. Copy `config.example.js` to `config.js` and replace `DEFAULT_TOKEN` with your gateway token (config.js is git-ignored and won't be committed by accident)
3. Open `chrome://extensions` → enable "Developer mode" → "Load unpacked" → select this folder
4. After reloading/updating the extension, click ↻ on its card so the new code takes effect

## Layout

```
openclaw-sender/
├── manifest.json     # MV3 manifest
├── background.js     # context menu, capture, streaming gateway requests (service worker)
├── dialog.html/js    # send dialog window
├── config.js         # local config (not committed)
├── config.example.js # config template
├── icon.png
└── legacy/
    └── openclaw-bridge/   # old extension (deprecated, archived only)
```

## Troubleshooting log

| Problem | Cause | Fix |
|---|---|---|
| `Invalid model` | The gateway's OpenAI-compatible API only accepts `openclaw` / `openclaw/<agentId>`, not provider/model names like `moonshot/kimi-k2.6` | Always use `openclaw/<agentId>` as the model name |
| `String contains non ISO-8859-1 code point` | The token was copied in truncated form like `2ebf43…e27a`; the `…` is a real character and HTTP headers don't allow non-Latin characters | Use the full 48-character token; the code now self-heals: invalid tokens (not pure hex) are ignored and fall back to the default, and are cleaned up on update |
| `HTTP 429 TPD rate limit` | Moonshot (Kimi) API daily token quota exhausted | Switch to `openclaw/chat` (separate deepseek quota) or wait for the next-day reset; note each request uses ~10k tokens (agent context included) |
| No feedback after context-menu send | manifest lacked the `notifications` permission | Permission added |
| Context menu error after update | `onInstalled` fires on every update and repeated `contextMenus.create` throws duplicate id | `removeAll` before creating |
| "Selection" button in popup always disabled | The page selection is lost the moment the popup opens | Read it live via `executeScript` on click |

## Technical notes

- MV3 service worker; `activeTab` + `scripting` inject extraction logic on demand, no persistent content script
- Streaming requests use a `chrome.runtime.connect` port channel and fall back to non-streaming on failure
- Page content is staged in `chrome.storage.session` (cleared when the browser closes)

## License

[MIT](LICENSE) © 2026 litterburger
