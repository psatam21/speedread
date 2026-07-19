/* global SR_DEFAULTS */

const defaults = globalThis.SR_DEFAULTS || {
  API_BASE: '',
  APP_ORIGIN: 'https://speedread-orcin.vercel.app',
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

load();
