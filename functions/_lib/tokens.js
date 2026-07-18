// Shared HMAC token helpers for Cloudflare Pages Functions.
// - license keys: portable proof of purchase (still needs device activation + KV slot)
// - device sessions: short-lived-ish tokens used for API (Gemini); bound to device id

/**
 * @param {object} payload
 * @param {string} secret
 * @returns {Promise<string>}
 */
export async function signToken(payload, secret) {
  if (!secret) throw new Error('JWT_SECRET not configured');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const payloadB64 = btoa(JSON.stringify(payload));
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
  return `${payloadB64}.${sigB64}`;
}

/**
 * @param {string} token
 * @param {string} secret
 * @returns {Promise<object|null>}
 */
export async function verifyToken(token, secret) {
  if (!token || !secret) return null;
  try {
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return null;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payloadB64));
    if (!valid) return null;

    return JSON.parse(atob(payloadB64));
  } catch {
    return null;
  }
}

/**
 * Portable multi-device license bound to a verified payment_id.
 * Alone is not enough for Premium APIs — must activate a device slot.
 */
export async function issueLicenseKey(paymentId, secret) {
  return signToken(
    {
      typ: 'license',
      pid: paymentId,
      iat: Date.now(),
    },
    secret
  );
}

/**
 * Device session used as Bearer for premium APIs.
 * Bound to device_id so a shared license without activation does not unlock APIs forever.
 */
export async function issueDeviceSession({ paymentId, deviceId, licenseHash }, secret) {
  return signToken(
    {
      typ: 'device',
      pid: paymentId,
      did: deviceId,
      lid: licenseHash,
      iat: Date.now(),
    },
    secret
  );
}

/**
 * Verify purchase license key (activation path only).
 */
export async function verifyLicenseKey(token, secret) {
  const payload = await verifyToken(token, secret);
  if (!payload) return null;
  if (payload.typ === 'license' && payload.pid) return payload;
  if (payload.payment_id) return { typ: 'license', pid: payload.payment_id, iat: payload.ts || payload.iat };
  return null;
}

/**
 * Verify premium API access: device session preferred.
 * Legacy license-only tokens rejected for Gemini (force re-activate).
 */
export async function verifyDeviceSession(token, secret) {
  const payload = await verifyToken(token, secret);
  if (!payload) return null;
  if (payload.typ === 'device' && payload.pid && payload.did) return payload;
  return null;
}

/** @deprecated use verifyLicenseKey / verifyDeviceSession */
export async function verifyPremiumToken(token, secret) {
  return (
    (await verifyDeviceSession(token, secret)) ||
    (await verifyLicenseKey(token, secret))
  );
}
