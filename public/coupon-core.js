/*
 * クーポン券(/coupon)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * coupon.js(画面)と tests/coupon.test.js の両方から使う。
 *
 * 紙面: 91×55mm(名刺と同じ大きさ)の券を A4 縦に 2列×5段=10枚、すき間なしで並べる。
 *       紙の端からの余白は 上下11mm・左右14mm(/meishi・/point-card と同じ値)。
 *
 * ここに置いた「判断」は次の6つだけ。
 *   1. 特典(「全品10%引き」など)をいちばん大きく出す。見出しが空なら「クーポン券」
 *   2. 有効期限は 書かない / 日付で入れる / 手書きの欄 の3つ。日付は「2026年12月31日まで」の形にする
 *   3. 通し番号は つける/つけない。つけると始めの番号から1ずつ増やし、4桁にそろえる(No.0001)
 *   4. 通し番号をつけたときだけ、刷る紙の枚数(1〜10枚=10〜100枚)を選べる。9999 を超える番号は作らない
 *   5. 空けた欄は紙に出さない
 *   6. 文字数の上限を超えたら知らせるだけ(切り詰めない)
 *
 * 割引や特典の表示が景品表示法などの決まりに触れるかは判断しない。使用済みの管理もしない。
 *
 * ブラウザでは window.Coupon、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  /** 1枚の紙に並べる枚数と寸法(mm)。/meishi と同じ。 */
  var LAYOUT = { cols: 2, rows: 5, cardW: 91, cardH: 55, marginTop: 11, marginLeft: 14 };
  var PER_SHEET = LAYOUT.cols * LAYOUT.rows;
  var MAX_SHEETS = 10;
  var MAX_NO = 9999;

  var ONOFF = ['on', 'off'];
  var EXPIRY = ['off', 'date', 'hand'];

  /*
   * 文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 券1枚の枠は固定なので、超えると文字が折れて枠からはみ出す(ページは増えない)。
   * 値は 2026-11-28、全角で詰めた最悪の入力を A4 の PDF に出して測って決めた(日報参照)。
   */
  var LIMITS = { title: 10, shop: 16, offer: 12, terms: 30, info1: 30, info2: 30 };

  var FIELDS = ['title', 'shop', 'offer', 'terms', 'info1', 'info2'];
  var OPTIONS = ['expiry', 'expiryDate', 'numbering', 'start', 'sheets', 'guides'];

  var LABELS = {
    title: '見出し', shop: '店名', offer: '特典', terms: '使えるときの決まり',
    info1: '下の1行目', info2: '下の2行目'
  };

  var DEFAULT_TITLE = 'クーポン券';

  function trimmed(v) { return String(v == null ? '' : v).trim(); }
  function chars(s) { return Array.from(s).length; }
  function pick(v, list, fallback) {
    for (var i = 0; i < list.length; i++) if (String(list[i]) === String(v)) return list[i];
    return fallback;
  }

  /** 全角数字も読む。整数でなければ null(読めない値を 0 にしない)。 */
  function toInt(v) {
    var s = trimmed(v).replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xFEE0); });
    if (!/^\d+$/.test(s)) return null;
    return parseInt(s, 10);
  }

  /** "2026-12-31" → "2026年12月31日まで"。暦にない日・形の違う値は null。 */
  function formatDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed(v));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return y + '年' + mo + '月' + d + '日まで';
  }

  function pad4(n) { var s = String(n); while (s.length < 4) s = '0' + s; return s; }

  /** 通し番号の始めと枚数。読めない・範囲外なら既定(1 と 1枚)に戻す。 */
  function numberPlan(input) {
    var start = toInt(input.start);
    if (start == null || start < 1 || start > MAX_NO) start = 1;
    var sheets = toInt(input.sheets);
    if (sheets == null || sheets < 1 || sheets > MAX_SHEETS) sheets = 1;
    /* 9999 を超える番号は作らない。入る分だけの紙に減らす */
    var room = MAX_NO - start + 1;
    var count = Math.min(sheets * PER_SHEET, room);
    return { start: start, count: count, sheets: Math.ceil(count / PER_SHEET) };
  }

  /**
   * 紙面を組み立てる。cards は券ごとの中身(番号だけが券ごとに違う)。
   *
   * input: { title, shop, offer, terms, info1, info2, expiry, expiryDate, numbering, start, sheets, guides }
   */
  function build(input) {
    input = input || {};
    var v = {};
    FIELDS.forEach(function (k) { v[k] = trimmed(input[k]); });

    var expiry = pick(input.expiry, EXPIRY, 'off');
    var expiryText = '';
    if (expiry === 'date') expiryText = formatDate(input.expiryDate) ? '有効期限 ' + formatDate(input.expiryDate) : '';
    if (expiry === 'hand') expiryText = '有効期限　　年　　月　　日まで';

    var numbering = pick(input.numbering, ONOFF, 'off') === 'on';
    var plan = numbering ? numberPlan(input) : { start: 0, count: PER_SHEET, sheets: 1 };

    var common = {
      title: v.title || DEFAULT_TITLE,
      shop: v.shop,
      offer: v.offer,
      terms: v.terms,
      expiry: expiryText,
      info: [v.info1, v.info2].filter(Boolean)
    };

    var cards = [];
    for (var i = 0; i < plan.sheets * PER_SHEET; i++) {
      var c = Object.assign({}, common);
      if (numbering) c.no = i < plan.count ? 'No.' + pad4(plan.start + i) : null;
      /* 番号の尽きた券は紙に出さない(空の枠だけ残す) */
      c.blank = numbering && i >= plan.count;
      cards.push(c);
    }

    return {
      cards: cards,
      sheets: plan.sheets,
      count: plan.count,
      numbering: numbering,
      guides: pick(input.guides, ONOFF, 'on')
    };
  }

  /** 印刷する前に知らせること。「どの欄が足りないか・長すぎるか」だけを言う。 */
  function findProblems(input) {
    input = input || {};
    var out = [];
    if (!trimmed(input.offer)) out.push('特典が入っていません。何がもらえる券か分かりません。');
    if (!trimmed(input.shop)) out.push('店名が入っていません。どの店の券か分かりません。');
    if (!trimmed(input.info1) && trimmed(input.info2)) out.push('下の2行目だけが入っています。1行目から入れてください。');
    if (pick(input.expiry, EXPIRY, 'off') === 'date' && !formatDate(input.expiryDate)) {
      out.push('有効期限の日付が入っていません。紙には期限が出ません。');
    }
    if (pick(input.numbering, ONOFF, 'off') === 'on') {
      var start = toInt(input.start);
      if (start == null || start < 1 || start > MAX_NO) {
        out.push('始めの番号が読めません(1〜' + MAX_NO + ')。1から振ります。');
      } else {
        var sheets = toInt(input.sheets);
        if (sheets != null && sheets >= 1 && sheets <= MAX_SHEETS && start + sheets * PER_SHEET - 1 > MAX_NO) {
          out.push('番号は' + MAX_NO + 'までです。' + MAX_NO + 'を超える分の券は作りません。');
        }
      }
    }
    FIELDS.forEach(function (k) {
      var s = trimmed(input[k]);
      if (chars(s) > LIMITS[k]) {
        out.push(LABELS[k] + 'が' + chars(s) + '字あります。' + LIMITS[k] + '字を超えると券の枠からはみ出します。');
      }
    });
    return out;
  }

  var api = {
    LAYOUT: LAYOUT,
    PER_SHEET: PER_SHEET,
    MAX_SHEETS: MAX_SHEETS,
    MAX_NO: MAX_NO,
    ONOFF: ONOFF,
    EXPIRY: EXPIRY,
    LIMITS: LIMITS,
    FIELDS: FIELDS,
    OPTIONS: OPTIONS,
    DEFAULT_TITLE: DEFAULT_TITLE,
    formatDate: formatDate,
    build: build,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Coupon = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
