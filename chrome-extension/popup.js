/* global SR_DEFAULTS, chrome, srListReadLater, srRemoveReadLater, srSetHandoff */

const $ = (id) => document.getElementById(id);

const els = {
  badge: $('status-badge'),
  btnRead: $('btn-read'),
  btnSaveLater: $('btn-save-later'),
  btnOpenApp: $('btn-open-app'),
  actionStatus: $('action-status'),
  tabHint: $('tab-hint'),
  extVersion: $('ext-version'),
  linkOptions: $('link-options'),
  onlineDot: $('online-dot'),
  queueList: $('queue-list'),
  queueEmpty: $('queue-empty'),
  queueCount: $('queue-count'),
};

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function relativeTime(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - Number(ts)) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}d ago`;
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return '';
  }
}

function articlePayload(item) {
  return {
    title: item.title || '',
    text: item.text || '',
    url: item.url || '',
    wordCount: item.wordCount || 0,
  };
}

async function getOrigins() {
  const defaults = globalThis.SR_DEFAULTS || {
    API_BASE: 'https://briskread.com',
    APP_ORIGIN: 'https://briskread.com',
  };
  const sync = await chrome.storage.sync.get(['api_base', 'app_origin']);
  return {
    API_BASE: (sync.api_base || defaults.API_BASE).replace(/\/$/, ''),
    APP_ORIGIN: (sync.app_origin || defaults.APP_ORIGIN).replace(/\/$/, ''),
  };
}

function setStatus(el, message, kind = '') {
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('error', 'ok');
  if (kind) el.classList.add(kind);
}

function refreshUI() {
  if (els.tabHint) {
    els.tabHint.textContent =
      'Read the active page in a private popup. It works offline and does not redirect.';
  }
  if (els.onlineDot) {
    els.onlineDot.classList.toggle('offline', !navigator.onLine);
    els.onlineDot.title = navigator.onLine ? 'Online' : 'Offline';
  }
}

async function openBriskRead(withArticle) {
  setStatus(els.actionStatus, withArticle ? 'Opening reader…' : 'Opening app…');
  els.btnRead.disabled = true;
  try {
    if (!withArticle) {
      const { APP_ORIGIN } = await getOrigins();
      if (typeof srSetHandoff === 'function') {
        await srSetHandoff({ article: null });
      } else {
        const handoff = {
          article: null,
          opened_at: Date.now(),
          expires_at: Date.now() + 60_000,
        };
        await chrome.storage.session.set({ sr_handoff: handoff });
        await chrome.storage.local.set({ sr_handoff: handoff });
      }
      await chrome.tabs.create({ url: `${APP_ORIGIN}/?source=extension&v=1` });
      setStatus(els.actionStatus, 'Opened.', 'ok');
      window.close();
      return;
    }

    const response = await chrome.runtime.sendMessage({ type: 'SR_OPEN_BRISKREAD' });
    if (response && response.ok === false) {
      setStatus(els.actionStatus, response.error || 'Failed to open.', 'error');
      return;
    }
    setStatus(els.actionStatus, 'Opened.', 'ok');
    window.close();
  } catch (err) {
    setStatus(els.actionStatus, err.message || 'Failed to open BriskRead.', 'error');
  } finally {
    els.btnRead.disabled = false;
  }
}

async function renderReadLater() {
  if (!els.queueList) return;
  const list = typeof srListReadLater === 'function' ? await srListReadLater() : [];
  if (els.queueCount) {
    els.queueCount.textContent = list.length ? `(${list.length})` : '';
  }
  if (!list.length) {
    els.queueList.classList.add('hidden');
    els.queueList.innerHTML = '';
    if (els.queueEmpty) els.queueEmpty.classList.remove('hidden');
    return;
  }
  if (els.queueEmpty) els.queueEmpty.classList.add('hidden');
  els.queueList.classList.remove('hidden');
  els.queueList.innerHTML = list
    .map((item) => {
      const id = escapeHtml(item.id);
      const title = escapeHtml(item.title || item.url || 'Untitled');
      const words = item.wordCount ? `${item.wordCount} words` : 'No text';
      const when = relativeTime(item.savedAt);
      const meta = [words, when].filter(Boolean).join(' · ');
      return `<li class="queue-item" data-id="${id}">
        <p class="queue-item-title">${title}</p>
        <p class="queue-item-meta">${escapeHtml(meta)}</p>
        <div class="queue-item-actions">
          <button type="button" class="btn btn-primary btn-sm" data-action="open">Open</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="web">Open in BriskRead.com</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="remove">Remove</button>
        </div>
      </li>`;
    })
    .join('');
}

async function handleSaveLater() {
  if (els.btnSaveLater) els.btnSaveLater.disabled = true;
  setStatus(els.actionStatus, 'Saving…');
  try {
    const response = await chrome.runtime.sendMessage({ type: 'SR_SAVE_READ_LATER' });
    if (!response?.ok) {
      setStatus(els.actionStatus, response?.error || 'Could not save.', 'error');
      return;
    }
    setStatus(els.actionStatus, 'Saved to read later.', 'ok');
    await renderReadLater();
  } catch (err) {
    setStatus(els.actionStatus, err.message || 'Could not save.', 'error');
  } finally {
    if (els.btnSaveLater) els.btnSaveLater.disabled = false;
  }
}

async function openQueueItem(item, { web = false } = {}) {
  const article = articlePayload(item);
  if (!article.text.trim()) {
    setStatus(els.actionStatus, 'Saved item has no extractable text.', 'error');
    return;
  }
  if (web) {
    setStatus(els.actionStatus, 'Opening BriskRead.com…');
    const { APP_ORIGIN } = await getOrigins();
    if (typeof srSetHandoff === 'function') {
      await srSetHandoff({ article });
    } else {
      const handoff = {
        article,
        opened_at: Date.now(),
        expires_at: Date.now() + 60_000,
      };
      await chrome.storage.session.set({ sr_handoff: handoff });
      await chrome.storage.local.set({ sr_handoff: handoff });
    }
    await chrome.tabs.create({ url: `${APP_ORIGIN}/?source=extension&handoff=1&v=1` });
    window.close();
    return;
  }
  setStatus(els.actionStatus, 'Opening reader…');
  const response = await chrome.runtime.sendMessage({ type: 'SR_OPEN_ARTICLE', article });
  if (response && response.ok === false) {
    setStatus(els.actionStatus, response.error || 'Failed to open.', 'error');
    return;
  }
  window.close();
}

async function onQueueClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const li = btn.closest('.queue-item');
  if (!li) return;
  const id = li.getAttribute('data-id');
  const list = typeof srListReadLater === 'function' ? await srListReadLater() : [];
  const item = list.find((x) => x.id === id);
  if (!item) {
    await renderReadLater();
    return;
  }
  const action = btn.getAttribute('data-action');
  if (action === 'remove') {
    if (typeof srRemoveReadLater === 'function') await srRemoveReadLater(id);
    await renderReadLater();
    setStatus(els.actionStatus, 'Removed.', 'ok');
    return;
  }
  if (action === 'open') {
    await openQueueItem(item, { web: false });
    return;
  }
  if (action === 'web') {
    await openQueueItem(item, { web: true });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    els.extVersion.textContent = chrome.runtime.getManifest().version;
  } catch (_) {}

  refreshUI();
  await renderReadLater();

  els.btnRead.addEventListener('click', () => openBriskRead(true));
  if (els.btnSaveLater) els.btnSaveLater.addEventListener('click', handleSaveLater);
  els.btnOpenApp.addEventListener('click', () => openBriskRead(false));
  if (els.queueList) els.queueList.addEventListener('click', onQueueClick);
  if (els.linkOptions) {
    els.linkOptions.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.sr_read_later) renderReadLater();
  });

  window.addEventListener('online', refreshUI);
  window.addEventListener('offline', refreshUI);
});
