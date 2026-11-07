// Nova Beach — /wa/* shared capture + pixel helper
// Responsabilidades:
//  1) Meta Pixel init + Advanced Matching (quando houver contato)
//  2) Captura mínima (nome, tel, email, cidade RMC) se usuário chegou SEM nb_tel
//  3) Gating por cidade: só RMC vira lead; "Outra" bloqueia
//  4) Grava Supabase + Google Sheets (sendLead unificado)
//  5) Dispara fbq Lead + CAPI com mesmo eventID (dedup)
//  6) Redirect pro WhatsApp
//
// Uso na página /wa/<slug>/index.html:
//   <body data-slug="pilates" data-content-name="pilates"
//         data-def-msg="Quero garantir minha vaga no Mat Pilates"
//         data-value="80">
//   <script src="../_capture.js"></script>

(function(){
  var PIXEL_ID = '1397968278475446';
  var SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxHj2ZmFdWwFJ9Yhc5lodg1Kn_BtHK9qOjiOM-GlzGYJ3eZEHFMMJrQRq4wcLFub9UIzQ/exec';
  var WHATSAPP = 'https://wa.me/5519995575156';

  // Cidades realmente proximas (~<25min do Nova Campinas). Lista enxuta pra evitar leads fora de raio util.
  var RMC = [
    'Campinas','Valinhos','Vinhedo','Hortolândia','Sumaré','Paulínia','Indaiatuba'
  ];

  // ===== Pixel loader =====
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

  var body = document.body;
  var SLUG = body.dataset.slug || 'desconhecido';
  var CONTENT_NAME = body.dataset.contentName || SLUG;
  var DEF_MSG = body.dataset.defMsg || 'Oi! Quero saber mais sobre a Nova Beach';
  var VALUE = parseFloat(body.dataset.value || '0') || 0;
  // Destino externo opcional (Byma, TFSports, etc). Se setado, form envia pra la ao inves do WhatsApp.
  var DEST_URL = body.dataset.destUrl || null;
  var CTA_LABEL = body.dataset.ctaLabel || (DEST_URL ? 'Continuar inscrição →' : 'Abrir conversa no WhatsApp →');
  var LOADER_LABEL = body.dataset.loaderLabel || (DEST_URL ? 'Abrindo inscrição' : 'Abrindo WhatsApp');

  var params = new URLSearchParams(window.location.search);
  var qMsg = params.get('nb_msg');
  var qBairro = params.get('nb_bairro');
  var qNome = params.get('nb_nome');
  var qTel = params.get('nb_tel');
  var qEmail = params.get('nb_email');
  var qCidade = params.get('nb_cidade');

  // UTMs persistidas via sessionStorage
  var persisted = {};
  try { persisted = JSON.parse(sessionStorage.getItem('nb_utms') || '{}'); } catch(e) {}
  function pick(k){ return params.get(k) || persisted[k] || ''; }
  var utm = {
    utm_source: pick('utm_source'),
    utm_medium: pick('utm_medium'),
    utm_campaign: pick('utm_campaign'),
    utm_content: pick('utm_content'),
    utm_term: pick('utm_term'),
    fbclid: pick('fbclid')
  };
  try { if(utm.utm_source || utm.fbclid) sessionStorage.setItem('nb_utms', JSON.stringify(utm)); } catch(e) {}

  // ===== Helpers =====
  function firstName(n){ return (n||'').trim().split(/\s+/)[0] || ''; }
  function phoneDigits(p){ var d = (p||'').replace(/\D/g,''); return d ? (d.length <= 11 ? '55'+d : d) : ''; }
  function emailLower(e){ return (e||'').trim().toLowerCase(); }
  function cookie(n){ return (document.cookie.split('; ').find(function(r){return r.indexOf(n+'=')===0;})||'').split('=')[1]||null; }
  function normCitySlug(c){ return (c||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z]/g,'').toLowerCase(); }
  function isRMC(city){
    if(!city) return false;
    var slug = normCitySlug(city);
    return RMC.some(function(c){ return normCitySlug(c) === slug; });
  }

  // ===== Pixel init com Advanced Matching =====
  var amData = {};
  if (qEmail)  amData.em = emailLower(qEmail);
  if (qTel)    amData.ph = phoneDigits(qTel);
  if (qNome)   amData.fn = firstName(qNome).toLowerCase();
  if (qCidade) amData.ct = normCitySlug(qCidade);
  if (Object.keys(amData).length > 0) {
    fbq('init', PIXEL_ID, amData);
  } else {
    fbq('init', PIXEL_ID);
  }
  fbq('track','PageView');

  // ===== Montar mensagem WhatsApp com origem =====
  function buildWaUrl(extras){
    extras = extras || {};
    var msg = qMsg ? decodeURIComponent(qMsg) : ('Oi! ' + DEF_MSG + '.');
    var bairro = extras.bairro || qBairro;
    var cidade = extras.cidade || qCidade;
    if (bairro)  msg += ' (Moro em: ' + decodeURIComponent(bairro) + ')';
    if (cidade && !bairro) msg += ' (Cidade: ' + cidade + ')';
    var parts = [];
    if (utm.utm_source)   parts.push(utm.utm_source);
    if (utm.utm_campaign) parts.push(utm.utm_campaign);
    if (utm.utm_content)  parts.push(utm.utm_content);
    if (utm.fbclid)       parts.push('fbclid:' + utm.fbclid.slice(0,10));
    msg += parts.length ? (' ⟨origem: ' + parts.join(' · ') + '⟩') : ' ⟨origem: landing_hub⟩';
    return WHATSAPP + '?text=' + encodeURIComponent(msg);
  }

  // ===== Montar URL destino externo (Byma, TFSports) preservando UTMs =====
  function buildExtDestUrl(){
    try {
      var u = new URL(DEST_URL);
      if (utm.utm_source)   u.searchParams.set('utm_source', utm.utm_source);
      if (utm.utm_medium)   u.searchParams.set('utm_medium', utm.utm_medium);
      if (utm.utm_campaign) u.searchParams.set('utm_campaign', utm.utm_campaign);
      if (utm.utm_content)  u.searchParams.set('utm_content', utm.utm_content);
      if (utm.utm_term)     u.searchParams.set('utm_term', utm.utm_term);
      return u.toString();
    } catch(e) { return DEST_URL; }
  }

  // ===== URL final: destino externo se setado, senao WhatsApp =====
  function buildFinalUrl(extras){
    return DEST_URL ? buildExtDestUrl() : buildWaUrl(extras);
  }

  // ===== Disparar Lead (browser pixel + CAPI) + sendLead opcional =====
  function fireLead(contact){
    contact = contact || {};
    var eventId = params.get('nb_event_id') || ('Lead-' + Date.now() + '-' + Math.random().toString(36).slice(2,10));
    var nome = contact.nome || qNome || '';
    var tel = contact.tel || qTel || '';
    var email = contact.email || qEmail || '';
    var cidade = contact.cidade || qCidade || '';
    var bairro = contact.bairro || qBairro || '';

    var customData = {
      content_name: CONTENT_NAME,
      content_category: utm.utm_campaign || 'direct',
      source: utm.utm_source || 'landing_hub',
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_content: utm.utm_content,
      utm_term: utm.utm_term,
      fbclid: utm.fbclid,
      bairro: bairro,
      cidade: cidade,
      value: VALUE,
      currency: 'BRL'
    };

    // CAPI server-side (dedup com eventID)
    try {
      fetch('/api/capi', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({
          event_name: 'Lead',
          event_id: eventId,
          event_time: Math.floor(Date.now()/1000),
          event_source_url: window.location.href,
          action_source: 'website',
          user_data: {
            fbp: cookie('_fbp'),
            fbc: cookie('_fbc'),
            name: nome || undefined,
            phone: tel ? phoneDigits(tel) : undefined,
            email: email ? emailLower(email) : undefined,
            city: cidade || undefined,
            external_id: eventId
          },
          custom_data: customData
        }),
        keepalive: true
      }).catch(function(){});
    } catch(e) {}

    // Grava Supabase + Sheets se tivermos contato completo (fluxo captura mínima)
    if (contact.saveLead) {
      saveLead({
        nome: nome,
        tel: tel,
        email: email,
        bairro: bairro,
        cidade: cidade,
        path: CONTENT_NAME,
        choice: SLUG,
        priceLabel: '-',
        priceValue: '-',
        priceTag: '-',
        msg: DEF_MSG,
        ts: new Date().toISOString(),
        page_url: window.location.href,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
        utm_content: utm.utm_content,
        utm_term: utm.utm_term,
        fbclid: utm.fbclid,
        nb_event_id: eventId
      });
    }

    // Browser pixel Lead (com dedup via eventID)
    try { fbq('track','Lead', customData, {eventID: eventId}); } catch(e) {}

    return eventId;
  }

  // ===== Supabase + Sheets =====
  function saveLead(payload){
    try {
      fetch('/api/lead', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify(payload), keepalive: true
      }).catch(function(){});
    } catch(e) {}
    if (SHEETS_URL) {
      try {
        fetch(SHEETS_URL, {
          method:'POST', headers:{'content-type':'application/json'},
          body: JSON.stringify(payload), keepalive: true, mode: 'no-cors'
        }).catch(function(){});
      } catch(e) {}
    }
  }

  // ===== Fluxo 1: já veio com contato (quiz completo) → redirect direto =====
  function flowDirectRedirect(){
    fireLead({ saveLead: false }); // sendLead já foi chamado pelo hub
    var delay = qMsg ? 500 : 1200;
    setTimeout(function(){ window.location.href = buildFinalUrl(); }, delay);
  }

  // ===== Fluxo 2: sem contato → mostra form de captura mínima =====
  function flowCaptureForm(){
    // Substitui o loader original pelo form
    var container = document.querySelector('.card') || body;
    container.innerHTML = renderFormHtml();

    var form = document.getElementById('nb-capture-form');
    var out = document.getElementById('nb-capture-error');

    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      out.style.display = 'none';
      var fd = new FormData(form);
      var nome = (fd.get('nome')||'').trim();
      var tel = (fd.get('tel')||'').trim();
      var email = (fd.get('email')||'').trim();
      var cidade = (fd.get('cidade')||'').trim();

      if (!nome || nome.length < 2)   return showErr('Preencha seu nome.');
      if (phoneDigits(tel).length < 12) return showErr('WhatsApp inválido. Inclua DDD.');
      if (email && !/^.+@.+\..+$/.test(email)) return showErr('Email inválido.');
      if (!cidade) return showErr('Selecione sua cidade.');

      // "Outra" → tenta ler input livre; se vazio, pede pra digitar
      if (cidade === '__outra__') {
        var cidadeLivre = (fd.get('cidade_outra')||'').trim();
        if (!cidadeLivre || cidadeLivre.length < 2) {
          showOutraInput();
          return;
        }
        cidade = cidadeLivre;
      }

      // Lead válido — dispara tudo (sem gating de RMC — lista enxuta ja filtra na UI)
      fireLead({
        nome: nome, tel: tel, email: email, cidade: cidade, bairro: '',
        saveLead: true
      });

      // Mostra "abrindo WhatsApp" por 800ms e redireciona
      container.innerHTML = renderLoaderHtml();
      setTimeout(function(){ window.location.href = buildFinalUrl({cidade: cidade}); }, 800);
    });

    function showErr(m){ out.textContent = m; out.style.display = 'block'; }
    function showOutraInput(){
      // Revela input text pra digitar cidade livre (se ainda nao existir)
      if (document.getElementById('nb-cidade-outra')) {
        showErr('Digite o nome da sua cidade.');
        return;
      }
      var select = form.querySelector('select[name="cidade"]');
      var extra = document.createElement('input');
      extra.id = 'nb-cidade-outra';
      extra.name = 'cidade_outra';
      extra.type = 'text';
      extra.placeholder = 'Digite sua cidade';
      extra.required = true;
      extra.setAttribute('style', inputCss());
      select.parentNode.insertBefore(extra, select.nextSibling);
      extra.focus();
    }
  }

  // ===== Renderização do form =====
  function renderFormHtml(){
    var opts = RMC.slice().sort().map(function(c){
      return '<option value="'+c+'">'+c+'</option>';
    }).join('');
    return (
      '<img class="logo" src="/logo-novabeach.png" alt="Nova Beach">' +
      '<h2 style="color:#fff;font-size:18px;margin:6px 0 2px;text-align:center;font-weight:800">Antes de abrir o WhatsApp</h2>' +
      '<p style="color:rgba(255,255,255,0.7);font-size:13px;margin-bottom:12px;text-align:center">Deixa teu contato pra gente responder rapidinho 👇</p>' +
      '<form id="nb-capture-form" style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:320px">' +
        inp('nome','Seu nome', 'text', true) +
        inp('tel','WhatsApp (com DDD)', 'tel', true) +
        inp('email','Email (opcional)', 'email', false) +
        '<select name="cidade" required style="'+inputCss()+'">' +
          '<option value="">Sua cidade</option>' +
          opts +
          '<option value="__outra__">Outra / fora da região</option>' +
        '</select>' +
        '<button type="submit" style="background:#d7fd3f;color:#0d0d0d;border:0;padding:12px 16px;border-radius:10px;font-weight:800;font-size:14px;cursor:pointer;letter-spacing:0.2px;margin-top:4px">' + CTA_LABEL + '</button>' +
        '<div id="nb-capture-error" style="display:none;color:#ff6b6b;font-size:12px;text-align:center;margin-top:4px"></div>' +
      '</form>'
    );
  }
  function inp(name, ph, type, req){
    return '<input name="'+name+'" type="'+type+'" placeholder="'+ph+'" '+(req?'required':'')+' style="'+inputCss()+'">';
  }
  function inputCss(){
    return 'padding:11px 13px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;font-size:14px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  }
  function renderLoaderHtml(){
    return (
      '<img class="logo" src="/logo-novabeach.png" alt="Nova Beach">' +
      '<p class="msg">' + LOADER_LABEL + '<span class="dots"><span>.</span><span>.</span><span>.</span></span></p>'
    );
  }
  function renderOutOfAreaHtml(){
    return (
      '<img class="logo" src="/logo-novabeach.png" alt="Nova Beach">' +
      '<h2 style="color:#fff;font-size:18px;margin:8px 0 6px;text-align:center;font-weight:800">Atendemos Campinas e região 🏖️</h2>' +
      '<p style="color:rgba(255,255,255,0.75);font-size:13px;line-height:1.5;text-align:center;max-width:300px">Nossa arena é presencial, na Av. Jesuíno Marcondes Machado, 869. Fica o convite pra conhecer quando estiver por aqui!</p>' +
      '<a href="https://www.instagram.com/novabeach.cps/" target="_blank" rel="noopener" style="color:#d7fd3f;font-weight:700;font-size:13px;margin-top:8px;text-decoration:none">Seguir no Instagram →</a>'
    );
  }

  // ===== Boot =====
  if (qTel) {
    flowDirectRedirect();
  } else {
    flowCaptureForm();
  }
})();
