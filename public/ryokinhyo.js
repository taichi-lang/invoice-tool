/*
 * 料金表(/ryokinhyo)の画面制御。
 * 紙面の組み立ては ryokinhyo-core.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var RK = window.Ryokinhyo;
  var STORAGE_KEY = 'ryokinhyo-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  /* 下書きの保存と読み戻しで同じ並びを使う。入力欄の id は「rk」+ 先頭を大文字にした名前 */
  var KEYS = ['titlePreset', 'titleCustom', 'taxNote'];
  for (var n = 1; n <= RK.ROWS; n++) KEYS.push('name' + n, 'note' + n, 'price' + n);
  KEYS.push('message', 'shop', 'contact');

  var els = {
    problems: $('rkProblems'),
    sheet: $('rkSheet'),
    btnPrint: $('rkPrint'),
    btnClear: $('rkClear')
  };
  KEYS.forEach(function (k) { els[k] = $('rk' + k.charAt(0).toUpperCase() + k.slice(1)); });

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

  function sheetNode(b) {
    var paper = el('div', 'paper rk-paper');

    paper.appendChild(el('p', 'rk-title', b.title));

    if (b.rows.length > 0) {
      var list = el('div', 'rk-list');
      b.rows.forEach(function (row) {
        var line = el('div', 'rk-row');
        var left = el('p', 'rk-left');
        left.appendChild(el('span', 'rk-name', row.name));
        if (row.note) left.appendChild(el('span', 'rk-note', row.note));
        line.appendChild(left);
        line.appendChild(el('span', 'rk-dots'));
        line.appendChild(el('p', 'rk-price', row.priceText));
        list.appendChild(line);
      });
      paper.appendChild(list);
    }

    if (b.taxNote) paper.appendChild(el('p', 'rk-tax', b.taxNote));
    if (b.message) paper.appendChild(el('p', 'rk-message', b.message));

    var sign = el('div', 'rk-sign');
    sign.appendChild(el('p', 'rk-shop', b.shop));
    if (b.contact) sign.appendChild(el('p', 'rk-contact', b.contact));
    paper.appendChild(sign);

    return paper;
  }

  function render() {
    var data = input();
    var built = RK.buildSheet(data);

    els.sheet.textContent = '';
    els.sheet.appendChild(sheetNode(built));

    var problems = RK.findProblems(data, built);
    els.problems.textContent = '';
    els.problems.hidden = problems.length === 0;
    problems.forEach(function (msg) { els.problems.appendChild(el('li', null, msg)); });

    /* 見出しを自分で書く欄は、「自分で書く」を選んだときだけ使える */
    els.titleCustom.disabled = els.titlePreset.value !== RK.CUSTOM;

    save();
  }

  /* ----------------------------------------------------------------- 下書き */

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(input())); } catch (e) { /* 保存できなくても動き続ける */ }
  }

  function validPreset(v) { return v === RK.CUSTOM || RK.TITLES.indexOf(v) >= 0; }
  function validTax(v) { return Object.prototype.hasOwnProperty.call(RK.TAX_NOTES, v); }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      KEYS.forEach(function (k) { els[k].value = data[k] == null ? '' : String(data[k]); });
      if (!validPreset(els.titlePreset.value)) els.titlePreset.value = RK.TITLES[0];
      if (!validTax(els.taxNote.value)) els.taxNote.value = 'incl';
      return true;
    } catch (e) { return false; }
  }

  function setDefaults() {
    KEYS.forEach(function (k) { els[k].value = ''; });
    els.titlePreset.value = RK.TITLES[0];
    els.taxNote.value = 'incl';
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
