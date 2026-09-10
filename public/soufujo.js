/*
 * 送付状ジェネレーター(/soufujo)の画面制御。
 * 文面の組み立ては cover.js の純粋関数が行い、ここは入力の取得と紙面の描画だけを担当する。
 * 入力内容はこの端末から出ない。下書きは localStorage にだけ置く。
 */
'use strict';

(function () {

  var CL = window.CoverLetter;
  var STORAGE_KEY = 'soufujo-draft-v1';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    kind: $('sfKind'),
    date: $('sfDate'),
    toName: $('sfToName'),
    toHonorific: $('sfToHonorific'),
    toDept: $('sfToDept'),
    fromName: $('sfFromName'),
    fromAddress: $('sfFromAddress'),
    salutation: $('sfSalutation'),
    useGreeting: $('sfUseGreeting'),
    greetingHint: $('sfGreetingHint'),
    body: $('sfBody'),
    items: $('sfItems'),
    postscript: $('sfPostscript'),
    missing: $('sfMissing'),
    sheet: $('sfSheet'),
    btnPrint: $('sfPrint'),
    btnClear: $('sfClear')
  };

  var FIELDS = [
    'kind', 'date', 'toName', 'toHonorific', 'toDept', 'fromName', 'fromAddress',
    'salutation', 'useGreeting', 'body', 'items', 'postscript'
  ];

  function value(key) {
    var el = els[key];
    return el.type === 'checkbox' ? el.checked : el.value;
  }

  function setValue(key, v) {
    var el = els[key];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v == null ? '' : String(v);
  }

  function todayIso() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ------------------------------------------------------------- 用途のひな形 */

  function fillPresetOptions() {
    Object.keys(CL.PRESETS).forEach(function (key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = CL.PRESETS[key].label;
      els.kind.appendChild(opt);
    });
  }

  /* 用途を選び直したときだけ本文と同封物を上書きする。
     利用者が手で直した文を、他の欄をいじった拍子に消さないため、input では呼ばない。 */
  function applyPreset() {
    var preset = CL.PRESETS[els.kind.value];
    if (!preset) return;
    els.body.value = preset.body;
    els.items.value = preset.items.map(CL.formatItem).join('\n');
  }

  /* --------------------------------------------------------------- 紙面の描画 */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function render() {
    var doc = CL.buildDocument({
      date: els.date.value,
      toName: els.toName.value,
      toHonorific: els.toHonorific.value,
      toDept: els.toDept.value,
      fromName: els.fromName.value,
      fromAddress: els.fromAddress.value,
      salutation: els.salutation.value,
      useGreeting: els.useGreeting.checked,
      body: els.body.value,
      itemsText: els.items.value,
      postscript: els.postscript.value
    });

    /* 前略を選ぶと時候の挨拶は出せない。その理由を、黙って無視せず画面に書く。 */
    var suppressed = els.salutation.value === 'zenryaku';
    els.useGreeting.disabled = suppressed;
    els.greetingHint.textContent = suppressed
      ? '「前略」は前置きを省くという意味の語です。時候の挨拶は付けません。'
      : '選んだ日付の月に合う挨拶(例: 9月なら「初秋の候」)を自動で入れます。';

    var sheet = els.sheet;
    sheet.textContent = '';

    sheet.appendChild(el('p', 'sf-date', doc.dateText));

    var head = el('div', 'sf-head');
    var to = el('div', 'sf-to');
    to.appendChild(el('p', 'sf-to-name', doc.to.name));
    if (doc.to.dept) to.appendChild(el('p', 'sf-to-dept', doc.to.dept));
    head.appendChild(to);

    var from = el('div', 'sf-from');
    from.appendChild(el('p', 'sf-from-name', doc.from.name));
    if (doc.from.address) from.appendChild(el('p', 'sf-from-addr', doc.from.address));
    head.appendChild(from);
    sheet.appendChild(head);

    sheet.appendChild(el('h2', 'sf-title', doc.title));

    if (doc.opening) sheet.appendChild(el('p', 'sf-opening', doc.opening));
    if (doc.lead) sheet.appendChild(el('p', 'sf-para', doc.lead));
    if (doc.body) {
      doc.body.split('\n').forEach(function (line) {
        if (line.trim() !== '') sheet.appendChild(el('p', 'sf-para', line.trim()));
      });
    }
    if (doc.postscript) sheet.appendChild(el('p', 'sf-para', doc.postscript));
    if (doc.closing) sheet.appendChild(el('p', 'sf-closing', doc.closing));

    if (doc.hasRecord) {
      sheet.appendChild(el('p', 'sf-kiji', '記'));
      var ul = el('ul', 'sf-items');
      doc.items.forEach(function (item) {
        ul.appendChild(el('li', null, CL.formatItem(item)));
      });
      sheet.appendChild(ul);
      sheet.appendChild(el('p', 'sf-ijo', '以上'));
    }

    var missing = CL.findMissing(doc);
    if (missing.length) {
      els.missing.hidden = false;
      els.missing.textContent = 'まだ空の欄があります: ' + missing.join('・');
    } else {
      els.missing.hidden = true;
      els.missing.textContent = '';
    }

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

  function clearAll() {
    if (!window.confirm('入力した内容をすべて消します。よろしいですか。')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    FIELDS.forEach(function (key) { setValue(key, ''); });
    els.kind.value = 'invoice';
    els.toHonorific.value = '御中';
    els.salutation.value = 'haikei';
    els.useGreeting.checked = true;
    els.date.value = todayIso();
    applyPreset();
    render();
  }

  /* ------------------------------------------------------------------- 起動 */

  fillPresetOptions();

  if (!load()) {
    els.kind.value = 'invoice';
    els.date.value = todayIso();
    applyPreset();
  }

  FIELDS.forEach(function (key) {
    els[key].addEventListener('input', render);
    els[key].addEventListener('change', render);
  });
  els.kind.addEventListener('change', function () { applyPreset(); render(); });
  els.btnPrint.addEventListener('click', function () { window.print(); });
  els.btnClear.addEventListener('click', clearAll);

  render();

})();
