/*
 * 経費精算書(/keihi)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * keihi.js(画面)と tests/keihi.test.js の両方から使う。
 *
 * 金額・日付の読み取りは出金伝票(shukkin-core.js)と同じ規則を使う。
 * ブラウザでは shukkin-core.js を先に読み込み(window.Shukkin)、node では require する。
 *
 * ここに置いた「判断」は次の4つだけ。
 *   1. 1行に書く支払いは1件。日付・支払先・内容・金額の4つがそろって初めて1行になる
 *   2. 金額は読み違えない。数字とカンマ以外が混じる入力は読まず、空欄で止める
 *   3. 差引は足し算と引き算だけ。合計から仮払金を引き、プラスなら「支給額」、マイナスなら「返金額」と書く
 *   4. その支払いが経費になるか、どの勘定科目にするかは判断しない。税務の判断で、このツールの範囲の外にある
 *
 * ブラウザでは window.Keihi、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  var SK = (typeof module === 'object' && module.exports)
    ? require('./shukkin-core.js')
    : root.Shukkin;

  /** A4 1枚に並べる明細の行数。紙面は常にこの行数の枠を引く(空いた行は手書き用に残る)。 */
  var MAX_ROWS = 15;

  var FIELDS = ['date', 'payee', 'memo', 'amount'];

  /*
   * 明細の文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 2026-11-12、A4 の PDF に出して測った(全角で詰めた最悪の入力・15行すべて・仮払金あり):
   *   支払先16字・内容28字 → どの行も2段になるが A4 1枚に収まり、最下行の文字は紙の下端から約34pt上
   *   これより長いと行が3段になり、紙の下へ押し出されることがある(3段は測っていない)
   */
  var LIMITS = { payee: 16, memo: 28 };
  var LIMIT_LABELS = { payee: '支払先', memo: '内容' };

  function trimmed(v) { return String(v == null ? '' : v).trim(); }

  /** 「2026/11/12」。表の日付欄は狭いので年月日を数字で書く。空・不正なら空文字。 */
  function formatDateSlash(iso) {
    var t = SK.parseIso(iso);
    if (t === null) return '';
    var d = new Date(t);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '/' + p(d.getUTCMonth() + 1) + '/' + p(d.getUTCDate());
  }

  /** 4つの欄がすべて空の行。紙面にも警告にも出さない(領収書の有無だけでは行にしない)。 */
  function isBlankRow(row) {
    row = row || {};
    return FIELDS.every(function (k) { return trimmed(row[k]) === ''; });
  }

  /**
   * 精算書を組み立てる。
   *
   * input: { submitDate, to, applicant, advance, rows: [{ date, payee, memo, amount, receipt }] }
   * 返り値: { rows: [...], total, advance, diff, diffLabel, overflow }
   *   rows は空行を除いたもの(最大 MAX_ROWS)。番号は 1 から振る。
   *   advance は仮払金。空なら null(差引の行を出さない)。
   */
  function buildSheet(input) {
    input = input || {};
    var src = Array.isArray(input.rows) ? input.rows.filter(function (r) { return !isBlankRow(r); }) : [];
    var overflow = Math.max(0, src.length - MAX_ROWS);

    var rows = src.slice(0, MAX_ROWS).map(function (row, i) {
      var amount = SK.parseAmount(row.amount);
      return {
        no: i + 1,
        dateText: formatDateSlash(row.date),
        payee: trimmed(row.payee),
        memo: trimmed(row.memo),
        amount: amount,
        amountText: amount === null ? '' : SK.formatNumber(amount),
        receiptText: row.receipt === false ? '無' : '有'
      };
    });

    var total = rows.reduce(function (sum, r) { return sum + (r.amount || 0); }, 0);
    var advance = trimmed(input.advance) === '' ? null : SK.parseAmount(input.advance);
    var diff = advance === null ? null : total - advance;
    var diffLabel = diff === null ? '' : (diff >= 0 ? '差引 支給額' : '差引 返金額');

    return {
      submitDateText: SK.formatDateJa(input.submitDate),
      to: trimmed(input.to),
      applicant: trimmed(input.applicant),
      rows: rows,
      total: total,
      totalText: SK.formatNumber(total),
      advance: advance,
      advanceText: advance === null ? '' : SK.formatNumber(advance),
      diff: diff,
      diffLabel: diffLabel,
      diffText: diff === null ? '' : SK.formatNumber(Math.abs(diff)),
      overflow: overflow
    };
  }

  /** 印刷する前に知らせること。行ごとに「どの欄が足りないか」だけを言う。 */
  function findProblems(input, built) {
    input = input || {};
    built = built || buildSheet(input);
    var out = [];
    if (!built.applicant) out.push('申請者の名前が入っていません。');
    if (built.rows.length === 0) {
      out.push('明細が1行もありません。日付・支払先・内容・金額を入れてください。');
      return out;
    }
    var src = Array.isArray(input.rows) ? input.rows.filter(function (r) { return !isBlankRow(r); }) : [];
    built.rows.forEach(function (row, i) {
      var head = row.no + '行目: ';
      var raw = src[i] || {};
      if (!row.dateText) out.push(head + '日付が入っていません。');
      if (!row.payee) out.push(head + '支払先が入っていません。');
      if (!row.memo) out.push(head + '内容が入っていません。');
      Object.keys(LIMITS).forEach(function (k) {
        var len = Array.from(row[k]).length;
        if (len > LIMITS[k]) {
          out.push(head + LIMIT_LABELS[k] + 'が' + len + '字あります。' + LIMITS[k] + '字を超えると行が2段になり、紙からはみ出すことがあります。');
        }
      });
      if (row.amount === null) {
        out.push(head + (trimmed(raw.amount)
          ? '金額を読めません。数字だけで入れてください(例: 1200)。'
          : '金額が入っていません。'));
      }
    });
    if (trimmed(input.advance) !== '' && built.advance === null) {
      out.push('仮払金を読めません。数字だけで入れてください(仮払いが無ければ空欄のまま)。');
    }
    if (built.overflow > 0) {
      out.push('1枚に書けるのは' + MAX_ROWS + '行までです。' + (MAX_ROWS + 1) + '行目以降は紙面に出ていません。2枚目は別に作ってください。');
    }
    return out;
  }

  var api = {
    MAX_ROWS: MAX_ROWS,
    FIELDS: FIELDS,
    LIMITS: LIMITS,
    formatDateSlash: formatDateSlash,
    isBlankRow: isBlankRow,
    buildSheet: buildSheet,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Keihi = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
