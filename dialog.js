// OpenClaw Sender - 对话框逻辑
const state = {
  payload: null,
  model: null,
  messages: [],       // 多轮对话历史（首轮含页面内容，后续纯追问）
  streaming: false,
  activeToolId: 'none'
};

const $ = (id) => document.getElementById(id);

(async function init() {
  // 设置回显
  const { gatewayUrl, token } = await chrome.storage.local.get(['gatewayUrl', 'token']);
  $('gwUrl').value = gatewayUrl || CONFIG.GATEWAY_URL;
  $('gwToken').value = isValidToken((token && token.trim()) || '') ? token.trim() : CONFIG.DEFAULT_TOKEN;

  // 读取 background 暂存的抓取内容
  const payload = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'getPayload' }, resolve);
  });
  state.payload = payload || { mode: 'page', title: '', url: '', content: '', extractError: '未获取到内容' };
  renderPayload();
  renderTools();
  await loadModels();

  // 事件
  $('settingsBtn').addEventListener('click', () => {
    $('settingsPanel').hidden = !$('settingsPanel').hidden;
  });
  $('saveSettings').addEventListener('click', saveSettings);
  $('sendBtn').addEventListener('click', send);
  $('clearBtn').addEventListener('click', clearChat);
  $('copyBtn').addEventListener('click', copyReply);
})();

function renderPayload() {
  const p = state.payload;
  $('pageTitle').textContent = p.title || '(无标题)';
  $('pageUrl').textContent = p.url || '';
  if (p.extractError) {
    $('contentText').textContent = '⚠️ 内容提取失败：' + p.extractError + '\n（可手动复制正文粘贴到提示词里发送）';
  } else {
    $('contentText').textContent = (p.content || '(未提取到正文，可手动粘贴)') + (p.mode === 'selection' ? '\n\n[来源：选中内容]' : '');
  }
}

function renderTools() {
  const wrap = $('tools');
  wrap.innerHTML = '';
  CONFIG.TOOLS.forEach((tool) => {
    const btn = document.createElement('button');
    btn.className = 'tool-chip' + (tool.id === state.activeToolId ? ' active' : '');
    btn.textContent = tool.name;
    btn.addEventListener('click', () => {
      state.activeToolId = tool.id;
      wrap.querySelectorAll('.tool-chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      $('prompt').value = tool.prompt || '';
      $('prompt').placeholder = tool.prompt || '输入提示词…';
    });
    wrap.appendChild(btn);
  });
}

async function loadModels() {
  const sel = $('model');
  sel.innerHTML = '';
  let ids = null;
  try {
    const res = await fetch(`${$('gwUrl').value || CONFIG.GATEWAY_URL}/v1/models`, {
      headers: { 'Authorization': `Bearer ${currentToken()}` }
    });
    if (res.ok) {
      const j = await res.json();
      ids = (j.data || []).map((m) => m.id);
    }
  } catch (e) { /* 拉取失败就用内置列表 */ }

  const list = ids || Object.keys(CONFIG.MODEL_LABELS);
  list.forEach((id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = CONFIG.MODEL_LABELS[id] || id;
    sel.appendChild(opt);
  });
  if (list.includes(CONFIG.DEFAULT_MODEL)) sel.value = CONFIG.DEFAULT_MODEL;
  state.model = sel.value;
  sel.addEventListener('change', () => { state.model = sel.value; });
}

async function saveSettings() {
  const t = $('gwToken').value.trim();
  if (!isValidToken(t)) {
    $('saveHint').textContent = '⚠️ token 格式不对（应纯字母数字），未保存';
    return;
  }
  await chrome.storage.local.set({
    gatewayUrl: $('gwUrl').value.trim(),
    token: t
  });
  $('saveHint').textContent = '✅ 已保存';
  setTimeout(() => { $('saveHint').textContent = ''; }, 1500);
}

function buildMessages(prompt) {
  const p = state.payload;
  const tool = CONFIG.TOOLS.find((t) => t.id === state.activeToolId) || CONFIG.TOOLS[0];
  const system = tool.system || '你是一个乐于助人的 AI 助手，会仔细分析用户提供的网页内容。';
  const instruction = prompt || tool.prompt || '请处理以下网页内容。';

  if (state.messages.length === 0) {
    // 首轮：附带完整网页内容
    const pageBlock = `网页标题：${p.title || '(无标题)'}\n网页URL：${p.url || '(未知)'}\n\n${p.content || '(未能提取正文)'}`;
    return [
      { role: 'system', content: system },
      { role: 'user', content: `以下是用户发送的网页内容：\n\n${pageBlock}\n\n-----\n指令：${instruction}` }
    ];
  }
  // 后续轮次：纯追问
  return [...state.messages, { role: 'user', content: instruction }];
}

function send() {
  if (state.streaming) return;
  const prompt = $('prompt').value.trim();
  const messages = buildMessages(prompt);
  const model = state.model || CONFIG.DEFAULT_MODEL;

  state.streaming = true;
  $('sendBtn').disabled = true;
  $('sendBtn').textContent = '思考中…';
  $('replyWrap').hidden = false;
  $('status').textContent = '⏳ 发送中 → ' + model;

  // 追加这一轮对话的 UI
  const turnDiv = document.createElement('div');
  turnDiv.className = 'turn';
  turnDiv.innerHTML = `<div class="msg user">你：${escapeHtml(prompt || '(发送页面)')}</div><div class="msg ai">AI：</div>`;
  $('reply').appendChild(turnDiv);
  const aiDiv = turnDiv.querySelector('.msg.ai');

  const port = chrome.runtime.connect({ name: 'chat' });
  let full = '';

  port.onMessage.addListener((msg) => {
    if (msg.type === 'delta') {
      full += msg.text;
      aiDiv.textContent = 'AI：' + full;
      aiDiv.scrollIntoView({ block: 'nearest' });
    } else if (msg.type === 'done') {
      if (msg.text) { full = msg.text; aiDiv.textContent = 'AI：' + full; }
      finish(full);
    } else if (msg.type === 'error') {
      aiDiv.textContent = 'AI：❌ ' + msg.message;
      finish('');
    }
  });

  port.postMessage({ type: 'send', model, messages });

  function finish(reply) {
    state.streaming = false;
    $('sendBtn').disabled = false;
    $('sendBtn').textContent = '🚀 发送';
    $('status').textContent = reply ? '✅ 完成（可继续在提示词里追问）' : '❌ 未收到回复';
    if (reply) state.messages = [...messages, { role: 'assistant', content: reply }];
  }
}

function clearChat() {
  state.messages = [];
  $('reply').innerHTML = '';
  $('replyWrap').hidden = true;
  $('prompt').value = '';
  $('status').textContent = '';
}

function copyReply() {
  const text = $('reply').innerText;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    $('status').textContent = '📋 已复制到剪贴板';
  });
}

function currentToken() {
  const t = $('gwToken').value.trim();
  return isValidToken(t) ? t : CONFIG.DEFAULT_TOKEN;
}

function isValidToken(t) {
  return typeof t === 'string' && /^[0-9a-fA-F]+$/.test(t);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
