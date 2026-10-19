/* global importScripts, BriskReadExt, SR_APP_ORIGIN, srGetSettings, srGetProgress, srSaveProgress, srAddReadLater, extractArticleInPage */
importScripts('lib/ext-core.js', 'lib/storage.js', 'lib/extract.js');

const X = BriskReadExt;
const overlayKey = (tabId) => `sr_overlay_article_${tabId}`;
// Chrome hides the URL of tabs we cannot access, so an unknown URL is tried, not assumed blocked.
const knownBlocked = (tab) => Boolean(tab?.url) && X.isBlockedUrl(tab.url);

const MENUS = [
  { id: 'br-read', title: 'Speed read this page', contexts: ['page', 'frame'] },
  { id: 'br-selection', title: 'Speed read selection', contexts: ['selection'] },
  { id: 'br-link', title: 'Speed read linked page', contexts: ['link'] },
  { id: 'br-bionic', title: 'Bionic reading on this page', contexts: ['page', 'frame'] },
  { id: 'br-later', title: 'Save to read later', contexts: ['page', 'selection', 'link'] },
];

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    for (const m of MENUS) chrome.contextMenus.create(m);
  });
  if (details.reason === 'install') chrome.tabs.create({ url: 'options.html#welcome' });
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(overlayKey(tabId)));

/* ---------- reading ---------- */

function textArticle(tab, text, extra = {}) {
  const clean = String(text || '').trim();
  return {
    title: tab?.title || '',
    text: clean,
    url: tab?.url || '',
    wordCount: clean ? clean.split(/\s+/).length : 0,
    ...extra,
  };
}

/** Context-menu selections lose line breaks, so re-read them from the frame that owns them. */
async function selectionArticle(tab, frameId, fallbackText) {
  let text = fallbackText;
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [frameId || 0] },
      func: () => String(getSelection()).trim(),
    });
    if (r?.result) text = r.result;
  } catch (_) {
    /* frame gone or not scriptable: keep Chrome's flattened copy */
  }
  return textArticle(tab, text, { selection: true });
}

async function extract(tabId) {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: extractArticleInPage });
  return r?.result || null;
}

/**
 * Standalone reader tab, used for PDFs, pages Chrome blocks, and as the fallback
 * when in-page injection fails. The payload rides in session storage under a
 * one-time key so two quick opens never read each other's article.
 */
async function openReaderPage(tab, payload) {
  const key = `sr_reader_${crypto.randomUUID()}`;
  await chrome.storage.session.set({ [key]: payload });
  const props = { url: `reader.html?k=${encodeURIComponent(key)}` };
  if (tab?.id) {
    props.index = tab.index + 1;
    props.openerTabId = tab.id;
  }
  await chrome.tabs.create(props);
}

async function openReader(tab, { article = null } = {}) {
  if (!tab?.id) return openReaderPage(null, { article });
  if (!article && knownBlocked(tab)) return openReaderPage(tab, { error: 'blocked', title: tab.title });

  if (!article) {
    try {
      article = await extract(tab.id);
    } catch (_) {
      const error = /^file:/i.test(tab.url || '') ? 'file' : 'blocked';
      return openReaderPage(tab, { error, title: tab.title });
    }
    if (article?.pdf) return openReaderPage(tab, { pdfTabId: tab.id, title: article.title || tab.title });
  }

  await chrome.storage.session.set({ [overlayKey(tab.id)]: article || textArticle(tab, '') });
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/reader-core.js', 'lib/ext-core.js', 'overlay.js'],
    });
  } catch (_) {
    await openReaderPage(tab, { article });
  }
}

/* ---------- bionic on the live page ---------- */

async function toggleBionic(tab) {
  if (!tab?.id || knownBlocked(tab)) return { ok: false, error: 'Chrome does not allow extensions on this page.' };
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/ext-core.js', 'page-bionic.js'],
    });
    return { ok: true, on: r?.result === true };
  } catch (_) {
    return { ok: false, error: 'This page cannot be changed by extensions.' };
  }
}

/* ---------- read later ---------- */

let badgeTimer = null;
async function flashBadge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
}

async function saveReadLater(tab, { selectionText = '', linkUrl = '', frameId = 0 } = {}) {
  let article;
  if (linkUrl) {
    // We cannot fetch another site from here; save the link and extract it when opened.
    article = { title: linkUrl, text: '', url: linkUrl };
  } else if (selectionText) {
    article = await selectionArticle(tab, frameId, selectionText);
  } else if (tab?.id && !knownBlocked(tab)) {
    try {
      article = await extract(tab.id);
    } catch (_) {
      article = null;
    }
    if (article?.pdf) article = { title: article.title || tab.title, text: '', url: tab.url };
  }
  if (!article) {
    await flashBadge('!', '#dc2626');
    return { ok: false, error: 'Chrome does not allow extensions to read this page.' };
  }
  const { entry, list } = await srAddReadLater(article);
  await flashBadge(String(Math.min(list.length, 99)), '#5e6ad2');
  return { ok: true, entry, count: list.length };
}

/* ---------- AI (the user's own Gemini key, called from here so page CORS never applies) ---------- */

const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];

async function callGemini(prompt) {
  const { gemini_key: key } = await chrome.storage.local.get('gemini_key');
  if (!key) return { ok: false, needsKey: true, error: 'Add your free Gemini API key in BriskRead options to use AI.' };
  const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
  let lastError = 'AI request failed';
  for (const model of GEMINI_MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      // Header, not ?key=, so the key never lands in a URL or a log line.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body,
      signal: AbortSignal.timeout(45_000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
      return text ? { ok: true, text } : { ok: false, error: 'AI returned an empty response.' };
    }
    lastError = data?.error?.message || `AI request failed (${res.status})`;
    if (res.status !== 404) break; // only a model this key cannot reach is worth retrying
  }
  return { ok: false, error: lastError };
}

/* ---------- entry points ---------- */

let overlayCss = null;
const loadOverlayCss = () =>
  (overlayCss ||= Promise.all(
    ['styles/tokens.css', 'styles/overlay.css'].map((f) => fetch(chrome.runtime.getURL(f)).then((r) => r.text()))
  ).then((parts) => parts.join('\n')));

async function handleMenuClick(info, tab) {
  switch (info.menuItemId) {
    case 'br-read':
      return openReader(tab);
    case 'br-selection':
      return openReader(tab, { article: await selectionArticle(tab, info.frameId, info.selectionText || '') });
    case 'br-link':
      return chrome.tabs.create({
        url: `${SR_APP_ORIGIN}/?url=${encodeURIComponent(info.linkUrl)}`,
        index: (tab?.index ?? -1) + 1,
      });
    case 'br-bionic':
      return toggleBionic(tab);
    case 'br-later':
      return saveReadLater(tab, {
        selectionText: info.linkUrl ? '' : info.selectionText || '',
        linkUrl: info.linkUrl || '',
        frameId: info.frameId,
      });
  }
}

async function handleCommand(command, tab) {
  tab ||= (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!tab) return;
  if (command === 'speed-read-tab') return openReader(tab);
  if (command === 'read-later-tab') return saveReadLater(tab);
  if (command === 'bionic-tab') return toggleBionic(tab);
}

chrome.contextMenus.onClicked.addListener((info, tab) => handleMenuClick(info, tab));
chrome.commands.onCommand.addListener((command, tab) => handleCommand(command, tab));

// Lets the Playwright suite drive the same paths as the real menu and shortcuts.
globalThis.__briskread = { handleMenuClick, handleCommand };

const HANDLERS = {
  async SR_OVERLAY_INIT(_msg, sender) {
    const tabId = sender.tab?.id;
    const key = overlayKey(tabId);
    const article = (await chrome.storage.session.get(key))[key] || null;
    const progress = article && !article.selection ? await srGetProgress(article.url) : null;
    return { ok: true, article, progress, settings: await srGetSettings(), css: await loadOverlayCss() };
  },
  async SR_SAVE_PROGRESS(msg) {
    await srSaveProgress(msg.url, msg.i, msg.n);
    return { ok: true };
  },
  SR_AI: (msg) => callGemini(String(msg.prompt || '')),
  async SR_READ_TAB(msg) {
    await openReader(await chrome.tabs.get(msg.tabId), { article: msg.article || null });
    return { ok: true };
  },
  async SR_SAVE_TAB(msg) {
    return saveReadLater(await chrome.tabs.get(msg.tabId));
  },
  async SR_BIONIC_TAB(msg) {
    return toggleBionic(await chrome.tabs.get(msg.tabId));
  },
  async SR_OPEN_OPTIONS() {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = HANDLERS[message?.type];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(message, sender))
    .then(sendResponse, (e) => sendResponse({ ok: false, error: e?.message || String(e) }));
  return true;
});
