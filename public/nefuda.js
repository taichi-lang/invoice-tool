/*
 * 値札(/nefuda)の画面制御。
 * 値札の中身は nefuda-core.js の純粋関数が組み立て、ここは入力の取得と、A4 に18枠並べる描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var NF = window.Nefuda;
  var STORAGE_KEY = 'nefuda-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  /* 入力欄の id は「nf」+ 先頭を大文字にした名前(nfName1, nfPrice1, nfCopies …) */
  var KEYS = ['copies', 'tax', 'guides'];
  for (var n = 1; n <= NF.ROWS; n++) KEYS.push('name' + n, 'note' + n, 'price' + n);
  var DEFAULTS = { copies: '1', tax: 'incl', guides: 'on' };

  var els = {
    problems: $('nfProblems'),
    sheet: $('nfSheet'),
    btnPrint: $('nfPrint'),
    btnClear: $('nfClear')
  };
  KEYS.forEach(function (k) { els[k] = $('nf' + k.charAt(0).toUpperCase() + k.slice(1)); });

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

  function tagNode(t) {
    var tag = el('div', 'nf-tag');
    var top = el('div', 'nf-top');
    top.appendChild(el('p', 'nf-name', t.name));
    if (t.note) top.appendChild(el('p', 'nf-note', t.note));
    tag.appendChild(top);
    var price = el('p', 'nf-price');
    price.appendChild(el('span', 'nf-amount', t.priceText));
    if (t.tax) price.appendChild(el('span', 'nf-tax', t.tax));
    tag.appendChild(price);
    return tag;
  }

  function render() {
    var data = input();
    var built = NF.buildSheet(data);

    var paper = el('div', 'nf-paper' + (built.guides === 'on' ? ' nf-guides' : ''));
    for (var i = 0; i < NF.SLOTS; i++) {
      paper.appendChild(i < built.tags.length ? tagNode(built.tags[i]) : el('div', 'nf-empty'));
    }
    els.sheet.textContent = '';
    els.sheet.appendChild(paper);

    var problems = NF.findProblems(data, built);
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
    KEYS.forEach(function (k) { els[k].value = DEFAULTS[k] || ''; });
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      KEYS.forEach(function (k) { els[k].value = data[k] == null ? (DEFAULTS[k] || '') : String(data[k]); });
      if (NF.COPIES.indexOf(els.copies.value) < 0) els.copies.value = DEFAULTS.copies;
      if (!Object.prototype.hasOwnProperty.call(NF.TAX, els.tax.value)) els.tax.value = DEFAULTS.tax;
      if (NF.GUIDES.indexOf(els.guides.value) < 0) els.guides.value = DEFAULTS.guides;
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
