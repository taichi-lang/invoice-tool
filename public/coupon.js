/*
 * クーポン券(/coupon)の画面制御。
 * 券の中身は coupon-core.js の純粋関数が組み立て、ここは入力の取得と、A4 に10枚ずつ並べる描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var CP = window.Coupon;
  var STORAGE_KEY = 'coupon-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  /* 下書きの保存と読み戻しで同じ並びを使う。入力欄の id は「cp」+ 先頭を大文字にした名前 */
  var KEYS = CP.FIELDS.concat(CP.OPTIONS);
  var DEFAULTS = { expiry: 'off', numbering: 'off', start: '1', sheets: '1', guides: 'on' };
  var SELECTS = { expiry: CP.EXPIRY, numbering: CP.ONOFF, guides: CP.ONOFF };

  var els = {
    problems: $('cpProblems'),
    sheet: $('cpSheet'),
    numberRow: $('cpNumberRow'),
    dateRow: $('cpDateRow'),
    btnPrint: $('cpPrint'),
    btnClear: $('cpClear')
  };
  KEYS.forEach(function (k) { els[k] = $('cp' + k.charAt(0).toUpperCase() + k.slice(1)); });

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

  function cardNode(c) {
    var card = el('div', 'cp-card');
    if (c.blank) return card;

    var head = el('div', 'cp-head');
    head.appendChild(el('p', 'cp-title', c.title));
    if (c.no) head.appendChild(el('p', 'cp-no', c.no));
    card.appendChild(head);

    var middle = el('div', 'cp-middle');
    if (c.offer) middle.appendChild(el('p', 'cp-offer', c.offer));
    if (c.terms) middle.appendChild(el('p', 'cp-terms', c.terms));
    if (c.expiry) middle.appendChild(el('p', 'cp-expiry', c.expiry));
    card.appendChild(middle);

    if (c.shop || c.info.length) {
      var bottom = el('div', 'cp-bottom');
      if (c.shop) bottom.appendChild(el('p', 'cp-shop', c.shop));
      c.info.forEach(function (line) { bottom.appendChild(el('p', 'cp-info', line)); });
      card.appendChild(bottom);
    }

    return card;
  }

  function render() {
    var data = input();
    var paper = CP.build(data);

    els.numberRow.hidden = !paper.numbering;
    els.dateRow.hidden = data.expiry !== 'date';

    els.sheet.textContent = '';
    for (var s = 0; s < paper.sheets; s++) {
      var node = el('div', 'cp-paper' + (paper.guides === 'on' ? ' cp-guides' : ''));
      for (var i = 0; i < CP.PER_SHEET; i++) node.appendChild(cardNode(paper.cards[s * CP.PER_SHEET + i]));
      els.sheet.appendChild(node);
    }

    var problems = CP.findProblems(data);
    els.problems.textContent = '';
    els.problems.hidden = problems.length === 0;
    problems.forEach(function (msg) { els.problems.appendChild(el('li', null, msg)); });

    save();
  }

  /* ----------------------------------------------------------------- 下書き */

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(input())); } catch (e) { /* 保存できなくても動き続ける */ }
  }

  function setDefaults() {
    KEYS.forEach(function (k) { els[k].value = k in DEFAULTS ? DEFAULTS[k] : ''; });
  }

  /* 選択肢の値が知らないものなら既定に戻す(古い下書き・壊れた下書きで画面と紙面が食い違わない) */
  function fixOptions() {
    Object.keys(SELECTS).forEach(function (k) {
      if (SELECTS[k].indexOf(els[k].value) < 0) els[k].value = DEFAULTS[k];
    });
    var n = Number(els.sheets.value);
    if (!(n >= 1 && n <= CP.MAX_SHEETS)) els.sheets.value = DEFAULTS.sheets;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      KEYS.forEach(function (k) { els[k].value = data[k] == null ? (DEFAULTS[k] || '') : String(data[k]); });
      fixOptions();
      return true;
    } catch (e) { return false; }
  }

  function clearAll() {
    if (!window.confirm('入力した内容をすべて消します。よろしいですか。')) return;
    setDefaults();
    render();
    /* render が空の下書きを書き直すので、消すのはそのあと。キーごと残さない */
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
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
