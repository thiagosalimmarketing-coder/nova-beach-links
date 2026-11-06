/**
 * Nova Beach — Captacao de leads (Google Sheets)
 *
 * Grava cada submit do form (quiz completo + captura minima /wa/*) numa aba
 * "Leads Captacao Site" da planilha CRM Nova Beach:
 * https://docs.google.com/spreadsheets/d/1eT_ES6ezk5dJltOmRR9RXCXhKO_dXhWSZu6JWd3gbMw
 *
 * FEATURES:
 *  - Dedup por telefone (10 min janela)
 *  - Validacao de telefone (10-13 digitos)
 *  - Validacao de nome (2-80 chars)
 *  - Migracao automatica do cabecalho quando mudamos o schema (nunca perde dados)
 *  - Suporta tanto o quiz do hub quanto a captura minima /wa/* (campos cidade/page_url/nb_event_id)
 *  - Push WhatsApp opcional via CallMeBot
 *
 * ATIVAR PUSH WHATSAPP (opcional, 2 min, GRATIS):
 *  1) Adicione +34 644 51 85 00 (CallMeBot) nos contatos
 *  2) Envie "I allow callmebot to send me messages"
 *  3) Ele responde com sua API key
 *  4) Cole em CALLMEBOT_API_KEY + seu numero em THIAGO_WHATSAPP e republique
 */

const SPREADSHEET_ID = '1eT_ES6ezk5dJltOmRR9RXCXhKO_dXhWSZu6JWd3gbMw';
const SHEET_GID = 590515581;
const DEDUP_WINDOW_MINUTES = 10;

const ALERT_EMAIL = 'thiago.salim.marketing@gmail.com';
const THIAGO_WHATSAPP = '';
const CALLMEBOT_API_KEY = '';

// === SCHEMA ATUAL ===
// Ordem define ordem das colunas na planilha. Mudar aqui + salvar + republicar
// que ensureHeader() migra o cabecalho e preserva dados antigos.
const HEADERS = [
  'timestamp',
  'nome',
  'telefone',
  'email',
  'cidade',
  'bairro',
  'vertical',
  'interesse',
  'mensagem_wa',
  'page_url',
  'nb_event_id',
  'utm_source',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'user_agent'
];

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // ===== Validacao =====
    const telDigits = String(body.tel || '').replace(/\D/g, '');
    if (telDigits.length < 10 || telDigits.length > 13) {
      return jsonOut({ ok: false, error: 'invalid_phone' });
    }
    const nome = String(body.nome || '').trim();
    if (nome.length < 2 || nome.length > 80) {
      return jsonOut({ ok: false, error: 'invalid_name' });
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheets().find(function(s) { return s.getSheetId() === SHEET_GID; });
    if (!sheet) {
      return jsonOut({ ok: false, error: 'sheet_gid_not_found', gid: SHEET_GID });
    }

    ensureHeader(sheet);

    // ===== Dedup por telefone nos ultimos 10 min =====
    const formattedPhone = formatPhone(telDigits);
    const lastRow = sheet.getLastRow();
    const phoneCol = HEADERS.indexOf('telefone') + 1;
    if (lastRow > 1) {
      const scanFrom = Math.max(2, lastRow - 50);
      const range = sheet.getRange(scanFrom, 1, lastRow - scanFrom + 1, HEADERS.length).getValues();
      const cutoff = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60 * 1000);
      for (let i = range.length - 1; i >= 0; i--) {
        const ts = range[i][0];
        const existingPhone = range[i][phoneCol - 1];
        if (ts instanceof Date && ts < cutoff) break;
        if (existingPhone === formattedPhone) {
          return jsonOut({ ok: true, deduped: true });
        }
      }
    }

    // ===== Monta row na ordem exata de HEADERS =====
    const email = String(body.email || '').trim();
    const cidade = String(body.cidade || '').trim();
    const bairro = String(body.bairro || '').trim();
    const vertical = body.path || '';
    const interesse = body.choice || '';
    const msg = body.msg || '';
    const pageUrl = body.page_url || '';
    const eventId = body.nb_event_id || '';
    const ua = (body.ua || '').toString().substring(0, 200);

    const rowMap = {
      timestamp: new Date(),
      nome: nome,
      telefone: formattedPhone,
      email: email,
      cidade: cidade,
      bairro: bairro,
      vertical: vertical,
      interesse: interesse,
      mensagem_wa: msg,
      page_url: pageUrl,
      nb_event_id: eventId,
      utm_source: body.utm_source || '',
      utm_campaign: body.utm_campaign || '',
      utm_content: body.utm_content || '',
      utm_term: body.utm_term || '',
      fbclid: body.fbclid || '',
      user_agent: ua
    };

    const row = HEADERS.map(function(h) { return rowMap[h] !== undefined ? rowMap[h] : ''; });
    sheet.appendRow(row);

    if (ALERT_EMAIL) {
      sendEmailAlert({
        nome: nome, telefone: formattedPhone, email: email,
        cidade: cidade, bairro: bairro,
        vertical: vertical, interesse: interesse,
        utmSource: body.utm_source, utmCampaign: body.utm_campaign,
        pageUrl: pageUrl
      });
    }

    if (THIAGO_WHATSAPP && CALLMEBOT_API_KEY) {
      pushWhatsApp(nome, formattedPhone, vertical, interesse, cidade || bairro, body.utm_source);
    }

    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doGet() {
  return jsonOut({ ok: true, service: 'Nova Beach Leads Captacao', schema_version: 2, headers: HEADERS });
}

/**
 * Garante que a planilha tem o cabecalho atual (HEADERS).
 *  - Sheet vazia: escreve header e aplica formatacao.
 *  - Sheet com header diferente: faz migracao preservando dados por NOME de coluna
 *    (adiciona colunas novas vazias no final, nunca sobrescreve dados).
 */
function ensureHeader(sheet) {
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();

  if (lastRow === 0) {
    sheet.appendRow(HEADERS);
    formatHeaderRow(sheet);
    return;
  }

  const currentHeader = sheet.getRange(1, 1, 1, Math.max(lastCol, 1)).getValues()[0]
    .map(function(v) { return String(v || '').trim(); });

  // Detecta header valido
  const headerLooksValid = currentHeader.some(function(h) { return h && HEADERS.indexOf(h) >= 0; });
  if (!headerLooksValid) {
    // Planilha com dados mas sem header reconhecido — nao migra automaticamente pra nao destruir
    return;
  }

  // Calcula colunas faltantes
  const missing = HEADERS.filter(function(h) { return currentHeader.indexOf(h) < 0; });
  if (missing.length === 0 && currentHeader.length === HEADERS.length) {
    // ja bate — nada a fazer
    return;
  }

  // Estrategia: reordena/expande o cabecalho preservando dados. Le TUDO, remapeia, reescreve.
  const dataRange = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, Math.max(lastCol, HEADERS.length)).getValues()
    : [];

  // Mapeia coluna antiga -> indice (0-based) no currentHeader
  const oldIdx = {};
  currentHeader.forEach(function(h, i) { if (h) oldIdx[h] = i; });

  // Novo conjunto de dados na ordem de HEADERS
  const newData = dataRange.map(function(oldRow) {
    return HEADERS.map(function(h) {
      const idx = oldIdx[h];
      return (idx !== undefined && idx >= 0 && idx < oldRow.length) ? oldRow[idx] : '';
    });
  });

  sheet.clear();
  sheet.appendRow(HEADERS);
  if (newData.length > 0) {
    sheet.getRange(2, 1, newData.length, HEADERS.length).setValues(newData);
  }
  formatHeaderRow(sheet);
}

function formatHeaderRow(sheet) {
  sheet.setFrozenRows(1);
  const h = sheet.getRange(1, 1, 1, HEADERS.length);
  h.setFontWeight('bold').setBackground('#1a3066').setFontColor('#ffffff');
  // Larguras sugeridas por coluna
  const widths = {
    timestamp: 160, nome: 140, telefone: 140, email: 200,
    cidade: 120, bairro: 140, vertical: 110, interesse: 140,
    mensagem_wa: 320, page_url: 240, nb_event_id: 220,
    utm_source: 130, utm_campaign: 160, utm_content: 140, utm_term: 110,
    fbclid: 140, user_agent: 200
  };
  HEADERS.forEach(function(name, i) {
    if (widths[name]) sheet.setColumnWidth(i + 1, widths[name]);
  });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function formatPhone(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length === 11) return '(' + d.substr(0,2) + ') ' + d.substr(2,5) + '-' + d.substr(7);
  if (d.length === 10) return '(' + d.substr(0,2) + ') ' + d.substr(2,4) + '-' + d.substr(6);
  return d;
}

function sendEmailAlert(p) {
  try {
    const subject = '[Nova Beach] Novo lead: ' + p.nome + ' · ' + (p.cidade || p.vertical || 'geral');
    const telDigits = String(p.telefone).replace(/\D/g, '');
    const waLink = 'https://wa.me/55' + telDigits + '?text=' +
      encodeURIComponent('Oi ' + p.nome + '! Aqui e da Nova Beach. Recebi seu contato pelo site, tudo bem? Posso te ajudar?');
    const html =
      '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f3f5fa">' +
        '<div style="background:#1a3066;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0;font-weight:700;letter-spacing:0.5px">' +
          '🏖️ NOVO LEAD · Nova Beach' +
        '</div>' +
        '<div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:0">' +
          '<table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6">' +
            row('Nome', p.nome) +
            row('Telefone', p.telefone) +
            row('Email', p.email || '-') +
            row('Cidade', p.cidade || '-') +
            row('Bairro', p.bairro || '-') +
            row('Vertical', p.vertical || '-') +
            row('Interesse', p.interesse || '-') +
            row('Pagina', p.pageUrl || '-') +
            row('Origem', (p.utmSource || 'direto') + (p.utmCampaign ? ' · ' + p.utmCampaign : '')) +
          '</table>' +
          '<div style="margin-top:20px;display:flex;gap:10px">' +
            '<a href="' + waLink + '" style="display:inline-block;background:#25d366;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Chamar no WhatsApp</a>' +
            '<a href="https://links.novabeachcampinas.com.br/dashboard/" style="display:inline-block;background:#0e1e42;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Ver dashboard</a>' +
          '</div>' +
        '</div>' +
        '<p style="color:#64708f;font-size:11px;text-align:center;margin-top:16px">Enviado automaticamente pelo captador de leads Nova Beach.</p>' +
      '</div>';
    MailApp.sendEmail({ to: ALERT_EMAIL, subject: subject, htmlBody: html });
  } catch (e) {
    // silencia erro do email pra nao quebrar a gravacao
  }
}

function row(label, value) {
  return '<tr>' +
    '<td style="color:#64708f;padding:4px 0;width:110px">' + label + '</td>' +
    '<td style="color:#0e1e42;font-weight:600">' + String(value).replace(/</g,'&lt;') + '</td>' +
  '</tr>';
}

function pushWhatsApp(nome, telefone, vertical, interesse, cidade, utmSource) {
  try {
    const msg = '🏖️ *Novo lead Nova Beach*\n\n' +
      '*Nome:* ' + nome + '\n' +
      '*Tel:* ' + telefone + '\n' +
      '*Vertical:* ' + (vertical || '-') + '\n' +
      '*Interesse:* ' + (interesse || '-') + '\n' +
      '*Cidade/Bairro:* ' + (cidade || '-') + '\n' +
      '*Origem:* ' + (utmSource || 'direto');
    const url = 'https://api.callmebot.com/whatsapp.php?' +
      'phone=' + encodeURIComponent(THIAGO_WHATSAPP) +
      '&text=' + encodeURIComponent(msg) +
      '&apikey=' + encodeURIComponent(CALLMEBOT_API_KEY);
    UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (e) {
    // silencia
  }
}
