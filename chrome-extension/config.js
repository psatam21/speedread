/** @type {{ API_BASE: string, APP_ORIGIN: string, PREMIUM_AVAILABLE: boolean, MAX_DEVICES: number, PRODUCT_NAME: string }} */
const SR_DEFAULTS = {
  // Must be absolute: a relative base resolves against chrome-extension://<id>/
  // in the service worker, so every API call 404s inside the extension itself.
  API_BASE: 'https://briskread.com',
  APP_ORIGIN: 'https://briskread.com',
  PREMIUM_AVAILABLE: true,
  MAX_DEVICES: 5,
  PRODUCT_NAME: 'BriskRead',
};

// Overridden at runtime from chrome.storage.sync (options page)
const SR_CONFIG = { ...SR_DEFAULTS };

if (typeof globalThis !== 'undefined') {
  globalThis.SR_DEFAULTS = SR_DEFAULTS;
  globalThis.SR_CONFIG = SR_CONFIG;
}
