/** @type {{ API_BASE: string, APP_ORIGIN: string, MAX_DEVICES: number, PRODUCT_NAME: string }} */
const SR_DEFAULTS = {
  API_BASE: 'https://speedread-web.com',
  APP_ORIGIN: 'https://speedread-web.com',
  MAX_DEVICES: 5,
  PRODUCT_NAME: 'SpeedRead',
};

// Overridden at runtime from chrome.storage.sync (options page)
const SR_CONFIG = { ...SR_DEFAULTS };

if (typeof globalThis !== 'undefined') {
  globalThis.SR_DEFAULTS = SR_DEFAULTS;
  globalThis.SR_CONFIG = SR_CONFIG;
}
