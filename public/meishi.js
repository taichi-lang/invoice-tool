/*
 * 名刺(/meishi)の画面制御。
 * 名刺1枚の中身は meishi-core.js の純粋関数が組み立て、ここは入力の取得と、A4 に10枚並べる描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var MC = window.Meishi;
  var STORAGE_KEY = 'meishi-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  /* 下書きの保存と読み戻しで同じ並びを使う。入力欄の id は「mc」+ 先頭を大文字にした名前 */
  var KEYS = MC.FIELDS.concat(['guides']);

  var els = {
    problems: $('mcProblems'),
    sheet: $('mcSheet'),
    btnPrint: $('mcPrint'),
    btnClear: $('mcClear')
  };
  KEYS.forEach(function (k) { els[k] = $('mc' + k.charAt(0).toUpperCase() + k.slice(1)); });

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
    var card = el('div', 'mc-card');

    var top = el('div', 'mc-top');
    if (c.company) top.appendChild(el('p', 'mc-company', c.company));
    if (c.catchcopy) top.appendChild(el('p', 'mc-catch', c.catchcopy));
    card.appendChild(top);

    var mid = el('div', 'mc-mid');
    if (c.role) mid.appendChild(el('p', 'mc-role', c.role));
    mid.appendChild(el('p', 'mc-name', c.name));
    if (c.kana) mid.appendChild(el('p', 'mc-kana', c.kana));
    card.appendChild(mid);

    var bottom = el('div', 'mc-bottom');
    c.address.forEach(function (line) { bottom.appendChild(el('p', 'mc-addr', line)); });
    c.contact.forEach(function (row) {
      var p = el('p', 'mc-contact');
      p.appendChild(el('span', 'mc-label', row.label));
      p.appendChild(el('span', 'mc-value', row.text));
      bottom.appendChild(p);
    });
    card.appendChild(bottom);

    return card;
  }

  function sheetNode(c) {
    var paper = el('div', 'mc-paper' + (c.guides === 'on' ? ' mc-guides' : ''));
    for (var i = 0; i < MC.COUNT; i++) paper.appendChild(cardNode(c));
    return paper;
  }

  function render() {
    var data = input();
    var card = MC.buildCard(data);

    els.sheet.textContent = '';
    els.sheet.appendChild(sheetNode(card));

    var problems = MC.findProblems(data);
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
      KEYS.forEach(function (k) { els[k].value = data[k] == null ? '' : String(data[k]); });
      if (MC.GUIDES.indexOf(els.guides.value) < 0) els.guides.value = 'on';
      return true;
    } catch (e) { return false; }
  }

  function setDefaults() {
    KEYS.forEach(function (k) { els[k].value = ''; });
    els.guides.value = 'on';
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
