import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Dodo Payments webhook receiver (Standard Webhooks spec).
//
// This is the safety net for the return_url flow in verify-payment.js: if a
// customer pays and closes the tab before being redirected back, that flow never
// runs and they get charged with nothing to show for it. Dodo still calls this,
// so Premium gets attached either way.
//
// Signature verification needs the EXACT bytes Dodo signed, so body parsing is
// disabled here — re-serialising a parsed object does not round-trip reliably.
export const config = { api: { bodyParser: false } };

// Reject anything older than this to blunt replay attacks (Standard Webhooks
// recommends 5 minutes).
const MAX_SKEW_SECONDS = 300;

const readRawBody = (request) => new Promise((resolve, reject) => {
  let data = '';
  request.on('data', (chunk) => { data += chunk; });
  request.on('end', () => resolve(data));
  request.on('error', reject);
});

export const signatureMatches = (id, timestamp, rawBody, signatureHeader, secret) => {
  // Secrets arrive as whsec_<base64>; the bytes after the prefix are the key.
  const secretBytes = Buffer.from(secret.split('_').pop(), 'base64');
  const expected = Buffer.from(
    crypto.createHmac('sha256', secretBytes)
      .update(`${id}.${timestamp}.${rawBody}`)
      .digest('base64')
  );

  // Header is space-separated "v1,<sig>" pairs; more than one during key rotation.
  return signatureHeader.split(' ').some((part) => {
    const candidate = Buffer.from(part.split(',')[1] || '');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
};

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DODO_WEBHOOK_SECRET) {
    console.error('Webhook hit but DODO_WEBHOOK_SECRET is not set');
    return response.status(503).json({ error: 'Webhook is not configured' });
  }

  const rawBody = await readRawBody(request);
  const id = request.headers['webhook-id'];
  const timestamp = request.headers['webhook-timestamp'];
  const signature = request.headers['webhook-signature'];
  if (!id || !timestamp || !signature) {
    return response.status(400).json({ error: 'Missing signature headers' });
  }

  const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(skew) || skew > MAX_SKEW_SECONDS) {
    return response.status(400).json({ error: 'Timestamp outside tolerance' });
  }

  if (!signatureMatches(id, timestamp, rawBody, signature, process.env.DODO_WEBHOOK_SECRET)) {
    return response.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return response.status(400).json({ error: 'Malformed payload' });
  }

  // Ack anything we don't act on, otherwise Dodo keeps retrying it forever.
  if (!String(event.type || '').startsWith('payment.succeeded')) {
    return response.status(200).json({ ok: true, ignored: event.type || 'unknown' });
  }

  const data = event.data || {};
  const paymentId = data.payment_id || data.id || null;
  const userId = data.metadata?.briskread_user_id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId || '')) {
    // Signature was valid, so this is a real Dodo event we simply can't attribute.
    // 200 rather than an error: retrying will not make the metadata appear.
    console.error('payment.succeeded without a usable briskread_user_id', paymentId);
    return response.status(200).json({ ok: false, reason: 'unattributed' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Supabase env missing; cannot grant entitlement for', paymentId);
    return response.status(503).json({ error: 'Entitlement store is not configured' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Same shape and conflict target as verify-payment.js, so whichever path lands
  // first wins and the second is a harmless no-op.
  const { error } = await supabase.from('entitlements').upsert({
    user_id: userId,
    product_key: 'briskread_lifetime',
    status: 'active',
    source: 'dodo',
    source_payment_id: paymentId,
    granted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (error) {
    // 500 so Dodo retries; the upsert is idempotent so a retry is safe.
    console.error('Entitlement upsert failed', error.message);
    return response.status(500).json({ error: 'Could not attach Premium' });
  }

  return response.status(200).json({ ok: true });
}
