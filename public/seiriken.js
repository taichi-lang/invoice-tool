/*
 * 整理券(/seiriken)の画面制御。
 * 紙面の中身は seiriken-core.js の純粋関数が組み立て、ここは入力の取得と、A4 に18枠ずつ並べる描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var SR = window.Seiriken;
  var STORAGE_KEY = 'seiriken-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  /* 入力欄の id は「sr」+ 先頭を大文字にした名前(srTitle, srStart …) */
  var KEYS = ['title', 'shop', 'event', 'note', 'start', 'count', 'pad', 'guides'];
  var DEFAULTS = { title: '整理券', start: '1', count: '18', pad: 'none', guides: 'on' };

  var els = {
    problems: $('srProblems'),
    sheet: $('srSheet'),
    btnPrint: $('srPrint'),
    btnClear: $('srClear')
  };
  KEYS.forEach(function (k) { els[k] = $('sr' + k.charAt(0).toUpperCase() + k.slice(1)); });

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

  function ticketNode(t) {
    var tk = el('div', 'sr-ticket');
    var head = el('div', 'sr-head');
    head.appendChild(el('p', 'sr-title', t.title));
    if (t.shop) head.appendChild(el('p', 'sr-shop', t.shop));
    tk.appendChild(head);
    var num = el('p', 'sr-number');
    num.appendChild(el('span', 'sr-no', 'No.'));
    num.appendChild(el('span', 'sr-digits', t.number));
    tk.appendChild(num);
    var foot = el('div', 'sr-foot');
    if (t.event) foot.appendChild(el('p', 'sr-event', t.event));
    if (t.note) foot.appendChild(el('p', 'sr-note', t.note));
    tk.appendChild(foot);
    return tk;
  }

  function render() {
    var data = input();
    var built = SR.buildSheet(data);

    els.sheet.textContent = '';
    var pages = built.pages.length ? built.pages : [[]];
    pages.forEach(function (page) {
      var paper = el('div', 'sr-paper' + (built.guides === 'on' ? ' sr-guides' : ''));
      for (var i = 0; i < SR.PER_PAGE; i++) {
        paper.appendChild(i < page.length ? ticketNode(page[i]) : el('div', 'sr-empty'));
      }
      els.sheet.appendChild(paper);
    });

    var problems = SR.findProblems(data, built);
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
      if (SR.PAD.indexOf(els.pad.value) < 0) els.pad.value = DEFAULTS.pad;
      if (SR.GUIDES.indexOf(els.guides.value) < 0) els.guides.value = DEFAULTS.guides;
      return true;
    } catch (e) { return false; }
  }

  function clearAll() {
    if (!window.confirm('入力した内容をすべて消します。よろしいですか。')) return;
    setDefaults();
    render();
    /* render が既定値の下書きを書き直すので、消すのはそのあと。キーごと残さない */
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
