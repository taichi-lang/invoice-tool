/*
 * 業務完了報告書(/kanryo-hokoku)の画面制御。
 * 紙面の組み立ては kanryo-hokoku-core.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var KH = window.KanryoHokoku;
  var STORAGE_KEY = 'kanryo-hokoku-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    issueDate: $('khIssueDate'),
    to: $('khTo'),
    honorific: $('khHonorific'),
    from: $('khFrom'),
    fromAddress: $('khFromAddress'),
    person: $('khPerson'),
    subject: $('khSubject'),
    startDate: $('khStartDate'),
    endDate: $('khEndDate'),
    doneDate: $('khDoneDate'),
    place: $('khPlace'),
    note: $('khNote'),
    confirm: $('khConfirm'),
    rows: $('khRows'),
    btnAdd: $('khAdd'),
    problems: $('khProblems'),
    sheet: $('khSheet'),
    btnPrint: $('khPrint'),
    btnClear: $('khClear')
  };

  /* 上の欄(行ではないもの)。下書きの保存と読み戻しで同じ並びを使う */
  var TOP_KEYS = ['issueDate', 'to', 'honorific', 'from', 'fromAddress', 'person', 'subject',
    'startDate', 'endDate', 'doneDate', 'place', 'note', 'confirm'];

  var ROW_FIELDS = [
    { key: 'name', label: '行った作業・納めた成果物', placeholder: '例: トップページのデザインと実装' },
    { key: 'qty', label: '数量(任意)', placeholder: '例: 1' },
    { key: 'unit', label: '単位(任意)', placeholder: '例: 式' }
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
    var card = el('fieldset', 'kh-row');
    ROW_FIELDS.forEach(function (f) {
      var label = el('label', null, f.label);
      var input = document.createElement('input');
      input.type = 'text';
      input.dataset.key = f.key;
      input.placeholder = f.placeholder;
      input.value = values[f.key] == null ? '' : String(values[f.key]);
      input.addEventListener('input', render);
      input.addEventListener('change', render);
      label.appendChild(input);
      card.appendChild(label);
    });
    var remove = el('button', 'btn-sub kh-remove', 'この行を消す');
    remove.type = 'button';
    remove.addEventListener('click', function () {
      card.parentNode.removeChild(card);
      if (els.rows.children.length === 0) addRow({});
      render();
    });
    card.appendChild(remove);
    els.rows.appendChild(card);
  }

  function readRows() {
    var out = [];
    Array.prototype.forEach.call(els.rows.children, function (card) {
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
    data.rows = readRows();
    return data;
  }

  /* ------------------------------------------------------------- 紙面 */

  function sheetNode(b) {
    var paper = el('div', 'paper kh-paper');

    var head = el('div', 'kh-head');
    head.appendChild(el('p', 'kh-title', '業務完了報告書'));
    head.appendChild(el('p', 'kh-date', '報告日 ' + (b.issueDateText || '　　年　　月　　日')));
    paper.appendChild(head);

    var parties = el('div', 'kh-parties');
    var left = el('div', 'kh-to');
    left.appendChild(el('p', 'kh-to-name', b.to ? b.to + '　' + b.honorific : ''));
    left.appendChild(el('p', 'kh-lead', '下記の業務が完了しましたので、ご報告いたします。'));
    parties.appendChild(left);
    var right = el('div', 'kh-from');
    right.appendChild(el('p', 'kh-from-name', b.from));
    if (b.fromAddress) right.appendChild(el('p', 'kh-from-addr', b.fromAddress));
    if (b.person) right.appendChild(el('p', 'kh-from-addr', '担当 ' + b.person));
    parties.appendChild(right);
    paper.appendChild(parties);

    var box = el('table', 'kh-box');
    [
      ['件名', b.subject, null],
      ['作業期間', b.periodText, null],
      ['完了日', b.doneDateText, 'kh-box-main'],
      ['作業場所', b.place, null]
    ].forEach(function (line) {
      var tr = el('tr', line[2]);
      tr.appendChild(el('th', null, line[0]));
      tr.appendChild(el('td', null, line[1]));
      box.appendChild(tr);
    });
    paper.appendChild(box);

    var table = el('table', 'kh-table');
    var thead = el('thead');
    var hr = el('tr');
    ['No', '行った作業・成果物', '数量', '単位'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    for (var i = 0; i < KH.MAX_ROWS; i++) {
      var r = b.rows[i];
      var tr = el('tr');
      tr.appendChild(el('td', 'kh-no', String(i + 1)));
      tr.appendChild(el('td', 'kh-name', r ? r.name : ''));
      tr.appendChild(el('td', 'kh-qty', r ? r.qty : ''));
      tr.appendChild(el('td', 'kh-unit', r ? r.unit : ''));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    paper.appendChild(table);

    var note = el('div', 'kh-note');
    note.appendChild(el('p', 'kh-note-cap', '備考'));
    note.appendChild(el('p', 'kh-note-body', b.note));
    paper.appendChild(note);

    /* 確認欄は相手が手で書く枠。中身はいつも空欄で出す */
    if (b.confirm === 'on') {
      var confirm = el('table', 'kh-confirm');
      var cr = el('tr');
      cr.appendChild(el('th', null, '確認欄'));
      cr.appendChild(el('td', 'kh-confirm-date', '確認日　　　　年　　月　　日'));
      cr.appendChild(el('td', 'kh-confirm-name', 'お名前'));
      confirm.appendChild(cr);
      paper.appendChild(confirm);
      paper.appendChild(el('p', 'kh-confirm-lead', '上記の内容をご確認のうえ、確認日とお名前をご記入ください。'));
    }

    return paper;
  }

  function render() {
    var data = input();
    var built = KH.buildSheet(data);

    els.sheet.textContent = '';
    els.sheet.appendChild(sheetNode(built));

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
      TOP_KEYS.forEach(function (k) { els[k].value = data[k] == null ? '' : String(data[k]); });
      if (KH.HONORIFICS.indexOf(els.honorific.value) < 0) els.honorific.value = KH.HONORIFICS[0];
      if (KH.CONFIRMS.indexOf(els.confirm.value) < 0) els.confirm.value = KH.CONFIRMS[0];
      var rows = Array.isArray(data.rows) ? data.rows.slice(0, KH.MAX_ROWS) : [];
      rows.forEach(function (r) { addRow(r); });
      if (rows.length === 0) addRow({});
      return true;
    } catch (e) { return false; }
  }

  function setDefaults() {
    TOP_KEYS.forEach(function (k) { els[k].value = ''; });
    els.issueDate.value = todayIso();
    els.honorific.value = KH.HONORIFICS[0];
    els.confirm.value = KH.CONFIRMS[0];
    els.rows.textContent = '';
    addRow({});
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
