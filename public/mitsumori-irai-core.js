/*
 * 見積依頼書(/mitsumori-irai)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * mitsumori-irai.js(画面)と tests/mitsumori-irai.test.js の両方から使う。
 *
 * 日付の読み取りは出金伝票(shukkin-core.js)と同じ規則を使う。
 * ブラウザでは shukkin-core.js を先に読み込み(window.Shukkin)、node では require する。
 *
 * ここに置いた「判断」は次の4つだけ。
 *   1. 明細の1行は「品名・仕様」が入って初めて1行になる(数量・単位だけの行は警告する)
 *   2. 数量と単位は書いたとおりに出す。「一式」「2〜3」のような書き方を読み替えない
 *   3. 金額の欄を持たない。値段を書くのは見積もる側で、この紙は条件をそろえて聞くところまで
 *   4. 回答期限・希望納期は、発行日より前のときだけ知らせる。何日あければ足りるかは判断しない
 *
 * ブラウザでは window.MitsumoriIrai、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  var SK = (typeof module === 'object' && module.exports)
    ? require('./shukkin-core.js')
    : root.Shukkin;

  /** A4 1枚に並べる明細の行数。紙面は常にこの行数の枠を引く。 */
  var MAX_ROWS = 10;

  var HONORIFICS = ['御中', '様'];

  /*
   * 文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 2026-11-14、A4 の PDF に出して測った(全角で詰めた最悪の入力・明細10行・条件5欄・備考160字):
   *   品名40字・数量8字・単位4字・件名40字・納入場所/支払条件40字・備考160字 → A4 1枚に収まり、最下行の文字は紙の下端から約29mm上
   *   これより長い入力は測っていない
   */
  var LIMITS = { name: 40, qty: 8, unit: 4, subject: 40, place: 40, payTerms: 40, note: 160 };

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
   * 依頼書を組み立てる。
   *
   * input: { issueDate, to, honorific, from, fromAddress, person, subject,
   *          replyDate, deliveryDate, place, payTerms, note,
   *          rows: [{ name, qty, unit }] }
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
      replyDateText: SK.formatDateJa(input.replyDate),
      deliveryDateText: SK.formatDateJa(input.deliveryDate),
      to: trimmed(input.to),
      honorific: honorific,
      from: trimmed(input.from),
      fromAddress: trimmed(input.fromAddress),
      person: trimmed(input.person),
      subject: trimmed(input.subject),
      place: trimmed(input.place),
      payTerms: trimmed(input.payTerms),
      note: trimmed(input.note),
      rows: rows,
      overflow: overflow
    };
  }

  /** 印刷する前に知らせること。「どの欄が足りないか」だけを言う。 */
  function findProblems(input, built) {
    input = input || {};
    built = built || buildSheet(input);
    var out = [];
    if (!built.to) out.push('依頼先(見積もりを出してもらう相手)の名前が入っていません。');
    if (!built.from) out.push('依頼する側(あなた)の名前が入っていません。');
    if (!built.replyDateText) out.push('回答期限が入っていません。いつまでに見積もりがほしいかを入れてください。');

    var issue = validIso(input.issueDate);
    var reply = validIso(input.replyDate);
    var delivery = validIso(input.deliveryDate);
    if (issue && reply && reply < issue) out.push('回答期限が発行日より前になっています。');
    if (issue && delivery && delivery < issue) out.push('希望納期が発行日より前になっています。');
    if (reply && delivery && delivery < reply) out.push('希望納期が回答期限より前になっています。');

    ['subject', 'place', 'payTerms'].forEach(function (k) {
      var label = { subject: '件名', place: '納入場所', payTerms: '支払条件' }[k];
      if (chars(built[k]) > LIMITS[k]) {
        out.push(label + 'が' + chars(built[k]) + '字あります。' + LIMITS[k] + '字までにしてください。');
      }
    });

    if (built.rows.length === 0) {
      out.push('明細が1行もありません。見積もってほしい品名・仕様を入れてください。');
    }
    built.rows.forEach(function (row) {
      var head = row.no + '行目: ';
      if (!row.name) out.push(head + '品名・仕様が入っていません。');
      if (chars(row.name) > LIMITS.name) {
        out.push(head + '品名・仕様が' + chars(row.name) + '字あります。' + LIMITS.name + '字を超えると行が2段になり、紙からはみ出すことがあります。');
      }
      if (row.name && !row.qty) out.push(head + '数量が入っていません。数が決まっていなければ「一式」などと書いてください。');
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
    LIMITS: LIMITS,
    isBlankRow: isBlankRow,
    buildSheet: buildSheet,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MitsumoriIrai = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
