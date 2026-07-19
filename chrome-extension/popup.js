/* global SR_DEFAULTS, chrome */

const $ = (id) => document.getElementById(id);

const els = {
  badge: $('status-badge'),
  panelLogin: $('panel-login'),
  panelAccount: $('panel-account'),
  licenseInput: $('license-input'),
  btnLogin: $('btn-login'),
  loginStatus: $('login-status'),
  btnToggleKey: $('btn-toggle-key-vis'),
  deviceCountLabel: $('device-count-label'),
  deviceList: $('device-list'),
  btnRefresh: $('btn-refresh'),
  btnLogout: $('btn-logout'),
  accountStatus: $('account-status'),
  btnRead: $('btn-read'),
  btnOpenApp: $('btn-open-app'),
  actionStatus: $('action-status'),
  tabHint: $('tab-hint'),
  extVersion: $('ext-version'),
  linkBuy: $('link-buy'),
  linkOptions: $('link-options'),
  onlineDot: $('online-dot'),
};

async function getOrigins() {
  const defaults = globalThis.SR_DEFAULTS || {
    API_BASE: '',
    APP_ORIGIN: 'https://speedread-orcin.vercel.app',
    PREMIUM_AVAILABLE: false,
  };
  const sync = await chrome.storage.sync.get(['api_base', 'app_origin']);
  return {
    API_BASE: (sync.api_base || defaults.API_BASE).replace(/\/$/, ''),
    APP_ORIGIN: (sync.app_origin || defaults.APP_ORIGIN).replace(/\/$/, ''),
  };
}

async function getDeviceId() {
  const { device_id } = await chrome.storage.local.get('device_id');
  if (device_id && String(device_id).length >= 8) return device_id;
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `ext-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  await chrome.storage.local.set({ device_id: id });
  return id;
}

function getDeviceLabel() {
  const ua = navigator.userAgent || '';
  let os = 'Desktop';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS|Macintosh/.test(ua)) os = 'Mac';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return `Chrome Extension (${os})`;
}

async function getAuth() {
  const data = await chrome.storage.local.get([
    'license_key',
    'premium_token',
    'device_id',
    'is_premium',
    'premium_devices',
  ]);
  return {
    license_key: data.license_key || '',
    premium_token: data.premium_token || '',
    device_id: data.device_id || '',
    is_premium: data.is_premium === true || data.is_premium === 'true',
    devices: data.premium_devices || null,
  };
}

async function setAuth({ license_key, premium_token, devices, max_devices, is_premium }) {
  const payload = {};
  if (license_key !== undefined) payload.license_key = license_key;
  if (premium_token !== undefined) payload.premium_token = premium_token;
  if (is_premium !== undefined) payload.is_premium = !!is_premium;
  if (devices !== undefined) {
    payload.premium_devices = { devices: devices || [], maxDevices: max_devices || 5 };
  }
  await chrome.storage.local.set(payload);
}

async function clearAuth() {
  await chrome.storage.local.remove(['premium_token', 'is_premium', 'premium_devices', 'license_key']);
}

async function activateLicense(licenseKey, extra = {}) {
  const { API_BASE } = await getOrigins();
  const device_id = await getDeviceId();
  const body = {
    license_key: licenseKey.trim(),
    device_id,
    device_label: getDeviceLabel(),
    ...extra,
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${API_BASE}/api/activate-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = { error: `Server error (${res.status})` };
    }
    return { res, data, device_id, API_BASE };
  } finally {
    clearTimeout(t);
  }
}

function setStatus(el, message, kind = '') {
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('error', 'ok');
  if (kind) el.classList.add(kind);
}

function renderDevices(devices, maxDevices, currentId) {
  if (!els.deviceList) return;
  if (!devices?.length) {
    els.deviceList.classList.add('hidden');
    els.deviceList.innerHTML = '';
    if (els.deviceCountLabel) els.deviceCountLabel.textContent = `0 / ${maxDevices || 5} devices`;
    return;
  }
  els.deviceList.classList.remove('hidden');
  if (els.deviceCountLabel) {
    els.deviceCountLabel.textContent = `${devices.length} / ${maxDevices || 5} devices`;
  }
  els.deviceList.innerHTML = devices
    .map((d) => {
      const isCurrent = d.id === currentId || d.is_current;
      const label = String(d.label || 'Device')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
      const id = String(d.id).replace(/"/g, '');
      return `<li class="device-item${isCurrent ? ' current' : ''}">
        <span>${label}${isCurrent ? ' <em>this</em>' : ''}</span>
        ${
          isCurrent
            ? ''
            : `<button type="button" class="btn btn-ghost btn-sm btn-revoke" data-device-id="${id}">Revoke</button>`
        }
      </li>`;
    })
    .join('');
}

async function refreshUI() {
  const auth = await getAuth();
  const premium = auth.is_premium && !!auth.premium_token;
  const premiumAvailable = Boolean(globalThis.SR_DEFAULTS?.PREMIUM_AVAILABLE);
  const { APP_ORIGIN } = await getOrigins();

  els.badge.textContent = premiumAvailable && premium ? 'Premium' : 'Free';
  els.badge.classList.toggle('premium', premium);
  els.badge.classList.toggle('free', !premiumAvailable || !premium);

  els.panelLogin.classList.toggle('hidden', premium || !premiumAvailable);
  els.panelAccount.classList.toggle('hidden', !premium || !premiumAvailable);

  if (els.linkBuy) els.linkBuy.href = `${APP_ORIGIN}/#importer-card`;

  if (!premiumAvailable) {
    els.tabHint.textContent = 'Read the active page in a private popup. It works offline and does not redirect.';
  } else if (premium) {
    const max = auth.devices?.maxDevices || 5;
    renderDevices(auth.devices?.devices || [], max, auth.device_id);
    els.tabHint.textContent = 'Premium active. Read locally, or open the full web workspace.';
  } else {
    els.tabHint.textContent =
      'Works free. Sign in with your lifetime license for Premium (1 of 5 device slots).';
  }

  if (els.onlineDot) {
    els.onlineDot.classList.toggle('offline', !navigator.onLine);
    els.onlineDot.title = navigator.onLine ? 'Online' : 'Offline';
  }
}

async function handleLogin() {
  const key = (els.licenseInput.value || '').trim();
  if (!key || !key.includes('.')) {
    setStatus(els.loginStatus, 'Paste a valid license key.', 'error');
    return;
  }
  if (!navigator.onLine) {
    setStatus(els.loginStatus, 'You appear offline. Connect and try again.', 'error');
    return;
  }

  els.btnLogin.disabled = true;
  setStatus(els.loginStatus, 'Signing in…');

  try {
    const { res, data, device_id } = await activateLicense(key);

    if (data.code === 'DEVICE_LIMIT') {
      await setAuth({
        license_key: key,
        is_premium: false,
        premium_token: '',
        devices: data.devices,
        max_devices: data.max_devices,
      });
      els.panelAccount.classList.remove('hidden');
      renderDevices(data.devices, data.max_devices, device_id);
      setStatus(
        els.loginStatus,
        data.error || 'Device limit reached. Revoke a device, then sign in again.',
        'error'
      );
      return;
    }

    if (data.code === 'KV_MISSING') {
      setStatus(
        els.loginStatus,
        'Server device registry not configured. Try again after deploy.',
        'error'
      );
      return;
    }

    if (!res.ok || !data.ok || !data.token) {
      setStatus(els.loginStatus, data.error || `Sign-in failed (${res.status}).`, 'error');
      return;
    }

    await setAuth({
      license_key: data.license_key || key,
      premium_token: data.token,
      is_premium: true,
      devices: data.devices,
      max_devices: data.max_devices,
    });

    els.licenseInput.value = '';
    setStatus(els.loginStatus, 'Premium unlocked on this extension.', 'ok');
    await refreshUI();
  } catch (err) {
    const msg =
      err?.name === 'AbortError'
        ? 'Request timed out. Check your connection.'
        : 'Could not reach SpeedRead. Check network or Options → API base.';
    setStatus(els.loginStatus, msg, 'error');
  } finally {
    els.btnLogin.disabled = false;
  }
}

async function handleRefresh() {
  const auth = await getAuth();
  if (!auth.license_key) {
    setStatus(els.accountStatus, 'No license key stored.', 'error');
    return;
  }
  setStatus(els.accountStatus, 'Refreshing session…');
  try {
    const { res, data } = await activateLicense(auth.license_key);
    if (res.ok && data.ok && data.token) {
      await setAuth({
        license_key: data.license_key || auth.license_key,
        premium_token: data.token,
        is_premium: true,
        devices: data.devices,
        max_devices: data.max_devices,
      });
      setStatus(els.accountStatus, 'Session refreshed.', 'ok');
      await refreshUI();
    } else if (data.code === 'DEVICE_LIMIT') {
      await setAuth({
        is_premium: false,
        premium_token: '',
        devices: data.devices,
        max_devices: data.max_devices,
      });
      setStatus(els.accountStatus, data.error || 'Device limit reached.', 'error');
      await refreshUI();
    } else {
      setStatus(els.accountStatus, data.error || 'Refresh failed.', 'error');
    }
  } catch {
    setStatus(els.accountStatus, 'Network error.', 'error');
  }
}

async function handleLogout() {
  const auth = await getAuth();
  if (auth.license_key) {
    try {
      await activateLicense(auth.license_key, { action: 'logout' });
    } catch (_) {
      /* offline: still clear local */
    }
  }
  await clearAuth();
  setStatus(els.loginStatus, 'Signed out.', 'ok');
  await refreshUI();
}

async function handleRevoke(deviceId) {
  const auth = await getAuth();
  if (!auth.license_key) return;
  setStatus(els.accountStatus, 'Revoking device…');
  try {
    const { res, data } = await activateLicense(auth.license_key, {
      revoke_device_id: deviceId,
    });
    if (res.ok && data.ok && data.token) {
      await setAuth({
        license_key: data.license_key || auth.license_key,
        premium_token: data.token,
        is_premium: true,
        devices: data.devices,
        max_devices: data.max_devices,
      });
      setStatus(els.accountStatus, 'Device revoked.', 'ok');
      await refreshUI();
    } else {
      setStatus(els.accountStatus, data.error || 'Revoke failed.', 'error');
    }
  } catch {
    setStatus(els.accountStatus, 'Network error.', 'error');
  }
}

async function openSpeedRead(withArticle) {
  setStatus(els.actionStatus, withArticle ? 'Opening reader…' : 'Opening app…');
  els.btnRead.disabled = true;
  try {
    if (!withArticle) {
      const { APP_ORIGIN } = await getOrigins();
      const auth = await getAuth();
      await chrome.storage.session.set({
        sr_handoff: {
          article: null,
          opened_at: Date.now(),
          expires_at: Date.now() + 60_000,
        },
      });
      await chrome.storage.local.set({
        sr_handoff: {
          article: null,
          opened_at: Date.now(),
          expires_at: Date.now() + 60_000,
        },
      });
      // Still pass premium via handoff (null article)
      await chrome.tabs.create({ url: `${APP_ORIGIN}/?source=extension&v=1` });
      setStatus(
        els.actionStatus,
        auth.is_premium ? 'Opened with Premium session.' : 'Opened.',
        'ok'
      );
      window.close();
      return;
    }

    const response = await chrome.runtime.sendMessage({ type: 'SR_OPEN_SPEEDREAD' });
    if (response && response.ok === false) {
      setStatus(els.actionStatus, response.error || 'Failed to open.', 'error');
      return;
    }
    setStatus(els.actionStatus, 'Opened.', 'ok');
    window.close();
  } catch (err) {
    setStatus(els.actionStatus, err.message || 'Failed to open SpeedRead.', 'error');
  } finally {
    els.btnRead.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    els.extVersion.textContent = chrome.runtime.getManifest().version;
  } catch (_) {}

  await getDeviceId();
  await refreshUI();

  // Silent re-bind only for this extension device (keeps session fresh)
  const auth = await getAuth();
  if (globalThis.SR_DEFAULTS?.PREMIUM_AVAILABLE && auth.license_key && navigator.onLine) {
    try {
      const { res, data } = await activateLicense(auth.license_key);
      if (res.ok && data.ok && data.token) {
        await setAuth({
          license_key: data.license_key || auth.license_key,
          premium_token: data.token,
          is_premium: true,
          devices: data.devices,
          max_devices: data.max_devices,
        });
        await refreshUI();
      } else if (data.code === 'DEVICE_LIMIT' || data.code === 'INVALID_KEY') {
        await setAuth({ is_premium: false, premium_token: '' });
        await refreshUI();
      }
    } catch (_) {}
  }

  els.btnLogin.addEventListener('click', handleLogin);
  els.licenseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  els.btnToggleKey.addEventListener('click', () => {
    const isPass = els.licenseInput.type === 'password';
    els.licenseInput.type = isPass ? 'text' : 'password';
    els.btnToggleKey.textContent = isPass ? 'Hide key' : 'Show key';
  });
  els.btnRefresh.addEventListener('click', handleRefresh);
  els.btnLogout.addEventListener('click', handleLogout);
  els.deviceList.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-revoke');
    if (btn) handleRevoke(btn.getAttribute('data-device-id'));
  });
  els.btnRead.addEventListener('click', () => openSpeedRead(true));
  els.btnOpenApp.addEventListener('click', () => openSpeedRead(false));
  if (els.linkOptions) {
    els.linkOptions.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }

  window.addEventListener('online', refreshUI);
  window.addEventListener('offline', refreshUI);
});
