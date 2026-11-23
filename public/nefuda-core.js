/*
 * 値札(/nefuda)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * nefuda.js(画面)と tests/nefuda.test.js の両方から使う。
 *
 * 金額の読み方は料金表(ryokinhyo-core.js)と同じ関数を使う。読み方を2つに分けない。
 *
 * ここに置いた「判断」は次の4つだけ。
 *   1. 品名も金額も空の行は、値札にしない
 *   2. 1品を何枚ずつ並べるかは 1・2・3 のどれか。並べきれない分は紙に出さず、警告する
 *   3. 金額の後ろの書き添えは「税込」「税抜」「書かない」の3つだけ
 *   4. 18枠に足りない分は空けたまま(線も引かない)
 *
 * 消費税の計算はしない。入れた金額が税込かどうか・その値段で売ってよいかは確かめない。
 *
 * ブラウザでは window.Nefuda、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  var Ryokinhyo = (typeof module === 'object' && module.exports)
    ? require('./ryokinhyo-core.js')
    : root.Ryokinhyo;

  /** 64×46mm を 3列×6段。余白は 上下10.5mm・左右9mm(nefuda.css と同じ値)。 */
  var LAYOUT = { cols: 3, rows: 6, tagW: 64, tagH: 46, marginTop: 10.5, marginLeft: 9 };
  var SLOTS = LAYOUT.cols * LAYOUT.rows;

  /** 入力の行の数。1品1枚なら18枠ちょうど。 */
  var ROWS = 18;

  var COPIES = ['1', '2', '3'];
  var TAX = { incl: '税込', excl: '税抜', none: '' };
  var GUIDES = ['on', 'off'];

  /*
   * 文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 2026-11-24、A4 の PDF に出して測った(全角で詰めた最悪の入力):
   *   品名12字・補足18字・金額7桁+「税込」で18枚とも枠の中・A4 1ページ。
   */
  var LIMITS = { name: 12, note: 18, price: 7 };

  function trimmed(v) { return String(v == null ? '' : v).trim(); }
  function chars(s) { return Array.from(s).length; }

  function readRow(input, n) {
    var raw = trimmed(input['price' + n]);
    return {
      n: n,
      name: trimmed(input['name' + n]),
      note: trimmed(input['note' + n]),
      priceRaw: raw,
      price: Ryokinhyo.parsePrice(raw)
    };
  }

  function copiesOf(input) {
    return COPIES.indexOf(String(input.copies)) >= 0 ? Number(input.copies) : 1;
  }

  /**
   * 値札を並べる。
   * input: { copies, tax, guides, name1, note1, price1, …(18行目まで) }
   * 返り値: { tags: [{ name, note, priceText, tax }…](最大18), overflow: 並べきれなかった枚数, guides }
   */
  function buildSheet(input) {
    input = input || {};
    var copies = copiesOf(input);
    var taxKey = Object.prototype.hasOwnProperty.call(TAX, input.tax) ? input.tax : 'incl';
    var tags = [];
    var overflow = 0;
    for (var n = 1; n <= ROWS; n++) {
      var r = readRow(input, n);
      if (!r.name && r.priceRaw === '') continue;
      var priceText = Ryokinhyo.formatPrice(r.price);
      var tag = { n: n, name: r.name, note: r.note, priceText: priceText, tax: priceText ? TAX[taxKey] : '' };
      for (var i = 0; i < copies; i++) {
        if (tags.length < SLOTS) tags.push(tag);
        else overflow++;
      }
    }
    return { tags: tags, overflow: overflow, guides: GUIDES.indexOf(input.guides) >= 0 ? input.guides : 'on' };
  }

  /** 印刷する前に知らせること。「どの欄が足りないか」だけを言う。 */
  function findProblems(input, built) {
    input = input || {};
    built = built || buildSheet(input);
    var out = [];
    if (built.tags.length === 0) out.push('品名と金額が1つも入っていません。');
    if (built.overflow > 0) {
      out.push('値札が' + SLOTS + '枚を超えたため、あとの' + built.overflow + '枚は紙に出ません。1品あたりの枚数を減らすか、2回に分けて刷ってください。');
    }
    for (var n = 1; n <= ROWS; n++) {
      var r = readRow(input, n);
      if (!r.name && r.priceRaw === '') {
        if (r.note) out.push(n + '行目は補足だけが入っています。品名の無い行は値札になりません。');
        continue;
      }
      if (!r.name) out.push(n + '行目の品名が入っていません。');
      if (r.priceRaw === '') out.push(n + '行目の金額が入っていません。空けたまま刷ると、金額の欄は空白になります。');
      else if (r.price === null) {
        out.push(n + '行目の金額「' + r.priceRaw + '」は読めませんでした。0以上の整数で入れてください(例: 1500)。');
      }
      if (chars(r.name) > LIMITS.name) out.push(n + '行目の品名が' + chars(r.name) + '字あります。' + LIMITS.name + '字までにしてください。');
      if (chars(r.note) > LIMITS.note) out.push(n + '行目の補足が' + chars(r.note) + '字あります。' + LIMITS.note + '字までにしてください。');
      if (r.price !== null && r.price !== '' && String(r.price).length > LIMITS.price) {
        out.push(n + '行目の金額が' + String(r.price).length + '桁あります。' + LIMITS.price + '桁までにしてください。');
      }
    }
    return out;
  }

  var api = {
    LAYOUT: LAYOUT,
    SLOTS: SLOTS,
    ROWS: ROWS,
    COPIES: COPIES,
    TAX: TAX,
    GUIDES: GUIDES,
    LIMITS: LIMITS,
    buildSheet: buildSheet,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Nefuda = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
