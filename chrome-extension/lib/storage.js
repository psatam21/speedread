/* Storage helpers shared by the service worker (importScripts) and the popup/options pages. */
const SR_APP_ORIGIN = 'https://briskread.com';

const SR_KEYS = {
  settings: 'sr_settings',
  progress: 'sr_progress',
  readLater: 'sr_read_later',
  geminiKey: 'gemini_key',
};

const SR_READ_LATER_MAX = 50;
// ~30k words. Keeps 50 saved articles well inside chrome.storage.local's 10 MB quota.
const SR_READ_LATER_MAX_CHARS = 180_000;
const SR_PROGRESS_MAX = 200;

async function srGetSettings() {
  const data = await chrome.storage.local.get(SR_KEYS.settings);
  return globalThis.BriskReadExt.normalizeSettings(data[SR_KEYS.settings]);
}

async function srSaveSettings(patch) {
  const next = globalThis.BriskReadExt.normalizeSettings({ ...(await srGetSettings()), ...patch });
  await chrome.storage.local.set({ [SR_KEYS.settings]: next });
  return next;
}

async function srGetProgress(url) {
  const data = await chrome.storage.local.get(SR_KEYS.progress);
  return (data[SR_KEYS.progress] || {})[globalThis.BriskReadExt.progressKey(url)] || null;
}

/** Remember where the reader stopped. Oldest entries fall off past SR_PROGRESS_MAX. */
async function srSaveProgress(url, index, wordCount) {
  const key = globalThis.BriskReadExt.progressKey(url);
  if (!key) return;
  const map = (await chrome.storage.local.get(SR_KEYS.progress))[SR_KEYS.progress] || {};
  map[key] = { i: index, n: wordCount, t: Date.now() };
  const keys = Object.keys(map);
  if (keys.length > SR_PROGRESS_MAX) {
    keys.sort((a, b) => map[a].t - map[b].t);
    for (const k of keys.slice(0, keys.length - SR_PROGRESS_MAX)) delete map[k];
  }
  await chrome.storage.local.set({ [SR_KEYS.progress]: map });
}

async function srListReadLater() {
  const list = (await chrome.storage.local.get(SR_KEYS.readLater))[SR_KEYS.readLater];
  return Array.isArray(list) ? list : [];
}

/** Write the queue, dropping the oldest items if the storage quota is hit. */
async function srWriteReadLater(list) {
  let next = list;
  for (;;) {
    try {
      await chrome.storage.local.set({ [SR_KEYS.readLater]: next });
      return next;
    } catch (err) {
      if (!/quota/i.test(String(err?.message || err)) || next.length <= 1) throw err;
      next = next.slice(0, -1);
    }
  }
}

async function srAddReadLater(item) {
  const list = await srListReadLater();
  let text = String(item?.text || '');
  if (text.length > SR_READ_LATER_MAX_CHARS) text = text.slice(0, SR_READ_LATER_MAX_CHARS);
  const url = item?.url || '';
  const entry = {
    id: item?.id || crypto.randomUUID(),
    title: item?.title || url || 'Untitled',
    text,
    url,
    wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
    savedAt: Date.now(),
  };
  // Saving the same page again moves it to the top instead of duplicating it.
  const rest = list.filter((x) => x.id !== entry.id && !(url && x.url === url));
  const next = await srWriteReadLater([entry, ...rest].slice(0, SR_READ_LATER_MAX));
  return { entry, list: next };
}

async function srRemoveReadLater(id) {
  return srWriteReadLater((await srListReadLater()).filter((x) => x.id !== id));
}

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    SR_APP_ORIGIN,
    SR_KEYS,
    SR_READ_LATER_MAX,
    SR_READ_LATER_MAX_CHARS,
    SR_PROGRESS_MAX,
    srGetSettings,
    srSaveSettings,
    srGetProgress,
    srSaveProgress,
    srListReadLater,
    srAddReadLater,
    srRemoveReadLater,
  });
}
