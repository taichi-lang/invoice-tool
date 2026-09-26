/*
 * 封筒の宛名(/atena)の組み立て。画面にも DOM にも触らない純粋関数だけを置く。
 *
 * ここを画面(atena.js)から分けてあるのは、敬称の付け方と数字の書き換えを
 * node のテストで直接確かめるためである。宛名の誤りは封をしてからでは直せない。
 *
 * ブラウザでは window.Atena、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  /** 朱書き(「請求書在中」など)の選択肢。空文字は「書かない」。 */
  var ENCLOSURES = ['', '請求書在中', '見積書在中', '納品書在中', '領収書在中', '書類在中'];

  var KANJI_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  /* 縦書きの住所でハイフンとして使われうる字。どれも縦書きで横棒のまま出るので、
     縦書きで縦棒になる長音符「ー」にそろえる。 */
  var HYPHENS = /[-‐‑‒–—―−－ｰ]/g;

  /** 全角の数字を半角にそろえる。 */
  function toHalfDigits(s) {
    return String(s == null ? '' : s).replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
  }

  /**
   * 縦書き用に、住所の算用数字を漢数字に、ハイフンを「ー」に書き換える。
   * 「1-2-3」は「一ー二ー三」になる。「12」は「一二」(位取りの「十」は使わない)。
   * 位取りをしないのは、番地や部屋番号で「十二」と「一二」の読み違いが起きないようにするためである。
   */
  function toVerticalNumerals(s) {
    return toHalfDigits(s)
      .replace(/[0-9]/g, function (d) { return KANJI_DIGITS[Number(d)]; })
      .replace(HYPHENS, 'ー');
  }

  /**
   * 郵便番号を「123-4567」の形にする。7桁の数字として読めなければ空文字を返す。
   * 読めないものを推測で整形すると、別の地域の番号を紙に刷ることになる。
   */
  function formatZip(s) {
    var digits = toHalfDigits(s).replace(/[〒\s\-‐‑‒–—―−－ｰ]/g, '');
    if (!/^[0-9]{7}$/.test(digits)) return '';
    return digits.slice(0, 3) + '-' + digits.slice(3);
  }

  /** 入力の末尾に利用者が自分で付けた敬称を外す(二重に付けないため)。 */
  function stripHonorific(s) {
    return String(s == null ? '' : s).trim().replace(/[\s　]*(御中|様|殿|さま)$/, '').trim();
  }

  function lines(s) {
    return String(s == null ? '' : s).split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l !== ''; });
  }

  /**
   * 宛名の表面と裏面の中身を組み立てる。
   *
   * 敬称の決まり(ここがこのツールの中心である):
   *   ・担当者名があれば、担当者に「様」を付け、会社名・部署には何も付けない
   *   ・担当者名が無ければ、いちばん最後の行(部署があれば部署、無ければ会社名)に「御中」を付ける
   *   ・「御中」と「様」は同時に出さない
   */
  function buildEnvelope(input) {
    var i = input || {};
    var kanji = i.kanji !== false;
    var conv = function (s) { return kanji ? toVerticalNumerals(s) : toHalfDigits(s).replace(HYPHENS, 'ー'); };

    var company = stripHonorific(i.company);
    var dept = stripHonorific(i.dept);
    var person = stripHonorific(i.person);

    var recipient = [];
    if (person) {
      if (company) recipient.push({ role: 'company', text: company });
      if (dept) recipient.push({ role: 'dept', text: dept });
      recipient.push({ role: 'person', text: person + '　様' });
    } else {
      if (company) recipient.push({ role: 'company', text: company });
      if (dept) recipient.push({ role: 'dept', text: dept });
      if (recipient.length) {
        var last = recipient[recipient.length - 1];
        last.text = last.text + '　御中';
        last.role = last.role + ' honor';
      }
    }

    var enclosure = ENCLOSURES.indexOf(i.enclosure) >= 0 ? i.enclosure : '';

    return {
      zip: formatZip(i.zip),
      zipRaw: String(i.zip == null ? '' : i.zip).trim(),
      address: lines(i.address).map(conv),
      recipient: recipient,
      enclosure: enclosure,
      from: {
        zip: formatZip(i.fromZip),
        zipRaw: String(i.fromZip == null ? '' : i.fromZip).trim(),
        address: lines(i.fromAddress).map(conv),
        name: String(i.fromName == null ? '' : i.fromName).trim()
      }
    };
  }

  /** 紙に出す前に知らせるべき空欄と誤り。 */
  function findProblems(env) {
    var out = [];
    if (!env.recipient.length) out.push('宛先の会社名か氏名');
    if (!env.address.length) out.push('宛先の住所');
    if (!env.zip) out.push(env.zipRaw ? '宛先の郵便番号(7桁で読めません)' : '宛先の郵便番号');
    if (!env.from.name) out.push('差出人の名前');
    if (!env.from.address.length) out.push('差出人の住所');
    if (env.from.zipRaw && !env.from.zip) out.push('差出人の郵便番号(7桁で読めません)');
    return out;
  }

  var api = {
    ENCLOSURES: ENCLOSURES,
    toVerticalNumerals: toVerticalNumerals,
    formatZip: formatZip,
    stripHonorific: stripHonorific,
    buildEnvelope: buildEnvelope,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Atena = api;
})(this);
