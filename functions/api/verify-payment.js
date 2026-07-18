// GET /api/verify-payment?payment_id=&device_id=&device_label=
// Confirms Dodo payment, issues license key, registers KV row, binds this device.
// Env: DODO_API_KEY, DODO_MODE, JWT_SECRET, LICENSES (KV)

import { issueDeviceSession, issueLicenseKey } from '../_lib/tokens.js';
import {
  bindDevice,
  ensureLicenseRecord,
  putLicenseRecord,
  publicDevices,
} from '../_lib/licenses.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const paymentId = url.searchParams.get('payment_id');
  const deviceId = (url.searchParams.get('device_id') || '').trim();
  const deviceLabel = (url.searchParams.get('device_label') || 'Device').slice(0, 80);

  if (!paymentId) {
    return json({ error: 'Missing payment_id' }, 400);
  }

  if (!env.DODO_API_KEY) {
    return json({ ok: false, error: 'Payment API not configured' }, 500);
  }

  if (!env.JWT_SECRET) {
    return json({ ok: false, error: 'JWT_SECRET not configured' }, 500);
  }

  const base =
    env.DODO_MODE === 'live'
      ? 'https://live.dodopayments.com'
      : 'https://test.dodopayments.com';

  const res = await fetch(`${base}/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${env.DODO_API_KEY}` },
  });

  if (!res.ok) {
    return json({ ok: false, error: 'Payment lookup failed' }, 502);
  }

  const payment = await res.json();
  const succeeded = payment.status === 'succeeded';
  if (!succeeded) {
    return json({ ok: false });
  }

  // Deterministic license per payment so re-verify returns the same key
  const licenseKey = await issueLicenseKey(paymentId, env.JWT_SECRET);

  if (!env.LICENSES) {
    // Fail closed on device binding — still return key so support can fix KV and user re-activates
    return json({
      ok: true,
      license_key: licenseKey,
      token: null,
      payment_id: paymentId,
      warning: 'KV not bound — activate again after LICENSES is configured',
      code: 'KV_MISSING',
    });
  }

  let record = await ensureLicenseRecord(env.LICENSES, licenseKey, paymentId);

  let sessionToken = null;
  let devices = publicDevices(record, deviceId);

  if (deviceId && deviceId.length >= 8) {
    const bound = bindDevice(record, { id: deviceId, label: deviceLabel });
    if (bound.ok) {
      record = bound.record;
      const licenseHash = await putLicenseRecord(env.LICENSES, licenseKey, record);
      sessionToken = await issueDeviceSession(
        { paymentId, deviceId, licenseHash },
        env.JWT_SECRET
      );
      devices = publicDevices(record, deviceId);
    } else {
      // Payment ok but device limit hit — still return license for management
      return json({
        ok: true,
        license_key: licenseKey,
        token: null,
        payment_id: paymentId,
        devices: publicDevices(bound.record, deviceId),
        max_devices: bound.record.max_devices,
        warning: bound.error,
        code: bound.code,
      });
    }
  }

  return json({
    ok: true,
    license_key: licenseKey,
    token: sessionToken,
    payment_id: paymentId,
    devices,
    max_devices: record.max_devices,
  });
}
