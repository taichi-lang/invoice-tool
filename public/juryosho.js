/*
 * 受領書(/juryosho)の画面制御。
 * 紙面の組み立ては juryosho-core.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var JR = window.Juryosho;
  var STORAGE_KEY = 'juryosho-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    issueDate: $('jrIssueDate'),
    to: $('jrTo'),
    honorific: $('jrHonorific'),
    from: $('jrFrom'),
    fromAddress: $('jrFromAddress'),
    person: $('jrPerson'),
    subject: $('jrSubject'),
    receivedDate: $('jrReceivedDate'),
    refNo: $('jrRefNo'),
    note: $('jrNote'),
    stamp: $('jrStamp'),
    rows: $('jrRows'),
    btnAdd: $('jrAdd'),
    problems: $('jrProblems'),
    sheet: $('jrSheet'),
    btnPrint: $('jrPrint'),
    btnClear: $('jrClear')
  };

  /* 上の欄(行ではないもの)。下書きの保存と読み戻しで同じ並びを使う */
  var TOP_KEYS = ['issueDate', 'to', 'honorific', 'from', 'fromAddress', 'person', 'subject',
    'receivedDate', 'refNo', 'note', 'stamp'];

  var ROW_FIELDS = [
    { key: 'name', label: '受け取った物の名前', placeholder: '例: コピー用紙 A4' },
    { key: 'qty', label: '数量(任意)', placeholder: '例: 5' },
    { key: 'unit', label: '単位(任意)', placeholder: '例: 箱' }
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
    if (els.rows.children.length >= JR.MAX_ROWS) return;
    values = values || {};
    var card = el('fieldset', 'jr-row');
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
    var remove = el('button', 'btn-sub jr-remove', 'この行を消す');
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
    var paper = el('div', 'paper jr-paper');

    var head = el('div', 'jr-head');
    head.appendChild(el('p', 'jr-title', '受領書'));
    head.appendChild(el('p', 'jr-date', '発行日 ' + (b.issueDateText || '　　年　　月　　日')));
    paper.appendChild(head);

    var parties = el('div', 'jr-parties');
    var left = el('div', 'jr-to');
    left.appendChild(el('p', 'jr-to-name', b.to ? b.to + '　' + b.honorific : ''));
    left.appendChild(el('p', 'jr-lead', '下記のとおり、たしかに受領いたしました。'));
    parties.appendChild(left);
    var right = el('div', 'jr-from');
    right.appendChild(el('p', 'jr-from-name', b.from));
    if (b.fromAddress) right.appendChild(el('p', 'jr-from-addr', b.fromAddress));
    if (b.person) right.appendChild(el('p', 'jr-from-addr', '担当 ' + b.person));
    parties.appendChild(right);
    paper.appendChild(parties);

    var box = el('table', 'jr-box');
    [
      ['受領日', b.receivedDateText, 'jr-box-main'],
      ['件名', b.subject, null],
      ['納品書の番号', b.refNo, null]
    ].forEach(function (line) {
      var tr = el('tr', line[2]);
      tr.appendChild(el('th', null, line[0]));
      tr.appendChild(el('td', null, line[1]));
      box.appendChild(tr);
    });
    paper.appendChild(box);

    var table = el('table', 'jr-table');
    var thead = el('thead');
    var hr = el('tr');
    ['No', '品名', '数量', '単位'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    for (var i = 0; i < JR.MAX_ROWS; i++) {
      var r = b.rows[i];
      var tr = el('tr');
      tr.appendChild(el('td', 'jr-no', String(i + 1)));
      tr.appendChild(el('td', 'jr-name', r ? r.name : ''));
      tr.appendChild(el('td', 'jr-qty', r ? r.qty : ''));
      tr.appendChild(el('td', 'jr-unit', r ? r.unit : ''));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    paper.appendChild(table);

    var note = el('div', 'jr-note');
    note.appendChild(el('p', 'jr-note-cap', '備考'));
    note.appendChild(el('p', 'jr-note-body', b.note));
    paper.appendChild(note);

    /* 受領印の枠は、受け取った側が手で押す場所。中身はいつも空欄で出す */
    if (b.stamp === 'on') {
      var stamp = el('table', 'jr-stamp');
      var sr = el('tr');
      sr.appendChild(el('th', null, '受領印'));
      sr.appendChild(el('td', 'jr-stamp-box', ''));
      stamp.appendChild(sr);
      paper.appendChild(stamp);
    }

    return paper;
  }

  function render() {
    var data = input();
    var built = JR.buildSheet(data);

    els.sheet.textContent = '';
    els.sheet.appendChild(sheetNode(built));

    var problems = JR.findProblems(data, built);
    els.problems.textContent = '';
    els.problems.hidden = problems.length === 0;
    problems.forEach(function (msg) { els.problems.appendChild(el('li', null, msg)); });

    els.btnAdd.disabled = els.rows.children.length >= JR.MAX_ROWS;

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
      if (JR.HONORIFICS.indexOf(els.honorific.value) < 0) els.honorific.value = JR.HONORIFICS[0];
      if (JR.STAMPS.indexOf(els.stamp.value) < 0) els.stamp.value = JR.STAMPS[0];
      var rows = Array.isArray(data.rows) ? data.rows.slice(0, JR.MAX_ROWS) : [];
      rows.forEach(function (r) { addRow(r); });
      if (rows.length === 0) addRow({});
      return true;
    } catch (e) { return false; }
  }

  function setDefaults() {
    TOP_KEYS.forEach(function (k) { els[k].value = ''; });
    els.issueDate.value = todayIso();
    els.honorific.value = JR.HONORIFICS[0];
    els.stamp.value = JR.STAMPS[0];
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
