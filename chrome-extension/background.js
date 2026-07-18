/* global importScripts, srGetAuth, srGetHandoff, srClearHandoff, srSetHandoff, srGetOrigins, extractArticleInPage */
importScripts('config.js', 'lib/storage.js', 'lib/extract.js');

const MENU_ID = 'speedread-page';

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
    chrome.tabs.create({ url: 'https://speedread-web.com/extension' });
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

async function openSpeedRead(tab, { preferSelection = false } = {}) {
  const origins = await srGetOrigins();
  let article = null;

  try {
    if (tab?.id && tab.url && !/^(chrome|chrome-extension|edge|about|devtools|chrome-search):/i.test(tab.url)) {
      article = await extractFromTab(tab.id);
      if (preferSelection) {
        const sel = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.getSelection()?.toString()?.trim() || '',
        });
        const selected = sel?.[0]?.result;
        if (selected && selected.length > 40) {
          article = {
            title: tab.title || article?.title || '',
            text: selected,
            url: tab.url,
            wordCount: selected.split(/\s+/).length,
          };
        }
      }
    }
  } catch (err) {
    console.warn('[SpeedRead] extract failed', err);
  }

  if (!article?.text || article.text.trim().length < 40) {
    article = {
      title: tab?.title || '',
      text: '',
      url: tab?.url || '',
      wordCount: 0,
    };
  }

  await srSetHandoff({ article });

  let url = `${origins.APP_ORIGIN}/?source=extension&v=1`;
  if (!article.text || article.text.length < 40) {
    if (article.url) {
      url = `${origins.APP_ORIGIN}/?url=${encodeURIComponent(article.url)}&source=extension&v=1`;
    }
  }

  await chrome.tabs.create({ url });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  await openSpeedRead(tab, { preferSelection: Boolean(info.selectionText) });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'speed-read-tab') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await openSpeedRead(tab);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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

  if (message?.type === 'SR_OPEN_SPEEDREAD') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await openSpeedRead(tab || null, { preferSelection: !!message.preferSelection });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  return false;
});
