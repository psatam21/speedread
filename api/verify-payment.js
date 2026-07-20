import { createClient } from '@supabase/supabase-js';

const json = (response, status, body) => {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
};

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const paymentId = String(request.query.payment_id || '').trim();
  if (!paymentId) return json(response, 400, { error: 'Missing payment_id' });
  if (!process.env.DODO_API_KEY) return json(response, 503, { error: 'Payment API is not configured' });

  const base = process.env.DODO_MODE === 'live'
    ? 'https://live.dodopayments.com'
    : 'https://test.dodopayments.com';
  const paymentResponse = await fetch(`${base}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${process.env.DODO_API_KEY}` },
  });
  if (!paymentResponse.ok) return json(response, 502, { error: 'Payment lookup failed' });

  const payment = await paymentResponse.json();
  if (payment.status !== 'succeeded') return json(response, 409, { ok: false, status: payment.status });

  let userId = payment.metadata?.speedread_user_id;
  if (!userId && payment.checkout_session_id) {
    const checkoutResponse = await fetch(`${base}/checkouts/${encodeURIComponent(payment.checkout_session_id)}`, {
      headers: { Authorization: `Bearer ${process.env.DODO_API_KEY}` },
    });
    if (checkoutResponse.ok) {
      const checkout = await checkoutResponse.json();
      userId = checkout.metadata?.speedread_user_id;
    }
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId || '')) {
    return json(response, 409, { error: 'This payment is not linked to a SpeedRead account' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.from('entitlements').upsert({
    user_id: userId,
    product_key: 'speedread_lifetime',
    status: 'active',
    source: 'dodo',
    source_payment_id: paymentId,
    granted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (error) {
    console.error('Entitlement upsert failed', error.message);
    return json(response, 500, { error: 'Could not attach Premium to the account' });
  }

  return json(response, 200, { ok: true, account_linked: true });
}

