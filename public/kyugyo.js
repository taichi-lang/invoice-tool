/*
 * 休業のお知らせ(/kyugyo)の画面制御。
 * 紙面の組み立ては kyugyo-core.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var KY = window.Kyugyo;
  var STORAGE_KEY = 'kyugyo-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    titlePreset: $('kyTitlePreset'),
    titleCustom: $('kyTitleCustom'),
    startDate: $('kyStartDate'),
    endDate: $('kyEndDate'),
    reopenDate: $('kyReopenDate'),
    message: $('kyMessage'),
    shop: $('kyShop'),
    contact: $('kyContact'),
    problems: $('kyProblems'),
    sheet: $('kySheet'),
    btnPrint: $('kyPrint'),
    btnClear: $('kyClear')
  };

  /* 下書きの保存と読み戻しで同じ並びを使う */
  var KEYS = ['titlePreset', 'titleCustom', 'startDate', 'endDate', 'reopenDate', 'message', 'shop', 'contact'];

  var BLANK_DATE = '　　　年　　月　　日(　)';

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
    var paper = el('div', 'paper ky-paper');

    paper.appendChild(el('p', 'ky-title', b.title));

    paper.appendChild(el('p', 'ky-lead',
      b.single ? '誠に勝手ながら、下記の日を休業とさせていただきます。'
        : '誠に勝手ながら、下記の期間を休業とさせていただきます。'));

    var period = el('div', 'ky-period');
    period.appendChild(el('p', 'ky-period-cap', b.single ? '休業日' : '休業期間'));
    if (b.single) {
      period.appendChild(el('p', 'ky-start', b.startText));
    } else {
      period.appendChild(el('p', 'ky-start', (b.startText || BLANK_DATE) + 'から'));
      period.appendChild(el('p', 'ky-end', (b.endText || BLANK_DATE) + 'まで'));
      if (b.days !== null) period.appendChild(el('p', 'ky-days', '(' + b.days + '日間)'));
    }
    paper.appendChild(period);

    if (b.reopenText) {
      paper.appendChild(el('p', 'ky-reopen', b.reopenText + 'から通常どおり営業いたします。'));
    }
    if (b.message) paper.appendChild(el('p', 'ky-message', b.message));
    paper.appendChild(el('p', 'ky-closing', 'ご不便をおかけいたしますが、何とぞよろしくお願い申し上げます。'));

    var sign = el('div', 'ky-sign');
    sign.appendChild(el('p', 'ky-shop', b.shop));
    if (b.contact) sign.appendChild(el('p', 'ky-contact', b.contact));
    paper.appendChild(sign);

    return paper;
  }

  function render() {
    var data = input();
    var built = KY.buildSheet(data);

    els.sheet.textContent = '';
    els.sheet.appendChild(sheetNode(built));

    var problems = KY.findProblems(data, built);
    els.problems.textContent = '';
    els.problems.hidden = problems.length === 0;
    problems.forEach(function (msg) { els.problems.appendChild(el('li', null, msg)); });

    /* 見出しを自分で書く欄は、「自分で書く」を選んだときだけ使える */
    els.titleCustom.disabled = els.titlePreset.value !== KY.CUSTOM;

    save();
  }

  /* ----------------------------------------------------------------- 下書き */

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(input())); } catch (e) { /* 保存できなくても動き続ける */ }
  }

  function validPreset(v) { return v === KY.CUSTOM || KY.TITLES.indexOf(v) >= 0; }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      KEYS.forEach(function (k) { els[k].value = data[k] == null ? '' : String(data[k]); });
      if (!validPreset(els.titlePreset.value)) els.titlePreset.value = KY.TITLES[0];
      return true;
    } catch (e) { return false; }
  }

  function setDefaults() {
    KEYS.forEach(function (k) { els[k].value = ''; });
    els.titlePreset.value = KY.TITLES[0];
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
