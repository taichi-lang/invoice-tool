/*
 * 預り証(/azukarisho)の画面制御。
 * 紙面の組み立ては azukarisho-core.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var AZ = window.Azukarisho;
  var STORAGE_KEY = 'azukarisho-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    issueDate: $('azIssueDate'),
    to: $('azTo'),
    honorific: $('azHonorific'),
    from: $('azFrom'),
    fromAddress: $('azFromAddress'),
    person: $('azPerson'),
    subject: $('azSubject'),
    receivedDate: $('azReceivedDate'),
    returnDate: $('azReturnDate'),
    refNo: $('azRefNo'),
    note: $('azNote'),
    stamp: $('azStamp'),
    returnBox: $('azReturnBox'),
    pickup: $('azPickup'),
    rows: $('azRows'),
    btnAdd: $('azAdd'),
    problems: $('azProblems'),
    sheet: $('azSheet'),
    btnPrint: $('azPrint'),
    btnClear: $('azClear')
  };

  /* 上の欄(行ではないもの)。下書きの保存と読み戻しで同じ並びを使う */
  var TOP_KEYS = ['issueDate', 'to', 'honorific', 'from', 'fromAddress', 'person', 'subject',
    'receivedDate', 'returnDate', 'refNo', 'note', 'stamp', 'returnBox', 'pickup'];

  var SWITCH_KEYS = ['stamp', 'returnBox', 'pickup'];

  var ROW_FIELDS = [
    { key: 'name', label: '預かった品物の名前', placeholder: '例: 腕時計' },
    { key: 'qty', label: '数量(任意)', placeholder: '例: 1' },
    { key: 'unit', label: '単位(任意)', placeholder: '例: 点' },
    { key: 'condition', label: '状態・付属品(任意)', placeholder: '例: ベルトにすり傷・箱あり' }
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
    if (els.rows.children.length >= AZ.MAX_ROWS) return;
    values = values || {};
    var card = el('fieldset', 'az-row');
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
    var remove = el('button', 'btn-sub az-remove', 'この行を消す');
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
    var paper = el('div', 'paper az-paper');

    var head = el('div', 'az-head');
    head.appendChild(el('p', 'az-title', '預り証'));
    head.appendChild(el('p', 'az-date', '発行日 ' + (b.issueDateText || '　　年　　月　　日')));
    paper.appendChild(head);

    var parties = el('div', 'az-parties');
    var left = el('div', 'az-to');
    left.appendChild(el('p', 'az-to-name', b.to ? b.to + '　' + b.honorific : ''));
    left.appendChild(el('p', 'az-lead', '下記の品物を、たしかにお預かりいたしました。'));
    parties.appendChild(left);
    var right = el('div', 'az-from');
    right.appendChild(el('p', 'az-from-name', b.from));
    if (b.fromAddress) right.appendChild(el('p', 'az-from-addr', b.fromAddress));
    if (b.person) right.appendChild(el('p', 'az-from-addr', '担当 ' + b.person));
    parties.appendChild(right);
    paper.appendChild(parties);

    var box = el('table', 'az-box');
    [
      ['お預かりした日', b.receivedDateText, 'az-box-main'],
      ['お返しする予定日', b.returnDateText, null],
      ['用件', b.subject, null],
      ['預り番号', b.refNo, null]
    ].forEach(function (line) {
      var tr = el('tr', line[2]);
      tr.appendChild(el('th', null, line[0]));
      tr.appendChild(el('td', null, line[1]));
      box.appendChild(tr);
    });
    paper.appendChild(box);

    var table = el('table', 'az-table');
    var thead = el('thead');
    var hr = el('tr');
    ['No', '品名', '数量', '単位', '状態・付属品'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    for (var i = 0; i < AZ.MAX_ROWS; i++) {
      var r = b.rows[i];
      var tr = el('tr');
      tr.appendChild(el('td', 'az-no', String(i + 1)));
      tr.appendChild(el('td', 'az-name', r ? r.name : ''));
      tr.appendChild(el('td', 'az-qty', r ? r.qty : ''));
      tr.appendChild(el('td', 'az-unit', r ? r.unit : ''));
      tr.appendChild(el('td', 'az-cond', r ? r.condition : ''));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    paper.appendChild(table);

    var note = el('div', 'az-note');
    note.appendChild(el('p', 'az-note-cap', '備考'));
    note.appendChild(el('p', 'az-note-body', b.note));
    paper.appendChild(note);

    if (b.pickup === 'on') paper.appendChild(el('p', 'az-pickup', AZ.PICKUP_TEXT));

    var foot = el('div', 'az-foot');

    /* お返しの欄は、品物を返したときに手で書き込む場所。中身はいつも空欄で出す */
    if (b.returnBox === 'on') {
      var ret = el('table', 'az-return');
      var cap = el('tr');
      var capTh = el('th', 'az-return-cap', 'お返しの欄(品物をお返ししたときに記入)');
      capTh.setAttribute('colspan', '2');
      cap.appendChild(capTh);
      ret.appendChild(cap);
      [['お返しした日', '　　年　　月　　日'], ['お受け取りのお名前', '']].forEach(function (line) {
        var tr = el('tr');
        tr.appendChild(el('th', null, line[0]));
        tr.appendChild(el('td', null, line[1]));
        ret.appendChild(tr);
      });
      foot.appendChild(ret);
    }

    /* 預かった側の印の枠。中身はいつも空欄で出す */
    if (b.stamp === 'on') {
      var stamp = el('table', 'az-stamp');
      var sr = el('tr');
      sr.appendChild(el('th', null, '預かった側の印'));
      sr.appendChild(el('td', 'az-stamp-box', ''));
      stamp.appendChild(sr);
      foot.appendChild(stamp);
    }

    if (foot.children.length) paper.appendChild(foot);

    return paper;
  }

  function render() {
    var data = input();
    var built = AZ.buildSheet(data);

    els.sheet.textContent = '';
    els.sheet.appendChild(sheetNode(built));

    var problems = AZ.findProblems(data, built);
    els.problems.textContent = '';
    els.problems.hidden = problems.length === 0;
    problems.forEach(function (msg) { els.problems.appendChild(el('li', null, msg)); });

    els.btnAdd.disabled = els.rows.children.length >= AZ.MAX_ROWS;

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
      if (AZ.HONORIFICS.indexOf(els.honorific.value) < 0) els.honorific.value = AZ.HONORIFICS[0];
      SWITCH_KEYS.forEach(function (k) {
        if (AZ.SWITCHES.indexOf(els[k].value) < 0) els[k].value = AZ.SWITCHES[0];
      });
      var rows = Array.isArray(data.rows) ? data.rows.slice(0, AZ.MAX_ROWS) : [];
      rows.forEach(function (r) { addRow(r); });
      if (rows.length === 0) addRow({});
      return true;
    } catch (e) { return false; }
  }

  function setDefaults() {
    TOP_KEYS.forEach(function (k) { els[k].value = ''; });
    els.issueDate.value = todayIso();
    els.honorific.value = AZ.HONORIFICS[0];
    SWITCH_KEYS.forEach(function (k) { els[k].value = AZ.SWITCHES[0]; });
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
