/*
 * 預り証(/azukarisho)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * azukarisho.js(画面)と tests/azukarisho.test.js の両方から使う。
 *
 * 日付の読み取りは出金伝票(shukkin-core.js)と同じ規則を使う。
 * ブラウザでは shukkin-core.js を先に読み込み(window.Shukkin)、node では require する。
 *
 * ここに置いた「判断」は次の5つだけ。
 *   1. 明細の1行は「預かった品物の名前」が入って初めて1行になる
 *      (数量・単位・状態だけの行は警告する)
 *   2. 数量・単位・状態は任意。書いたとおりに出す。読み替えない
 *   3. 金額の欄を持たない。このページは「品物を預かった」紙で、お金を預かる紙は扱わない
 *   4. 日付は前後だけを知らせる(返す予定日が預かった日より前・発行日が預かった日より前)。
 *      保管期間の長さ・期限を過ぎたときの扱い・預かった物の責任は判断しない
 *   5. 「お返しの欄」は、返したときに手で書き込むための空欄。中身はいつも空で出す
 *
 * 預かった側の印の枠も、つける/つけないを選べる。枠の中は常に空欄で出す(印影を刷らない)。
 *
 * ブラウザでは window.Azukarisho、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  var SK = (typeof module === 'object' && module.exports)
    ? require('./shukkin-core.js')
    : root.Shukkin;

  /** A4 1枚に並べる明細の行数。紙面は常にこの行数の枠を引く(下に「お返しの欄」を置くため受領書より少ない)。 */
  var MAX_ROWS = 8;

  /** 預けてくれるのは個人のお客様が多いので「様」を先にする。 */
  var HONORIFICS = ['様', '御中'];

  /** 'on' = つける(既定) / 'off' = つけない。印の枠・お返しの欄・引き取りの一文で共用する */
  var SWITCHES = ['on', 'off'];

  /** 紙の下に添える一文(引き取りの一文を「つける」にしたとき)。 */
  var PICKUP_TEXT = 'お引き取りの際は、この預り証をお持ちください。';

  /*
   * 文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 2026-11-25、A4 の PDF に出して測った(全角で詰めた最悪の入力・明細8行・備考120字・
   * お返しの欄・印の枠・引き取りの一文すべてあり。ラベルの折れを直した後の値):
   *   品名24字・状態20字・単位4字では明細の行が2段に折れた → 品名22・状態15・単位3字で全行1段。
   *   用件40字は2段に折れた → 34字。このとき A4 1枚に収まり、最も下の枠は紙の下端から約42mm上
   *   これより長い入力は測っていない
   */
  var LIMITS = { name: 22, qty: 6, unit: 3, condition: 15, subject: 34, refNo: 30, note: 120 };

  function trimmed(v) { return String(v == null ? '' : v).trim(); }
  function chars(s) { return Array.from(s).length; }
  function onOff(v) { return v === 'off' ? 'off' : 'on'; }

  function isBlankRow(row) {
    row = row || {};
    return trimmed(row.name) === '' && trimmed(row.qty) === '' && trimmed(row.unit) === '' && trimmed(row.condition) === '';
  }

  /** ISO の日付として読めたときだけ、その文字列を返す(比べるため)。 */
  function validIso(v) {
    var s = trimmed(v);
    return SK.formatDateJa(s) === '' ? '' : s;
  }

  /**
   * 預り証を組み立てる。
   *
   * input: { issueDate, to, honorific, from, fromAddress, person, subject, receivedDate,
   *          returnDate, refNo, note, stamp, returnBox, pickup,
   *          rows: [{ name, qty, unit, condition }] }
   */
  function buildSheet(input) {
    input = input || {};
    var src = Array.isArray(input.rows) ? input.rows.filter(function (r) { return !isBlankRow(r); }) : [];
    var overflow = Math.max(0, src.length - MAX_ROWS);

    var rows = src.slice(0, MAX_ROWS).map(function (row, i) {
      return {
        no: i + 1,
        name: trimmed(row.name),
        qty: trimmed(row.qty),
        unit: trimmed(row.unit),
        condition: trimmed(row.condition)
      };
    });

    var honorific = HONORIFICS.indexOf(input.honorific) >= 0 ? input.honorific : HONORIFICS[0];

    return {
      issueDateText: SK.formatDateJa(input.issueDate),
      receivedDateText: SK.formatDateJa(input.receivedDate),
      returnDateText: SK.formatDateJa(input.returnDate),
      to: trimmed(input.to),
      honorific: honorific,
      from: trimmed(input.from),
      fromAddress: trimmed(input.fromAddress),
      person: trimmed(input.person),
      subject: trimmed(input.subject),
      refNo: trimmed(input.refNo),
      note: trimmed(input.note),
      stamp: onOff(input.stamp),
      returnBox: onOff(input.returnBox),
      pickup: onOff(input.pickup),
      rows: rows,
      overflow: overflow
    };
  }

  /** 印刷する前に知らせること。「どの欄が足りないか」だけを言う。 */
  function findProblems(input, built) {
    input = input || {};
    built = built || buildSheet(input);
    var out = [];
    if (!built.to) out.push('宛先(品物を預けてくれた人)の名前が入っていません。');
    if (!built.from) out.push('預かった側(あなた)の名前が入っていません。');
    if (!built.receivedDateText) out.push('預かった日が入っていません。');

    var issue = validIso(input.issueDate);
    var received = validIso(input.receivedDate);
    var ret = validIso(input.returnDate);
    if (issue && received && issue < received) out.push('発行日が預かった日より前になっています。');
    if (ret && received && ret < received) out.push('お返しする予定日が預かった日より前になっています。');

    ['subject', 'refNo'].forEach(function (k) {
      var label = { subject: '用件', refNo: '預り番号' }[k];
      if (chars(built[k]) > LIMITS[k]) {
        out.push(label + 'が' + chars(built[k]) + '字あります。' + LIMITS[k] + '字までにしてください。');
      }
    });

    if (built.rows.length === 0) {
      out.push('明細が1行もありません。預かった品物の名前を入れてください。');
    }
    built.rows.forEach(function (row) {
      var head = row.no + '行目: ';
      if (!row.name) out.push(head + '預かった品物の名前が入っていません。');
      if (chars(row.name) > LIMITS.name) {
        out.push(head + '品物の名前が' + chars(row.name) + '字あります。' + LIMITS.name + '字を超えると行が2段になり、紙からはみ出すことがあります。');
      }
      if (chars(row.qty) > LIMITS.qty) out.push(head + '数量が' + chars(row.qty) + '字あります。' + LIMITS.qty + '字までにしてください。');
      if (chars(row.unit) > LIMITS.unit) out.push(head + '単位が' + chars(row.unit) + '字あります。' + LIMITS.unit + '字までにしてください。');
      if (chars(row.condition) > LIMITS.condition) {
        out.push(head + '状態・付属品が' + chars(row.condition) + '字あります。' + LIMITS.condition + '字を超えると行が2段になり、紙からはみ出すことがあります。');
      }
    });
    if (chars(built.note) > LIMITS.note) {
      out.push('備考が' + chars(built.note) + '字あります。' + LIMITS.note + '字を超えると紙からはみ出すことがあります。');
    }
    if (built.overflow > 0) {
      out.push('1枚に書けるのは' + MAX_ROWS + '行までです。' + (MAX_ROWS + 1) + '行目以降は紙面に出ていません。2枚目は別に作ってください。');
    }
    return out;
  }

  var api = {
    MAX_ROWS: MAX_ROWS,
    HONORIFICS: HONORIFICS,
    SWITCHES: SWITCHES,
    PICKUP_TEXT: PICKUP_TEXT,
    LIMITS: LIMITS,
    isBlankRow: isBlankRow,
    buildSheet: buildSheet,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Azukarisho = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
