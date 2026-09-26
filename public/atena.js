/*
 * 封筒の宛名(/atena)の画面制御。
 * 宛名の組み立ては atena-core.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var A = window.Atena;
  var STORAGE_KEY = 'atena-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    zip: $('atZip'),
    address: $('atAddress'),
    company: $('atCompany'),
    dept: $('atDept'),
    person: $('atPerson'),
    enclosure: $('atEnclosure'),
    fromZip: $('atFromZip'),
    fromAddress: $('atFromAddress'),
    fromName: $('atFromName'),
    kanji: $('atKanji'),
    printZip: $('atPrintZip'),
    printBack: $('atPrintBack'),
    problems: $('atProblems'),
    front: $('atFront'),
    back: $('atBack'),
    btnPrint: $('atPrint'),
    btnClear: $('atClear')
  };

  var FIELDS = [
    'zip', 'address', 'company', 'dept', 'person', 'enclosure',
    'fromZip', 'fromAddress', 'fromName', 'kanji', 'printZip', 'printBack'
  ];

  var DEFAULTS = { enclosure: '請求書在中', kanji: true, printZip: true, printBack: true };

  function value(key) {
    var el = els[key];
    return el.type === 'checkbox' ? el.checked : el.value;
  }

  function setValue(key, v) {
    var el = els[key];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v == null ? '' : String(v);
  }

  function fillEnclosureOptions() {
    A.ENCLOSURES.forEach(function (text) {
      var opt = document.createElement('option');
      opt.value = text;
      opt.textContent = text || '(書かない)';
      els.enclosure.appendChild(opt);
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function render() {
    var env = A.buildEnvelope({
      zip: els.zip.value,
      address: els.address.value,
      company: els.company.value,
      dept: els.dept.value,
      person: els.person.value,
      enclosure: els.enclosure.value,
      fromZip: els.fromZip.value,
      fromAddress: els.fromAddress.value,
      fromName: els.fromName.value,
      kanji: els.kanji.checked
    });

    /* ---- 表面 */
    var front = els.front;
    front.textContent = '';
    if (els.printZip.checked && env.zip) front.appendChild(el('p', 'at-zip', '〒' + env.zip));

    var body = el('div', 'at-body');
    env.address.forEach(function (line, i) {
      body.appendChild(el('p', 'at-addr' + (i ? ' at-addr-sub' : ''), line));
    });
    front.appendChild(body);

    var wrap = el('div', 'at-names-wrap');
    var names = el('div', 'at-names');
    env.recipient.forEach(function (r) {
      names.appendChild(el('p', 'at-to at-to-' + r.role.split(' ')[0], r.text));
    });
    wrap.appendChild(names);
    front.appendChild(wrap);

    if (env.enclosure) front.appendChild(el('p', 'at-enclosure', env.enclosure));

    /* ---- 裏面 */
    var back = els.back;
    back.textContent = '';
    back.hidden = !els.printBack.checked;
    var fromBox = el('div', 'at-from');
    env.from.address.forEach(function (line) { fromBox.appendChild(el('p', 'at-from-addr', line)); });
    if (env.from.name) fromBox.appendChild(el('p', 'at-from-name', env.from.name));
    back.appendChild(fromBox);
    if (els.printZip.checked && env.from.zip) back.appendChild(el('p', 'at-from-zip', '〒' + env.from.zip));

    var problems = A.findProblems(env);
    els.problems.hidden = problems.length === 0;
    els.problems.textContent = problems.length ? 'まだ空の欄・読めない欄があります: ' + problems.join('・') : '';

    save();
  }

  /* ----------------------------------------------------------------- 下書き */

  function save() {
    try {
      var data = {};
      FIELDS.forEach(function (key) { data[key] = value(key); });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
    FIELDS.forEach(function (key) {
      setValue(key, Object.prototype.hasOwnProperty.call(DEFAULTS, key) ? DEFAULTS[key] : '');
    });
  }

  function clearAll() {
    if (!window.confirm('入力した内容をすべて消します。よろしいですか。')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    applyDefaults();
    render();
  }

  /* ------------------------------------------------------------------- 起動 */

  fillEnclosureOptions();
  if (!load()) applyDefaults();

  FIELDS.forEach(function (key) {
    els[key].addEventListener('input', render);
    els[key].addEventListener('change', render);
  });
  els.btnPrint.addEventListener('click', function () { window.print(); });
  els.btnClear.addEventListener('click', clearAll);

  render();

})();
