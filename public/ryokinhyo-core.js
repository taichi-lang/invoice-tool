/*
 * 料金表(/ryokinhyo)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * ryokinhyo.js(画面)と tests/ryokinhyo.test.js の両方から使う。
 *
 * ここに置いた「判断」は次の4つだけ。
 *   1. 金額は 0 以上の整数として読み、「3,000円」の形で出す(全角数字・カンマ・円・¥ は読み飛ばす)
 *   2. 小数・マイナス・数字以外が混じった金額は読まない(空欄として出し、警告する。勝手に丸めない)
 *   3. 品名も金額も空の行は、紙に出さない
 *   4. 税の書き添えは「表示はすべて税込です」を出すか出さないかの2つだけ
 *
 * 消費税の計算はしない。入れた金額が税込かどうか・その値段で売ってよいかは確かめない。
 *
 * ブラウザでは window.Ryokinhyo、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  /** 見出しの決まった言葉。'custom' を選ぶと、自分で書いた見出しを出す。 */
  var TITLES = ['料金表', '料金のご案内', 'メニュー', '価格表'];
  var CUSTOM = 'custom';

  /** 税の書き添え。'incl' は1行出す、'none' は何も出さない。 */
  var TAX_NOTES = { incl: '表示はすべて税込価格です', none: '' };

  /** 品目の行の数。 */
  var ROWS = 12;

  /*
   * 文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 2026-11-22、A4 の PDF に出して測った(全角で詰めた最悪の入力):
   *   見出し12字・12行とも品名14字+補足8字+金額7桁・ひとこと60字・店の名前20字・連絡先40字
   *   → A4 1枚に収まり、最下行の文字は紙の下端から約47mm上。
   *     品名18字・補足12字・金額9桁では行が折り返して2ページになったため、上限をここまで下げた
   */
  var LIMITS = { title: 12, name: 14, note: 8, price: 7, message: 60, shop: 20, contact: 40 };

  function trimmed(v) { return String(v == null ? '' : v).trim(); }
  function chars(s) { return Array.from(s).length; }

  /** 全角の数字・記号を半角に。半角はそのまま。 */
  function toHalf(s) {
    return s.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[，、]/g, ',').replace(/[￥]/g, '¥').replace(/[．]/g, '.').replace(/[－ー−]/g, '-');
  }

  /**
   * 金額を読む。空は ''、読めないものは null、読めたら 0 以上の整数。
   * 「3,000」「3000円」「¥3,000」「３０００」を読む。「1.5」「-100」「3千」は読まない。
   */
  function parsePrice(v) {
    var s = toHalf(trimmed(v)).replace(/\s/g, '');
    if (s === '') return '';
    s = s.replace(/^¥/, '').replace(/円$/, '');
    if (!/^\d{1,3}(,\d{3})*$|^\d+$/.test(s)) return null;
    var n = Number(s.replace(/,/g, ''));
    if (!Number.isSafeInteger(n)) return null;
    return n;
  }

  /** 3000 → 「3,000円」。'' と null は空文字。 */
  function formatPrice(n) {
    if (n === '' || n === null || n === undefined) return '';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円';
  }

  /** n 行目(1始まり)の入力を読む。 */
  function readRow(input, n) {
    var raw = trimmed(input['price' + n]);
    return {
      n: n,
      name: trimmed(input['name' + n]),
      note: trimmed(input['note' + n]),
      priceRaw: raw,
      price: parsePrice(raw)
    };
  }

  /**
   * 料金表を組み立てる。
   *
   * input: { titlePreset, titleCustom, taxNote, name1, note1, price1, …(12行目まで), message, shop, contact }
   */
  function buildSheet(input) {
    input = input || {};
    var title;
    if (input.titlePreset === CUSTOM) title = trimmed(input.titleCustom);
    else title = TITLES.indexOf(input.titlePreset) >= 0 ? input.titlePreset : TITLES[0];

    var rows = [];
    for (var n = 1; n <= ROWS; n++) {
      var r = readRow(input, n);
      if (!r.name && r.priceRaw === '') continue;
      rows.push({ n: n, name: r.name, note: r.note, priceText: formatPrice(r.price) });
    }

    var taxKey = Object.prototype.hasOwnProperty.call(TAX_NOTES, input.taxNote) ? input.taxNote : 'incl';

    return {
      title: title,
      taxNote: TAX_NOTES[taxKey],
      rows: rows,
      message: trimmed(input.message),
      shop: trimmed(input.shop),
      contact: trimmed(input.contact)
    };
  }

  /** 印刷する前に知らせること。「どの欄が足りないか」だけを言う。 */
  function findProblems(input, built) {
    input = input || {};
    built = built || buildSheet(input);
    var out = [];
    if (!built.title) out.push('見出しが入っていません。「自分で書く」を選んだときは、見出しを入れてください。');
    if (chars(built.title) > LIMITS.title) {
      out.push('見出しが' + chars(built.title) + '字あります。' + LIMITS.title + '字を超えると2行になります。');
    }
    if (built.rows.length === 0) out.push('品名と金額が1つも入っていません。');

    for (var n = 1; n <= ROWS; n++) {
      var r = readRow(input, n);
      if (!r.name && r.priceRaw === '') {
        if (r.note) out.push(n + '行目は補足だけが入っています。品名の無い行は紙に出ません。');
        continue;
      }
      if (!r.name) out.push(n + '行目の品名が入っていません。');
      if (r.priceRaw === '') out.push(n + '行目の金額が入っていません。空けたまま刷ると、金額の欄は空白になります。');
      else if (r.price === null) {
        out.push(n + '行目の金額「' + r.priceRaw + '」は読めませんでした。0以上の整数で入れてください(例: 3000)。');
      }
      if (chars(r.name) > LIMITS.name) out.push(n + '行目の品名が' + chars(r.name) + '字あります。' + LIMITS.name + '字までにしてください。');
      if (chars(r.note) > LIMITS.note) out.push(n + '行目の補足が' + chars(r.note) + '字あります。' + LIMITS.note + '字までにしてください。');
      if (r.price !== null && r.price !== '' && String(r.price).length > LIMITS.price) {
        out.push(n + '行目の金額が' + String(r.price).length + '桁あります。' + LIMITS.price + '桁までにしてください。');
      }
    }

    if (!built.shop) out.push('店や事務所の名前が入っていません。');

    ['message', 'shop', 'contact'].forEach(function (k) {
      var label = { message: 'ひとこと', shop: '店や事務所の名前', contact: '連絡先' }[k];
      if (chars(built[k]) > LIMITS[k]) {
        out.push(label + 'が' + chars(built[k]) + '字あります。' + LIMITS[k] + '字までにしてください。');
      }
    });
    return out;
  }

  var api = {
    TITLES: TITLES,
    CUSTOM: CUSTOM,
    TAX_NOTES: TAX_NOTES,
    ROWS: ROWS,
    LIMITS: LIMITS,
    parsePrice: parsePrice,
    formatPrice: formatPrice,
    buildSheet: buildSheet,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Ryokinhyo = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
