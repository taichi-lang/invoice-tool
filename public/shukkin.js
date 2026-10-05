/*
 * 出金伝票(/shukkin)の画面制御。
 * 紙面の組み立ては shukkin-core.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var SK = window.Shukkin;
  var STORAGE_KEY = 'shukkin-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    startNo: $('skStartNo'),
    issuer: $('skIssuer'),
    rows: $('skRows'),
    btnAdd: $('skAdd'),
    total: $('skTotal'),
    problems: $('skProblems'),
    sheets: $('skSheets'),
    btnPrint: $('skPrint'),
    btnClear: $('skClear')
  };

  /* 1行(=伝票1枚)の入力欄。label は画面の見出し、type は input の種類 */
  var ROW_FIELDS = [
    { key: 'date', label: '日付', type: 'date' },
    { key: 'payee', label: '支払先', type: 'text', placeholder: '例: 東京メトロ' },
    { key: 'memo', label: '摘要(何に払ったか)', type: 'text', placeholder: '例: 新宿→渋谷 打合せ 往復' },
    { key: 'amount', label: '金額(円)', type: 'text', placeholder: '例: 400', inputmode: 'numeric' },
    { key: 'account', label: '勘定科目(任意)', type: 'text', placeholder: '任意' }
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
    if (els.rows.children.length >= SK.MAX_SLIPS) return;
    values = values || {};
    var card = el('fieldset', 'sk-row');
    ROW_FIELDS.forEach(function (f) {
      var label = el('label', null, f.label);
      var input = document.createElement('input');
      input.type = f.type;
      input.dataset.key = f.key;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.inputmode) input.setAttribute('inputmode', f.inputmode);
      input.value = values[f.key] == null ? '' : String(values[f.key]);
      input.addEventListener('input', render);
      input.addEventListener('change', render);
      label.appendChild(input);
      card.appendChild(label);
    });
    var remove = el('button', 'btn-sub sk-remove', 'この伝票を消す');
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
        row[inp.dataset.key] = inp.value;
      });
      rows.push(row);
    });
    return { startNo: els.startNo.value, issuer: els.issuer.value, rows: rows };
  }

  /* ------------------------------------------------------------- 紙面 */

  function slipNode(slip) {
    var box = el('div', 'sk-slip');

    var head = el('div', 'sk-head');
    head.appendChild(el('p', 'sk-title', '出金伝票'));
    var meta = el('div', 'sk-meta');
    meta.appendChild(el('p', 'sk-no', 'No. ' + slip.no));
    meta.appendChild(el('p', 'sk-date', slip.dateText || '　　年　　月　　日'));
    head.appendChild(meta);
    box.appendChild(head);

    var payee = el('p', 'sk-payee');
    payee.appendChild(el('span', 'sk-cap', '支払先'));
    payee.appendChild(el('span', 'sk-payee-name', slip.payee));
    box.appendChild(payee);

    var table = el('table', 'sk-table');
    var thead = el('thead');
    var hr = el('tr');
    ['勘定科目', '摘要', '金額'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    var tr = el('tr');
    tr.appendChild(el('td', 'sk-account', slip.account));
    tr.appendChild(el('td', 'sk-memo', slip.memo));
    tr.appendChild(el('td', 'sk-amount', slip.amountText));
    tbody.appendChild(tr);
    var sum = el('tr', 'sk-sum');
    sum.appendChild(el('td', null, ''));
    sum.appendChild(el('th', null, '合計'));
    sum.appendChild(el('td', 'sk-amount', slip.amountText ? '¥' + slip.amountText + '-' : ''));
    tbody.appendChild(sum);
    table.appendChild(tbody);
    box.appendChild(table);

    var foot = el('div', 'sk-foot');
    var who = el('p', 'sk-issuer');
    who.appendChild(el('span', 'sk-cap', '起票'));
    who.appendChild(el('span', null, slip.issuer));
    foot.appendChild(who);
    var stamps = el('div', 'sk-stamps');
    ['承認', '起票印'].forEach(function (s) {
      var cell = el('div', 'sk-stamp');
      cell.appendChild(el('span', null, s));
      stamps.appendChild(cell);
    });
    foot.appendChild(stamps);
    box.appendChild(foot);

    return box;
  }

  function render() {
    var data = input();
    var built = SK.buildSlips(data);

    els.sheets.textContent = '';
    var pages = built.pages.length ? built.pages : [[]];
    pages.forEach(function (page) {
      var paper = el('div', 'paper sk-paper');
      page.forEach(function (slip) { paper.appendChild(slipNode(slip)); });
      els.sheets.appendChild(paper);
    });

    els.total.textContent = built.slips.length
      ? built.slips.length + '枚・合計 ' + SK.formatNumber(built.total) + '円(紙面には1枚ずつの金額だけが出ます)'
      : '';

    var problems = SK.findProblems(data, built);
    els.problems.textContent = '';
    els.problems.hidden = problems.length === 0;
    problems.forEach(function (msg) { els.problems.appendChild(el('li', null, msg)); });

    els.btnAdd.disabled = els.rows.children.length >= SK.MAX_SLIPS;

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
      els.startNo.value = data.startNo == null ? '' : String(data.startNo);
      els.issuer.value = data.issuer == null ? '' : String(data.issuer);
      var rows = Array.isArray(data.rows) ? data.rows.slice(0, SK.MAX_SLIPS) : [];
      rows.forEach(function (r) { addRow(r); });
      if (rows.length === 0) addRow({ date: todayIso() });
      return true;
    } catch (e) { return false; }
  }

  function setDefaults() {
    els.startNo.value = '1';
    els.issuer.value = '';
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

  [els.startNo, els.issuer].forEach(function (node) {
    node.addEventListener('input', render);
    node.addEventListener('change', render);
  });
  els.btnAdd.addEventListener('click', function () {
    /* 足した伝票の日付は、直前の伝票と同じ日にしておく(同じ日の支払いをまとめて書くことが多いため) */
    var last = els.rows.lastElementChild;
    var prevDate = last ? last.querySelector('input[data-key="date"]').value : todayIso();
    addRow({ date: prevDate });
    render();
  });
  els.btnPrint.addEventListener('click', function () { window.print(); });
  els.btnClear.addEventListener('click', clearAll);

  render();

})();
