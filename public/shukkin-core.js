/*
 * 出金伝票(/shukkin)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * shukkin.js(画面)と tests/shukkin.test.js の両方から使う。
 *
 * ここに置いた「判断」は次の3つだけ。
 *   1. 1枚の伝票に書く支払いは1件。日付・支払先・摘要・金額の4つがそろって初めて1枚になる
 *   2. 金額は読み違えない。数字とカンマ以外が混じる入力は読まず、空欄で止める
 *   3. 勘定科目は利用者が書いたまま出す。こちらから候補を出さない・補わない。
 *      その支払いが経費になるか、どの科目にするかは税務の判断で、このツールの範囲の外にある
 *
 * ブラウザでは window.Shukkin、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  /** 1回で作れる伝票の枚数。A4 1枚に3枚ずつ並べるので、最大2ページ。 */
  var MAX_SLIPS = 6;
  /** A4 1枚に並べる伝票の数。 */
  var PER_PAGE = 3;

  var FIELDS = ['date', 'payee', 'account', 'memo', 'amount'];

  /*
   * 伝票の枠(高さ 84mm)に収まる文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 2026-10-06、A4 の PDF に出して測った(全角の同じ字を詰めた最悪の入力・3枚とも):
   *   摘要120字・支払先60字・勘定科目20字 → 枠の下の線を越え、起票の行が次の伝票との切り取り線に重なった
   *   摘要 80字・支払先40字・勘定科目12字 → 3枚とも枠の中に収まった(下の線まで約2mm)
   */
  var LIMITS = { payee: 40, memo: 80, account: 12 };
  var LIMIT_LABELS = { payee: '支払先', memo: '摘要', account: '勘定科目' };

  /** 「2026-10-06」を UTC の日付として読む。読めなければ null。 */
  function parseIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    var t = Date.UTC(y, mo - 1, d);
    var back = new Date(t);
    /* 2026-02-30 のような、暦に無い日付を受け付けない */
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return t;
  }

  /** 「2026年10月6日」。空・不正なら空文字(勝手に今日にしない)。 */
  function formatDateJa(iso) {
    var t = parseIso(iso);
    if (t === null) return '';
    var d = new Date(t);
    return d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日';
  }

  /**
   * 金額の入力を円の整数にする。「1,200」「¥1200」「1200円」「１２００」は読む。
   * 「1.2千」「12万」「千二百」のように数字とカンマ以外が混じるものは読まない(null)。
   * 0円も読まない。0円の出金を伝票に残す場面は無いので、入力漏れとして止める。
   */
  function parseAmount(s) {
    var t = String(s == null ? '' : s)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[，,]/g, '')
      .replace(/^[¥￥]\s*/, '')
      .replace(/円$/, '')
      .trim();
    if (!/^\d+$/.test(t)) return null;
    var n = Number(t);
    return n > 0 ? n : null;
  }

  /** 1200 → 「1,200」 */
  function formatNumber(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** 最初の伝票番号。1以上の整数でなければ 1。 */
  function parseStartNo(s) {
    var t = String(s == null ? '' : s).replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).trim();
    if (!/^\d+$/.test(t)) return 1;
    var n = Number(t);
    return n >= 1 ? n : 1;
  }

  function trimmed(v) { return String(v == null ? '' : v).trim(); }

  /** 5つの欄がすべて空の行。紙面にも警告にも出さない。 */
  function isBlankRow(row) {
    row = row || {};
    return FIELDS.every(function (k) { return trimmed(row[k]) === ''; });
  }

  /**
   * 伝票を組み立てる。
   *
   * input: { startNo, issuer, rows: [{ date, payee, account, memo, amount }] }
   * 返り値: { slips: [...], pages: [[slip, slip, slip], ...], total, issuer }
   *   空の行は伝票にしない。番号は残った伝票に startNo から振る。
   */
  function buildSlips(input) {
    input = input || {};
    var rows = Array.isArray(input.rows) ? input.rows.slice(0, MAX_SLIPS) : [];
    var no = parseStartNo(input.startNo);
    var issuer = trimmed(input.issuer);

    var slips = [];
    rows.forEach(function (row) {
      if (isBlankRow(row)) return;
      var amount = parseAmount(row.amount);
      slips.push({
        no: no++,
        dateText: formatDateJa(row.date),
        payee: trimmed(row.payee),
        account: trimmed(row.account),
        memo: trimmed(row.memo),
        amount: amount,
        amountText: amount === null ? '' : formatNumber(amount),
        issuer: issuer
      });
    });

    var pages = [];
    for (var i = 0; i < slips.length; i += PER_PAGE) pages.push(slips.slice(i, i + PER_PAGE));

    var total = slips.reduce(function (sum, s) { return sum + (s.amount || 0); }, 0);
    return { slips: slips, pages: pages, total: total, issuer: issuer };
  }

  /** 印刷する前に知らせること。伝票ごとに「どの欄が足りないか」だけを言う。 */
  function findProblems(input, built) {
    input = input || {};
    built = built || buildSlips(input);
    var out = [];
    if (built.slips.length === 0) {
      out.push('伝票が1枚もありません。日付・支払先・摘要・金額を入れてください。');
      return out;
    }
    var rows = Array.isArray(input.rows) ? input.rows.slice(0, MAX_SLIPS).filter(function (r) { return !isBlankRow(r); }) : [];
    built.slips.forEach(function (slip, i) {
      var head = 'No.' + slip.no + ': ';
      var raw = rows[i] || {};
      if (!slip.dateText) out.push(head + '日付が入っていません。');
      if (!slip.payee) out.push(head + '支払先が入っていません。');
      if (!slip.memo) out.push(head + '摘要(何に払ったか)が入っていません。');
      Object.keys(LIMITS).forEach(function (k) {
        var len = Array.from(slip[k]).length;
        if (len > LIMITS[k]) {
          out.push(head + LIMIT_LABELS[k] + 'が' + len + '字あります。' + LIMITS[k] + '字を超えると伝票の枠からはみ出すことがあります。');
        }
      });
      if (slip.amount === null) {
        out.push(head + (trimmed(raw.amount)
          ? '金額を読めません。数字だけで入れてください(例: 1200)。'
          : '金額が入っていません。'));
      }
    });
    if (Array.isArray(input.rows) && input.rows.length > MAX_SLIPS) {
      out.push('1回に作れるのは' + MAX_SLIPS + '枚までです。7枚目以降は紙面に出ていません。');
    }
    return out;
  }

  var api = {
    MAX_SLIPS: MAX_SLIPS,
    PER_PAGE: PER_PAGE,
    FIELDS: FIELDS,
    LIMITS: LIMITS,
    parseIso: parseIso,
    formatDateJa: formatDateJa,
    parseAmount: parseAmount,
    formatNumber: formatNumber,
    parseStartNo: parseStartNo,
    isBlankRow: isBlankRow,
    buildSlips: buildSlips,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Shukkin = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
