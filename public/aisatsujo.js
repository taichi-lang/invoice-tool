/*
 * 開業挨拶状(/aisatsujo)の画面制御。
 * 文面の組み立ては aisatsujo-core.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var A = window.Aisatsujo;
  var STORAGE_KEY = 'aisatsujo-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    kind: $('asKind'),
    openDate: $('asOpenDate'),
    shopName: $('asShopName'),
    business: $('asBusiness'),
    formerEmployer: $('asFormerEmployer'),
    letterDate: $('asLetterDate'),
    title: $('asTitle'),
    name: $('asName'),
    zip: $('asZip'),
    address: $('asAddress'),
    tel: $('asTel'),
    email: $('asEmail'),
    punctuation: $('asPunctuation'),
    kanji: $('asKanji'),
    formerRow: $('asFormerRow'),
    problems: $('asProblems'),
    sheet: $('asSheet'),
    btnPrint: $('asPrint'),
    btnClear: $('asClear')
  };

  var FIELDS = [
    'kind', 'openDate', 'shopName', 'business', 'formerEmployer', 'letterDate',
    'title', 'name', 'zip', 'address', 'tel', 'email', 'punctuation', 'kanji'
  ];

  function today() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function defaults() {
    return { kind: 'new', letterDate: today(), title: '代表', punctuation: false, kanji: true };
  }

  function value(key) {
    var el = els[key];
    return el.type === 'checkbox' ? el.checked : el.value;
  }

  function setValue(key, v) {
    var el = els[key];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v == null ? '' : String(v);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function readInput() {
    var input = {};
    FIELDS.forEach(function (key) { input[key] = value(key); });
    return input;
  }

  function render() {
    var input = readInput();
    var letter = A.buildLetter(input);

    els.formerRow.hidden = letter.kind !== 'independent';

    var sheet = els.sheet;
    sheet.textContent = '';

    var text = el('div', 'as-text');
    letter.body.forEach(function (para) { text.appendChild(el('p', 'as-para', para)); });
    text.appendChild(el('p', 'as-closing', letter.closing));
    if (letter.date) text.appendChild(el('p', 'as-date', letter.date));

    var sign = el('div', 'as-sign');
    letter.address.forEach(function (line, i) {
      var head = i === 0 && letter.zip ? '〒' + letter.zip + '　' : '';
      sign.appendChild(el('p', 'as-addr', head + line));
    });
    if (letter.tel || letter.email) {
      var contact = el('p', 'as-contact', letter.tel);
      if (letter.email) contact.appendChild(el('span', 'as-email', (letter.tel ? '　' : '') + letter.email));
      sign.appendChild(contact);
    }
    if (letter.shopName) sign.appendChild(el('p', 'as-shop', letter.shopName));
    if (letter.representative) sign.appendChild(el('p', 'as-name', letter.representative));
    text.appendChild(sign);

    sheet.appendChild(text);

    var problems = A.findProblems(letter, input);
    if (!fit(text)) problems.push('文面がはがきに収まりません(事業の内容・住所などを短くしてください)');
    els.problems.hidden = problems.length === 0;
    els.problems.textContent = problems.length ? 'まだ空の欄・読めない欄があります: ' + problems.join('・') : '';

    save();
  }

  /*
   * 縦書きの文面は左へ伸びる。はがきの幅に収まらなければ、文字を5%ずつ小さくする(下限 75%)。
   * それでも収まらなければ false を返し、警告に回す。はみ出した列は紙の外に出て刷られない。
   */
  function fit(text) {
    for (var scale = 1; scale >= 0.75 - 1e-9; scale -= 0.05) {
      text.style.setProperty('--as-scale', scale.toFixed(2));
      if (text.scrollWidth <= text.clientWidth + 1) return true;
    }
    return false;
  }

  /* ----------------------------------------------------------------- 下書き */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(readInput()));
    } catch (e) { /* 保存できない設定でも、ツールとしては動き続ける */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      FIELDS.forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(data, key)) setValue(key, data[key]);
      });
      return true;
    } catch (e) { return false; }
  }

  function applyDefaults() {
    var d = defaults();
    FIELDS.forEach(function (key) {
      setValue(key, Object.prototype.hasOwnProperty.call(d, key) ? d[key] : '');
    });
  }

  function clearAll() {
    if (!window.confirm('入力した内容をすべて消します。よろしいですか。')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    applyDefaults();
    render();
  }

  /* ------------------------------------------------------------------- 起動 */

  if (!load()) applyDefaults();

  FIELDS.forEach(function (key) {
    els[key].addEventListener('input', render);
    els[key].addEventListener('change', render);
  });
  els.btnPrint.addEventListener('click', function () { window.print(); });
  els.btnClear.addEventListener('click', clearAll);

  render();

})();
