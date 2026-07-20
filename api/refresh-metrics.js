import { createClient } from '@supabase/supabase-js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.authorization !== `Bearer ${expected}`) {
    return response.status(401).json({ error: 'Unauthorized' });
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return response.status(503).json({ error: 'Supabase is not configured' });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc('refresh_platform_totals');

  if (error) {
    console.error('Metric refresh failed', error.message);
    return response.status(500).json({ error: 'Metric refresh failed' });
  }

  response.setHeader('Cache-Control', 'no-store');
  const result = Array.isArray(data) ? data[0] : data;
  return response.status(200).json({ ok: true, refreshed_at: result?.refreshed_at ?? null });
}
