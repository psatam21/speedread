/**
 * Production article extractor for the active page.
 * Injected via chrome.scripting.executeScript({ func: extractArticleInPage }).
 * Heuristic + density scoring (no external deps — MV3 friendly).
 */
function extractArticleInPage() {
  const MAX_CHARS = 400_000;
  const NOISE =
    'script,style,noscript,nav,footer,header,aside,form,iframe,svg,canvas,button,input,textarea,select,noscript,[role="navigation"],[role="banner"],[role="contentinfo"],.nav,.navbar,.sidebar,.menu,.ad,.ads,.advertisement,.cookie,.modal,.popup,.share,.social,.comments,#comments';

  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function textOf(el) {
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function scoreNode(el) {
    if (!visible(el)) return -1;
    const text = el.innerText || '';
    const len = text.trim().length;
    if (len < 80) return -1;
    let score = Math.min(len / 100, 50);
    const tag = el.tagName.toLowerCase();
    if (tag === 'article') score += 25;
    if (tag === 'main') score += 15;
    if (el.getAttribute('role') === 'main') score += 15;
    if (/article|post|content|entry|story|body/i.test(el.className + ' ' + (el.id || ''))) score += 12;
    if (/comment|sidebar|footer|header|nav|share|related|promo/i.test(el.className + ' ' + (el.id || '')))
      score -= 20;
    const ps = el.querySelectorAll('p');
    score += Math.min(ps.length * 2, 30);
    const links = el.querySelectorAll('a');
    const linkText = Array.from(links).reduce((n, a) => n + (a.innerText || '').length, 0);
    if (len > 0 && linkText / len > 0.45) score -= 15;
    return score;
  }

  const candidates = Array.from(
    document.querySelectorAll('article, main, [role="main"], .post, .article, .entry-content, #content, #main')
  );
  if (!candidates.length) {
    candidates.push(...document.querySelectorAll('div'));
  }

  let best = null;
  let bestScore = 0;
  for (const el of candidates) {
    if (el.querySelector('article, main')) continue; // prefer leaves-ish
    const s = scoreNode(el);
    if (s > bestScore) {
      bestScore = s;
      best = el;
    }
  }

  const root = best && bestScore > 5 ? best : document.body;
  const clone = root.cloneNode(true);
  clone.querySelectorAll(NOISE).forEach((n) => n.remove());

  const blocks = Array.from(clone.querySelectorAll('p, h1, h2, h3, h4, li, blockquote, pre'))
    .map((el) => (el.innerText || '').trim())
    .filter((t) => t.length > 20);

  let text = blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 120) {
    text = (clone.innerText || document.body.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);

  const title =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector('h1')?.innerText?.trim() ||
    document.title ||
    '';

  return {
    title: title.trim().slice(0, 500),
    text,
    url: location.href,
    wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
  };
}

// Export for tests / direct use if loaded as script
if (typeof globalThis !== 'undefined') {
  globalThis.extractArticleInPage = extractArticleInPage;
}
