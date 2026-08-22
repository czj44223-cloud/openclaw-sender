// OpenClaw Bridge - background service worker
const GATEWAY_URL = 'http://localhost:18789';
const GATEWAY_TOKEN = 'YOUR_GATEWAY_TOKEN';
// 网关的 OpenAI 兼容接口只接受 "openclaw" 或 "openclaw/<agentId>"，不能直接写 provider/model。
// openclaw/kimi => kimi agent（配置的是 moonshot/kimi-k2.6）
const MODEL = 'openclaw/kimi';

// Create context menu on install/update
chrome.runtime.onInstalled.addListener(() => {
  // 先清空旧菜单，否则扩展更新时重复 create 会抛 "duplicate id" 错误
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'sendToOpenClaw',
      title: '发送选中内容到 OpenClaw',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'sendPageToOpenClaw',
      title: '发送整个页面到 OpenClaw',
      contexts: ['page']
    });
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'sendToOpenClaw') {
      await sendToOpenClaw({
        type: 'selection',
        content: info.selectionText,
        url: tab.url,
        title: tab.title
      });
    } else if (info.menuItemId === 'sendPageToOpenClaw') {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractPage' });
      if (response) {
        await sendToOpenClaw({ type: 'page', ...response });
      } else {
        notify('发送失败', '无法提取页面内容（受限页面或扩展未注入）');
      }
    }
  } catch (error) {
    console.error('OpenClaw Bridge error:', error);
    notify('发送失败', error.message);
  }
});

// Send data to OpenClaw Gateway
async function sendToOpenClaw(data) {
  const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GATEWAY_TOKEN}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant. The user has sent you content from a webpage. Analyze and respond to it.'
        },
        {
          role: 'user',
          content: formatContent(data)
        }
      ],
      stream: false
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${response.statusText} ${detail.slice(0, 200)}`);
  }

  const result = await response.json();
  console.log('OpenClaw response:', result);

  const reply = result.choices?.[0]?.message?.content?.trim();
  notify('✅ 已发送到 OpenClaw', reply ? `回复：${reply.slice(0, 200)}` : '内容已发送，请查看 OpenClaw 对话');
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title,
    message
  });
}

function formatContent(data) {
  if (data.type === 'selection') {
    return `用户从网页选中的内容：\n\n来源：${data.title}\nURL：${data.url}\n\n内容：\n${data.content}`;
  }
  return `用户发送的完整网页：\n\n标题：${data.title}\nURL：${data.url}\n\n正文内容：\n${data.content}`;
}
