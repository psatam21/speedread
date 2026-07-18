// Cloudflare Pages Function — Dodo Payments webhook receiver.
// Verifies the Standard Webhooks signature so only Dodo can hit this endpoint.
// This app has no database/user accounts, so premium unlock happens via
// verify-payment.js on the return_url instead of here. This handler just proves the
// signature checks out and 200s; wire it to email receipts / a DB once you have one.
// Environment variable: DODO_WEBHOOK_SECRET

async function verifySignature(id, timestamp, body, signatureHeader, secret) {
  const signedContent = `${id}.${timestamp}.${body}`;
  const secretBytes = Uint8Array.from(
    atob(secret.split('_').pop()),
    c => c.charCodeAt(0)
  );
  const key = await crypto.subtle.importKey(
    'raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  return signatureHeader.split(' ').some(part => part.split(',')[1] === expected);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.text();
  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');

  if (!id || !timestamp || !signature) {
    return new Response('Missing signature headers', { status: 400 });
  }

  const valid = await verifySignature(id, timestamp, body, signature, env.DODO_WEBHOOK_SECRET);
  if (!valid) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(body);
  console.log('Dodo webhook received:', event.type);

  return new Response('ok', { status: 200 });
}
