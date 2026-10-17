#!/bin/bash
# Generator: creates /ads/<slot>, /site/<slot>, and /handoff/<slot> pages.
#
# Architecture:
#   /ads/*     — Meta Ads landings. Lead pixel event. Some route to AI (5983),
#                others to human (5575156). AI qualifies then hands off.
#   /site/*    — Organic/site landings. Same pixel, source=site. Always human.
#   /handoff/* — Bot sends this link after qualifying. Purchase/Schedule event.
#                Always human. Clean, natural pre-filled message.
#
# Numbers:
#   5519989725983 — AI (Agi Genies) — receives ads/* qualified flows
#   5519995575156 — Human atendimento — receives all site/*, handoff/*, quadra, reservas
#   5519999178194 — Funcional na Areia (dedicated number)
#
# Pixel signal quality: Lead/Purchase/Schedule fire INSIDE the setTimeout callback,
# just before redirect. This filters bots/crawlers and page loads that never
# converted, giving Meta a cleaner signal to optimize on.

set -e
cd "$(dirname "$0")"

PIXEL="1397968278475446"

# Ajuste 2026-09-28: numeros reatribuidos.
#   IA (Agi Genies)   -> 5519994557698 (linha nova dedicada ao bot)
#   CRM (Reportana)   -> 5519989725983 (linha antiga do "atendimento app", agora usada
#                        para disparos/nutricao automatizada pelo CRM)
#   Humano (recepcao) -> 5519995575156 (sem mudanca)
#   Funcional         -> 5519999178194 (legacy, modalidade descontinuada)
AI_PHONE="5519994557698"
CRM_PHONE="5519989725983"
HUMAN_PHONE="5519995575156"
FUNCIONAL_PHONE="5519999178194"

# ─────────────────────────────────────────────────────────────
# CHAVE DA IA (2026-10-16): a NOVA (Agi Genies) ainda NAO esta no ar.
# Enquanto isso, toda porta de entrada (/ads, /site, bio, CRM "saber mais")
# vai direto para a recepcao humana. Quando a IA estiver ativa e testada,
# troque para:  ENTRY_PHONE="${AI_PHONE}"  e rode ./_generate.sh de novo.
# ─────────────────────────────────────────────────────────────
ENTRY_PHONE="${HUMAN_PHONE}"

BASE_URL="https://links.novabeachcampinas.com.br"

# ─────────────────────────────────────────────────────────────
# TABLE 1: Products (drives /ads/* and /site/*)
# slot | ads_phone | site_phone | content_name | product_label
# ─────────────────────────────────────────────────────────────
PRODUCTS=(
  "bt|${ENTRY_PHONE}|${ENTRY_PHONE}|beach_tennis|Beach Tennis"
  "bt-1x|${ENTRY_PHONE}|${ENTRY_PHONE}|beach_tennis_1x_semana|plano Beach Tennis 1x por semana"
  "bt-2x|${ENTRY_PHONE}|${ENTRY_PHONE}|beach_tennis_2x_semana|plano Beach Tennis 2x por semana"
  "clubinho|${ENTRY_PHONE}|${ENTRY_PHONE}|clubinho|Clubinho (jogo livre de Beach Tennis)"
  "experimental|${ENTRY_PHONE}|${ENTRY_PHONE}|aula_experimental|aula experimental de Beach Tennis"
  "quadra|${ENTRY_PHONE}|${ENTRY_PHONE}|locacao_quadra|locação de quadra avulsa"
  "reservas|${ENTRY_PHONE}|${ENTRY_PHONE}|day_use_empresarial|Day Use Empresarial"
  # funcional: modalidade encerrada (out/2026). Rota mantida so para nao quebrar links antigos -> cai em Beach Tennis.
  "funcional|${ENTRY_PHONE}|${ENTRY_PHONE}|beach_tennis|Beach Tennis"
  "day-use-individual|${ENTRY_PHONE}|${ENTRY_PHONE}|day_use_individual|Day Use individual (uso das quadras por um dia)"
  "aniversario|${ENTRY_PHONE}|${ENTRY_PHONE}|reserva_aniversario|reserva de aniversário / evento particular"
)

# ─────────────────────────────────────────────────────────────
# TABLE 2b: CRM reactivation paths (drives /crm/*)
# Reportana envia mensagem de reativação com 2 botões:
#   "Quero saber mais"  → /crm/saber-mais  → IA qualifica de novo
#   "Falar com humano"  → /crm/falar-*    → direto para o humano
# Cada rota carrega tag específica pra medir efetividade da reativação.
# Formato: slot|phone|pixel_event|content_name|prefilled_message
# ─────────────────────────────────────────────────────────────
CRM_PATHS=(
  "saber-mais|${ENTRY_PHONE}|Lead|reativacao_saber_mais|Oi! Recebi a mensagem de vocês. Quero saber mais sobre a Nova Beach."
  "falar-humano-bt|${HUMAN_PHONE}|Purchase|reativacao_humano_bt|Oi! Recebi a mensagem de vocês. Quero falar direto com o atendimento sobre Beach Tennis."
  "falar-humano-eventos|${FUNCIONAL_PHONE}|Purchase|reativacao_humano_eventos|Oi! Recebi a mensagem de vocês. Quero falar direto sobre eventos / Day Use."
)

# ─────────────────────────────────────────────────────────────
# TABLE 2: Handoffs (drives /handoff/*) — bot uses these after qualifying
# slot | pixel_event | content_name | prefilled_message
#
# Modelo de 2 eventos:
#   Lead     -> chegou na pagina /ads/* ou /site/* (topo de funil)
#   Purchase -> lead foi encaminhado ao humano via /handoff/* (fundo de funil)
#
# Purchase aqui significa: lead qualificado pela IA que chegou ao humano.
# NAO significa matricula fechada. Todos os produtos usam Purchase — para
# medirmos exatamente quantos leads o time humano recebe qualificados.
# ─────────────────────────────────────────────────────────────
# Formato: slot|phone|pixel_event|content_name|prefilled_message
HANDOFFS=(
  "bt-1x|${HUMAN_PHONE}|Purchase|matricula_bt_1x|Olá! Gostaria de prosseguir com a matrícula no plano Beach Tennis 1x por semana."
  "bt-2x|${HUMAN_PHONE}|Purchase|matricula_bt_2x|Olá! Gostaria de prosseguir com a matrícula no plano Beach Tennis 2x por semana."
  "clubinho|${HUMAN_PHONE}|Purchase|matricula_clubinho|Olá! Gostaria de prosseguir com a inscrição no Clubinho."
  "experimental|${HUMAN_PHONE}|Purchase|agendamento_experimental|Olá! Gostaria de confirmar meu horário para a aula experimental."
  "quadra|${HUMAN_PHONE}|Purchase|locacao_quadra|Olá! Gostaria de reservar uma quadra avulsa."
  "reservas|${FUNCIONAL_PHONE}|Purchase|day_use_empresarial|Olá! Tenho interesse no Day Use Empresarial. Gostaria de receber uma proposta."
  "day-use-individual|${HUMAN_PHONE}|Purchase|day_use_individual|Olá! Quero passar o dia usando as quadras. Como faço para reservar?"
  "aniversario|${FUNCIONAL_PHONE}|Purchase|reserva_aniversario|Olá! Quero fazer minha reserva de aniversário na Nova Beach."
)

# ─────────────────────────────────────────────────────────────
# URL-encode helper
# ─────────────────────────────────────────────────────────────
url_encode() {
  # Node is available on all our dev envs (Vercel + local)
  node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$1"
}

# ─────────────────────────────────────────────────────────────
# HTML template writer
# Args: 1=output_dir  2=pixel_event  3=content_name  4=source_label  5=wa_url  6=og_title  7=og_desc
# ─────────────────────────────────────────────────────────────
write_page() {
  local dir="$1"
  local event="$2"
  local cname="$3"
  local source="$4"
  local wa_url="$5"
  local og_title="${6:-Nova Beach Campinas}"
  local og_desc="${7:-Beach Tennis e eventos em Campinas. Fale com a gente pelo WhatsApp.}"
  local up="../.."
  local canonical="${BASE_URL}/${dir}/"

  mkdir -p "$dir"
  cat > "$dir/index.html" <<HTML
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${og_title}</title>
  <meta name="description" content="${og_desc}">
  <meta name="robots" content="noindex,nofollow">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Nova Beach Campinas">
  <meta property="og:title" content="${og_title}">
  <meta property="og:description" content="${og_desc}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${BASE_URL}/logo-novabeach.png">
  <meta property="og:image:alt" content="Nova Beach Campinas">
  <meta property="og:locale" content="pt_BR">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${og_title}">
  <meta name="twitter:description" content="${og_desc}">
  <meta name="twitter:image" content="${BASE_URL}/logo-novabeach.png">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { min-height: 100vh; background: #f3f5fa; display: flex; align-items: center; justify-content: center; font-family: Arial, sans-serif; position: relative; }
    .pattern { position: fixed; inset: 0; pointer-events: none; background-image: url('${up}/nb-ball.png'); background-repeat: repeat; background-size: 140px 140px; opacity: 0.035; }
    .card { position: relative; z-index: 1; background: #1a3066; border-radius: 16px; padding: 40px 48px; display: flex; flex-direction: column; align-items: center; gap: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); }
    .logo { height: 48px; width: auto; object-fit: contain; }
    .msg { color: rgba(255,255,255,0.7); font-size: 14px; letter-spacing: 0.3px; }
    .dots span { display: inline-block; animation: blink 1.2s infinite; }
    .dots span:nth-child(2) { animation-delay: 0.2s; }
    .dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink { 0%, 80%, 100% { opacity: 0; } 40% { opacity: 1; } }
  </style>
  <script>
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${PIXEL}');
    fbq('track', 'PageView');
    (function(){
      // ===== Capture UTM + fbclid from URL (fallback to sessionStorage from referring quiz) =====
      var qs = new URLSearchParams(window.location.search);
      var persisted = {};
      try { persisted = JSON.parse(sessionStorage.getItem('nb_utms')||'{}'); } catch(e){}
      function pick(k){ return qs.get(k) || persisted[k] || ''; }
      var utm = {
        utm_source:   pick('utm_source'),
        utm_medium:   pick('utm_medium'),
        utm_campaign: pick('utm_campaign'),
        utm_content:  pick('utm_content'),
        utm_term:     pick('utm_term'),
        fbclid:       pick('fbclid')
      };
      // Persist for later pages in same session
      try { if(utm.utm_source||utm.fbclid) sessionStorage.setItem('nb_utms', JSON.stringify(utm)); } catch(e){}

      // ===== Build origem tag for WhatsApp message =====
      // Hidden-ish tag at the end so attendant can copy to CRM. If no UTM, mark as source.
      function originTag(){
        if(!utm.utm_source && !utm.fbclid) return ' ⟨origem: ${source}⟩';
        var parts = [];
        if(utm.utm_source)   parts.push(utm.utm_source);
        if(utm.utm_campaign) parts.push(utm.utm_campaign);
        if(utm.utm_content)  parts.push(utm.utm_content);
        if(utm.fbclid)       parts.push('fbclid:'+utm.fbclid.slice(0,10));
        return ' ⟨origem: '+parts.join(' · ')+'⟩';
      }
      var baseWa = '${wa_url}';
      // Append the origem tag to the text= param
      var waUrl = baseWa.indexOf('text=') >= 0
        ? baseWa + encodeURIComponent(originTag())
        : baseWa + (baseWa.indexOf('?')<0?'?':'&') + 'text=' + encodeURIComponent(originTag());

      // ===== Event ID for Pixel/CAPI dedup =====
      var eventId = '${event}-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);

      // ===== Read fbp / fbc cookies for CAPI user_data =====
      function cookie(n){ return (document.cookie.split('; ').find(function(r){return r.indexOf(n+'=')===0;})||'').split('=')[1]||null; }

      var customData = {
        content_name:    '${cname}',
        content_category:'${source}',
        source:          '${source}',
        utm_source:      utm.utm_source,
        utm_medium:      utm.utm_medium,
        utm_campaign:    utm.utm_campaign,
        utm_content:     utm.utm_content,
        utm_term:        utm.utm_term,
        fbclid:          utm.fbclid
      };

      // ===== CAPI relay (keepalive so it survives the redirect) =====
      try {
        var capiPayload = {
          event_name:       '${event}',
          event_id:         eventId,
          event_time:       Math.floor(Date.now()/1000),
          event_source_url: window.location.href,
          action_source:    'website',
          user_data: {
            fbp: cookie('_fbp'),
            fbc: cookie('_fbc')
          },
          custom_data: customData
        };
        fetch('/api/capi', {
          method: 'POST',
          headers: {'content-type':'application/json'},
          body: JSON.stringify(capiPayload),
          keepalive: true
        }).catch(function(){});
      } catch(e){}

      // Delay filters bots/crawlers from firing Pixel event
      setTimeout(function(){
        try {
          fbq('track', '${event}', customData, {eventID: eventId});
        } catch(e){}
        window.location.href = waUrl;
      }, 1200);
    })();
  </script>
  <noscript>
    <img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${PIXEL}&ev=${event}&noscript=1"/>
    <meta http-equiv="refresh" content="0;url=${wa_url}">
  </noscript>
</head>
<body>
  <div class="pattern"></div>
  <div class="card">
    <img class="logo" src="${up}/logo-novabeach.png" alt="Nova Beach">
    <p class="msg">Abrindo WhatsApp<span class="dots"><span>.</span><span>.</span><span>.</span></span></p>
  </div>
</body>
</html>
HTML
}

# ─────────────────────────────────────────────────────────────
# Build /ads/* and /site/*
# ─────────────────────────────────────────────────────────────
echo "Building /ads/* and /site/*..."
for prod in "${PRODUCTS[@]}"; do
  IFS='|' read -r slot ads_phone site_phone content_name label <<< "$prod"

  og_title="Nova Beach Campinas — ${label}"
  og_desc="Fale com a Nova Beach pelo WhatsApp sobre ${label}. Beach Tennis em Campinas."

  # /ads/<slot>
  ads_msg="Olá! Vim pelo anúncio e gostaria de saber mais sobre ${label}."
  ads_url="https://wa.me/${ads_phone}?text=$(url_encode "$ads_msg")"
  write_page "ads/${slot}" "Lead" "$content_name" "meta_ads" "$ads_url" "$og_title" "$og_desc"
  echo "  ✓ /ads/${slot}/  → ${ads_phone}"

  # /site/<slot>
  site_msg="Olá! Vim pelo site e gostaria de saber mais sobre ${label}."
  site_url="https://wa.me/${site_phone}?text=$(url_encode "$site_msg")"
  write_page "site/${slot}" "Lead" "$content_name" "site" "$site_url" "$og_title" "$og_desc"
  echo "  ✓ /site/${slot}/  → ${site_phone}"
done

# ─────────────────────────────────────────────────────────────
# Build /handoff/*
# ─────────────────────────────────────────────────────────────
echo ""
echo "Building /crm/*..."
for c in "${CRM_PATHS[@]}"; do
  IFS='|' read -r slot phone event content_name message <<< "$c"
  wa_url="https://wa.me/${phone}?text=$(url_encode "$message")"
  og_title="Nova Beach Campinas"
  og_desc="Reativação Nova Beach. Fale com a gente pelo WhatsApp."
  write_page "crm/${slot}" "$event" "$content_name" "crm_reativacao" "$wa_url" "$og_title" "$og_desc"
  echo "  ✓ /crm/${slot}/  → ${phone}  (${event})"
done

echo ""
echo "Building /handoff/*..."
for h in "${HANDOFFS[@]}"; do
  IFS='|' read -r slot phone event content_name message <<< "$h"
  wa_url="https://wa.me/${phone}?text=$(url_encode "$message")"
  og_title="Nova Beach Campinas"
  og_desc="Encaminhamento para atendimento Nova Beach via WhatsApp."
  write_page "handoff/${slot}" "$event" "$content_name" "handoff" "$wa_url" "$og_title" "$og_desc"
  echo "  ✓ /handoff/${slot}/  → ${phone}  (${event})"
done

echo ""
echo "Done. Structure:"
find ads site handoff crm -name index.html 2>/dev/null | sort
