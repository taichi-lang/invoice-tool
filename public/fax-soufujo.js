/*
 * FAX送付状(/fax-soufujo)の画面制御。
 * 紙面の組み立ては fax-soufujo-core.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。FAXを送る機能は無い。
 */
'use strict';

(function () {

  var FX = window.FaxSoufujo;
  var STORAGE_KEY = 'fax-soufujo-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    date: $('fxDate'),
    toCompany: $('fxToCompany'),
    toName: $('fxToName'),
    toFax: $('fxToFax'),
    fromCompany: $('fxFromCompany'),
    fromName: $('fxFromName'),
    fromTel: $('fxFromTel'),
    fromFax: $('fxFromFax'),
    subject: $('fxSubject'),
    pages: $('fxPages'),
    request: $('fxRequest'),
    message: $('fxMessage'),
    problems: $('fxProblems'),
    sheet: $('fxSheet'),
    btnPrint: $('fxPrint'),
    btnClear: $('fxClear')
  };

  /* 下書きの保存と読み戻しで同じ並びを使う */
  var KEYS = ['date', 'toCompany', 'toName', 'toFax', 'fromCompany', 'fromName', 'fromTel', 'fromFax',
    'subject', 'pages', 'request', 'message'];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function input() {
    var data = {};
    KEYS.forEach(function (k) { data[k] = els[k].value; });
    return data;
  }

  /* ------------------------------------------------------------- 紙面 */

  function row(label, value, valueClass) {
    var r = el('div', 'fx-row');
    r.appendChild(el('p', 'fx-row-label', label));
    r.appendChild(el('p', valueClass, value));
    return r;
  }

  function sheetNode(b) {
    var paper = el('div', 'paper fx-paper');

    paper.appendChild(el('p', 'fx-title', 'FAX送付状'));
    paper.appendChild(el('p', 'fx-date', b.dateText || '　　　　年　　月　　日'));

    var parties = el('div', 'fx-parties');

    var to = el('div', 'fx-party');
    to.appendChild(el('p', 'fx-cap', '送付先'));
    var toName = el('div', 'fx-to-name');
    b.toLines.forEach(function (line) { toName.appendChild(el('p', 'fx-to-line', line)); });
    to.appendChild(toName);
    to.appendChild(el('p', 'fx-to-fax', 'FAX　' + b.toFax));
    parties.appendChild(to);

    var from = el('div', 'fx-party');
    from.appendChild(el('p', 'fx-cap', '発信元'));
    var fromName = el('div', 'fx-from-name');
    if (b.fromCompany) fromName.appendChild(el('p', 'fx-from-company', b.fromCompany));
    if (b.fromName) fromName.appendChild(el('p', 'fx-from-person', b.fromName));
    from.appendChild(fromName);
    from.appendChild(el('p', 'fx-from-tel', 'TEL　' + b.fromTel));
    from.appendChild(el('p', 'fx-from-fax', 'FAX　' + b.fromFax));
    parties.appendChild(from);

    paper.appendChild(parties);

    var meta = el('div', 'fx-meta');
    meta.appendChild(row('件名', b.subject, 'fx-subject'));
    meta.appendChild(row('送付枚数', (b.pagesText || '　　　枚') + '(この送付状を含む)', 'fx-pages'));
    paper.appendChild(meta);

    var reqs = el('div', 'fx-requests');
    FX.REQUESTS.forEach(function (name) {
      var item = el('p', 'fx-req');
      item.appendChild(el('span', 'fx-box', b.request === name ? 'レ' : ''));
      item.appendChild(el('span', 'fx-req-label', name));
      reqs.appendChild(item);
    });
    paper.appendChild(reqs);

    paper.appendChild(el('p', 'fx-message-cap', '通信欄'));
    var message = el('div', 'fx-message');
    b.messageLines.forEach(function (line) { message.appendChild(el('p', 'fx-message-line', line || '　')); });
    paper.appendChild(message);

    paper.appendChild(el('p', 'fx-foot',
      '枚数が足りないとき、または宛先にお心当たりがないときは、お手数ですが発信元までご連絡ください。'));

    return paper;
  }

  function render() {
    var data = input();
    var built = FX.buildSheet(data);

    els.sheet.textContent = '';
    els.sheet.appendChild(sheetNode(built));

    var problems = FX.findProblems(data, built);
    els.problems.textContent = '';
    els.problems.hidden = problems.length === 0;
    problems.forEach(function (msg) { els.problems.appendChild(el('li', null, msg)); });

    save();
  }

  /* ----------------------------------------------------------------- 下書き */

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(input())); } catch (e) { /* 保存できなくても動き続ける */ }
  }

  function validRequest(v) { return v === FX.NONE || FX.REQUESTS.indexOf(v) >= 0; }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      KEYS.forEach(function (k) { els[k].value = data[k] == null ? '' : String(data[k]); });
      if (!validRequest(els.request.value)) els.request.value = FX.NONE;
      return true;
    } catch (e) { return false; }
  }

  function setDefaults() {
    KEYS.forEach(function (k) { els[k].value = ''; });
    els.request.value = FX.NONE;
  }

  function clearAll() {
    if (!window.confirm('入力した内容をすべて消します。よろしいですか。')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    setDefaults();
    render();
  }

  /* ------------------------------------------------------------------- 起動 */

  if (!load()) setDefaults();

  KEYS.forEach(function (k) {
    els[k].addEventListener('input', render);
    els[k].addEventListener('change', render);
  });
  els.btnPrint.addEventListener('click', function () { window.print(); });
  els.btnClear.addEventListener('click', clearAll);

  render();

})();
