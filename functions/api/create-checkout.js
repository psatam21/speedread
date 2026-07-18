// Cloudflare Pages Function — creates a Dodo Payments checkout session server-side
// so the API key never reaches the browser.
// Environment variables (set in Cloudflare Pages dashboard):
//   DODO_API_KEY, DODO_PRODUCT_ID, DODO_MODE ("live" or "test")

export async function onRequestPost(context) {
  const { env, request } = context;
  const origin = new URL(request.url).origin;

  const base = env.DODO_MODE === 'live'
    ? 'https://live.dodopayments.com'
    : 'https://test.dodopayments.com';

  const res = await fetch(`${base}/checkouts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.DODO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product_cart: [{ product_id: env.DODO_PRODUCT_ID, quantity: 1 }],
      return_url: `${origin}/?checkout=return`,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return new Response(JSON.stringify({ error: 'Failed to create checkout session', detail: errText }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await res.json();
  return new Response(JSON.stringify({ checkout_url: data.checkout_url || data.url }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
