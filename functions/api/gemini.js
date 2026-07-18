// Premium Gemini proxy — requires device session token (typ: device), not bare license.
// Env: GEMINI_API_KEY, JWT_SECRET, LICENSES (optional re-check that device still registered)

import { verifyDeviceSession } from '../_lib/tokens.js';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function onRequestPost(context) {
  const { env, request } = context;

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const session = await verifyDeviceSession(token, env.JWT_SECRET);
  if (!session) {
    return new Response(
      JSON.stringify({
        error: 'Invalid or missing device session. Activate Premium on this device with your license key.',
        code: 'DEVICE_SESSION_REQUIRED',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // If KV is available, ensure this device is still on the roster (revoked devices lose API)
  if (env.LICENSES && session.lid) {
    const record = await env.LICENSES.get(`lic:${session.lid}`, 'json');
    if (record) {
      if (record.revoked) {
        return new Response(JSON.stringify({ error: 'License revoked', code: 'REVOKED' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const stillBound = (record.devices || []).some((d) => d.id === session.did);
      if (!stillBound) {
        return new Response(
          JSON.stringify({
            error: 'This device is no longer activated. Re-activate with your license key.',
            code: 'DEVICE_REVOKED',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Gemini API key not configured on server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const geminiUrl = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

  try {
    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Gemini API error', detail: data }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Gemini proxy failed', detail: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
