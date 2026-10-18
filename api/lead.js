// Vercel Serverless Function — Nova Beach lead capture
// POST /api/lead
// Grava o lead no Supabase (tabela leads_captacao) ANTES de o usuario clicar no WhatsApp.
//
// Env vars (configurar em Vercel → Project Settings → Environment Variables):
//   SUPABASE_URL          — https://pkdtxatnvemynlybprtg.supabase.co
//   SUPABASE_SERVICE_KEY  — service_role key (NUNCA expor no front)
//
// Schema esperado (rodar em supabase-schema.sql primeiro):
//   leads_captacao (id, created_at, nome, telefone, vertical, interesse, bairro,
//                   mensagem_wa, utm_source, utm_campaign, utm_content, utm_term,
//                   fbclid, user_agent, ip)

module.exports = async (req, res) => {
  // CORS basico (mesmo dominio ja funciona, mas deixa aberto por garantia)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ ok: false, error: 'Supabase env vars missing' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;

    const row = {
      nome: (body.nome || '').toString().slice(0, 80),
      telefone: formatPhone(body.tel || ''),
      vertical: (body.path || '').toString().slice(0, 40),
      interesse: (body.choice || '').toString().slice(0, 60),
      bairro: (body.bairro || '').toString().slice(0, 60),
      mensagem_wa: (body.msg || '').toString().slice(0, 500),
      utm_source: (body.utm_source || '').toString().slice(0, 80),
      utm_campaign: (body.utm_campaign || '').toString().slice(0, 120),
      utm_content: (body.utm_content || '').toString().slice(0, 120),
      utm_term: (body.utm_term || '').toString().slice(0, 80),
      fbclid: (body.fbclid || '').toString().slice(0, 200),
      user_agent: (body.ua || '').toString().slice(0, 300),
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
      return res.status(502).json({ ok: false, error: 'Supabase error', detail: txt.slice(0, 200) });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err).slice(0, 200) });
  }
};

function formatPhone(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length === 11) return '(' + d.substr(0, 2) + ') ' + d.substr(2, 5) + '-' + d.substr(7);
  if (d.length === 10) return '(' + d.substr(0, 2) + ') ' + d.substr(2, 4) + '-' + d.substr(6);
  return d;
}
