// /api/reached — records that someone SAW the details screen and got a score.
// Deliberately holds NO name, email or phone. Its only job is to give us the
// drop-off number: how many saw this screen versus how many actually submitted.
// Env: SUPABASE_URL, SUPABASE_KEY (publishable — insert-only RLS on assessment_reached)

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { total_score, zone, weakest_dimension, primary_concern, age_group, utm_source } = body || {};

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const { error } = await supabase.from('assessment_reached').insert([{
      total_score, zone, weakest_dimension, primary_concern, age_group, utm_source
    }]);
    if (error) console.error('reached insert error:', error.message);
  } catch (e) { console.error('reached exception:', e.message); }

  // Always succeed. This is measurement, it must never block a real lead.
  return res.status(200).json({ ok: true });
}
