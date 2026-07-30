/*
 * 請求書ジェネレーター — アプリ本体
 *
 * 設計方針:
 *  - 外部ライブラリなし。すべてブラウザ内で完結し、入力内容は一切送信しない。
 *  - PDF はブラウザの「印刷 → PDFとして保存」を使う。透かし・ロゴ・広告は一切入れない。
 *  - 消費税の端数処理は「一の請求書につき、税率ごとに1回」だけ行う(インボイス制度の要件)。
 */
'use strict';

const STORAGE_KEY = 'invoice-tool:draft:v1';

const { calcTotals, isValidInvoiceNo } = window.InvoiceCalc;

/** 税率の定義。key は内部識別子、rate は百分率。 */
const TAX_RATES = [
  { key: '10', label: '10%', rate: 10 },
  { key: '8', label: '8%(軽減)', rate: 8 },
  { key: '0', label: '非課税', rate: 0 },
];

/**
 * ランディングページから書類の種類を指定して開けるようにする(例: /?type=estimate)。
 * 受け取った値はこの表のキーとの完全一致でしか採用しないため、URLの内容が
 * そのまま画面に出ることはない。
 */
const DOC_TYPE_BY_QUERY = {
  invoice: '請求書',
  estimate: '見積書',
  delivery: '納品書',
  receipt: '領収書',
};

/** 書類の種類ごとの表示文言。 */
const DOC_PRESETS = {
  '請求書': { lead: '下記のとおりご請求申し上げます。', grand: 'ご請求金額', bank: 'お振込先', due: '支払期限' },
  '見積書': { lead: '下記のとおりお見積り申し上げます。', grand: 'お見積金額', bank: 'お振込先', due: '有効期限' },
  '納品書': { lead: '下記のとおり納品いたしました。', grand: '納品金額合計', bank: 'お振込先', due: '納品日' },
  '領収書': { lead: '下記のとおり領収いたしました。', grand: '領収金額', bank: 'お振込先', due: '' },
};

// ---------------------------------------------------------------- 表示ヘルパ

const yen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');

function formatDate(value) {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}

const $ = (id) => document.getElementById(id);

function setText(id, text) {
  const el = $(id);
  el.textContent = text || '';
  el.classList.toggle('empty', !text);
}

// ---------------------------------------------------------------- 明細の編集

const itemRows = $('itemRows');

function createItemRow(data = {}) {
  const tr = document.createElement('tr');

  const rateOptions = TAX_RATES
    .map((t) => `<option value="${t.rate}"${Number(data.rate) === t.rate ? ' selected' : ''}>${t.label}</option>`)
    .join('');

  tr.innerHTML = `
    <td><input type="text" class="i-name" placeholder="Webサイト制作費"></td>
    <td><input type="number" class="i-qty" step="any" min="0" value="1"></td>
    <td><input type="text" class="i-unit" placeholder="式"></td>
    <td><input type="number" class="i-price" step="any" min="0" placeholder="0"></td>
    <td><select class="i-rate">${rateOptions}</select></td>
    <td class="col-wh" hidden><input type="checkbox" class="i-wh" title="源泉徴収の対象にする"></td>
    <td><button type="button" class="i-del" title="この行を削除">×</button></td>`;

  tr.querySelector('.i-name').value = data.name || '';
  if (data.qty !== undefined) tr.querySelector('.i-qty').value = data.qty;
  tr.querySelector('.i-unit').value = data.unit || '';
  if (data.price !== undefined) tr.querySelector('.i-price').value = data.price;
  tr.querySelector('.i-wh').checked = data.wh !== false;

  tr.querySelector('.i-del').addEventListener('click', () => {
    tr.remove();
    if (!itemRows.children.length) createItemRow();
    update();
  });

  itemRows.appendChild(tr);
  return tr;
}

function readItems() {
  return [...itemRows.children].map((tr) => ({
    name: tr.querySelector('.i-name').value.trim(),
    qty: Number(tr.querySelector('.i-qty').value) || 0,
    unit: tr.querySelector('.i-unit').value.trim(),
    price: Number(tr.querySelector('.i-price').value) || 0,
    rate: Number(tr.querySelector('.i-rate').value),
    wh: tr.querySelector('.i-wh').checked,
  }));
}

// ---------------------------------------------------------------- 状態の読み書き

function readState() {
  return {
    docType: $('docType').value,
    docNo: $('docNo').value.trim(),
    issueDate: $('issueDate').value,
    dueDate: $('dueDate').value,
    toName: $('toName').value.trim(),
    toHonorific: $('toHonorific').value,
    toDept: $('toDept').value.trim(),
    toAddress: $('toAddress').value.trim(),
    fromName: $('fromName').value.trim(),
    fromInvoiceNo: $('fromInvoiceNo').value.trim(),
    fromAddress: $('fromAddress').value.trim(),
    bank: $('bank').value.trim(),
    rounding: $('rounding').value,
    withholdingOn: $('withholdingOn').checked,
    withholdingBase: $('withholdingBase').value,
    notes: $('notes').value.trim(),
    items: readItems(),
  };
}

function writeState(state) {
  const assign = (id, value) => { if (value !== undefined && value !== null) $(id).value = value; };
  assign('docType', state.docType);
  assign('docNo', state.docNo);
  assign('issueDate', state.issueDate);
  assign('dueDate', state.dueDate);
  assign('toName', state.toName);
  assign('toHonorific', state.toHonorific);
  assign('toDept', state.toDept);
  assign('toAddress', state.toAddress);
  assign('fromName', state.fromName);
  assign('fromInvoiceNo', state.fromInvoiceNo);
  assign('fromAddress', state.fromAddress);
  assign('bank', state.bank);
  assign('rounding', state.rounding);
  assign('withholdingBase', state.withholdingBase);
  assign('notes', state.notes);
  $('withholdingOn').checked = Boolean(state.withholdingOn);

  itemRows.innerHTML = '';
  const items = Array.isArray(state.items) && state.items.length ? state.items : [{}];
  items.forEach((item) => createItemRow(item));
}

// ------------------------------------------------------------ 収入印紙の案内

/**
 * 書類の種類が「領収書」のときだけ、収入印紙の判定ツールへの導線を出す。
 * 判定に必要な「税抜金額」と「税率」をURLに載せ、入力し直さずに済むようにする。
 * 税率が混在する場合は、印紙の金額が大きく出るほう(高い税率)を既定にする。
 */
function updateStampHint(state, totals) {
  const hint = $('receiptStampHint');
  if (!hint) return;

  const isReceipt = state.docType === '領収書';
  hint.hidden = !isReceipt;
  if (!isReceipt) return;

  const rate = totals.rates.length
    ? Math.max(...totals.rates.map((r) => r.rate))
    : 10;
  const params = new URLSearchParams({
    amount: String(Math.max(0, Math.round(totals.subtotal))),
    rate: String(rate),
  });
  $('receiptStampLink').href = `/inshi?${params.toString()}`;
}

// ---------------------------------------------------------------- プレビュー描画

function renderPreview(state, totals) {
  // 読み込んだJSONに未知の値が入っていても既定の書式に落とす
  const preset = Object.prototype.hasOwnProperty.call(DOC_PRESETS, state.docType)
    ? DOC_PRESETS[state.docType]
    : DOC_PRESETS['請求書'];

  setText('pDocType', state.docType);
  setText('pLead', preset.lead);
  setText('pGrandLabel', preset.grand);
  setText('pBankLabel', preset.bank);
  setText('pToName', state.toName);
  setText('pToHonorific', state.toName ? state.toHonorific : '');
  setText('pToDept', state.toDept);
  setText('pToAddress', state.toAddress);
  setText('pDocNo', state.docNo);
  setText('pIssueDate', formatDate(state.issueDate));
  setText('pFromName', state.fromName);
  setText('pFromInvoiceNo', state.fromInvoiceNo ? `登録番号 ${state.fromInvoiceNo}` : '');
  setText('pFromAddress', state.fromAddress);
  setText('pBank', state.bank);
  setText('pNotes', state.notes);

  const dueLine = document.querySelector('.due-line');
  if (preset.due && state.dueDate) {
    dueLine.hidden = false;
    dueLine.firstElementChild.textContent = preset.due;
    setText('pDueDate', formatDate(state.dueDate));
  } else {
    dueLine.hidden = true;
  }

  setText('pGrandTotal', yen(totals.payable));
  updateStampHint(state, totals);

  // 明細
  const rows = state.items
    .filter((item) => item.name || item.qty * item.price)
    .map((item) => {
      const amount = item.qty * item.price;
      const rateLabel = item.rate === 0 ? '非課税' : `${item.rate}%`;
      return `<tr>
        <td class="c-name">${escapeHtml(item.name)}</td>
        <td class="c-qty">${item.qty ? item.qty.toLocaleString('ja-JP') : ''}</td>
        <td class="c-unit">${escapeHtml(item.unit)}</td>
        <td class="c-price">${item.price ? yen(item.price) : ''}</td>
        <td class="c-rate">${rateLabel}</td>
        <td class="c-amount">${amount ? yen(amount) : ''}</td>
      </tr>`;
    });
  // 見た目を安定させるため最低行数を確保する
  while (rows.length < 3) rows.push('<tr class="blank"><td colspan="6">&nbsp;</td></tr>');
  $('pItems').innerHTML = rows.join('');

  // 合計欄
  const lines = [`<tr><th>小計(税抜)</th><td>${yen(totals.subtotal)}</td></tr>`];
  for (const r of totals.rates) {
    if (r.rate === 0) continue;
    lines.push(`<tr><th>消費税(${r.rate}%)</th><td>${yen(r.tax)}</td></tr>`);
  }
  lines.push(`<tr class="sum"><th>合計</th><td>${yen(totals.total)}</td></tr>`);
  if (state.withholdingOn) {
    const baseLabel = state.withholdingBase === 'incl' ? '税込' : '税抜';
    lines.push(`<tr><th>源泉徴収税額<small>(対象額 ${baseLabel} ${yen(totals.withholdingBase)})</small></th><td>△${yen(totals.withholdingTax).slice(1)}</td></tr>`);
    lines.push(`<tr class="sum"><th>お振込金額</th><td>${yen(totals.payable)}</td></tr>`);
  }
  $('pTotals').innerHTML = lines.join('');

  // 税率ごとの内訳(適格請求書の記載事項)
  const breakdown = totals.rates.map((r) => {
    const label = r.rate === 0 ? '非課税' : `${r.rate}%対象`;
    const tax = r.rate === 0 ? '—' : yen(r.tax);
    return `<tr><th>${label}</th><td>${yen(r.subtotal)}</td><td>消費税 ${tax}</td></tr>`;
  });
  $('pTaxBreakdown').innerHTML = breakdown.length
    ? breakdown.join('')
    : '<tr><th>—</th><td>¥0</td><td>消費税 ¥0</td></tr>';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

// ---------------------------------------------------------------- 書き出し

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Excel でそのまま開けるよう UTF-8 BOM を付ける。 */
function toCsv(state, totals) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['書類種別', '書類番号', '発行日', '支払期限', '請求先', '請求元', '登録番号'].map(esc).join(','),
    [state.docType, state.docNo, state.issueDate, state.dueDate,
      state.toName + state.toHonorific, state.fromName, state.fromInvoiceNo].map(esc).join(','),
    '',
    ['品目', '数量', '単位', '単価', '税率', '金額', '源泉対象'].map(esc).join(','),
  ];
  for (const item of state.items) {
    if (!item.name && !item.qty * item.price) continue;
    lines.push([item.name, item.qty, item.unit, item.price,
      item.rate === 0 ? '非課税' : `${item.rate}%`, item.qty * item.price,
      state.withholdingOn ? (item.wh ? '対象' : '対象外') : ''].map(esc).join(','));
  }
  lines.push('');
  lines.push(['小計(税抜)', totals.subtotal].map(esc).join(','));
  for (const r of totals.rates) {
    if (r.rate === 0) continue;
    lines.push([`消費税(${r.rate}%)`, r.tax].map(esc).join(','));
  }
  lines.push(['合計', totals.total].map(esc).join(','));
  if (state.withholdingOn) {
    lines.push(['源泉徴収の対象額', totals.withholdingBase].map(esc).join(','));
    lines.push(['源泉徴収税額', -totals.withholdingTax].map(esc).join(','));
    lines.push(['お振込金額', totals.payable].map(esc).join(','));
  }
  return '﻿' + lines.join('\r\n');
}

function baseFilename(state) {
  const parts = [state.docType, state.docNo || state.issueDate, state.toName].filter(Boolean);
  return parts.join('_').replace(/[\\/:*?"<>|]/g, '') || 'invoice';
}

// ---------------------------------------------------------------- 更新ループ

let currentState = null;
let currentTotals = null;

function update() {
  const state = readState();
  const totals = calcTotals(state.items, state.rounding, {
    enabled: state.withholdingOn,
    base: state.withholdingBase,
  });

  currentState = state;
  currentTotals = totals;

  $('withholdingBox').hidden = !state.withholdingOn;
  // 源泉徴収を使うときだけ、明細の「源泉」列を表示する
  document.querySelectorAll('.col-wh').forEach((cell) => { cell.hidden = !state.withholdingOn; });

  const hint = $('invoiceNoHint');
  if (!state.fromInvoiceNo) {
    hint.textContent = '未入力の場合、適格請求書(インボイス)としては扱えません。免税事業者の方は空欄のままで構いません。';
    hint.className = 'hint';
  } else if (isValidInvoiceNo(state.fromInvoiceNo)) {
    hint.textContent = '形式は正しい登録番号です(実在確認は国税庁の公表サイトで行ってください)。';
    hint.className = 'hint ok';
  } else {
    hint.textContent = '登録番号は「T」+ 数字13桁です。形式をご確認ください。';
    hint.className = 'hint warn';
  }

  renderPreview(state, totals);
  saveDraft(state);
}

function saveDraft(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // プライベートブラウズ等で保存できない場合は下書きを諦める(動作自体は継続する)
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/** URLで指定された書類の種類。未指定・未知の値なら null。 */
function requestedDocType() {
  const key = new URLSearchParams(location.search).get('type');
  return key && Object.prototype.hasOwnProperty.call(DOC_TYPE_BY_QUERY, key)
    ? DOC_TYPE_BY_QUERY[key]
    : null;
}

function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---------------------------------------------------------------- 起動

function init() {
  const draft = loadDraft();
  if (draft) {
    writeState(draft);
  } else {
    createItemRow();
    $('issueDate').value = todayIso();
  }

  // URLでの指定は下書きより優先する(見積書のランディングから来た場合など)
  const wantedDocType = requestedDocType();
  if (wantedDocType) $('docType').value = wantedDocType;

  document.addEventListener('input', update);
  document.addEventListener('change', update);

  $('addItem').addEventListener('click', () => { createItemRow(); update(); });

  $('btnPrint').addEventListener('click', () => window.print());

  $('btnCsv').addEventListener('click', () => {
    download(baseFilename(currentState) + '.csv', toCsv(currentState, currentTotals), 'text/csv;charset=utf-8');
  });

  $('btnJson').addEventListener('click', () => {
    download(baseFilename(currentState) + '.json', JSON.stringify(currentState, null, 2), 'application/json');
  });

  $('fileJson').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        writeState(JSON.parse(reader.result));
        update();
      } catch (e) {
        alert('読み込めませんでした。このツールで保存したJSONファイルを選んでください。');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  });

  $('btnClear').addEventListener('click', () => {
    if (!confirm('入力内容をすべて消します。よろしいですか?')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    location.reload();
  });

  update();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
