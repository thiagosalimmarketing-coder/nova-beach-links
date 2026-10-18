# Captacao de Leads — links.novabeachcampinas.com.br

Grava TODO lead que preenche o form (step 4 do quiz) ANTES de ir pro WhatsApp.
Base pra cobrar atendimento depois.

## Arquitetura

```
Form step 4 → sendLead(payload) → dispara em paralelo:
                                    ├─ POST /api/lead      → Supabase (fonte da verdade)
                                    └─ POST SHEETS_URL     → Google Sheets (espelho visual)
                                   → renderSummary() → step 5 → clica "Chamar no WhatsApp" → wa.me
```

Os dois endpoints sao fire-and-forget com `keepalive:true` — nao bloqueiam o
redirect pro WhatsApp mesmo se um deles cair.

---

## 1) Supabase (fonte da verdade)

### a) Criar tabela
Supabase (projeto `pkdtxatnvemynlybprtg`) → SQL Editor → cola `_leads-schema.sql` → Run.

### b) Env vars no Vercel
`nova-beach-links` → Settings → Environment Variables → adicionar nos 3 ambientes
(Production, Preview, Development):

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | `https://pkdtxatnvemynlybprtg.supabase.co` |
| `SUPABASE_SERVICE_KEY` | service_role key (Supabase → Settings → API → service_role) |

> **Nunca** colocar a service_role key no front. Ela so vive no serverless.

### c) Query mensal pra cobranca
```sql
select date_trunc('month', created_at) as mes,
       vertical,
       count(*) as leads
from public.leads_captacao
group by 1, 2
order by 1 desc, 2;
```

---

## 2) Google Sheets (espelho visual)

### a) Deploy do Apps Script
1. Abre a planilha CRM: https://docs.google.com/spreadsheets/d/1eT_ES6ezk5dJltOmRR9RXCXhKO_dXhWSZu6JWd3gbMw
2. Extensoes → Apps Script
3. Apaga o Code.gs padrao → cola `_leads-apps-script.gs` inteiro
4. Salva (disquete)
5. Implantar → Nova implantacao → engrenagem → "App da Web"
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
6. Implantar → autoriza → copia a URL (termina em `/exec`)

### b) Cola a URL
`index.html` linha ~701:
```js
const SHEETS_URL = 'https://script.google.com/macros/s/XXXXX/exec';
```

Commit + deploy Vercel. Aba "Leads Captacao Site" aparece automatica no 1o lead.

---

## 3) Testar

1. Abre https://links.novabeachcampinas.com.br/?utm_source=teste&utm_campaign=teste&p=jogar
2. Faz o fluxo ate o step 4 (nome + tel + LGPD)
3. Clica "Avancar" (vai pro step 5 — ja gravou os 2 lugares)
4. Verifica:
   - Supabase → Table Editor → `leads_captacao` → tem linha
   - Sheets → aba "Leads Captacao Site" → tem linha

Se Supabase vazio → checa env vars no Vercel + logs em
`vercel.com/[org]/nova-beach-links/logs` filtrando por `/api/lead`.
Se Sheets vazio → confere se a URL do Apps Script tem permissao "Qualquer pessoa".
