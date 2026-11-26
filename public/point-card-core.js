/*
 * ポイントカード(/point-card)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * point-card.js(画面)と tests/point-card.test.js の両方から使う。
 *
 * 紙面: 91×55mm(名刺と同じ大きさ)のカードを A4 縦に 2列×5段=10枚、すき間なしで並べる。
 *       紙の端からの余白は 上下11mm・左右14mm(/meishi と同じ値)。10枚とも同じ中身。
 *
 * ここに置いた「判断」は次の5つだけ。
 *   1. スタンプの数は 5・10・15・20 の4つ。マスの並べ方と大きさは数ごとに決めた表(GRID)で持つ
 *   2. マスには 1 から順に小さな番号を振り、最後のマスだけ枠を太くする(特典まであと何個か分かる)
 *   3. 「お名前」「有効期限」の欄は つける/つけない。つけると手書きの下線だけを出す
 *   4. 空けた欄は紙に出さない。カード名が空なら「ポイントカード」
 *   5. 文字数の上限を超えたら知らせるだけ(切り詰めない)
 *
 * 特典の中身が景品表示法などの決まりに触れるかは判断しない。
 *
 * ブラウザでは window.PointCard、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  /** 1枚の紙に並べる枚数と寸法(mm)。/meishi と同じ。 */
  var LAYOUT = { cols: 2, rows: 5, cardW: 91, cardH: 55, marginTop: 11, marginLeft: 14 };
  var COUNT = LAYOUT.cols * LAYOUT.rows;

  /*
   * スタンプの数ごとのマスの並べ方(cell はマス1つの一辺 mm、マスどうしのすき間は 1mm)。
   * カードの内側の幅は 91 - 左右6mm×2 = 79mm。20個は 10列 × 6.8mm + すき間9mm = 77mm で幅に収める。
   */
  var GRID = {
    5: { cols: 5, rows: 1, cell: 10 },
    10: { cols: 5, rows: 2, cell: 9 },
    15: { cols: 5, rows: 3, cell: 7.5 },
    20: { cols: 10, rows: 2, cell: 6.8 }
  };
  var STAMPS = [5, 10, 15, 20];
  var ONOFF = ['on', 'off'];

  /*
   * 文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * カード1枚の枠は固定なので、超えると文字が枠からはみ出して切れる(ページは増えない)。
   * 値は 2026-11-27、全角で詰めた最悪の入力を A4 の PDF に出して測って決めた(日報参照)。
   */
  var LIMITS = { title: 10, shop: 16, reward: 26, info1: 30, info2: 30 };

  var FIELDS = ['title', 'shop', 'reward', 'info1', 'info2'];
  var OPTIONS = ['stamps', 'name', 'expiry', 'guides'];

  var LABELS = {
    title: 'カード名', shop: '店名', reward: '特典', info1: '下の1行目', info2: '下の2行目'
  };

  var DEFAULT_TITLE = 'ポイントカード';

  function trimmed(v) { return String(v == null ? '' : v).trim(); }
  function chars(s) { return Array.from(s).length; }
  function pick(v, list, fallback) {
    for (var i = 0; i < list.length; i++) if (String(list[i]) === String(v)) return list[i];
    return fallback;
  }

  /**
   * カード1枚ぶんの中身を組み立てる。10枚とも同じなので1枚だけ返す。
   *
   * input: { title, shop, reward, info1, info2, stamps, name, expiry, guides }
   */
  function buildCard(input) {
    input = input || {};
    var v = {};
    FIELDS.forEach(function (k) { v[k] = trimmed(input[k]); });

    var stamps = pick(input.stamps, STAMPS, 10);
    var cells = [];
    for (var i = 1; i <= stamps; i++) cells.push({ no: i, goal: i === stamps });

    var info = [v.info1, v.info2].filter(Boolean);

    return {
      title: v.title || DEFAULT_TITLE,
      shop: v.shop,
      reward: v.reward,
      info: info,
      stamps: stamps,
      grid: GRID[stamps],
      cells: cells,
      name: pick(input.name, ONOFF, 'on') === 'on',
      expiry: pick(input.expiry, ONOFF, 'off') === 'on',
      guides: pick(input.guides, ONOFF, 'on')
    };
  }

  /** 印刷する前に知らせること。「どの欄が足りないか・長すぎるか」だけを言う。 */
  function findProblems(input) {
    input = input || {};
    var out = [];
    if (!trimmed(input.shop)) out.push('店名が入っていません。どの店のカードか分かりません。');
    if (!trimmed(input.info1) && trimmed(input.info2)) out.push('下の2行目だけが入っています。1行目から入れてください。');
    FIELDS.forEach(function (k) {
      var s = trimmed(input[k]);
      if (chars(s) > LIMITS[k]) {
        out.push(LABELS[k] + 'が' + chars(s) + '字あります。' + LIMITS[k] + '字を超えるとカードの枠からはみ出します。');
      }
    });
    return out;
  }

  var api = {
    LAYOUT: LAYOUT,
    COUNT: COUNT,
    GRID: GRID,
    STAMPS: STAMPS,
    ONOFF: ONOFF,
    LIMITS: LIMITS,
    FIELDS: FIELDS,
    OPTIONS: OPTIONS,
    DEFAULT_TITLE: DEFAULT_TITLE,
    buildCard: buildCard,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.PointCard = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
