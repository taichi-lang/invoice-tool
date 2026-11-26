/*
 * ポイントカード(/point-card)の画面制御。
 * カード1枚の中身は point-card-core.js の純粋関数が組み立て、ここは入力の取得と、A4 に10枚並べる描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var PC = window.PointCard;
  var STORAGE_KEY = 'point-card-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  /* 下書きの保存と読み戻しで同じ並びを使う。入力欄の id は「pc」+ 先頭を大文字にした名前 */
  var KEYS = PC.FIELDS.concat(PC.OPTIONS);
  var DEFAULTS = { stamps: '10', name: 'on', expiry: 'off', guides: 'on' };

  var els = {
    problems: $('pcProblems'),
    sheet: $('pcSheet'),
    btnPrint: $('pcPrint'),
    btnClear: $('pcClear')
  };
  KEYS.forEach(function (k) { els[k] = $('pc' + k.charAt(0).toUpperCase() + k.slice(1)); });

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
    var card = el('div', 'pc-card');

    var head = el('div', 'pc-head');
    head.appendChild(el('p', 'pc-title', c.title));
    if (c.shop) head.appendChild(el('p', 'pc-shop', c.shop));
    card.appendChild(head);

    if (c.name || c.expiry) {
      var fill = el('p', 'pc-fill');
      if (c.name) {
        var n = el('span', 'pc-name', 'お名前 ');
        n.appendChild(el('span', 'pc-line'));
        fill.appendChild(n);
      }
      if (c.expiry) fill.appendChild(el('span', 'pc-expiry', '有効期限　　年　　月　　日'));
      card.appendChild(fill);
    }

    var grid = el('div', 'pc-grid');
    grid.style.gridTemplateColumns = 'repeat(' + c.grid.cols + ', ' + c.grid.cell + 'mm)';
    grid.style.gridAutoRows = c.grid.cell + 'mm';
    c.cells.forEach(function (cell) {
      var box = el('div', cell.goal ? 'pc-cell pc-goal' : 'pc-cell');
      box.appendChild(el('span', 'pc-no', String(cell.no)));
      grid.appendChild(box);
    });
    card.appendChild(grid);

    if (c.reward) card.appendChild(el('p', 'pc-reward', c.reward));

    if (c.info.length) {
      var bottom = el('div', 'pc-bottom');
      c.info.forEach(function (line) { bottom.appendChild(el('p', 'pc-info', line)); });
      card.appendChild(bottom);
    }

    return card;
  }

  function sheetNode(c) {
    var paper = el('div', 'pc-paper' + (c.guides === 'on' ? ' pc-guides' : ''));
    for (var i = 0; i < PC.COUNT; i++) paper.appendChild(cardNode(c));
    return paper;
  }

  function render() {
    var data = input();
    var card = PC.buildCard(data);

    els.sheet.textContent = '';
    els.sheet.appendChild(sheetNode(card));

    var problems = PC.findProblems(data);
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
    if (PC.STAMPS.map(String).indexOf(els.stamps.value) < 0) els.stamps.value = DEFAULTS.stamps;
    ['name', 'expiry', 'guides'].forEach(function (k) {
      if (PC.ONOFF.indexOf(els[k].value) < 0) els[k].value = DEFAULTS[k];
    });
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
