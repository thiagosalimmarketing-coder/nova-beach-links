// Vercel Serverless Function — Nova Beach lead capture
// POST /api/lead
// Grava o lead no Supabase (tabela leads_captacao) ANTES de o usuario clicar no WhatsApp.
//
// Env vars (configurar em Vercel → Project Settings → Environment Variables):
//   SUPABASE_URL          — https://pkdtxatnvemynlybprtg.supabase.co
//   SUPABASE_SERVICE_KEY  — service_role key (NUNCA expor no front)
//
// Schema esperado: ver api/_leads-schema.sql

// Rate limit em memoria (reinicia a cada cold start — adequado pra abuso casual)
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const rateBuckets = new Map(); // ip → [timestamps]

// Dedup em memoria (10 min)
const DEDUP_WINDOW_MS = 10 * 60_000;
const dedupSet = new Map(); // tel → timestamp

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[lead] Supabase env vars missing — skipping persistence');
    return res.status(200).json({ ok: true, skipped: 'no-supabase-env' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  // ----- Rate limit -----
  const now = Date.now();
  const timestamps = (rateBuckets.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (timestamps.length >= RATE_MAX) {
    console.warn(`[lead] rate-limited ip=${ip} count=${timestamps.length}`);
    return res.status(429).json({ ok: false, error: 'rate_limited' });
  }
  timestamps.push(now);
  rateBuckets.set(ip, timestamps);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // ----- Validacao de telefone -----
    const telDigits = String(body.tel || '').replace(/\D/g, '');
    if (telDigits.length < 10 || telDigits.length > 13) {
      return res.status(400).json({ ok: false, error: 'invalid_phone', detail: `${telDigits.length} digits` });
    }

    // ----- Validacao de nome -----
    const nome = String(body.nome || '').trim();
    if (nome.length < 2 || nome.length > 80) {
      return res.status(400).json({ ok: false, error: 'invalid_name' });
    }

    // ----- Dedup por telefone (10 min) -----
    const dedupKey = telDigits;
    const lastSeen = dedupSet.get(dedupKey);
    if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
      console.log(`[lead] dedup hit tel=${telDigits.slice(-4)} age=${Math.round((now-lastSeen)/1000)}s`);
      return res.status(200).json({ ok: true, deduped: true });
    }
    dedupSet.set(dedupKey, now);
    // Garbage collect dedup entries antigas
    if (dedupSet.size > 500) {
      for (const [k, t] of dedupSet) {
        if (now - t > DEDUP_WINDOW_MS) dedupSet.delete(k);
      }
    }

    const row = {
      nome: nome.slice(0, 80),
      telefone: formatPhone(telDigits),
      vertical: String(body.path || '').slice(0, 40),
      interesse: String(body.choice || '').slice(0, 60),
      bairro: String(body.bairro || '').slice(0, 60),
      mensagem_wa: String(body.msg || '').slice(0, 500),
      utm_source: String(body.utm_source || '').slice(0, 80),
      utm_campaign: String(body.utm_campaign || '').slice(0, 120),
      utm_content: String(body.utm_content || '').slice(0, 120),
      utm_term: String(body.utm_term || '').slice(0, 80),
      fbclid: String(body.fbclid || '').slice(0, 200),
      user_agent: String(body.ua || '').slice(0, 300),
      ip
    };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/leads_captacao`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(row)
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error(`[lead] supabase error status=${r.status} ${txt.slice(0, 200)}`);
      return res.status(502).json({ ok: false, error: 'supabase_error', detail: txt.slice(0, 200) });
    }

    console.log(`[lead] saved tel=${telDigits.slice(-4)} vertical=${row.vertical} source=${row.utm_source || 'direct'}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[lead] exception', err);
    return res.status(500).json({ ok: false, error: 'exception', detail: String(err).slice(0, 200) });
  }
};

function formatPhone(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length === 11) return '(' + d.substr(0, 2) + ') ' + d.substr(2, 5) + '-' + d.substr(7);
  if (d.length === 10) return '(' + d.substr(0, 2) + ') ' + d.substr(2, 4) + '-' + d.substr(6);
  return d;
}
