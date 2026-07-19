// Cloudflare Pages Function — server-side URL content extractor.
// Replaces the client-side api.allorigins.win dependency with a first-party
// fetch so that CORS is handled server-side and there is no third-party SPOF.
// GET /api/extract?url=<encoded-url>

const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain'];
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB cap

export function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true;

  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224;
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = url.searchParams.get('url');

  if (!target) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Basic validation
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return new Response(JSON.stringify({ error: 'Only http/https URLs are supported' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isPrivateHost(parsed.hostname)) {
    return new Response(JSON.stringify({ error: 'Private network URLs are not supported' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SpeedReadBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Upstream returned ${res.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const isAllowed = ALLOWED_CONTENT_TYPES.some(t => contentType.includes(t));
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Unsupported content type' }), {
        status: 415,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Read body with size cap
    const reader = res.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        reader.cancel();
        break;
      }
      chunks.push(value);
    }

    const bodyBytes = new Uint8Array(totalBytes > MAX_BODY_BYTES ? MAX_BODY_BYTES : totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      const remaining = bodyBytes.byteLength - offset;
      if (chunk.byteLength > remaining) {
        bodyBytes.set(chunk.subarray(0, remaining), offset);
        break;
      }
      bodyBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const contents = new TextDecoder().decode(bodyBytes);

    return new Response(JSON.stringify({ contents, status: { url: target, http_code: res.status } }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Fetch failed', detail: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
