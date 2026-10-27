/**
 * Nova Beach — Captacao de leads (Google Sheets)
 *
 * Grava cada submit do form (step 4 do quiz) numa aba "Leads Captacao Site"
 * da planilha CRM Nova Beach:
 * https://docs.google.com/spreadsheets/d/1eT_ES6ezk5dJltOmRR9RXCXhKO_dXhWSZu6JWd3gbMw
 *
 * FEATURES:
 *  - Dedup por telefone (10 min janela)
 *  - Validacao de telefone (10-13 digitos)
 *  - Validacao de nome (2-80 chars)
 *  - Push WhatsApp opcional via CallMeBot (ativar colando THIAGO_WHATSAPP + CALLMEBOT_API_KEY abaixo)
 *
 * ATIVAR PUSH WHATSAPP (opcional, 2 min, GRATIS):
 *  1) Adicione o numero +34 644 51 85 00 (CallMeBot) nos seus contatos
 *  2) Envie pra ele: "I allow callmebot to send me messages"
 *  3) Ele responde com sua API key pessoal
 *  4) Cole a API key em CALLMEBOT_API_KEY abaixo + seu numero em THIAGO_WHATSAPP
 *  5) Salve o script e reimplante
 *  → Cada lead novo = push instantaneo no seu WhatsApp
 */

const SPREADSHEET_ID = '1eT_ES6ezk5dJltOmRR9RXCXhKO_dXhWSZu6JWd3gbMw';
const SHEET_NAME = 'Leads Captacao Site';
const DEDUP_WINDOW_MINUTES = 10;

// === EMAIL ALERT (ATIVO) ===
const ALERT_EMAIL = 'thiago.salim.marketing@gmail.com';

// === PUSH WHATSAPP (opcional) ===
const THIAGO_WHATSAPP = ''; // ex: '5519999999999' (com DDI 55, sem +)
const CALLMEBOT_API_KEY = ''; // Cole aqui depois de ativar CallMeBot

const HEADERS = ['timestamp','nome','telefone','vertical','interesse','bairro','mensagem_wa','utm_source','utm_campaign','utm_content','utm_term','fbclid','user_agent'];

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
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
      const h = sheet.getRange(1, 1, 1, HEADERS.length);
      h.setFontWeight('bold').setBackground('#1a3066').setFontColor('#ffffff');
      sheet.setColumnWidth(1, 160); sheet.setColumnWidth(2, 140); sheet.setColumnWidth(3, 140);
    }

    // ===== Dedup por telefone nos ultimos 10 min =====
    const formattedPhone = formatPhone(telDigits);
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      // Verifica so os ultimos 50 registros (performance)
      const scanFrom = Math.max(2, lastRow - 50);
      const range = sheet.getRange(scanFrom, 1, lastRow - scanFrom + 1, 3).getValues();
      const cutoff = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60 * 1000);
      for (let i = range.length - 1; i >= 0; i--) {
        const [ts, , existingPhone] = range[i];
        if (ts instanceof Date && ts < cutoff) break; // ja passou da janela
        if (existingPhone === formattedPhone) {
          return jsonOut({ ok: true, deduped: true });
        }
      }
    }

    sheet.appendRow([
      new Date(), nome, formattedPhone,
      body.path || '', body.choice || '', body.bairro || '', body.msg || '',
      body.utm_source || '', body.utm_campaign || '', body.utm_content || '',
      body.utm_term || '', body.fbclid || '', (body.ua || '').toString().substring(0, 200)
    ]);

    // ===== Email alert (ATIVO) =====
    if (ALERT_EMAIL) {
      sendEmailAlert(nome, formattedPhone, body.path, body.choice, body.bairro, body.utm_source, body.utm_campaign);
    }

    // ===== Push WhatsApp (opcional) =====
    if (THIAGO_WHATSAPP && CALLMEBOT_API_KEY) {
      pushWhatsApp(nome, formattedPhone, body.path, body.choice, body.bairro, body.utm_source);
    }

    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doGet() {
  return jsonOut({ ok: true, service: 'Nova Beach Leads Captacao' });
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

function sendEmailAlert(nome, telefone, vertical, interesse, bairro, utmSource, utmCampaign) {
  try {
    const subject = `[Nova Beach] Novo lead: ${nome} · ${vertical || 'geral'}`;
    const telDigits = String(telefone).replace(/\D/g, '');
    const waLink = `https://wa.me/55${telDigits}?text=` + encodeURIComponent(`Oi ${nome}! Aqui e da Nova Beach. Recebi seu contato pelo site, tudo bem? Posso te ajudar?`);
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f3f5fa">
        <div style="background:#1a3066;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0;font-weight:700;letter-spacing:0.5px">
          🏖️ NOVO LEAD · Nova Beach
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:0">
          <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6">
            <tr><td style="color:#64708f;padding:4px 0;width:110px">Nome</td><td style="color:#0e1e42;font-weight:700">${nome}</td></tr>
            <tr><td style="color:#64708f;padding:4px 0">Telefone</td><td style="color:#0e1e42;font-weight:700">${telefone}</td></tr>
            <tr><td style="color:#64708f;padding:4px 0">Vertical</td><td style="color:#0e1e42">${vertical || '-'}</td></tr>
            <tr><td style="color:#64708f;padding:4px 0">Interesse</td><td style="color:#0e1e42">${interesse || '-'}</td></tr>
            <tr><td style="color:#64708f;padding:4px 0">Bairro</td><td style="color:#0e1e42">${bairro || '-'}</td></tr>
            <tr><td style="color:#64708f;padding:4px 0">Origem</td><td style="color:#0e1e42">${utmSource || 'direto'}${utmCampaign ? ' · ' + utmCampaign : ''}</td></tr>
          </table>
          <div style="margin-top:20px;display:flex;gap:10px">
            <a href="${waLink}" style="display:inline-block;background:#25d366;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Chamar no WhatsApp</a>
            <a href="https://links.novabeachcampinas.com.br/dashboard/" style="display:inline-block;background:#0e1e42;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Ver dashboard</a>
          </div>
        </div>
        <p style="color:#64708f;font-size:11px;text-align:center;margin-top:16px">Enviado automaticamente pelo captador de leads Nova Beach.</p>
      </div>`;
    MailApp.sendEmail({
      to: ALERT_EMAIL,
      subject: subject,
      htmlBody: html
    });
  } catch (e) {
    // silencia erro do email pra nao quebrar a gravacao
  }
}

function pushWhatsApp(nome, telefone, vertical, interesse, bairro, utmSource) {
  try {
    const msg = `🏖️ *Novo lead Nova Beach*\n\n` +
      `*Nome:* ${nome}\n` +
      `*Tel:* ${telefone}\n` +
      `*Vertical:* ${vertical || '-'}\n` +
      `*Interesse:* ${interesse || '-'}\n` +
      `*Bairro:* ${bairro || '-'}\n` +
      `*Origem:* ${utmSource || 'direto'}`;
    const url = 'https://api.callmebot.com/whatsapp.php?' +
      'phone=' + encodeURIComponent(THIAGO_WHATSAPP) +
      '&text=' + encodeURIComponent(msg) +
      '&apikey=' + encodeURIComponent(CALLMEBOT_API_KEY);
    UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (e) {
    // silencia erro do push pra nao quebrar a gravacao
  }
}
