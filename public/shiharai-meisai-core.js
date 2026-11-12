/*
 * 支払明細書(/shiharai-meisai)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * shiharai-meisai.js(画面)と tests/shiharai-meisai.test.js の両方から使う。
 *
 * 金額・日付の読み取りは出金伝票(shukkin-core.js)と同じ規則を使う。
 * ブラウザでは shukkin-core.js を先に読み込み(window.Shukkin)、node では require する。
 *
 * ここに置いた「判断」は次の4つだけ。
 *   1. 明細の1行は「内容」と「金額」の2つがそろって初めて1行になる
 *   2. 金額は読み違えない。数字とカンマ以外が混じる入力は読まず、空欄で止める
 *   3. 計算は足し算と引き算だけ。支払額の合計から、入れてもらった差し引く額を引いて「差引支払額」を出す
 *   4. 源泉徴収が要るか・いくら引くか・消費税をどう扱うか・インボイスの代わりになるかは判断しない。
 *      差し引く額は、使う人が自分で決めた数字をそのまま書く
 *
 * ブラウザでは window.ShiharaiMeisai、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  var SK = (typeof module === 'object' && module.exports)
    ? require('./shukkin-core.js')
    : root.Shukkin;

  /** A4 1枚に並べる明細の行数。紙面は常にこの行数の枠を引く。 */
  var MAX_ROWS = 10;
  /** 差し引くものの行数(源泉所得税・振込手数料など)。 */
  var MAX_DEDUCTIONS = 3;

  var HONORIFICS = ['様', '御中'];

  /*
   * 文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 2026-11-13、A4 の PDF に出して測った(全角で詰めた最悪の入力・明細10行・差し引き3行・備考120字):
   *   内容40字・差し引く名目12字・備考120字 → A4 1枚に収まり、最下行の文字は紙の下端から約22mm上
   *   これより長い入力は測っていない
   */
  var LIMITS = { memo: 40, name: 12, note: 120 };

  function trimmed(v) { return String(v == null ? '' : v).trim(); }
  function chars(s) { return Array.from(s).length; }

  function isBlankRow(row) {
    row = row || {};
    return trimmed(row.memo) === '' && trimmed(row.amount) === '';
  }

  function isBlankDeduction(d) {
    d = d || {};
    return trimmed(d.name) === '' && trimmed(d.amount) === '';
  }

  /**
   * 明細書を組み立てる。
   *
   * input: { issueDate, to, honorific, from, fromAddress, payDate, method, note,
   *          rows: [{ memo, amount }], deductions: [{ name, amount }] }
   */
  function buildSheet(input) {
    input = input || {};
    var src = Array.isArray(input.rows) ? input.rows.filter(function (r) { return !isBlankRow(r); }) : [];
    var overflow = Math.max(0, src.length - MAX_ROWS);

    var rows = src.slice(0, MAX_ROWS).map(function (row, i) {
      var amount = SK.parseAmount(row.amount);
      return {
        no: i + 1,
        memo: trimmed(row.memo),
        amount: amount,
        amountText: amount === null ? '' : SK.formatNumber(amount)
      };
    });

    var dsrc = Array.isArray(input.deductions) ? input.deductions.filter(function (d) { return !isBlankDeduction(d); }) : [];
    var deductions = dsrc.slice(0, MAX_DEDUCTIONS).map(function (d) {
      var amount = SK.parseAmount(d.amount);
      return {
        name: trimmed(d.name),
        amount: amount,
        amountText: amount === null ? '' : SK.formatNumber(amount)
      };
    });

    var total = rows.reduce(function (sum, r) { return sum + (r.amount || 0); }, 0);
    var deductionTotal = deductions.reduce(function (sum, d) { return sum + (d.amount || 0); }, 0);
    var net = total - deductionTotal;
    var honorific = HONORIFICS.indexOf(input.honorific) >= 0 ? input.honorific : HONORIFICS[0];

    return {
      issueDateText: SK.formatDateJa(input.issueDate),
      payDateText: SK.formatDateJa(input.payDate),
      to: trimmed(input.to),
      honorific: honorific,
      from: trimmed(input.from),
      fromAddress: trimmed(input.fromAddress),
      method: trimmed(input.method),
      note: trimmed(input.note),
      rows: rows,
      deductions: deductions,
      total: total,
      totalText: SK.formatNumber(total),
      deductionTotal: deductionTotal,
      net: net,
      /* マイナスの差引は紙に書かない(警告で止める)。 */
      netText: net < 0 ? '' : SK.formatNumber(net),
      overflow: overflow
    };
  }

  /** 印刷する前に知らせること。「どの欄が足りないか」だけを言う。 */
  function findProblems(input, built) {
    input = input || {};
    built = built || buildSheet(input);
    var out = [];
    if (!built.to) out.push('支払先(受け取る方)の名前が入っていません。');
    if (!built.from) out.push('支払う側(あなた)の名前が入っていません。');
    if (!built.payDateText) out.push('支払日が入っていません。');
    if (built.rows.length === 0) {
      out.push('明細が1行もありません。内容と金額を入れてください。');
      return out;
    }
    var src = Array.isArray(input.rows) ? input.rows.filter(function (r) { return !isBlankRow(r); }) : [];
    built.rows.forEach(function (row, i) {
      var head = row.no + '行目: ';
      var raw = src[i] || {};
      if (!row.memo) out.push(head + '内容が入っていません。');
      if (chars(row.memo) > LIMITS.memo) {
        out.push(head + '内容が' + chars(row.memo) + '字あります。' + LIMITS.memo + '字を超えると行が2段になり、紙からはみ出すことがあります。');
      }
      if (row.amount === null) {
        out.push(head + (trimmed(raw.amount)
          ? '金額を読めません。数字だけで入れてください(例: 55000)。'
          : '金額が入っていません。'));
      }
    });
    var dsrc = Array.isArray(input.deductions) ? input.deductions.filter(function (d) { return !isBlankDeduction(d); }) : [];
    built.deductions.forEach(function (d, i) {
      var head = '差し引くもの' + (i + 1) + ': ';
      var raw = dsrc[i] || {};
      if (!d.name) out.push(head + '名目が入っていません(例: 源泉所得税)。');
      if (chars(d.name) > LIMITS.name) {
        out.push(head + '名目が' + chars(d.name) + '字あります。' + LIMITS.name + '字までにしてください。');
      }
      if (d.amount === null) {
        out.push(head + (trimmed(raw.amount)
          ? '金額を読めません。数字だけで入れてください。'
          : '金額が入っていません。'));
      }
    });
    if (built.net < 0) {
      out.push('差し引く額の合計が、支払額の合計より大きくなっています。差引支払額は紙に出していません。');
    }
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
    MAX_DEDUCTIONS: MAX_DEDUCTIONS,
    HONORIFICS: HONORIFICS,
    LIMITS: LIMITS,
    isBlankRow: isBlankRow,
    isBlankDeduction: isBlankDeduction,
    buildSheet: buildSheet,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.ShiharaiMeisai = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
