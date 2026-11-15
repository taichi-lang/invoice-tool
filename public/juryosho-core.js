/*
 * 受領書(/juryosho)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * juryosho.js(画面)と tests/juryosho.test.js の両方から使う。
 *
 * 日付の読み取りは出金伝票(shukkin-core.js)と同じ規則を使う。
 * ブラウザでは shukkin-core.js を先に読み込み(window.Shukkin)、node では require する。
 *
 * ここに置いた「判断」は次の4つだけ。
 *   1. 明細の1行は「受け取った物の名前」が入って初めて1行になる(数量・単位だけの行は警告する)
 *   2. 数量と単位は任意。書いたとおりに出す。「一式」「3箱」のような書き方を読み替えない
 *   3. 金額の欄を持たない。お金を受け取ったときの紙は領収書で、この紙は「物や書類を受け取った」まで
 *   4. 日付は前後だけを知らせる(発行日が受領日より前)。
 *      受け取った物の中身が合っているか(検品・検収)は判断しない
 *
 * 受領印の枠は、つける/つけないを選べる。枠の中は常に空欄で出す(印影を刷らない)。
 *
 * ブラウザでは window.Juryosho、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  var SK = (typeof module === 'object' && module.exports)
    ? require('./shukkin-core.js')
    : root.Shukkin;

  /** A4 1枚に並べる明細の行数。紙面は常にこの行数の枠を引く。 */
  var MAX_ROWS = 10;

  var HONORIFICS = ['御中', '様'];

  /** 受領印の枠。'on' = つける(既定) / 'off' = つけない */
  var STAMPS = ['on', 'off'];

  /*
   * 文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 2026-11-16、A4 の PDF に出して測った(全角で詰めた最悪の入力・明細10行・備考160字・受領印の枠あり):
   *   品名40字・数量8字・単位4字・件名40字・納品書の番号40字・備考160字 → A4 1枚に収まり、
   *   最下行の文字(「受領印」)は紙の下端から約26mm上。枠の下端そのものは測っていない
   *   (枠の高さ22mmから数えると下端から約16mm上=計算値)
   *   これより長い入力は測っていない
   */
  var LIMITS = { name: 40, qty: 8, unit: 4, subject: 40, refNo: 40, note: 160 };

  function trimmed(v) { return String(v == null ? '' : v).trim(); }
  function chars(s) { return Array.from(s).length; }

  function isBlankRow(row) {
    row = row || {};
    return trimmed(row.name) === '' && trimmed(row.qty) === '' && trimmed(row.unit) === '';
  }

  /** ISO の日付として読めたときだけ、その文字列を返す(比べるため)。 */
  function validIso(v) {
    var s = trimmed(v);
    return SK.formatDateJa(s) === '' ? '' : s;
  }

  /**
   * 受領書を組み立てる。
   *
   * input: { issueDate, to, honorific, from, fromAddress, person, subject,
   *          receivedDate, refNo, note, stamp, rows: [{ name, qty, unit }] }
   */
  function buildSheet(input) {
    input = input || {};
    var src = Array.isArray(input.rows) ? input.rows.filter(function (r) { return !isBlankRow(r); }) : [];
    var overflow = Math.max(0, src.length - MAX_ROWS);

    var rows = src.slice(0, MAX_ROWS).map(function (row, i) {
      return { no: i + 1, name: trimmed(row.name), qty: trimmed(row.qty), unit: trimmed(row.unit) };
    });

    var honorific = HONORIFICS.indexOf(input.honorific) >= 0 ? input.honorific : HONORIFICS[0];

    return {
      issueDateText: SK.formatDateJa(input.issueDate),
      receivedDateText: SK.formatDateJa(input.receivedDate),
      to: trimmed(input.to),
      honorific: honorific,
      from: trimmed(input.from),
      fromAddress: trimmed(input.fromAddress),
      person: trimmed(input.person),
      subject: trimmed(input.subject),
      refNo: trimmed(input.refNo),
      note: trimmed(input.note),
      stamp: input.stamp === 'off' ? 'off' : 'on',
      rows: rows,
      overflow: overflow
    };
  }

  /** 印刷する前に知らせること。「どの欄が足りないか」だけを言う。 */
  function findProblems(input, built) {
    input = input || {};
    built = built || buildSheet(input);
    var out = [];
    if (!built.to) out.push('宛先(渡してくれた相手)の名前が入っていません。');
    if (!built.from) out.push('受け取った側(あなた)の名前が入っていません。');
    if (!built.receivedDateText) out.push('受領日が入っていません。受け取った日を入れてください。');

    var issue = validIso(input.issueDate);
    var received = validIso(input.receivedDate);
    if (issue && received && issue < received) out.push('発行日が受領日より前になっています。');

    ['subject', 'refNo'].forEach(function (k) {
      var label = { subject: '件名', refNo: '納品書の番号' }[k];
      if (chars(built[k]) > LIMITS[k]) {
        out.push(label + 'が' + chars(built[k]) + '字あります。' + LIMITS[k] + '字までにしてください。');
      }
    });

    if (built.rows.length === 0) {
      out.push('明細が1行もありません。受け取った物の名前を入れてください。');
    }
    built.rows.forEach(function (row) {
      var head = row.no + '行目: ';
      if (!row.name) out.push(head + '受け取った物の名前が入っていません。');
      if (chars(row.name) > LIMITS.name) {
        out.push(head + '受け取った物の名前が' + chars(row.name) + '字あります。' + LIMITS.name + '字を超えると行が2段になり、紙からはみ出すことがあります。');
      }
      if (chars(row.qty) > LIMITS.qty) out.push(head + '数量が' + chars(row.qty) + '字あります。' + LIMITS.qty + '字までにしてください。');
      if (chars(row.unit) > LIMITS.unit) out.push(head + '単位が' + chars(row.unit) + '字あります。' + LIMITS.unit + '字までにしてください。');
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
    STAMPS: STAMPS,
    LIMITS: LIMITS,
    isBlankRow: isBlankRow,
    buildSheet: buildSheet,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Juryosho = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
