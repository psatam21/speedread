// License registry + device slots (Cloudflare KV binding: LICENSES).
// Sharing a key only works up to MAX_DEVICES; API access requires a device session token.

export const MAX_DEVICES = 5;

/**
 * @param {string} licenseKey
 */
export async function hashLicenseKey(licenseKey) {
  const data = new TextEncoder().encode(licenseKey);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {KVNamespace | undefined} kv
 * @param {string} licenseKey
 */
export async function getLicenseRecord(kv, licenseKey) {
  if (!kv) return null;
  const h = await hashLicenseKey(licenseKey);
  const record = await kv.get(`lic:${h}`, 'json');
  return record ? { ...record, _hash: h } : null;
}

/**
 * @param {KVNamespace | undefined} kv
 * @param {string} licenseKey
 * @param {object} record
 */
export async function putLicenseRecord(kv, licenseKey, record) {
  if (!kv) throw new Error('LICENSES KV not bound');
  const h = await hashLicenseKey(licenseKey);
  const { _hash, ...rest } = record;
  await kv.put(`lic:${h}`, JSON.stringify(rest));
  if (rest.payment_id) {
    await kv.put(`pay:${rest.payment_id}`, h);
  }
  return h;
}

/**
 * Ensure a KV row exists for a verified payment / license.
 * @param {KVNamespace} kv
 * @param {string} licenseKey
 * @param {string} paymentId
 */
export async function ensureLicenseRecord(kv, licenseKey, paymentId) {
  let record = await getLicenseRecord(kv, licenseKey);
  if (record) return record;

  record = {
    payment_id: paymentId,
    max_devices: MAX_DEVICES,
    devices: [],
    created_at: Date.now(),
    revoked: false,
  };
  await putLicenseRecord(kv, licenseKey, record);
  return { ...record, _hash: await hashLicenseKey(licenseKey) };
}

/**
 * Register or refresh a device. Returns { ok, record, error?, code? }
 * @param {object} record
 * @param {{ id: string, label?: string }} device
 */
export function bindDevice(record, device) {
  if (record.revoked) {
    return { ok: false, code: 'REVOKED', error: 'This license has been revoked. Contact support.' };
  }

  const devices = Array.isArray(record.devices) ? [...record.devices] : [];
  const max = record.max_devices || MAX_DEVICES;
  const now = Date.now();
  const existing = devices.findIndex((d) => d.id === device.id);

  if (existing >= 0) {
    devices[existing] = {
      ...devices[existing],
      label: device.label || devices[existing].label || 'Device',
      last_seen: now,
    };
    return { ok: true, record: { ...record, devices } };
  }

  if (devices.length >= max) {
    return {
      ok: false,
      code: 'DEVICE_LIMIT',
      error: `This license is active on ${devices.length}/${max} devices. Revoke one to add this device.`,
      record: { ...record, devices },
    };
  }

  devices.push({
    id: device.id,
    label: (device.label || 'Device').slice(0, 80),
    activated_at: now,
    last_seen: now,
  });

  return { ok: true, record: { ...record, devices } };
}

/**
 * @param {object} record
 * @param {string} deviceId
 */
export function revokeDevice(record, deviceId) {
  const devices = (record.devices || []).filter((d) => d.id !== deviceId);
  return { ...record, devices };
}

/**
 * Public device list (no raw secrets).
 * @param {object} record
 * @param {string} [currentDeviceId]
 */
export function publicDevices(record, currentDeviceId) {
  return (record.devices || []).map((d) => ({
    id: d.id,
    label: d.label,
    activated_at: d.activated_at,
    last_seen: d.last_seen,
    is_current: currentDeviceId ? d.id === currentDeviceId : false,
  }));
}
