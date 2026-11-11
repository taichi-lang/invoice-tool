/*
 * 経費精算書(/keihi)の画面制御。
 * 紙面の組み立ては keihi-core.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var KH = window.Keihi;
  var STORAGE_KEY = 'keihi-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    submitDate: $('kiSubmitDate'),
    to: $('kiTo'),
    applicant: $('kiApplicant'),
    advance: $('kiAdvance'),
    rows: $('kiRows'),
    btnAdd: $('kiAdd'),
    total: $('kiTotal'),
    problems: $('kiProblems'),
    sheet: $('kiSheet'),
    btnPrint: $('kiPrint'),
    btnClear: $('kiClear')
  };

  /* 1行の入力欄。receipt だけはチェックボックス(既定は「領収書あり」) */
  var ROW_FIELDS = [
    { key: 'date', label: '日付', type: 'date' },
    { key: 'payee', label: '支払先', type: 'text', placeholder: '例: JR東日本' },
    { key: 'memo', label: '内容(何に払ったか)', type: 'text', placeholder: '例: 法務局へ 登記申請 往復' },
    { key: 'amount', label: '金額(円)', type: 'text', placeholder: '例: 960', inputmode: 'numeric' },
    { key: 'receipt', label: '領収書あり', type: 'checkbox' }
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

  function addRow(values) {
    if (els.rows.children.length >= KH.MAX_ROWS) return;
    values = values || {};
    var card = el('fieldset', 'ki-row');
    ROW_FIELDS.forEach(function (f) {
      var label = el('label', f.type === 'checkbox' ? 'ki-check' : null, f.type === 'checkbox' ? null : f.label);
      var input = document.createElement('input');
      input.type = f.type;
      input.dataset.key = f.key;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.inputmode) input.setAttribute('inputmode', f.inputmode);
      if (f.type === 'checkbox') {
        input.checked = values.receipt !== false;
      } else {
        input.value = values[f.key] == null ? '' : String(values[f.key]);
      }
      input.addEventListener('input', render);
      input.addEventListener('change', render);
      label.appendChild(input);
      if (f.type === 'checkbox') label.appendChild(el('span', null, f.label));
      card.appendChild(label);
    });
    var remove = el('button', 'btn-sub ki-remove', 'この行を消す');
    remove.type = 'button';
    remove.addEventListener('click', function () {
      card.parentNode.removeChild(card);
      if (els.rows.children.length === 0) addRow({ date: todayIso() });
      render();
    });
    card.appendChild(remove);
    els.rows.appendChild(card);
  }

  function input() {
    var rows = [];
    Array.prototype.forEach.call(els.rows.children, function (card) {
      var row = {};
      Array.prototype.forEach.call(card.querySelectorAll('input[data-key]'), function (inp) {
        row[inp.dataset.key] = inp.type === 'checkbox' ? !!inp.checked : inp.value;
      });
      rows.push(row);
    });
    return {
      submitDate: els.submitDate.value,
      to: els.to.value,
      applicant: els.applicant.value,
      advance: els.advance.value,
      rows: rows
    };
  }

  /* ------------------------------------------------------------- 紙面 */

  function cell(tag, className, text) { return el(tag, className, text == null ? '' : text); }

  function sheetNode(b) {
    var paper = el('div', 'paper ki-paper');

    var head = el('div', 'ki-head');
    head.appendChild(el('p', 'ki-title', '経費精算書'));
    head.appendChild(el('p', 'ki-date', '提出日 ' + (b.submitDateText || '　　年　　月　　日')));
    paper.appendChild(head);

    var parties = el('div', 'ki-parties');
    var left = el('div', 'ki-to');
    left.appendChild(el('p', 'ki-to-name', (b.to || '') + (b.to ? '　御中' : '')));
    left.appendChild(el('p', 'ki-lead', '下記のとおり立て替えた経費の精算を申請します。'));
    parties.appendChild(left);

    var right = el('div', 'ki-right');
    var who = el('p', 'ki-applicant');
    who.appendChild(el('span', 'ki-cap', '申請者'));
    who.appendChild(el('span', 'ki-applicant-name', b.applicant));
    right.appendChild(who);
    var stamps = el('div', 'ki-stamps');
    ['承認', '確認', '申請者印'].forEach(function (s) {
      var c = el('div', 'ki-stamp');
      c.appendChild(el('span', null, s));
      stamps.appendChild(c);
    });
    right.appendChild(stamps);
    parties.appendChild(right);
    paper.appendChild(parties);

    var table = el('table', 'ki-table');
    var thead = el('thead');
    var hr = el('tr');
    ['No', '日付', '支払先', '内容', '領収書', '金額'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    for (var i = 0; i < KH.MAX_ROWS; i++) {
      var r = b.rows[i];
      var tr = el('tr');
      tr.appendChild(cell('td', 'ki-no', r ? String(r.no) : String(i + 1)));
      tr.appendChild(cell('td', 'ki-d', r && r.dateText));
      tr.appendChild(cell('td', 'ki-payee', r && r.payee));
      tr.appendChild(cell('td', 'ki-memo', r && r.memo));
      tr.appendChild(cell('td', 'ki-rc', r ? r.receiptText : ''));
      tr.appendChild(cell('td', 'ki-amount', r && r.amountText));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    paper.appendChild(table);

    var sum = el('table', 'ki-sum');
    var lines = [['合計', b.rows.length ? '¥' + b.totalText + '-' : '']];
    if (b.advance !== null) {
      lines.push(['仮払金', '¥' + b.advanceText + '-']);
      lines.push([b.diffLabel, '¥' + b.diffText + '-']);
    }
    lines.forEach(function (line, idx) {
      var tr = el('tr', idx === lines.length - 1 ? 'ki-sum-last' : null);
      tr.appendChild(el('th', null, line[0]));
      tr.appendChild(el('td', 'ki-amount', line[1]));
      sum.appendChild(tr);
    });
    paper.appendChild(sum);

    paper.appendChild(el('p', 'ki-note', '領収書・レシートは、この精算書の裏に貼って提出します。領収書が無い支払いは「無」とし、内容を具体的に書いてください。'));

    return paper;
  }

  function render() {
    var data = input();
    var built = KH.buildSheet(data);

    els.sheet.textContent = '';
    els.sheet.appendChild(sheetNode(built));

    els.total.textContent = built.rows.length
      ? built.rows.length + '行・合計 ' + built.totalText + '円' +
        (built.diff === null ? '' : '・' + built.diffLabel + ' ' + built.diffText + '円')
      : '';

    var problems = KH.findProblems(data, built);
    els.problems.textContent = '';
    els.problems.hidden = problems.length === 0;
    problems.forEach(function (msg) { els.problems.appendChild(el('li', null, msg)); });

    els.btnAdd.disabled = els.rows.children.length >= KH.MAX_ROWS;

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
      els.submitDate.value = data.submitDate == null ? '' : String(data.submitDate);
      els.to.value = data.to == null ? '' : String(data.to);
      els.applicant.value = data.applicant == null ? '' : String(data.applicant);
      els.advance.value = data.advance == null ? '' : String(data.advance);
      var rows = Array.isArray(data.rows) ? data.rows.slice(0, KH.MAX_ROWS) : [];
      rows.forEach(function (r) { addRow(r); });
      if (rows.length === 0) addRow({ date: todayIso() });
      return true;
    } catch (e) { return false; }
  }

  function setDefaults() {
    els.submitDate.value = todayIso();
    els.to.value = '';
    els.applicant.value = '';
    els.advance.value = '';
    els.rows.textContent = '';
    addRow({ date: todayIso() });
  }

  function clearAll() {
    if (!window.confirm('入力した内容をすべて消します。よろしいですか。')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    setDefaults();
    render();
  }

  /* ------------------------------------------------------------------- 起動 */

  if (!load()) setDefaults();

  [els.submitDate, els.to, els.applicant, els.advance].forEach(function (node) {
    node.addEventListener('input', render);
    node.addEventListener('change', render);
  });
  els.btnAdd.addEventListener('click', function () {
    /* 足した行の日付は、直前の行と同じ日にしておく(同じ日の支払いをまとめて書くことが多いため) */
    var last = els.rows.lastElementChild;
    var prevDate = last ? last.querySelector('input[data-key="date"]').value : todayIso();
    addRow({ date: prevDate });
    render();
  });
  els.btnPrint.addEventListener('click', function () { window.print(); });
  els.btnClear.addEventListener('click', clearAll);

  render();

})();
