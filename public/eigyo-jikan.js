/*
 * 営業時間の張り紙(/eigyo-jikan)の画面制御。
 * 紙面の組み立ては eigyo-jikan-core.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var EJ = window.EigyoJikan;
  var STORAGE_KEY = 'eigyo-jikan-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  /* 下書きの保存と読み戻しで同じ並びを使う。入力欄の id は「ej」+ 先頭を大文字にした名前 */
  var KEYS = ['titlePreset', 'titleCustom', 'fromDate'];
  for (var n = 1; n <= EJ.ROWS; n++) KEYS.push('label' + n, 'open' + n, 'close' + n);
  KEYS.push('holiday', 'message', 'shop', 'contact');

  var els = {
    problems: $('ejProblems'),
    sheet: $('ejSheet'),
    btnPrint: $('ejPrint'),
    btnClear: $('ejClear')
  };
  KEYS.forEach(function (k) { els[k] = $('ej' + k.charAt(0).toUpperCase() + k.slice(1)); });

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
    var paper = el('div', 'paper ej-paper');

    paper.appendChild(el('p', 'ej-title', b.title));

    if (b.fromText) paper.appendChild(el('p', 'ej-from', b.fromText + 'から'));

    if (b.rows.length > 0) {
      var hours = el('div', 'ej-hours');
      hours.appendChild(el('p', 'ej-cap', '営業時間'));
      b.rows.forEach(function (row) {
        if (row.label) hours.appendChild(el('p', 'ej-label', row.label));
        hours.appendChild(el('p', 'ej-time', EJ.rowTimeText(row)));
      });
      paper.appendChild(hours);
    }

    if (b.holiday) {
      var holiday = el('div', 'ej-holiday');
      holiday.appendChild(el('p', 'ej-cap', '定休日'));
      holiday.appendChild(el('p', 'ej-holiday-text', b.holiday));
      paper.appendChild(holiday);
    }

    if (b.message) paper.appendChild(el('p', 'ej-message', b.message));
    if (b.isChange) {
      paper.appendChild(el('p', 'ej-closing', 'ご不便をおかけいたしますが、何とぞよろしくお願い申し上げます。'));
    }

    var sign = el('div', 'ej-sign');
    sign.appendChild(el('p', 'ej-shop', b.shop));
    if (b.contact) sign.appendChild(el('p', 'ej-contact', b.contact));
    paper.appendChild(sign);

    return paper;
  }

  function render() {
    var data = input();
    var built = EJ.buildSheet(data);

    els.sheet.textContent = '';
    els.sheet.appendChild(sheetNode(built));

    var problems = EJ.findProblems(data, built);
    els.problems.textContent = '';
    els.problems.hidden = problems.length === 0;
    problems.forEach(function (msg) { els.problems.appendChild(el('li', null, msg)); });

    /* 見出しを自分で書く欄は、「自分で書く」を選んだときだけ使える */
    els.titleCustom.disabled = els.titlePreset.value !== EJ.CUSTOM;

    save();
  }

  /* ----------------------------------------------------------------- 下書き */

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(input())); } catch (e) { /* 保存できなくても動き続ける */ }
  }

  function validPreset(v) { return v === EJ.CUSTOM || EJ.TITLES.indexOf(v) >= 0; }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      KEYS.forEach(function (k) { els[k].value = data[k] == null ? '' : String(data[k]); });
      if (!validPreset(els.titlePreset.value)) els.titlePreset.value = EJ.TITLES[0];
      return true;
    } catch (e) { return false; }
  }

  function setDefaults() {
    KEYS.forEach(function (k) { els[k].value = ''; });
    els.titlePreset.value = EJ.TITLES[0];
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
