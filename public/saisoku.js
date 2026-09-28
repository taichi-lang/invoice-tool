/*
 * 催促状ジェネレーター(/saisoku)の画面制御。
 * 文面の組み立ては saisoku-core.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 * 紙面は送付状(/soufujo)と同じ .sf- の部品で組む。用紙の余白と改ページの扱いを二重に持たないため。
 */
'use strict';

(function () {

  var SS = window.Saisoku;
  var STORAGE_KEY = 'saisoku-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    stage: $('ssStage'),
    date: $('ssDate'),
    replyBy: $('ssReplyBy'),
    toName: $('ssToName'),
    toHonorific: $('ssToHonorific'),
    toDept: $('ssToDept'),
    invoiceNo: $('ssInvoiceNo'),
    invoiceDate: $('ssInvoiceDate'),
    subject: $('ssSubject'),
    amount: $('ssAmount'),
    dueDate: $('ssDueDate'),
    bank: $('ssBank'),
    fromName: $('ssFromName'),
    fromAddress: $('ssFromAddress'),
    elapsed: $('ssElapsed'),
    problems: $('ssProblems'),
    sheet: $('ssSheet'),
    btnPrint: $('ssPrint'),
    btnClear: $('ssClear')
  };

  var FIELDS = [
    'stage', 'date', 'replyBy', 'toName', 'toHonorific', 'toDept', 'invoiceNo', 'invoiceDate',
    'subject', 'amount', 'dueDate', 'bank', 'fromName', 'fromAddress'
  ];

  function todayIso() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function fillStageOptions() {
    Object.keys(SS.STAGES).forEach(function (key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = SS.STAGES[key].label;
      els.stage.appendChild(opt);
    });
  }

  function input() {
    var data = {};
    FIELDS.forEach(function (key) { data[key] = els[key].value; });
    return data;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function render() {
    var data = input();
    var doc = SS.buildDocument(data);

    els.elapsed.textContent = doc.elapsed !== null && doc.elapsed > 0
      ? '支払期日から、発行日までに ' + doc.elapsed + '日が経っています。'
      : '';

    var sheet = els.sheet;
    sheet.textContent = '';

    sheet.appendChild(el('p', 'sf-date', doc.dateText));

    var head = el('div', 'sf-head');
    var to = el('div', 'sf-to');
    to.appendChild(el('p', 'sf-to-name', doc.to.name));
    if (doc.to.dept) to.appendChild(el('p', 'sf-to-dept', doc.to.dept));
    head.appendChild(to);
    var from = el('div', 'sf-from');
    from.appendChild(el('p', 'sf-from-name', doc.from.name));
    if (doc.from.address) from.appendChild(el('p', 'sf-from-addr', doc.from.address));
    head.appendChild(from);
    sheet.appendChild(head);

    sheet.appendChild(el('h2', 'sf-title', doc.title));
    sheet.appendChild(el('p', 'sf-opening', doc.opening));
    sheet.appendChild(el('p', 'sf-para', doc.lead));
    doc.body.forEach(function (line) { sheet.appendChild(el('p', 'sf-para', line)); });
    sheet.appendChild(el('p', 'sf-closing', doc.closing));

    if (doc.hasRecord) {
      sheet.appendChild(el('p', 'sf-kiji', '記'));
      var ul = el('ul', 'sf-items');
      doc.record.forEach(function (row) {
        ul.appendChild(el('li', null, row.label + '　' + row.value));
      });
      sheet.appendChild(ul);
      sheet.appendChild(el('p', 'sf-ijo', '以上'));
    }

    var problems = SS.findProblems(data, doc);
    els.problems.textContent = '';
    els.problems.hidden = problems.length === 0;
    problems.forEach(function (msg) { els.problems.appendChild(el('li', null, msg)); });

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
      FIELDS.forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(data, key)) els[key].value = data[key] == null ? '' : String(data[key]);
      });
      return true;
    } catch (e) { return false; }
  }

  function setDefaults() {
    els.stage.value = 'first';
    els.toHonorific.value = '御中';
    els.date.value = todayIso();
    /* 回答期限の初期値は発行日の7日後。1回目から2回目までの間隔と同じにしてある */
    els.replyBy.value = SS.addDays(els.date.value, 7);
  }

  function clearAll() {
    if (!window.confirm('入力した内容をすべて消します。よろしいですか。')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    FIELDS.forEach(function (key) { els[key].value = ''; });
    setDefaults();
    render();
  }

  /* ------------------------------------------------------------------- 起動 */

  fillStageOptions();
  if (!load()) setDefaults();

  FIELDS.forEach(function (key) {
    els[key].addEventListener('input', render);
    els[key].addEventListener('change', render);
  });
  els.btnPrint.addEventListener('click', function () { window.print(); });
  els.btnClear.addEventListener('click', clearAll);

  render();

})();
