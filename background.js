// OpenClaw Sender - background service worker
importScripts('config.js');

const PENDING_KEY = 'pendingPayload';
let dialogWindowId = null;

// 监听对话窗口被关闭，释放 windowId
chrome.windows.onRemoved.addListener((id) => {
  if (id === dialogWindowId) dialogWindowId = null;
});

// ---------- 右键菜单 ----------
chrome.runtime.onInstalled.addListener(() => {
  // 自愈：清掉存过的非法 token（旧版截断 token 含省略号字符，会导致 fetch 报错）
  chrome.storage.local.get(['token']).then(({ token }) => {
    if (token && !isValidToken(token.trim())) chrome.storage.local.remove('token');
  });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'sendPage', title: '发送整个页面到 OpenClaw', contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'sendSelection', title: '发送选中内容到 OpenClaw', contexts: ['selection']
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'sendPage') {
      await openDialogForPage(tab);
    } else if (info.menuItemId === 'sendSelection') {
      await openDialog({
        mode: 'selection',
        title: (tab && tab.title) || '',
        url: (tab && tab.url) || '',
        content: info.selectionText || ''
      });
    }
  } catch (e) {
    notify('❌ 打开对话框失败', e.message);
  }
});

// ---------- 工具栏图标 ----------
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await openDialogForPage(tab);
  } catch (e) {
    notify('❌ 打开对话框失败', e.message);
  }
});

async function openDialogForPage(tab) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPage
    });
    await openDialog({ mode: 'page', ...((res && res.result) || {}) });
  } catch (e) {
    // 受限页面（chrome:// 等）提取失败，仍然打开对话框，可手动粘贴内容
    await openDialog({
      mode: 'page',
      title: (tab && tab.title) || '',
      url: (tab && tab.url) || '',
      content: '',
      extractError: e.message
    });
  }
}

// 在目标页面里执行的正文提取逻辑（会序列化注入）
function extractPage() {
  const title = document.title || '';
  const url = location.href;
  const selectors = ['article', '[role="main"]', '.post-content', '.entry-content', '.article-content', '#content', 'main', '.content'];
  let content = '';
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el && el.innerText.trim()) { content = el.innerText.trim(); break; }
  }
  if (!content) {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script,style,nav,header,footer,aside,iframe,form').forEach((el) => el.remove());
    content = clone.innerText.trim();
  }
  if (content.length > 8000) content = content.slice(0, 8000) + '\n\n[内容已截断，仅截取前8000字]';
  return { title, url, content };
}

// ---------- 打开发送对话框窗口 ----------
async function openDialog(payload) {
  await chrome.storage.session.set({ [PENDING_KEY]: payload });

  // 已有一个对话框就关掉，避免堆叠
  if (dialogWindowId != null) {
    try { await chrome.windows.remove(dialogWindowId); } catch (e) { /* 已关闭 */ }
    dialogWindowId = null;
  }

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('dialog.html'),
    type: 'popup',
    width: 500,
    height: 740,
    focused: true
  });
  dialogWindowId = win.id;
}

// ---------- 对话框读取暂存内容 ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getPayload') {
    chrome.storage.session.get(PENDING_KEY).then((d) => sendResponse(d[PENDING_KEY] || null));
    return true; // 异步响应
  }
});

// ---------- 流式对话（对话框通过 port 连接） ----------
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'chat') return;

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'send') return;
    const { model, messages } = msg;
    try {
      const { gatewayUrl, token } = await getSettings();
      const result = await streamChat(gatewayUrl, token, model, messages,
        (delta) => port.postMessage({ type: 'delta', text: delta }));

      if (result === 'fallback') {
        // 流式失败 → 退回非流式一次性请求
        const reply = await chatOnce(gatewayUrl, token, model, messages);
        port.postMessage({ type: 'done', text: reply });
      } else if (result === true) {
        port.postMessage({ type: 'done' });
      }
    } catch (e) {
      console.error('OpenClaw Sender error:', e);
      port.postMessage({ type: 'error', message: e.message });
    }
  });
});

async function getSettings() {
  const { gatewayUrl, token } = await chrome.storage.local.get(['gatewayUrl', 'token']);
  return {
    gatewayUrl: (gatewayUrl && gatewayUrl.trim()) || CONFIG.GATEWAY_URL,
    token: isValidToken((token && token.trim()) || '') ? token.trim() : CONFIG.DEFAULT_TOKEN
  };
}

// token 必须是纯十六进制；否则视为非法，一律退回默认值（防止旧版截断 token 污染）
function isValidToken(t) {
  return typeof t === 'string' && /^[0-9a-fA-F]+$/.test(t);
}

async function streamChat(base, token, model, messages, onDelta) {
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ model, messages, stream: true })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status >= 400 && response.status < 500) return 'fallback'; // 可能是模型不支持流式
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  if (!response.body) return 'fallback';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let gotContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (delta) { gotContent = true; onDelta(delta); }
      } catch (e) { /* 忽略无法解析的行 */ }
    }
  }
  return gotContent ? true : 'fallback';
}

async function chatOnce(base, token, model, messages) {
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ model, messages, stream: false })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const j = await response.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title,
    message
  });
}
