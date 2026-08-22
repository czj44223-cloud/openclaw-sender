// Content script: extract webpage data
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractPage') {
    sendResponse(extractPageData());
  }
});

function extractPageData() {
  // Get main content
  const title = document.title || '';
  const url = window.location.href;

  // Try to extract article content
  let content = '';

  // Priority selectors for main content
  const selectors = [
    'article',
    '[role="main"]',
    '.post-content',
    '.entry-content',
    '.article-content',
    '#content',
    'main',
    '.content'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      content = element.innerText.trim();
      break;
    }
  }

  // Fallback to body text if no content found
  if (!content) {
    // Remove script and style elements
    const bodyClone = document.body.cloneNode(true);
    const scripts = bodyClone.querySelectorAll('script, style, nav, header, footer, aside');
    scripts.forEach(el => el.remove());
    content = bodyClone.innerText.trim();
  }

  // Limit content length
  const maxLength = 8000;
  if (content.length > maxLength) {
    content = content.substring(0, maxLength) + '\n\n[内容已截断...]';
  }

  // Extract links
  const links = Array.from(document.querySelectorAll('a[href]'))
    .slice(0, 20)
    .map(a => ({
      text: a.innerText.trim(),
      href: a.href
    }))
    .filter(link => link.text && link.href.startsWith('http'));

  // Extract images
  const images = Array.from(document.querySelectorAll('img[src]'))
    .slice(0, 10)
    .map(img => ({
      src: img.src,
      alt: img.alt || ''
    }))
    .filter(img => img.src.startsWith('http'));

  return {
    title,
    url,
    content,
    links,
    images,
    timestamp: new Date().toISOString()
  };
}
