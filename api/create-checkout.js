import { createClient } from '@supabase/supabase-js';

const json = (response, status, body) => {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!supabaseUrl || !serviceKey || !accessToken) {
    return json(response, 401, { error: 'Sign in before checkout' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !user) return json(response, 401, { error: 'Session expired. Sign in again.' });

  if (!process.env.DODO_API_KEY || !process.env.DODO_PRODUCT_ID) {
    return json(response, 503, { error: 'Checkout is not configured yet' });
  }

  const base = process.env.DODO_MODE === 'live'
    ? 'https://live.dodopayments.com'
    : 'https://test.dodopayments.com';
  const origin = `https://${request.headers['x-forwarded-host'] || request.headers.host}`;
  const checkout = await fetch(`${base}/checkouts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DODO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product_cart: [{ product_id: process.env.DODO_PRODUCT_ID, quantity: 1 }],
      return_url: `${origin}/?checkout=return`,
      metadata: { speedread_user_id: user.id },
    }),
  });

  if (!checkout.ok) {
    console.error('Dodo checkout failed', checkout.status, await checkout.text());
    return json(response, 502, { error: 'Could not start checkout' });
  }

  const data = await checkout.json();
  return json(response, 200, { checkout_url: data.checkout_url || data.url });
}

