/* Shared storage helpers — imported via importScripts in SW, copied logic in popup via storage-api.js */
const SR_KEYS = {
  licenseKey: 'license_key',
  sessionToken: 'premium_token',
  deviceId: 'device_id',
  isPremium: 'is_premium',
  devices: 'premium_devices',
  handoff: 'sr_handoff',
  apiBase: 'api_base',
  appOrigin: 'app_origin',
};

async function srGetDeviceId() {
  const { device_id } = await chrome.storage.local.get(SR_KEYS.deviceId);
  if (device_id && String(device_id).length >= 8) return device_id;
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `ext-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  await chrome.storage.local.set({ [SR_KEYS.deviceId]: id });
  return id;
}

function srDeviceLabel() {
  const ua = navigator.userAgent || '';
  let os = 'Desktop';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS|Macintosh/.test(ua)) os = 'Mac';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return `Chrome Extension (${os})`;
}

async function srGetAuth() {
  const data = await chrome.storage.local.get([
    SR_KEYS.licenseKey,
    SR_KEYS.sessionToken,
    SR_KEYS.deviceId,
    SR_KEYS.isPremium,
    SR_KEYS.devices,
  ]);
  return {
    license_key: data[SR_KEYS.licenseKey] || '',
    premium_token: data[SR_KEYS.sessionToken] || '',
    device_id: data[SR_KEYS.deviceId] || '',
    is_premium: data[SR_KEYS.isPremium] === true || data[SR_KEYS.isPremium] === 'true',
    devices: data[SR_KEYS.devices] || null,
  };
}

async function srGetOrigins() {
  const sync = await chrome.storage.sync.get([SR_KEYS.apiBase, SR_KEYS.appOrigin]);
  const defaults = globalThis.SR_DEFAULTS || {
    API_BASE: 'https://speedread-orcin.vercel.app',
    APP_ORIGIN: 'https://speedread-orcin.vercel.app',
  };
  return {
    API_BASE: (sync[SR_KEYS.apiBase] || defaults.API_BASE).replace(/\/$/, ''),
    APP_ORIGIN: (sync[SR_KEYS.appOrigin] || defaults.APP_ORIGIN).replace(/\/$/, ''),
  };
}

async function srSetHandoff(payload) {
  const handoff = {
    ...payload,
    opened_at: Date.now(),
    expires_at: Date.now() + 60_000, // 60s TTL
  };
  // session preferred; local fallback for SW wake races
  await chrome.storage.session.set({ [SR_KEYS.handoff]: handoff });
  await chrome.storage.local.set({ [SR_KEYS.handoff]: handoff });
}

async function srGetHandoff() {
  const sess = await chrome.storage.session.get(SR_KEYS.handoff);
  let handoff = sess[SR_KEYS.handoff] || null;
  if (!handoff) {
    const loc = await chrome.storage.local.get(SR_KEYS.handoff);
    handoff = loc[SR_KEYS.handoff] || null;
  }
  if (handoff?.expires_at && Date.now() > handoff.expires_at) {
    await srClearHandoff();
    return null;
  }
  return handoff;
}

async function srClearHandoff() {
  await chrome.storage.session.remove(SR_KEYS.handoff);
  await chrome.storage.local.remove(SR_KEYS.handoff);
}

if (typeof globalThis !== 'undefined') {
  globalThis.SR_KEYS = SR_KEYS;
  globalThis.srGetDeviceId = srGetDeviceId;
  globalThis.srDeviceLabel = srDeviceLabel;
  globalThis.srGetAuth = srGetAuth;
  globalThis.srGetOrigins = srGetOrigins;
  globalThis.srSetHandoff = srSetHandoff;
  globalThis.srGetHandoff = srGetHandoff;
  globalThis.srClearHandoff = srClearHandoff;
}
