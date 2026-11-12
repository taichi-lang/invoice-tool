/*
 * 支払明細書(/shiharai-meisai)の画面制御。
 * 紙面の組み立ては shiharai-meisai-core.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var SM = window.ShiharaiMeisai;
  var STORAGE_KEY = 'shiharai-meisai-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    issueDate: $('smIssueDate'),
    to: $('smTo'),
    honorific: $('smHonorific'),
    from: $('smFrom'),
    fromAddress: $('smFromAddress'),
    payDate: $('smPayDate'),
    method: $('smMethod'),
    note: $('smNote'),
    rows: $('smRows'),
    btnAdd: $('smAdd'),
    deds: $('smDeds'),
    total: $('smTotal'),
    problems: $('smProblems'),
    sheet: $('smSheet'),
    btnPrint: $('smPrint'),
    btnClear: $('smClear')
  };

  /* 上の欄(行ではないもの)。下書きの保存と読み戻しで同じ並びを使う */
  var TOP_KEYS = ['issueDate', 'to', 'honorific', 'from', 'fromAddress', 'payDate', 'method', 'note'];

  var ROW_FIELDS = [
    { key: 'memo', label: '内容(何の代金か)', placeholder: '例: 11月分 ロゴ制作費' },
    { key: 'amount', label: '金額(円)', placeholder: '例: 55000', inputmode: 'numeric' }
  ];

  var DED_FIELDS = [
    { key: 'name', label: '名目', placeholder: '例: 源泉所得税' },
    { key: 'amount', label: '差し引く額(円)', placeholder: '例: 5105', inputmode: 'numeric' }
  ];

  function todayIso() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ------------------------------------------------------------- 入力欄 */

  function fieldCard(fields, values, className) {
    var card = el('fieldset', className);
    fields.forEach(function (f) {
      var label = el('label', null, f.label);
      var input = document.createElement('input');
      input.type = 'text';
      input.dataset.key = f.key;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.inputmode) input.setAttribute('inputmode', f.inputmode);
      input.value = values[f.key] == null ? '' : String(values[f.key]);
      input.addEventListener('input', render);
      input.addEventListener('change', render);
      label.appendChild(input);
      card.appendChild(label);
    });
    return card;
  }

  function addRow(values) {
    if (els.rows.children.length >= SM.MAX_ROWS) return;
    var card = fieldCard(ROW_FIELDS, values || {}, 'sm-row');
    var remove = el('button', 'btn-sub sm-remove', 'この行を消す');
    remove.type = 'button';
    remove.addEventListener('click', function () {
      card.parentNode.removeChild(card);
      if (els.rows.children.length === 0) addRow({});
      render();
    });
    card.appendChild(remove);
    els.rows.appendChild(card);
  }

  /* 差し引くものは、いつも MAX_DEDUCTIONS 個の欄を出しておく(使わない欄は空のまま) */
  function setDeductions(list) {
    els.deds.textContent = '';
    for (var i = 0; i < SM.MAX_DEDUCTIONS; i++) {
      els.deds.appendChild(fieldCard(DED_FIELDS, (list && list[i]) || {}, 'sm-row sm-ded'));
    }
  }

  function readCards(container) {
    var out = [];
    Array.prototype.forEach.call(container.children, function (card) {
      var row = {};
      Array.prototype.forEach.call(card.querySelectorAll('input[data-key]'), function (inp) {
        row[inp.dataset.key] = inp.value;
      });
      out.push(row);
    });
    return out;
  }

  function input() {
    var data = {};
    TOP_KEYS.forEach(function (k) { data[k] = els[k].value; });
    data.rows = readCards(els.rows);
    data.deductions = readCards(els.deds);
    return data;
  }

  /* ------------------------------------------------------------- 紙面 */

  function yen(text) { return text === '' ? '' : '¥' + text + '-'; }

  function sheetNode(b) {
    var paper = el('div', 'paper sm-paper');

    var head = el('div', 'sm-head');
    head.appendChild(el('p', 'sm-title', '支払明細書'));
    head.appendChild(el('p', 'sm-date', '発行日 ' + (b.issueDateText || '　　年　　月　　日')));
    paper.appendChild(head);

    var parties = el('div', 'sm-parties');
    var left = el('div', 'sm-to');
    left.appendChild(el('p', 'sm-to-name', b.to ? b.to + '　' + b.honorific : ''));
    left.appendChild(el('p', 'sm-lead', '下記のとおりお支払いいたします。'));
    parties.appendChild(left);
    var right = el('div', 'sm-from');
    right.appendChild(el('p', 'sm-from-name', b.from));
    if (b.fromAddress) right.appendChild(el('p', 'sm-from-addr', b.fromAddress));
    parties.appendChild(right);
    paper.appendChild(parties);

    var box = el('table', 'sm-box');
    [
      ['差引支払額', b.rows.length ? yen(b.netText) : '', 'sm-box-main'],
      ['支払日', b.payDateText, null],
      ['支払方法', b.method, null]
    ].forEach(function (line) {
      var tr = el('tr', line[2]);
      tr.appendChild(el('th', null, line[0]));
      tr.appendChild(el('td', null, line[1]));
      box.appendChild(tr);
    });
    paper.appendChild(box);

    var table = el('table', 'sm-table');
    var thead = el('thead');
    var hr = el('tr');
    ['No', '内容', '金額'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    for (var i = 0; i < SM.MAX_ROWS; i++) {
      var r = b.rows[i];
      var tr = el('tr');
      tr.appendChild(el('td', 'sm-no', String(i + 1)));
      tr.appendChild(el('td', 'sm-memo', r ? r.memo : ''));
      tr.appendChild(el('td', 'sm-amount', r ? r.amountText : ''));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    paper.appendChild(table);

    var sum = el('table', 'sm-sum');
    var lines = [['支払額 合計', b.rows.length ? yen(b.totalText) : '']];
    b.deductions.forEach(function (d) {
      lines.push(['差引 ' + d.name, d.amountText === '' ? '' : '-¥' + d.amountText]);
    });
    lines.push(['差引支払額', b.rows.length ? yen(b.netText) : '']);
    lines.forEach(function (line, idx) {
      var tr = el('tr', idx === lines.length - 1 ? 'sm-sum-last' : null);
      tr.appendChild(el('th', null, line[0]));
      tr.appendChild(el('td', 'sm-amount', line[1]));
      sum.appendChild(tr);
    });
    paper.appendChild(sum);

    var note = el('div', 'sm-note');
    note.appendChild(el('p', 'sm-note-cap', '備考'));
    note.appendChild(el('p', 'sm-note-body', b.note));
    paper.appendChild(note);

    return paper;
  }

  function render() {
    var data = input();
    var built = SM.buildSheet(data);

    els.sheet.textContent = '';
    els.sheet.appendChild(sheetNode(built));

    els.total.textContent = built.rows.length
      ? '支払額の合計 ' + built.totalText + '円' +
        (built.deductions.length ? '・差し引く額 ' + built.deductionTotal.toLocaleString('ja-JP') + '円' : '') +
        (built.netText === '' ? '' : '・差引支払額 ' + built.netText + '円')
      : '';

    var problems = SM.findProblems(data, built);
    els.problems.textContent = '';
    els.problems.hidden = problems.length === 0;
    problems.forEach(function (msg) { els.problems.appendChild(el('li', null, msg)); });

    els.btnAdd.disabled = els.rows.children.length >= SM.MAX_ROWS;

    save();
  }

  /* ----------------------------------------------------------------- 下書き */

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(input())); } catch (e) { /* 保存できなくても動き続ける */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      TOP_KEYS.forEach(function (k) { els[k].value = data[k] == null ? '' : String(data[k]); });
      if (SM.HONORIFICS.indexOf(els.honorific.value) < 0) els.honorific.value = SM.HONORIFICS[0];
      var rows = Array.isArray(data.rows) ? data.rows.slice(0, SM.MAX_ROWS) : [];
      rows.forEach(function (r) { addRow(r); });
      if (rows.length === 0) addRow({});
      setDeductions(Array.isArray(data.deductions) ? data.deductions : []);
      return true;
    } catch (e) { return false; }
  }

  function setDefaults() {
    TOP_KEYS.forEach(function (k) { els[k].value = ''; });
    els.issueDate.value = todayIso();
    els.honorific.value = SM.HONORIFICS[0];
    els.rows.textContent = '';
    addRow({});
    setDeductions([]);
  }

  function clearAll() {
    if (!window.confirm('入力した内容をすべて消します。よろしいですか。')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    setDefaults();
    render();
  }

  /* ------------------------------------------------------------------- 起動 */

  if (!load()) setDefaults();

  TOP_KEYS.forEach(function (k) {
    els[k].addEventListener('input', render);
    els[k].addEventListener('change', render);
  });
  els.btnAdd.addEventListener('click', function () { addRow({}); render(); });
  els.btnPrint.addEventListener('click', function () { window.print(); });
  els.btnClear.addEventListener('click', clearAll);

  render();

})();
