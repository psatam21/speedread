/* global chrome, BriskReadExt, SR_APP_ORIGIN, SR_KEYS, srListReadLater, srRemoveReadLater */
const X = BriskReadExt;
const $ = (id) => document.getElementById(id);
let tab = null;

const ICONS = {
  open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  remove: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function setStatus(message, kind = '') {
  $('status').textContent = message;
  $('status').className = `status ${kind}`;
}

function ago(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

async function send(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function renderQueue() {
  const [list, store] = await Promise.all([srListReadLater(), chrome.storage.local.get(SR_KEYS.progress)]);
  const progress = store[SR_KEYS.progress] || {};
  $('queue-count').textContent = list.length ? `· ${list.length}` : '';
  $('queue-empty').hidden = list.length > 0;
  $('queue').innerHTML = list
    .map((item) => {
      const p = progress[X.progressKey(item.url)];
      const pct = p && p.n === item.wordCount ? Math.round((p.i / Math.max(1, p.n - 1)) * 100) : 0;
      const meta = item.wordCount
        ? `${item.wordCount.toLocaleString()} words · ${X.minutesFor(item.wordCount, 300)} min · ${ago(item.savedAt)}`
        : `Link · ${ago(item.savedAt)}`;
      return `<li class="q-item" data-id="${esc(item.id)}">
        <span class="q-title" title="${esc(item.url)}">${esc(item.title || item.url || 'Untitled')}</span>
        <span class="q-meta">${esc(meta)}${pct ? ` · ${pct}% read` : ''}</span>
        ${pct ? `<span class="q-bar"><span style="width:${pct}%"></span></span>` : ''}
        <span class="q-btns">
          <button type="button" class="btn btn-primary btn-sm" data-act="read">Read</button>
          ${item.url && /^https?:/i.test(item.url) ? `<button type="button" class="icon-btn" data-act="source" title="Open original page" aria-label="Open original page">${ICONS.open}</button>` : ''}
          <button type="button" class="icon-btn" data-act="remove" title="Remove" aria-label="Remove from queue">${ICONS.remove}</button>
        </span>
      </li>`;
    })
    .join('');
}

async function onQueueClick(e) {
  const btn = e.target.closest('[data-act]');
  const li = btn?.closest('.q-item');
  if (!li) return;
  const item = (await srListReadLater()).find((x) => x.id === li.dataset.id);
  if (!item) return renderQueue();
  const act = btn.dataset.act;
  if (act === 'remove') {
    await srRemoveReadLater(item.id);
    return renderQueue();
  }
  if (act === 'source') {
    await chrome.tabs.create({ url: item.url });
    return window.close();
  }
  // Read: saved text opens in the reader; a saved link is extracted first.
  if (item.text) {
    const res = await send({ type: 'SR_READ_TAB', tabId: tab.id, article: item });
    if (res?.ok === false) return setStatus(res.error, 'error');
  } else if (X.isPdfUrl(item.url)) {
    await chrome.tabs.create({ url: item.url });
  } else {
    await chrome.tabs.create({ url: `${SR_APP_ORIGIN}/?url=${encodeURIComponent(item.url)}` });
  }
  window.close();
}

async function showShortcuts() {
  const commands = await chrome.commands.getAll();
  for (const kbd of document.querySelectorAll('kbd[data-cmd]')) {
    const shortcut = commands.find((c) => c.name === kbd.dataset.cmd)?.shortcut;
    kbd.textContent = shortcut || '';
    kbd.hidden = !shortcut;
  }
}

async function init() {
  $('ver').textContent = `v${chrome.runtime.getManifest().version}`;
  // ?tabId= lets the e2e tests and store screenshots point the popup at a page; Chrome never passes it.
  const forced = Number(new URLSearchParams(location.search).get('tabId'));
  tab = forced ? await chrome.tabs.get(forced) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  // No URL means Chrome gave us no access (browser pages); the worker then explains it in the reader tab.
  const blocked = Boolean(tab?.url) && X.isBlockedUrl(tab.url);
  $('tab-title').textContent = tab?.title || tab?.url || 'This page';
  $('tab-title').title = tab?.url || '';
  if (X.isPdfUrl(tab?.url)) $('read-label').textContent = 'Speed read this PDF';
  if (blocked) {
    for (const id of ['btn-read', 'btn-bionic', 'btn-save']) $(id).disabled = true;
    setStatus('Chrome does not let extensions read this page. Open a PDF or paste text instead.');
  }

  $('btn-read').addEventListener('click', async () => {
    setStatus('Opening reader…');
    const res = await send({ type: 'SR_READ_TAB', tabId: tab.id });
    if (res?.ok === false) return setStatus(res.error, 'error');
    window.close();
  });
  $('btn-bionic').addEventListener('click', async () => {
    const res = await send({ type: 'SR_BIONIC_TAB', tabId: tab.id });
    if (!res?.ok) return setStatus(res?.error || 'Could not change this page.', 'error');
    setStatus(res.on ? 'Bionic reading is on for this page.' : 'Bionic reading is off.', 'ok');
    setTimeout(() => window.close(), 700);
  });
  $('btn-save').addEventListener('click', async () => {
    $('btn-save').disabled = true;
    const res = await send({ type: 'SR_SAVE_TAB', tabId: tab.id });
    $('btn-save').disabled = false;
    if (!res?.ok) return setStatus(res?.error || 'Could not save this page.', 'error');
    setStatus('Saved to read later.', 'ok');
  });
  $('btn-file').addEventListener('click', () => chrome.tabs.create({ url: 'reader.html' }).then(() => window.close()));
  $('queue').addEventListener('click', onQueueClick);
  $('link-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  $('link-shortcuts').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SR_KEYS.readLater]) renderQueue();
  });

  await Promise.all([renderQueue(), showShortcuts()]);
}

document.addEventListener('DOMContentLoaded', init);
