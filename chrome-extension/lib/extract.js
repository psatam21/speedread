/**
 * Article extractor, injected with chrome.scripting.executeScript({ func: extractArticleInPage }).
 * Must stay self-contained: only this function's source is serialised into the page.
 * Order: a real text selection wins, then a PDF marker, then density-scored main content.
 */
function extractArticleInPage() {
  const MAX_CHARS = 400_000;
  const NOISE =
    'script,style,noscript,nav,footer,header,aside,form,iframe,svg,canvas,button,input,textarea,select,[role="navigation"],[role="banner"],[role="contentinfo"],[aria-hidden="true"],.nav,.navbar,.sidebar,.menu,.ad,.ads,.advertisement,.cookie,.modal,.popup,.share,.social,.comments,#comments,briskread-overlay';
  const title = (
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector('h1')?.innerText ||
    document.title ||
    ''
  )
    .trim()
    .slice(0, 500);
  const pack = (text, extra = {}) => ({
    title,
    text,
    url: location.href,
    lang: document.documentElement.lang || '',
    wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
    ...extra,
  });

  const selected = String(window.getSelection?.() || '').trim();
  if (selected.split(/\s+/).length >= 3) return pack(selected.slice(0, MAX_CHARS), { selection: true });

  if (document.contentType === 'application/pdf') return pack('', { pdf: true });

  function visible(el) {
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function scoreNode(el) {
    if (!visible(el)) return -1;
    const text = el.innerText || '';
    const len = text.trim().length;
    if (len < 80) return -1;
    let score = Math.min(len / 100, 50);
    const tag = el.tagName.toLowerCase();
    const hint = `${el.className} ${el.id || ''}`;
    if (tag === 'article') score += 25;
    if (tag === 'main' || el.getAttribute('role') === 'main') score += 15;
    if (/article|post|content|entry|story|body/i.test(hint)) score += 12;
    if (/comment|sidebar|footer|header|nav|share|related|promo/i.test(hint)) score -= 20;
    score += Math.min(el.querySelectorAll('p').length * 2, 30);
    const linkText = Array.from(el.querySelectorAll('a')).reduce((n, a) => n + (a.innerText || '').length, 0);
    if (linkText / len > 0.45) score -= 15;
    return score;
  }

  let candidates = Array.from(
    document.querySelectorAll('article, main, [role="main"], .post, .article, .entry-content, #content, #main')
  );
  if (!candidates.length) candidates = Array.from(document.querySelectorAll('div'));

  let best = null;
  let bestScore = 0;
  for (const el of candidates) {
    if (el.querySelector('article, main')) continue; // prefer the innermost container
    const s = scoreNode(el);
    if (s > bestScore) {
      bestScore = s;
      best = el;
    }
  }

  const root = best && bestScore > 5 ? best : document.body;
  if (!root) return pack('');
  const clone = root.cloneNode(true);
  clone.querySelectorAll(NOISE).forEach((n) => n.remove());

  // innerText of a detached clone ignores layout, so use textContent per block.
  const blocks = Array.from(clone.querySelectorAll('p, h1, h2, h3, h4, li, blockquote, pre'))
    .filter((el) => !el.parentElement?.closest('p, li, blockquote'))
    .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 20);

  let text = blocks.join('\n\n').trim();
  if (text.length < 120) text = (root.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  return pack(text.slice(0, MAX_CHARS));
}

if (typeof globalThis !== 'undefined') globalThis.extractArticleInPage = extractArticleInPage;
