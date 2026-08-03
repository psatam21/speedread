/* global importScripts, srGetAuth, srGetOrigins, srGetHandoff, srClearHandoff, extractArticleInPage */
importScripts('config.js', 'lib/storage.js', 'lib/extract.js');

const MENU_ID = 'briskread-page';

function ensureContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Speed read this page',
      contexts: ['page', 'selection', 'link'],
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  ensureContextMenu();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'https://briskread.com/extension' });
  }
});

chrome.runtime.onStartup.addListener(ensureContextMenu);

async function extractFromTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractArticleInPage,
  });
  return results?.[0]?.result || null;
}

const RESTRICTED = /^(chrome|chrome-extension|edge|about|devtools|chrome-search|moz-extension|view-source):/i;
const overlayKey = (tabId) => `sr_overlay_article_${tabId}`;

async function articleForTab(tab, selectionText = '') {
  let article = null;
  try {
    if (tab?.id && tab.url && !RESTRICTED.test(tab.url)) {
      article = await extractFromTab(tab.id);
      const selected = selectionText.trim();
      if (selected) {
        article = {
          title: tab.title || article?.title || '',
          text: selected,
          url: tab.url,
          wordCount: selected.split(/\s+/).length,
        };
      }
    }
  } catch (err) {
    console.warn('[BriskRead] extract failed', err);
  }
  if (!article?.text?.trim()) {
    article = { title: tab?.title || '', text: '', url: tab?.url || '', wordCount: 0 };
  }
  return article;
}

async function openBriskRead(tab, { selectionText = '' } = {}) {
  const article = await articleForTab(tab, selectionText);
  await chrome.storage.local.set({ sr_reader_article: article });
  await chrome.windows.create({
    url: chrome.runtime.getURL('reader.html'),
    type: 'popup',
    width: 760,
    height: 620,
  });
}

/**
 * Inject the in-page overlay into the active tab. Falls back to the standalone
 * reader window on pages where content scripts are not allowed (chrome://, the
 * Web Store, PDF viewer, …).
 */
async function openOverlay(tab, { selectionText = '' } = {}) {
  if (!tab?.id || !tab.url || RESTRICTED.test(tab.url)) {
    return openBriskRead(tab, { selectionText });
  }
  const article = await articleForTab(tab, selectionText);
  await chrome.storage.local.set({ [overlayKey(tab.id)]: article });
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/reader-core.js', 'overlay.js'],
    });
  } catch (err) {
    console.warn('[BriskRead] overlay injection failed, falling back', err);
    await openBriskRead(tab, { selectionText });
  }
}

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.local.remove(overlayKey(tabId)));

/** POST to /api/gemini from the SW so host-page CORS never applies. */
async function callGemini(prompt) {
  const auth = await srGetAuth();
  if (!auth.is_premium || !auth.premium_token) {
    return { ok: false, error: 'Premium required. Sign in from the BriskRead popup.' };
  }
  const { API_BASE } = await srGetOrigins();
  const res = await fetch(`${API_BASE}/api/gemini`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.premium_token}` },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || `AI request failed (${res.status})` };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { ok: false, error: 'AI returned an empty response' };
  return { ok: true, text };
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  await openOverlay(tab, { selectionText: info.selectionText || '' });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'speed-read-tab') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await openOverlay(tab);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SR_OVERLAY_INIT') {
    (async () => {
      const tabId = sender?.tab?.id;
      const auth = await srGetAuth();
      const store = await chrome.storage.local.get([overlayKey(tabId), 'reader_wpm', 'overlay_mode']);
      sendResponse({
        ok: true,
        premium: auth.is_premium && !!auth.premium_token,
        article: store[overlayKey(tabId)] || null,
        wpm: store.reader_wpm || 350,
        mode: store.overlay_mode || 'rsvp',
      });
    })();
    return true;
  }

  if (message?.type === 'SR_AI') {
    callGemini(String(message.prompt || ''))
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e.message || 'Network error' }));
    return true;
  }

  if (message?.type === 'SR_GET_HANDOFF') {
    (async () => {
      const handoff = await srGetHandoff();
      const auth = await srGetAuth();
      if (!handoff && !auth.is_premium && !auth.premium_token) {
        sendResponse({ ok: false });
        return;
      }
      sendResponse({
        ok: true,
        license_key: auth.license_key,
        premium_token: auth.premium_token,
        is_premium: auth.is_premium && !!auth.premium_token,
        article: handoff?.article || null,
        opened_at: handoff?.opened_at || null,
      });
    })();
    return true;
  }

  if (message?.type === 'SR_CLEAR_HANDOFF') {
    srClearHandoff().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === 'SR_GET_AUTH') {
    srGetAuth().then((auth) => sendResponse({ ok: true, ...auth }));
    return true;
  }

  if (message?.type === 'SR_OPEN_BRISKREAD') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await openOverlay(tab || null);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  return false;
});
