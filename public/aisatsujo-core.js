/*
 * 開業挨拶状(/aisatsujo)の文面の組み立て。画面にも DOM にも触らない純粋関数だけを置く。
 *
 * 画面(aisatsujo.js)から分けてあるのは、時候の挨拶・和暦・句読点の有無を
 * node のテストで直接確かめるためである。はがきは刷ってしまうと直せない。
 *
 * ブラウザでは window.Aisatsujo、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  /*
   * 時候の挨拶(「〇〇の候」の〇〇)。差出日の月で1つに決める。
   * 挨拶状でよく使われる漢語調のものを、各月1つだけ選んである。選ばせないのは、
   * 月と合わない季語(10月に「盛夏」)を刷る誤りを、選択肢ごと無くすためである。
   */
  var SEASONS = {
    1: '新春', 2: '立春', 3: '早春', 4: '陽春', 5: '新緑', 6: '初夏',
    7: '盛夏', 8: '晩夏', 9: '初秋', 10: '秋冷', 11: '晩秋', 12: '師走'
  };

  var KANJI_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var HYPHENS = /[-‐‑‒–—―−－ｰ]/g;

  function str(s) { return String(s == null ? '' : s).trim(); }

  function toHalfDigits(s) {
    return String(s == null ? '' : s).replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
  }

  /**
   * 1〜99 を位取りの漢数字にする(10 → 十、21 → 二十一)。日付と年に使う。
   * 範囲外は空文字を返す。読めないものを推測で書かない。
   */
  function toKanjiNumber(n) {
    n = Number(n);
    if (!Number.isInteger(n) || n < 1 || n > 99) return '';
    var tens = Math.floor(n / 10);
    var ones = n % 10;
    var out = '';
    if (tens) out += (tens === 1 ? '' : KANJI_DIGITS[tens]) + '十';
    if (ones) out += KANJI_DIGITS[ones];
    return out;
  }

  /**
   * 番地・電話番号の数字を1字ずつ漢数字にする(12 → 一二)。
   * 番号は数量ではないので位取りしない(/atena と同じ規則)。
   */
  function toVerticalNumerals(s) {
    return toHalfDigits(s)
      .replace(/[0-9]/g, function (d) { return KANJI_DIGITS[Number(d)]; })
      .replace(HYPHENS, 'ー');
  }

  function formatZip(s) {
    var digits = toHalfDigits(s).replace(/[〒\s\-‐‑‒–—―−－ｰ]/g, '');
    if (!/^[0-9]{7}$/.test(digits)) return '';
    return digits.slice(0, 3) + '-' + digits.slice(3);
  }

  /** 'YYYY-MM-DD' を読む。暦に無い日付は null(勝手に今日にしない)。 */
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(s));
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }

  /**
   * 和暦(令和)の年を漢数字で。令和元年は 2019-05-01 から。
   * それより前の日付は開業挨拶状の差出日としてありえないので、空文字を返して警告に回す。
   */
  function reiwaYear(date) {
    if (!date) return '';
    if (date.y < 2019 || (date.y === 2019 && date.m < 5)) return '';
    var n = date.y - 2018;
    return '令和' + (n === 1 ? '元' : toKanjiNumber(n)) + '年';
  }

  /** 開業日を「令和八年十月一日」の形に。 */
  function formatOpenDate(s) {
    var d = parseDate(s);
    var y = reiwaYear(d);
    if (!y) return '';
    return y + toKanjiNumber(d.m) + '月' + toKanjiNumber(d.d) + '日';
  }

  /** 差出日を「令和八年十月」の形に(挨拶状の日付は日を入れず月までにする)。 */
  function formatLetterMonth(s) {
    var d = parseDate(s);
    var y = reiwaYear(d);
    if (!y) return '';
    return y + toKanjiNumber(d.m) + '月';
  }

  function seasonFor(s) {
    var d = parseDate(s);
    return d ? SEASONS[d.m] : '';
  }

  /**
   * 文面を組み立てる。
   *
   * 句読点について: 挨拶状は句読点を打たず、区切りを字間の空白で示す書き方が慣例として広く使われている。
   * 既定は「打たない」。punctuation: true のときだけ「、」「。」を入れる。
   * 文はすべて「区切り(clause)の配列」で持ち、最後にどちらかの形で継ぐ。
   */
  function buildLetter(input) {
    var i = input || {};
    var kind = i.kind === 'independent' ? 'independent' : 'new';
    var punct = i.punctuation === true;
    var num = i.kanji !== false ? toVerticalNumerals : function (s) { return toHalfDigits(s).replace(HYPHENS, 'ー'); };

    var shopName = str(i.shopName);
    var business = str(i.business);
    var formerEmployer = str(i.formerEmployer);
    var openDate = formatOpenDate(i.openDate);
    var season = seasonFor(i.letterDate);

    var join = function (clauses) {
      var cs = clauses.filter(function (c) { return c; });
      return punct ? cs.join('、') + '。' : cs.join('　');
    };

    var body = [];

    body.push(join([
      '拝啓　' + (season || '〇〇') + 'の候',
      '皆様にはますますご清祥のこととお慶び申し上げます'
    ]));

    if (kind === 'independent') {
      body.push(join([
        'さて　私こと',
        'このたび' + (formerEmployer ? formerEmployer + 'を退職し' : '勤務先を退職し'),
        (openDate || '〇〇') + 'をもちまして' + (shopName || '〇〇') + 'を開業いたしました'
      ]));
      body.push(join([
        '在職中は公私にわたり格別のご厚情を賜り',
        '心より御礼申し上げます'
      ]));
    } else {
      body.push(join([
        'さて　私こと',
        (openDate || '〇〇') + 'をもちまして' + (shopName || '〇〇') + 'を開業いたしました'
      ]));
    }

    if (business) {
      body.push(join([
        '今後は' + business + 'を通じて',
        '皆様のお役に立てるよう誠心誠意努めてまいる所存でございます'
      ]));
    } else {
      body.push(join(['皆様のお役に立てるよう誠心誠意努めてまいる所存でございます']));
    }

    body.push(join([
      'なにとぞ一層のご指導ご鞭撻を賜りますよう',
      'よろしくお願い申し上げます'
    ]));
    body.push(join(['まずは略儀ながら書中をもちまして開業のご挨拶を申し上げます']));

    var zip = formatZip(i.zip);
    var addressLines = String(i.address == null ? '' : i.address).split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l !== ''; })
      .map(num);
    var tel = str(i.tel);

    return {
      kind: kind,
      body: body,
      closing: '敬具',
      date: formatLetterMonth(i.letterDate),
      shopName: shopName,
      representative: [str(i.title), str(i.name)].filter(function (s) { return s; }).join('　'),
      zip: zip,
      zipRaw: str(i.zip),
      address: addressLines,
      tel: tel ? '電話　' + num(tel) : '',
      email: str(i.email),
      openDateText: openDate,
      season: season
    };
  }

  /** 紙に出す前に知らせるべき空欄と誤り。 */
  function findProblems(letter, input) {
    var i = input || {};
    var out = [];
    if (!letter.shopName) out.push('屋号・会社名');
    if (!letter.openDateText) out.push(str(i.openDate) ? '開業日(令和の日付として読めません)' : '開業日');
    if (!letter.date) out.push(str(i.letterDate) ? '差出日(令和の日付として読めません)' : '差出日');
    if (!letter.representative) out.push('代表者名');
    if (!letter.address.length) out.push('住所');
    if (letter.zipRaw && !letter.zip) out.push('郵便番号(7桁で読めません)');
    return out;
  }

  var api = {
    SEASONS: SEASONS,
    toKanjiNumber: toKanjiNumber,
    toVerticalNumerals: toVerticalNumerals,
    formatZip: formatZip,
    parseDate: parseDate,
    formatOpenDate: formatOpenDate,
    formatLetterMonth: formatLetterMonth,
    seasonFor: seasonFor,
    buildLetter: buildLetter,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Aisatsujo = api;
})(this);
