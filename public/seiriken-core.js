/*
 * 整理券(/seiriken)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * seiriken.js(画面)と tests/seiriken.test.js の両方から使う。
 *
 * ここに置いた「判断」は次の4つだけ。
 *   1. 番号は「始めの番号」から1ずつ増やす。枚数は1〜90枚(A4 5ページ)まで
 *   2. 番号の桁は「そのまま」か「3桁にそろえる(001)」の2つだけ
 *   3. 1ページに18枚(64×46mm を 3列×6段)。最後のページの余りの枠は空けたまま(線も引かない)
 *   4. 文字は切り詰めない。上限を超えたら警告だけ出す
 *
 * 何人まで配ってよいか・先着順や抽選の決め方・転売の禁止などの決まりは扱わない。
 *
 * ブラウザでは window.Seiriken、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  /** 64×46mm を 3列×6段。余白は 上下10.5mm・左右9mm(seiriken.css と同じ値)。値札と同じ割り付け。 */
  var LAYOUT = { cols: 3, rows: 6, tagW: 64, tagH: 46, marginTop: 10.5, marginLeft: 9 };
  var PER_PAGE = LAYOUT.cols * LAYOUT.rows;
  var MAX_PAGES = 5;
  var MAX_COUNT = PER_PAGE * MAX_PAGES;
  var MAX_NUMBER = 9999;

  var PAD = ['none', '3'];
  var GUIDES = ['on', 'off'];

  /*
   * 文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 2026-11-26、A4 の PDF に出して測った値(全角で詰めた最悪の入力で、18枚とも枠の中・1ページに1面)。
   */
  var LIMITS = { title: 6, shop: 14, event: 18, note: 22 };

  function trimmed(v) { return String(v == null ? '' : v).trim(); }
  function chars(s) { return Array.from(s).length; }

  /** 全角数字も読む。0以上の整数だけを返し、読めなければ null、空なら ''。 */
  function parseInt0(raw) {
    var s = trimmed(raw).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    if (s === '') return '';
    if (!/^\d+$/.test(s)) return null;
    return Number(s);
  }

  function formatNumber(n, pad) {
    var s = String(n);
    if (pad === '3') while (s.length < 3) s = '0' + s;
    return s;
  }

  function settings(input) {
    input = input || {};
    var start = parseInt0(input.start);
    var count = parseInt0(input.count);
    return {
      title: trimmed(input.title),
      shop: trimmed(input.shop),
      event: trimmed(input.event),
      note: trimmed(input.note),
      startRaw: trimmed(input.start),
      countRaw: trimmed(input.count),
      start: start,
      count: count,
      pad: PAD.indexOf(input.pad) >= 0 ? input.pad : 'none',
      guides: GUIDES.indexOf(input.guides) >= 0 ? input.guides : 'on'
    };
  }

  /**
   * 整理券を並べる。
   * input: { title, shop, event, note, start, count, pad, guides }
   * 返り値: { pages: [[{ title, shop, event, note, number }…(最大18)]…], guides, count: 実際に並べた枚数 }
   * 始めの番号か枚数が読めないときは pages は空。
   */
  function buildSheet(input) {
    var s = settings(input);
    var pages = [];
    var ok = typeof s.start === 'number' && typeof s.count === 'number' && s.count >= 1;
    var n = 0;
    if (ok) {
      var count = Math.min(s.count, MAX_COUNT);
      for (var i = 0; i < count; i++) {
        var num = s.start + i;
        if (num > MAX_NUMBER) break;
        if (i % PER_PAGE === 0) pages.push([]);
        pages[pages.length - 1].push({
          title: s.title || '整理券',
          shop: s.shop,
          event: s.event,
          note: s.note,
          number: formatNumber(num, s.pad)
        });
        n++;
      }
    }
    return { pages: pages, guides: s.guides, count: n };
  }

  /** 印刷する前に知らせること。「どの欄が足りないか」だけを言う。 */
  function findProblems(input, built) {
    var s = settings(input);
    built = built || buildSheet(input);
    var out = [];
    if (s.startRaw === '') out.push('始めの番号が入っていません。');
    else if (s.start === null) out.push('始めの番号「' + s.startRaw + '」は読めませんでした。0以上の整数で入れてください(例: 1)。');
    if (s.countRaw === '') out.push('枚数が入っていません。');
    else if (s.count === null) out.push('枚数「' + s.countRaw + '」は読めませんでした。1以上の整数で入れてください(例: 50)。');
    else if (s.count === 0) out.push('枚数は1枚以上にしてください。');
    else if (s.count > MAX_COUNT) out.push('枚数は' + MAX_COUNT + '枚(A4 ' + MAX_PAGES + 'ページ)までです。あとの' + (s.count - MAX_COUNT) + '枚は紙に出ません。始めの番号を変えて2回に分けて刷ってください。');
    if (typeof s.start === 'number' && typeof s.count === 'number' && s.count >= 1 && s.start + Math.min(s.count, MAX_COUNT) - 1 > MAX_NUMBER) {
      out.push('番号は' + MAX_NUMBER + 'までです。' + MAX_NUMBER + 'を超える分は紙に出ません。');
    }
    if (!s.shop) out.push('店名・催しの名前が入っていません。空けたまま刷ると、その行は出ません。');
    if (chars(s.title) > LIMITS.title) out.push('見出しが' + chars(s.title) + '字あります。' + LIMITS.title + '字までにしてください。');
    if (chars(s.shop) > LIMITS.shop) out.push('店名・催しの名前が' + chars(s.shop) + '字あります。' + LIMITS.shop + '字までにしてください。');
    if (chars(s.event) > LIMITS.event) out.push('日付・用件が' + chars(s.event) + '字あります。' + LIMITS.event + '字までにしてください。');
    if (chars(s.note) > LIMITS.note) out.push('ひとことが' + chars(s.note) + '字あります。' + LIMITS.note + '字までにしてください。');
    return out;
  }

  var api = {
    LAYOUT: LAYOUT,
    PER_PAGE: PER_PAGE,
    MAX_PAGES: MAX_PAGES,
    MAX_COUNT: MAX_COUNT,
    MAX_NUMBER: MAX_NUMBER,
    PAD: PAD,
    GUIDES: GUIDES,
    LIMITS: LIMITS,
    parseInt0: parseInt0,
    formatNumber: formatNumber,
    buildSheet: buildSheet,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Seiriken = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
