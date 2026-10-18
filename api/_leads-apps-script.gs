/**
 * Nova Beach — Captacao de leads (Google Sheets)
 *
 * Grava cada submit do form (step 4 do quiz) numa aba "Leads Captacao Site"
 * da planilha CRM Nova Beach:
 * https://docs.google.com/spreadsheets/d/1eT_ES6ezk5dJltOmRR9RXCXhKO_dXhWSZu6JWd3gbMw
 *
 * Deploy (2 min):
 *  1) Abre a planilha acima
 *  2) Extensoes > Apps Script
 *  3) Apaga o conteudo e cola TODO esse arquivo
 *  4) Clica no disquete (salvar)
 *  5) Clica Implantar > Nova implantacao
 *       - Icone de engrenagem > "App da Web"
 *       - Descricao: "Captacao leads site"
 *       - Executar como: Eu (sua conta)
 *       - Quem tem acesso: Qualquer pessoa
 *  6) Implantar > autoriza > copia a URL (termina em /exec)
 *  7) Me passa a URL (ou cola no index.html linha ~702: const SHEETS_URL = '...')
 */

const SPREADSHEET_ID = '1eT_ES6ezk5dJltOmRR9RXCXhKO_dXhWSZu6JWd3gbMw';
const SHEET_NAME = 'Leads Captacao Site';
const HEADERS = [
  'timestamp',
  'nome',
  'telefone',
  'vertical',
  'interesse',
  'bairro',
  'mensagem_wa',
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
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
      const h = sheet.getRange(1, 1, 1, HEADERS.length);
      h.setFontWeight('bold').setBackground('#1a3066').setFontColor('#ffffff');
      sheet.setColumnWidth(1, 160);
      sheet.setColumnWidth(2, 140);
      sheet.setColumnWidth(3, 140);
    }
    sheet.appendRow([
      new Date(),
      body.nome || '',
      formatPhone(body.tel || ''),
      body.path || '',
      body.choice || '',
      body.bairro || '',
      body.msg || '',
      body.utm_source || '',
      body.utm_campaign || '',
      body.utm_content || '',
      body.utm_term || '',
      body.fbclid || '',
      (body.ua || '').toString().substring(0, 200)
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'Nova Beach Leads Captacao' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatPhone(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length === 11) return '(' + d.substr(0, 2) + ') ' + d.substr(2, 5) + '-' + d.substr(7);
  if (d.length === 10) return '(' + d.substr(0, 2) + ') ' + d.substr(2, 4) + '-' + d.substr(6);
  return d;
}
