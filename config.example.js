// OpenClaw Sender - 配置模板
// 使用：复制本文件为 config.js，把 DEFAULT_TOKEN 换成你自己的网关 token
// 注意：config.js 已被 .gitignore 忽略，不会被提交
const CONFIG = {
  GATEWAY_URL: 'http://localhost:18789',
  DEFAULT_TOKEN: 'YOUR_GATEWAY_TOKEN',
  DEFAULT_MODEL: 'openclaw/chat',

  // 模型显示名（弹窗会自动拉取网关 /v1/models，这里的 label 用于美化）
  MODEL_LABELS: {
    'openclaw': 'OpenClaw (默认)',
    'openclaw/default': 'OpenClaw (default)',
    'openclaw/main': '脏脏 (主会话 / deepseek-v4-flash)',
    'openclaw/chat': 'chat (deepseek-v4-flash)',
    'openclaw/kimi': 'kimi (Kimi K2.6)',
    'openclaw/career': '职业规划师 (deepseek)',
    'openclaw/local': '本地小助手 (ollama qwen2.5vl:3b)'
  },

  // 常用工具模板：点击后自动填入提示词（可再手动改）
  TOOLS: [
    { id: 'none',      name: '💬 自由提问', system: '', prompt: '' },
    { id: 'summarize', name: '📝 总结全文', system: '你是一个专业的文章总结助手。', prompt: '请用简洁的中文总结这个页面的核心内容，150-250字。' },
    { id: 'points',    name: '🎯 提炼要点', system: '你是一个信息整理专家。', prompt: '请提炼这个页面的关键要点，用编号列表输出，每条不超过一行。' },
    { id: 'zh',        name: '🌐 翻译成中文', system: '你是一个专业翻译，译文要通顺自然、符合中文表达习惯。', prompt: '请将页面内容翻译成简体中文。' },
    { id: 'en',        name: '🌐 翻译成英文', system: 'You are a professional translator. Output natural English.', prompt: 'Translate the page content into English.' },
    { id: 'keywords',  name: '🏷️ 提取关键词', system: '你是一个 SEO 关键词分析师。', prompt: '请提取这个页面的 10 个核心关键词，用逗号分隔输出。' },
    { id: 'review',    name: '🔍 代码审查', system: '你是一个资深代码审查专家，能指出问题并给出改进建议。', prompt: '请审查页面中的代码：指出 bug、安全隐患和性能问题，并给出修改建议。' }
  ]
};
