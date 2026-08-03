/* global SR_DEFAULTS */

const defaults = globalThis.SR_DEFAULTS || {
  API_BASE: '',
  APP_ORIGIN: 'https://briskread.com',
};

const apiEl = document.getElementById('api-base');
const appEl = document.getElementById('app-origin');
const status = document.getElementById('opt-status');

function isAllowedOrigin(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    // Block obviously wrong schemes for production safety
    if (u.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/i.test(u.hostname)) {
      return false; // http only for local
    }
    return true;
  } catch {
    return false;
  }
}

async function load() {
  const data = await chrome.storage.sync.get(['api_base', 'app_origin']);
  apiEl.value = data.api_base || defaults.API_BASE;
  appEl.value = data.app_origin || defaults.APP_ORIGIN;
}

document.getElementById('btn-save').addEventListener('click', async () => {
  const api = apiEl.value.trim().replace(/\/$/, '');
  const app = appEl.value.trim().replace(/\/$/, '');
  if (!isAllowedOrigin(api) || !isAllowedOrigin(app)) {
    status.textContent = 'Invalid URL. Use https://… or http://localhost for dev.';
    status.className = 'status error';
    return;
  }
  await chrome.storage.sync.set({ api_base: api, app_origin: app });
  status.textContent = 'Saved. Reload the extension if content scripts need new hosts.';
  status.className = 'status ok';
});

document.getElementById('btn-reset').addEventListener('click', async () => {
  await chrome.storage.sync.remove(['api_base', 'app_origin']);
  apiEl.value = defaults.API_BASE;
  appEl.value = defaults.APP_ORIGIN;
  status.textContent = 'Defaults restored.';
  status.className = 'status ok';
});

// Gemini key: local storage, never chrome.storage.sync — a sync'd API key would
// ride Google's account sync to every machine the user signs into.
const keyEl = document.getElementById('gemini-key');
const keyStatus = document.getElementById('key-status');

document.getElementById('btn-save-key').addEventListener('click', async () => {
  const key = keyEl.value.trim();
  if (!key) {
    keyStatus.textContent = 'Enter a key first.';
    keyStatus.className = 'status error';
    return;
  }
  await chrome.storage.local.set({ gemini_key: key });
  keyStatus.textContent = 'Key saved. AI summary and chat are ready.';
  keyStatus.className = 'status ok';
});

document.getElementById('btn-clear-key').addEventListener('click', async () => {
  await chrome.storage.local.remove('gemini_key');
  keyEl.value = '';
  keyStatus.textContent = 'Key removed.';
  keyStatus.className = 'status ok';
});

chrome.storage.local.get('gemini_key').then(({ gemini_key }) => {
  keyEl.value = gemini_key || '';
});

load();
