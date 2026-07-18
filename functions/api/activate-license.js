// POST /api/activate-license
// Body: { license_key, device_id, device_label?, revoke_device_id? }
// - Verifies HMAC license
// - Binds this device into KV slot (max 5)
// - Optional revoke_device_id frees a slot when at capacity
// - Returns device session token (not the license alone) for API use
// Env: JWT_SECRET, LICENSES (KV)

import { issueDeviceSession, verifyLicenseKey } from '../_lib/tokens.js';
import {
  bindDevice,
  ensureLicenseRecord,
  getLicenseRecord,
  publicDevices,
  putLicenseRecord,
  revokeDevice,
} from '../_lib/licenses.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.JWT_SECRET) {
    return json({ error: 'Server not configured' }, 500);
  }

  if (!env.LICENSES) {
    return json(
      {
        error:
          'Device registry not configured. Bind Cloudflare KV namespace "LICENSES" to this project.',
        code: 'KV_MISSING',
      },
      503
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const licenseKey = (body.license_key || body.token || '').trim();
  const deviceId = (body.device_id || '').trim();
  const deviceLabel = (body.device_label || 'Device').toString().slice(0, 80);
  const revokeDeviceId = (body.revoke_device_id || '').trim();
  // logout: revoke this device_id and do not re-bind (Chrome extension sign-out)
  const isLogout = body.action === 'logout' || body.unbind === true;

  if (!licenseKey || !licenseKey.includes('.')) {
    return json({ error: 'Missing or invalid license key' }, 400);
  }
  if (!deviceId || deviceId.length < 8 || deviceId.length > 128) {
    return json({ error: 'Missing or invalid device_id' }, 400);
  }

  const licensePayload = await verifyLicenseKey(licenseKey, env.JWT_SECRET);
  if (!licensePayload) {
    return json({ ok: false, error: 'Invalid license key', code: 'INVALID_KEY' }, 401);
  }

  const paymentId = licensePayload.pid;
  let record = await ensureLicenseRecord(env.LICENSES, licenseKey, paymentId);

  // Free a slot if requested (must own the license)
  if (revokeDeviceId) {
    record = revokeDevice(record, revokeDeviceId);
    await putLicenseRecord(env.LICENSES, licenseKey, record);
  }

  if (isLogout) {
    record = revokeDevice(record, deviceId);
    await putLicenseRecord(env.LICENSES, licenseKey, record);
    return json({
      ok: true,
      unbound: true,
      payment_id: paymentId,
      devices: publicDevices(record, null),
      max_devices: record.max_devices,
    });
  }

  const bound = bindDevice(record, { id: deviceId, label: deviceLabel });
  if (!bound.ok) {
    return json(
      {
        ok: false,
        error: bound.error,
        code: bound.code,
        devices: publicDevices(bound.record, deviceId),
        max_devices: bound.record.max_devices,
      },
      bound.code === 'DEVICE_LIMIT' ? 409 : 403
    );
  }

  record = bound.record;
  const licenseHash = await putLicenseRecord(env.LICENSES, licenseKey, record);

  const sessionToken = await issueDeviceSession(
    { paymentId, deviceId, licenseHash },
    env.JWT_SECRET
  );

  return json({
    ok: true,
    token: sessionToken,
    license_key: licenseKey,
    payment_id: paymentId,
    device_id: deviceId,
    devices: publicDevices(record, deviceId),
    max_devices: record.max_devices,
  });
}
