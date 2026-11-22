/*
 * 名刺(/meishi)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * meishi.js(画面)と tests/meishi.test.js の両方から使う。
 *
 * 紙面: 91×55mm の名刺を A4 縦に 2列×5段=10枚、すき間なしで並べる。
 *       紙の端からの余白は 上下11mm・左右14mm(210-91×2=28 → 左右14 / 297-55×5=22 → 上下11)。
 *       10枚とも同じ中身。
 *
 * ここに置いた「判断」は次の4つだけ。
 *   1. 空けた欄は紙に出さない(「TEL」などの見出しだけが残らない)
 *   2. 郵便番号は、頭に「〒」が無ければ付ける。全角の数字とハイフンは半角にする。形は確かめない
 *   3. 切り取り線は「つける(普通紙をはさみで切る)」「つけない(ミシン目の用紙)」の2つ
 *   4. 文字数の上限を超えたら知らせるだけ(切り詰めない)
 *
 * 電話番号・メールアドレス・URL が正しいかは確かめない。
 *
 * ブラウザでは window.Meishi、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  /** 1枚の紙に並べる枚数と寸法(mm)。 */
  var LAYOUT = { cols: 2, rows: 5, cardW: 91, cardH: 55, marginTop: 11, marginLeft: 14 };
  var COUNT = LAYOUT.cols * LAYOUT.rows;

  /** 切り取り線。'on' は線を引く、'off' は引かない。 */
  var GUIDES = ['on', 'off'];

  /*
   * 文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 名刺1枚の枠は固定なので、超えると文字が枠からはみ出して切れる(ページは増えない)。
   * 2026-11-23、全角で詰めた最悪の入力を A4 の PDF に出して測った(Chromium・Playwright):
   *   はじめの上限(郵便番号10字・住所1行目24字・メール/URL 40字)では住所と URL が折り返し、
   *   最下行が枠の下端すれすれになった → ここまで下げると全行1行に収まり、
   *   10枚とも枠からのはみ出し0・最下行は枠の下端から約4.5mm上・A4 1ページ。
   */
  var LIMITS = {
    company: 20, catchcopy: 28, role: 20, name: 10, kana: 24,
    zip: 8, addr1: 22, addr2: 28, tel: 24, email: 36, web: 36
  };

  var FIELDS = ['company', 'catchcopy', 'role', 'name', 'kana', 'zip', 'addr1', 'addr2', 'tel', 'email', 'web'];

  var LABELS = {
    company: '屋号・会社名', catchcopy: '仕事の内容', role: '肩書', name: '氏名', kana: 'ふりがな・ローマ字',
    zip: '郵便番号', addr1: '住所1行目', addr2: '住所2行目', tel: '電話番号', email: 'メールアドレス', web: 'URL'
  };

  function trimmed(v) { return String(v == null ? '' : v).trim(); }
  function chars(s) { return Array.from(s).length; }

  /** 郵便番号: 全角の数字とハイフンを半角にし、頭に「〒」が無ければ付ける。空は空のまま。 */
  function formatZip(v) {
    var s = trimmed(v)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[－ー−‐]/g, '-');
    if (s === '') return '';
    s = s.replace(/^〒\s*/, '');
    return '〒' + s;
  }

  /**
   * 名刺1枚ぶんの中身を組み立てる。10枚とも同じなので1枚だけ返す。
   *
   * input: { company, catchcopy, role, name, kana, zip, addr1, addr2, tel, email, web, guides }
   * 戻り値の contact は、入れた欄だけを上から並べたもの(見出しつき)。
   */
  function buildCard(input) {
    input = input || {};
    var v = {};
    FIELDS.forEach(function (k) { v[k] = trimmed(input[k]); });

    var address = [];
    var zip = formatZip(v.zip);
    var line1 = [zip, v.addr1].filter(Boolean).join(' ');
    if (line1) address.push(line1);
    if (v.addr2) address.push(v.addr2);

    var contact = [];
    if (v.tel) contact.push({ label: 'TEL', text: v.tel });
    if (v.email) contact.push({ label: 'Mail', text: v.email });
    if (v.web) contact.push({ label: 'URL', text: v.web });

    return {
      company: v.company,
      catchcopy: v.catchcopy,
      role: v.role,
      name: v.name,
      kana: v.kana,
      address: address,
      contact: contact,
      guides: GUIDES.indexOf(input.guides) >= 0 ? input.guides : 'on'
    };
  }

  /** 印刷する前に知らせること。「どの欄が足りないか・長すぎるか」だけを言う。 */
  function findProblems(input) {
    input = input || {};
    var out = [];
    if (!trimmed(input.name)) out.push('氏名が入っていません。');
    if (!trimmed(input.tel) && !trimmed(input.email) && !trimmed(input.web)) {
      out.push('電話番号・メールアドレス・URL のどれも入っていません。受け取った人が連絡できません。');
    }
    if (!trimmed(input.addr1) && trimmed(input.addr2)) out.push('住所の2行目だけが入っています。1行目から入れてください。');
    FIELDS.forEach(function (k) {
      var s = trimmed(input[k]);
      if (chars(s) > LIMITS[k]) {
        out.push(LABELS[k] + 'が' + chars(s) + '字あります。' + LIMITS[k] + '字を超えると名刺の枠からはみ出します。');
      }
    });
    return out;
  }

  var api = {
    LAYOUT: LAYOUT,
    COUNT: COUNT,
    GUIDES: GUIDES,
    LIMITS: LIMITS,
    FIELDS: FIELDS,
    formatZip: formatZip,
    buildCard: buildCard,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Meishi = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
