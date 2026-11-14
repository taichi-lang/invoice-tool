/*
 * 業務完了報告書(/kanryo-hokoku)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * kanryo-hokoku.js(画面)と tests/kanryo-hokoku.test.js の両方から使う。
 *
 * 日付の読み取りは出金伝票(shukkin-core.js)と同じ規則を使う。
 * ブラウザでは shukkin-core.js を先に読み込み(window.Shukkin)、node では require する。
 *
 * ここに置いた「判断」は次の4つだけ。
 *   1. 明細の1行は「行った作業・成果物」が入って初めて1行になる(数量・単位だけの行は警告する)
 *   2. 数量と単位は任意。書いたとおりに出す。「一式」「3回」のような書き方を読み替えない
 *   3. 金額の欄を持たない。金額は請求書に書くもので、この紙は「何を終えたか」を伝えるところまで
 *   4. 日付は前後だけを知らせる(開始>終了、完了が開始より前、報告が完了より前)。
 *      いつまでに報告すべきか・検収に何日かかるかは判断しない
 *
 * 確認欄(相手が確認日と名前を書く枠)は、つける/つけないを選べる。枠の中は常に空欄で出す。
 * 相手が確認したかどうかを、このツールが決めることはない。
 *
 * ブラウザでは window.KanryoHokoku、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  var SK = (typeof module === 'object' && module.exports)
    ? require('./shukkin-core.js')
    : root.Shukkin;

  /** A4 1枚に並べる明細の行数。紙面は常にこの行数の枠を引く。 */
  var MAX_ROWS = 10;

  var HONORIFICS = ['御中', '様'];

  /** 確認欄。'on' = つける(既定) / 'off' = つけない */
  var CONFIRMS = ['on', 'off'];

  /*
   * 文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 2026-11-15、A4 の PDF に出して測った(全角で詰めた最悪の入力・明細10行・条件4欄・備考160字・確認欄あり):
   *   作業内容40字・数量8字・単位4字・件名40字・作業場所40字・備考160字 → A4 1枚に収まり、
   *   最下行の文字は紙の下端から約16mm上(@page の下余白 8mm を引くと、残りは約8mm)
   *   これより長い入力は測っていない
   */
  var LIMITS = { name: 40, qty: 8, unit: 4, subject: 40, place: 40, note: 160 };

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

  /** 作業期間の表示。片方だけなら、入っている側だけを「〜」つきで出す。両方空なら空。 */
  function periodText(startText, endText) {
    if (!startText && !endText) return '';
    return startText + ' 〜 ' + endText;
  }

  /**
   * 報告書を組み立てる。
   *
   * input: { issueDate, to, honorific, from, fromAddress, person, subject,
   *          startDate, endDate, doneDate, place, note, confirm,
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
    var startText = SK.formatDateJa(input.startDate);
    var endText = SK.formatDateJa(input.endDate);

    return {
      issueDateText: SK.formatDateJa(input.issueDate),
      doneDateText: SK.formatDateJa(input.doneDate),
      periodText: periodText(startText, endText),
      to: trimmed(input.to),
      honorific: honorific,
      from: trimmed(input.from),
      fromAddress: trimmed(input.fromAddress),
      person: trimmed(input.person),
      subject: trimmed(input.subject),
      place: trimmed(input.place),
      note: trimmed(input.note),
      confirm: input.confirm === 'off' ? 'off' : 'on',
      rows: rows,
      overflow: overflow
    };
  }

  /** 印刷する前に知らせること。「どの欄が足りないか」だけを言う。 */
  function findProblems(input, built) {
    input = input || {};
    built = built || buildSheet(input);
    var out = [];
    if (!built.to) out.push('報告先(仕事を頼んでくれた相手)の名前が入っていません。');
    if (!built.from) out.push('報告する側(あなた)の名前が入っていません。');
    if (!built.subject) out.push('件名(どの仕事の報告か)が入っていません。');
    if (!built.doneDateText) out.push('完了日が入っていません。仕事を終えた日を入れてください。');

    var issue = validIso(input.issueDate);
    var start = validIso(input.startDate);
    var end = validIso(input.endDate);
    var done = validIso(input.doneDate);
    if (start && end && end < start) out.push('作業期間の終わりが、始まりより前になっています。');
    if (start && done && done < start) out.push('完了日が、作業期間の始まりより前になっています。');
    if (issue && done && issue < done) out.push('報告日が完了日より前になっています。');

    ['subject', 'place'].forEach(function (k) {
      var label = { subject: '件名', place: '作業場所' }[k];
      if (chars(built[k]) > LIMITS[k]) {
        out.push(label + 'が' + chars(built[k]) + '字あります。' + LIMITS[k] + '字までにしてください。');
      }
    });

    if (built.rows.length === 0) {
      out.push('明細が1行もありません。行った作業・納めた成果物を入れてください。');
    }
    built.rows.forEach(function (row) {
      var head = row.no + '行目: ';
      if (!row.name) out.push(head + '行った作業・成果物が入っていません。');
      if (chars(row.name) > LIMITS.name) {
        out.push(head + '行った作業・成果物が' + chars(row.name) + '字あります。' + LIMITS.name + '字を超えると行が2段になり、紙からはみ出すことがあります。');
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
    CONFIRMS: CONFIRMS,
    LIMITS: LIMITS,
    isBlankRow: isBlankRow,
    periodText: periodText,
    buildSheet: buildSheet,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.KanryoHokoku = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
