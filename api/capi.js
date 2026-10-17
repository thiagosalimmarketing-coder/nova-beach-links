// Vercel Serverless Function — Meta Conversions API (CAPI) relay
// POST /api/capi
// Env vars required:
//   META_PIXEL_ID        — e.g. "1397968278475446"
//   META_CAPI_TOKEN      — permanent access token (System User with Pixel/Dataset perms)
// Optional:
//   META_CAPI_TEST_CODE  — e.g. "TESTxxxxx" → mirrors event to Test Events tab in Events Manager
//
// Expected body (JSON):
//   {
//     event_name: 'Lead' | 'Purchase' | 'ViewContent' | ...,
//     event_id: 'unique-uuid-here',          // MUST match Pixel eventID for dedup
//     event_time: 1760000000,                 // seconds, unix
//     event_source_url: 'https://...',
//     action_source: 'website',
//     user_data: {
//       fbp: '...',                           // _fbp cookie
//       fbc: '...',                           // _fbc cookie (set from fbclid)
//       phone: '+55...',                      // raw, will be hashed
//       email: '...',                         // raw, will be hashed
//       name: '...'                           // raw, will be hashed
//     },
//     custom_data: { ... }                    // utm_source, utm_campaign, content_name, etc.
//   }

const crypto = require('crypto');

const sha256 = (v) => {
  if (!v) return undefined;
  return crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');
};

const normalizePhone = (p) => {
  if (!p) return undefined;
  const digits = String(p).replace(/\D/g, '');
  if (!digits) return undefined;
  return digits.startsWith('55') ? digits : '55' + digits;
};

module.exports = async (req, res) => {
  // CORS (same-origin fetch doesn't strictly need it, but we're defensive)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const PIXEL_ID = process.env.META_PIXEL_ID;
  const TOKEN = process.env.META_CAPI_TOKEN;
  const TEST_CODE = process.env.META_CAPI_TEST_CODE;

  if (!PIXEL_ID || !TOKEN) {
    return res.status(500).json({ error: 'missing_env', hint: 'Set META_PIXEL_ID and META_CAPI_TOKEN in Vercel env' });
  }

  // Vercel parses JSON body automatically when Content-Type is application/json
  const body = req.body || {};
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress;
  const ua = req.headers['user-agent'];

  const u = body.user_data || {};
  const phoneNormalized = normalizePhone(u.phone);

  const payload = {
    data: [{
      event_name: body.event_name,
      event_time: body.event_time || Math.floor(Date.now() / 1000),
      event_id: body.event_id,
      event_source_url: body.event_source_url,
      action_source: body.action_source || 'website',
      user_data: {
        em: u.email ? [sha256(u.email)] : undefined,
        ph: phoneNormalized ? [sha256(phoneNormalized)] : undefined,
        fn: u.name ? [sha256(u.name)] : undefined,
        fbp: u.fbp || undefined,
        fbc: u.fbc || undefined,
        client_ip_address: ip,
        client_user_agent: ua
      },
      custom_data: body.custom_data || {}
    }]
  };

  // Clean undefined keys inside user_data
  Object.keys(payload.data[0].user_data).forEach(k => {
    if (payload.data[0].user_data[k] === undefined) delete payload.data[0].user_data[k];
  });

  if (TEST_CODE) payload.test_event_code = TEST_CODE;

  const url = `https://graph.facebook.com/v20.0/${PIXEL_ID}/events?access_token=${TOKEN}`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, meta: data });
  } catch (err) {
    return res.status(500).json({ error: 'capi_fetch_failed', message: String(err?.message || err) });
  }
};
