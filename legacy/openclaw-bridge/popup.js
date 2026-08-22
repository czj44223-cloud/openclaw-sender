const GATEWAY_URL = 'http://localhost:18789';
const GATEWAY_TOKEN = 'YOUR_GATEWAY_TOKEN';
const MODEL = 'openclaw/kimi';

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const sendPageBtn = document.getElementById('sendPage');
  const sendSelectionBtn = document.getElementById('sendSelection');

  // Check if OpenClaw is reachable
  try {
    const response = await fetch(`${GATEWAY_URL}/health`);
    if (response.ok) {
      statusEl.textContent = '✅ OpenClaw 已连接';
      statusEl.className = 'status connected';
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch {
    statusEl.textContent = '❌ OpenClaw 未连接 (localhost:18789)';
    statusEl.className = 'status disconnected';
  }

  // Send current page
  sendPageBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    sendPageBtn.disabled = true;
    sendPageBtn.textContent = '发送中...';
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractPage' });
      if (!response) throw new Error('无法提取页面内容（受限页面或扩展未注入）');
      await sendToOpenClaw({ type: 'page', ...response });
    } catch (error) {
      alert('❌ 发送失败: ' + error.message);
    } finally {
      sendPageBtn.disabled = false;
      sendPageBtn.textContent = '发送当前页面';
    }
  });

  // Send selection - 点击时实时读取选中文本（弹窗一打开原页面选中就会丢失，不能只在打开时检查一次）
  sendSelectionBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    sendSelectionBtn.disabled = true;
    sendSelectionBtn.textContent = '发送中...';
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString()
      });
      if (!result) throw new Error('当前页面没有选中文本');
      await sendToOpenClaw({ type: 'selection', content: result, url: tab.url, title: tab.title });
    } catch (error) {
      alert('❌ 发送失败: ' + error.message);
    } finally {
      sendSelectionBtn.disabled = false;
      sendSelectionBtn.textContent = '发送选中内容';
    }
  });
});

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
    throw new Error(`HTTP ${response.status} ${detail.slice(0, 200)}`);
  }

  alert('✅ 已发送到 OpenClaw！');
}

function formatContent(data) {
  if (data.type === 'selection') {
    return `用户从网页选中的内容：\n\n来源：${data.title}\nURL：${data.url}\n\n内容：\n${data.content}`;
  }
  return `用户发送的完整网页：\n\n标题：${data.title}\nURL：${data.url}\n\n正文内容：\n${data.content}`;
}
