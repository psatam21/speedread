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

  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(response, 401, { error: 'Sign in with a Premium account to use AI' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return json(response, 401, { error: 'Session expired. Sign in again.' });

  const { data: entitlement } = await supabase
    .from('entitlements')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (entitlement?.status !== 'active') {
    return json(response, 403, { error: 'Lifetime Premium is required for hosted AI' });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return json(response, 503, { error: 'Hosted AI is not configured yet' });
  }

  const prompt = request.body?.contents
    ?.flatMap((content) => content.parts || [])
    .map((part) => part.text || '')
    .join('\n')
    .trim();
  if (!prompt) return json(response, 400, { error: 'Missing prompt' });

  const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://speedread-orcin.vercel.app',
      'X-OpenRouter-Title': 'SpeedRead',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 700,
    }),
  });
  const data = await aiResponse.json().catch(() => ({}));
  if (!aiResponse.ok) {
    console.error('OpenRouter request failed', aiResponse.status, data?.error?.message);
    return json(response, 502, { error: 'Hosted AI request failed' });
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) return json(response, 502, { error: 'AI returned an empty response' });

  return json(response, 200, {
    candidates: [{ content: { parts: [{ text }] } }],
    model: data.model,
  });
}

