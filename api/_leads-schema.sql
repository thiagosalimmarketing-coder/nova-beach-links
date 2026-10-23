-- Nova Beach — tabela de captacao de leads do links.novabeachcampinas.com.br
-- Rodar em: Supabase (projeto pkdtxatnvemynlybprtg) → SQL Editor

create table if not exists public.leads_captacao (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  nome          text,
  telefone      text,
  email         text,          -- opcional (coletado no quiz pra melhor match rate CAPI)
  vertical      text,          -- bt | funcional | ct_nb360 | eventos | patrocinio
  interesse     text,          -- choice.key do quiz
  bairro        text,
  mensagem_wa   text,
  utm_source    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  fbclid        text,
  user_agent    text,
  ip            text
);

create index if not exists idx_leads_captacao_created on public.leads_captacao (created_at desc);
create index if not exists idx_leads_captacao_vertical on public.leads_captacao (vertical);
create index if not exists idx_leads_captacao_telefone on public.leads_captacao (telefone);
create index if not exists idx_leads_captacao_ip_created on public.leads_captacao (ip, created_at desc); -- rate limit lookup

-- Migration pra bases existentes:
-- alter table public.leads_captacao add column if not exists email text;

-- RLS: fica desabilitado (so service_role grava via API)
alter table public.leads_captacao disable row level security;

-- Query util pra cobranca mensal:
-- select date_trunc('month', created_at) as mes,
--        vertical,
--        count(*) as leads
-- from public.leads_captacao
-- group by 1, 2
-- order by 1 desc, 2;
