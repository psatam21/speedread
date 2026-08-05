import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/founding-seats
 * Public: claimed / remaining founding Lifetime seats (cap 50).
 */
const FOUNDING_CAP = 50;

const json = (response, status, body) => {
  response.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  return response.status(status).json(body);
};

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json(response, 503, { error: 'Not configured', cap: FOUNDING_CAP, claimed: null, remaining: null, open: true });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rpcData, error: rpcError } = await supabase.rpc('founding_seat_stats');
  if (!rpcError && rpcData) {
    return json(response, 200, {
      cap: Number(rpcData.cap) || FOUNDING_CAP,
      claimed: Number(rpcData.claimed) || 0,
      remaining: Number(rpcData.remaining) || 0,
      open: Boolean(rpcData.open),
    });
  }

  const { count, error } = await supabase
    .from('entitlements')
    .select('user_id', { count: 'exact', head: true })
    .eq('source', 'founding')
    .eq('status', 'active');

  if (error) {
    console.error('founding-seats count failed', error.message);
    return json(response, 500, { error: 'Could not load seats', cap: FOUNDING_CAP, claimed: null, remaining: null, open: true });
  }

  const claimed = count || 0;
  const remaining = Math.max(0, FOUNDING_CAP - claimed);
  return json(response, 200, {
    cap: FOUNDING_CAP,
    claimed,
    remaining,
    open: remaining > 0,
  });
}
