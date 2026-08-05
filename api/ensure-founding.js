import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/ensure-founding
 * Auth: Bearer <supabase access token>
 *
 * Grants Lifetime Premium to the first 50 accounts (source=founding).
 * Idempotent. Prefer DB trigger on signup; this covers existing users
 * and clients that cannot call RPC (or migration not yet applied).
 */
const json = (response, status, body) => {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
};

const FOUNDING_CAP = 50;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!supabaseUrl || !serviceKey || !accessToken) {
    return json(response, 401, { error: 'Sign in required' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !user) return json(response, 401, { error: 'Session expired. Sign in again.' });

  // Prefer SQL function (atomic cap + lock) when migration is applied.
  const { data: rpcData, error: rpcError } = await supabase.rpc('try_grant_founding_lifetime', {
    p_user_id: user.id,
  });

  if (!rpcError && rpcData) {
    return json(response, 200, {
      ok: true,
      premium: Boolean(rpcData.premium),
      granted: Boolean(rpcData.granted),
      reason: rpcData.reason || null,
      source: rpcData.source || null,
      remaining: typeof rpcData.remaining === 'number' ? rpcData.remaining : null,
    });
  }

  // Fallback if migration not deployed yet (best-effort; slight race risk).
  if (rpcError) {
    console.warn('try_grant_founding_lifetime RPC unavailable, using fallback', rpcError.message);
  }

  const { data: existing } = await supabase
    .from('entitlements')
    .select('status, source')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing?.status === 'active') {
    return json(response, 200, {
      ok: true,
      premium: true,
      granted: false,
      reason: 'already_active',
      source: existing.source,
    });
  }

  if (existing?.status === 'refunded' || existing?.status === 'revoked') {
    return json(response, 200, {
      ok: true,
      premium: false,
      granted: false,
      reason: existing.status,
    });
  }

  const { count, error: countError } = await supabase
    .from('entitlements')
    .select('user_id', { count: 'exact', head: true })
    .eq('source', 'founding')
    .eq('status', 'active');

  if (countError) {
    console.error('Founding count failed', countError.message);
    return json(response, 500, { error: 'Could not check founding seats' });
  }

  if ((count || 0) >= FOUNDING_CAP) {
    await supabase.from('entitlements').upsert({
      user_id: user.id,
      product_key: 'briskread_lifetime',
      status: 'inactive',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    return json(response, 200, {
      ok: true,
      premium: false,
      granted: false,
      reason: 'cap_reached',
      remaining: 0,
    });
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await supabase.from('entitlements').upsert({
    user_id: user.id,
    product_key: 'briskread_lifetime',
    status: 'active',
    source: 'founding',
    granted_at: now,
    updated_at: now,
  }, { onConflict: 'user_id' });

  if (upsertError) {
    console.error('Founding grant failed', upsertError.message);
    return json(response, 500, { error: 'Could not grant founding Premium' });
  }

  return json(response, 200, {
    ok: true,
    premium: true,
    granted: true,
    reason: 'founding_granted',
    source: 'founding',
    remaining: Math.max(0, FOUNDING_CAP - (count || 0) - 1),
  });
}
