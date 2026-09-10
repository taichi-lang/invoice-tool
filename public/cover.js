/*
 * 送付状(書類送付のご案内)の文面を組み立てる純粋関数。
 * 画面もブラウザAPIも触らない。soufujo.js(画面)と tests/cover.test.js の両方から使う。
 *
 * ここに置いた「判断」は次の3つ。文面の見た目ではなく、間違えると恥をかく箇所だけを扱う。
 *   1. 頭語と結語の対応(拝啓→敬具 / 前略→草々)。片方だけ変えると対にならない
 *   2. 前略のときは時候の挨拶を書かない。「前略」は前置きを省くという意味の語であり、
 *      そのあとに時候の挨拶を続けるのは矛盾する
 *   3. 記書き(記〜以上)は、同封物が1つ以上あるときだけ出す。中身が無い「記」は出さない
 */
'use strict';

(function (root) {

  /* 頭語と結語の対応。ここが唯一の対応表で、画面側で別に持たない。 */
  var SALUTATIONS = {
    haikei: { opening: '拝啓', closing: '敬具', withGreeting: true },
    zenryaku: { opening: '前略', closing: '草々', withGreeting: false },
    none: { opening: '', closing: '', withGreeting: true }
  };

  /* 時候の挨拶(漢語調)。月を跨いで使い回されるので、月番号だけで引く。 */
  var GREETINGS = {
    1: '厳寒の候', 2: '余寒の候', 3: '早春の候', 4: '陽春の候',
    5: '新緑の候', 6: '梅雨の候', 7: '盛夏の候', 8: '残暑の候',
    9: '初秋の候', 10: '仲秋の候', 11: '晩秋の候', 12: '師走の候'
  };

  /*
   * 用途ごとのひな形。
   * 主文は「何を送ったか」と「相手に何をしてほしいか」の2文で閉じる。
   * 送っただけで用件を書かない送付状は、受け取った側が次に何をすればよいか分からない。
   */
  var PRESETS = {
    invoice: {
      label: '請求書を送る',
      body: 'さて、このたびは下記のとおり請求書をお送りいたします。\nご査収のうえ、お手続きくださいますようお願い申し上げます。',
      items: [{ name: '請求書', count: 1 }]
    },
    estimate: {
      label: '見積書を送る',
      body: 'さて、ご依頼いただきました件につきまして、下記のとおりお見積書をお送りいたします。\nご検討のうえ、ご不明な点がございましたらお申し付けください。',
      items: [{ name: '見積書', count: 1 }]
    },
    delivery: {
      label: '納品書を送る',
      body: 'さて、下記のとおり納品書をお送りいたします。\n品物とあわせてご確認くださいますようお願い申し上げます。',
      items: [{ name: '納品書', count: 1 }]
    },
    receipt: {
      label: '領収書を送る',
      body: 'さて、先般はお振込みをいただき、誠にありがとうございました。\n下記のとおり領収書をお送りいたしますので、ご査収ください。',
      items: [{ name: '領収書', count: 1 }]
    },
    contract: {
      label: '契約書を送る(返送をお願いする)',
      body: 'さて、下記のとおり契約書2通をお送りいたします。\nご内容をご確認のうえ、ご記名・ご捺印のうえ1通をご返送くださいますようお願い申し上げます。',
      items: [{ name: '契約書', count: 2 }, { name: '返信用封筒', count: 1 }]
    },
    free: {
      label: '自分で書く',
      body: '',
      items: []
    }
  };

  /** 「2026-09-10」を「2026年9月10日」にする。空・不正なら空文字を返す(勝手に今日にしない)。 */
  function formatDateJa(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    if (!m) return '';
    return Number(m[1]) + '年' + Number(m[2]) + '月' + Number(m[3]) + '日';
  }

  /** その日付の月に合う時候の挨拶を返す。日付が読めなければ空文字。 */
  function greetingFor(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    if (!m) return '';
    return GREETINGS[Number(m[2])] || '';
  }

  /**
   * 同封物の入力(1行1件)を配列にする。
   *   「請求書 1通」「請求書　2」「請求書」→ すべて {name, count} に落とす。
   * 数量が読めない行は 1通として扱う。空行は捨てる。
   */
  function parseItems(text) {
    return String(text || '')
      .split('\n')
      .map(function (line) { return line.replace(/　/g, ' ').trim(); })
      .filter(function (line) { return line !== ''; })
      .map(function (line) {
        var m = /^(.*?)[\s]+(\d+)\s*(通|部|枚|冊|点|式)?$/.exec(line);
        if (m && m[1].trim() !== '') {
          return { name: m[1].trim(), count: Number(m[2]), unit: m[3] || '通' };
        }
        return { name: line, count: 1, unit: '通' };
      });
  }

  /** 同封物1件を「請求書　1通」の形にする。 */
  function formatItem(item) {
    return item.name + '　' + item.count + (item.unit || '通');
  }

  /**
   * 送付状1枚ぶんを組み立てる。戻り値はそのまま紙面に流し込める形にしてある。
   *
   * input: {
   *   date, toName, toHonorific, toDept, fromName, fromAddress,
   *   salutation('haikei'|'zenryaku'|'none'), useGreeting, body, itemsText, postscript
   * }
   */
  function buildDocument(input) {
    input = input || {};
    var key = SALUTATIONS[input.salutation] ? input.salutation : 'haikei';
    var sal = SALUTATIONS[key];

    /* 前略のときは、利用者が時候の挨拶を選んでいても出さない(2の判断)。 */
    var wantGreeting = input.useGreeting !== false;
    var greeting = (sal.withGreeting && wantGreeting) ? greetingFor(input.date) : '';

    var lead = '';
    if (greeting) {
      lead = greeting + '、貴社ますますご清栄のこととお慶び申し上げます。'
        + '平素は格別のご高配を賜り、厚く御礼申し上げます。';
    }

    var items = parseItems(input.itemsText);

    var toName = String(input.toName || '').trim();
    var honorific = String(input.toHonorific || '').trim();

    return {
      dateText: formatDateJa(input.date),
      to: {
        name: toName ? (toName + (honorific ? '　' + honorific : '')) : '',
        dept: String(input.toDept || '').trim()
      },
      from: {
        name: String(input.fromName || '').trim(),
        address: String(input.fromAddress || '').trim()
      },
      title: '書類送付のご案内',
      opening: sal.opening,
      closing: sal.closing,
      lead: lead,
      body: String(input.body || '').trim(),
      items: items,
      /* 中身が無い「記」は出さない(3の判断)。 */
      hasRecord: items.length > 0,
      postscript: String(input.postscript || '').trim()
    };
  }

  /** 入力の抜けのうち、相手に届いてから困るものだけを挙げる。文体の好みは対象にしない。 */
  function findMissing(doc) {
    var missing = [];
    if (!doc.to.name) missing.push('宛名');
    if (!doc.from.name) missing.push('差出人');
    if (!doc.dateText) missing.push('日付');
    if (!doc.body) missing.push('本文');
    return missing;
  }

  var api = {
    SALUTATIONS: SALUTATIONS,
    GREETINGS: GREETINGS,
    PRESETS: PRESETS,
    formatDateJa: formatDateJa,
    greetingFor: greetingFor,
    parseItems: parseItems,
    formatItem: formatItem,
    buildDocument: buildDocument,
    findMissing: findMissing
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CoverLetter = api;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
