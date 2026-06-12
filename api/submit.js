// /api/submit — receives assessment result, writes to Supabase + Kit
// Env vars required (set in Vercel):
//   SUPABASE_URL, SUPABASE_KEY  (publishable key — insert-only RLS, Dr Madhu intelligence project)
//   KIT_API_KEY                 (Kit v4 API key, Arogya Clinic account)
// Tag IDs (Arogya Clinic): lead-magnet-assessment = 20107122 ; modak-nurture-so1 = 20111119

import { createClient } from '@supabase/supabase-js';

const ASSESSMENT_TAG = 20107122;   // lead-magnet-assessment
const NURTURE_TAG    = 20111119;   // modak-nurture-so1

export default async function handler(req, res) {
  // CORS (same-origin in prod, but safe)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const {
    name, email, phone,
    primary_concern, concern_other,
    age_group, duration, combination, medications, morning_erections,
    q_energy, q_physical, q_sleep, q_confidence, q_stress, q_pressure,
    q_communication, q_connection, q_satisfaction, q_knowledge, q_proactiveness, q_situation,
    dim_physical, dim_emotional, dim_relationship, dim_awareness,
    total_score, zone, weakest_dimension,
    utm_source, utm_medium, utm_campaign
  } = body || {};

  if (!email) return res.status(400).json({ error: 'email required' });

  const results = { supabase: false, kit: false };

  // ---- 1. WRITE TO SUPABASE (intelligence layer) ----
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const { error } = await supabase.from('assessment_results').insert([{
      name, email, phone,
      primary_concern, concern_other,
      age_group, duration, combination, medications, morning_erections,
      q_energy, q_physical, q_sleep, q_confidence, q_stress, q_pressure,
      q_communication, q_connection, q_satisfaction, q_knowledge, q_proactiveness, q_situation,
      dim_physical, dim_emotional, dim_relationship, dim_awareness,
      total_score, zone, weakest_dimension,
      utm_source, utm_medium, utm_campaign
    }]);
    if (error) console.error('Supabase insert error:', error.message);
    else results.supabase = true;
  } catch (e) { console.error('Supabase exception:', e.message); }

  // ---- 2. WRITE TO KIT (subscriber + tags + custom fields) ----
  // Kit v4: create/upsert subscriber, then add tags. Auth header: X-Kit-Api-Key
  try {
    const KIT = 'https://api.kit.com/v4';
    const headers = { 'Content-Type': 'application/json', 'X-Kit-Api-Key': process.env.KIT_API_KEY };

    // upsert subscriber with custom fields
    const subRes = await fetch(`${KIT}/subscribers`, {
      method: 'POST', headers,
      body: JSON.stringify({
        email_address: email,
        first_name: name || '',
        fields: {
          phone_number: phone || '',
          score: total_score != null ? String(total_score) : '',
          zone: zone || '',
          primary_concern: primary_concern || '',
          duration: duration || '',
          combination: combination || '',
          weakest_dimension: weakest_dimension || '',
          utm_source: utm_source || '',
          utm_medium: utm_medium || '',
          utm_campaign: utm_campaign || ''
        }
      })
    });
    const subData = await subRes.json().catch(() => ({}));
    const subId = subData?.subscriber?.id;

    // apply both tags (assessment + nurture trigger)
    if (subId) {
      await Promise.all([
        fetch(`${KIT}/tags/${ASSESSMENT_TAG}/subscribers/${subId}`, { method: 'POST', headers }),
        fetch(`${KIT}/tags/${NURTURE_TAG}/subscribers/${subId}`,    { method: 'POST', headers })
      ]);
      results.kit = true;
    } else {
      // fallback: tag by email (Kit v4 supports tagging via subscriber email lookup)
      console.error('No subscriber id returned from Kit:', JSON.stringify(subData).slice(0,300));
    }
  } catch (e) { console.error('Kit exception:', e.message); }

  // Always 200 so the front-end reveals the result; we logged any partial failures
  return res.status(200).json({ ok: true, ...results });
}
