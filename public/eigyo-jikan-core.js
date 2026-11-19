/*
 * 営業時間の張り紙(/eigyo-jikan)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * eigyo-jikan.js(画面)と tests/eigyo-jikan.test.js の両方から使う。
 *
 * ここに置いた「判断」は次の4つだけ。
 *   1. 時刻は「9:00」の形で出す(頭の0は付けない)
 *   2. 閉める時刻が開く時刻より早い行は、日をまたぐ営業として閉める時刻に「翌」を添える(18:00〜翌2:00)
 *   3. 開く時刻と閉める時刻が両方とも空の行は、紙に出さない
 *   4. 「いつから」の曜日は、入れた日付から暦のとおりに出す
 *
 * その時間に営業してよいか・届出が要るか・働く人の時間の決まりに合うかは判断しない。
 * 定休日は書いたとおりに出す(曜日の候補は出さない)。
 *
 * ブラウザでは window.EigyoJikan、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  /** 見出しの決まった言葉。'custom' を選ぶと、自分で書いた見出しを出す。 */
  var TITLES = ['営業時間のご案内', '営業時間変更のお知らせ', '定休日のご案内'];
  var CHANGE_TITLE = TITLES[1];
  var CUSTOM = 'custom';

  /** 営業時間の行の数。平日・土曜・日曜のように分けて書ける。 */
  var ROWS = 3;

  var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  /*
   * 文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 2026-11-20、A4 の PDF に出して測った(全角で詰めた最悪の入力):
   *   見出し16字・いつからあり・3行とも呼び名8字と「翌」つき・定休日20字・ひとこと60字・店の名前20字・連絡先40字
   *   → A4 1枚に収まり、最下行の文字(連絡先)は紙の下端から約24mm上(結びの文が出る「変更のお知らせ」のとき)。
   *     これより長い入力は測っていない
   */
  var LIMITS = { title: 16, label: 8, holiday: 20, message: 60, shop: 20, contact: 40 };

  function trimmed(v) { return String(v == null ? '' : v).trim(); }
  function chars(s) { return Array.from(s).length; }

  /** 「09:30」「9:30」を、0時からの分として読む。読めない形・24時以降は null。 */
  function parseTime(v) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(trimmed(v));
    if (!m) return null;
    var h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  /** 0時からの分を「9:30」に。null は空文字。 */
  function formatTime(min) {
    if (min === null || min === undefined) return '';
    var mi = min % 60;
    return Math.floor(min / 60) + ':' + (mi < 10 ? '0' : '') + mi;
  }

  /** 「2026-12-01」を UTC の日付として読む。暦に無い日付・読めない形は null。 */
  function parseIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed(iso));
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    var t = Date.UTC(y, mo - 1, d);
    var back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return t;
  }

  /** 「2026年12月1日(火)」。空・不正なら空文字(勝手に今日にしない)。 */
  function formatDateWd(iso) {
    var t = parseIso(iso);
    if (t === null) return '';
    var d = new Date(t);
    return d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日(' + WEEKDAYS[d.getUTCDay()] + ')';
  }

  /** n 行目(1始まり)の入力を読む。 */
  function readRow(input, n) {
    return {
      n: n,
      label: trimmed(input['label' + n]),
      open: parseTime(input['open' + n]),
      close: parseTime(input['close' + n])
    };
  }

  /**
   * 張り紙を組み立てる。
   *
   * input: { titlePreset, titleCustom, fromDate, label1, open1, close1, …(3行目まで), holiday, message, shop, contact }
   */
  function buildSheet(input) {
    input = input || {};
    var title;
    if (input.titlePreset === CUSTOM) title = trimmed(input.titleCustom);
    else title = TITLES.indexOf(input.titlePreset) >= 0 ? input.titlePreset : TITLES[0];

    var rows = [];
    for (var n = 1; n <= ROWS; n++) {
      var r = readRow(input, n);
      if (r.open === null && r.close === null) continue;
      rows.push({
        n: n,
        label: r.label,
        openText: formatTime(r.open),
        closeText: formatTime(r.close),
        nextDay: r.open !== null && r.close !== null && r.close < r.open
      });
    }

    return {
      title: title,
      isChange: input.titlePreset === CHANGE_TITLE,
      fromText: formatDateWd(input.fromDate),
      rows: rows,
      holiday: trimmed(input.holiday),
      message: trimmed(input.message),
      shop: trimmed(input.shop),
      contact: trimmed(input.contact)
    };
  }

  /** 紙に出す1行の時刻。「9:00 〜 18:00」「18:00 〜 翌2:00」。片方が空なら、そこは空けて出す。 */
  function rowTimeText(row) {
    return (row.openText || '　　') + ' 〜 ' + (row.nextDay ? '翌' : '') + (row.closeText || '　　');
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
    if (built.isChange && !built.fromText) out.push('いつから変わるかが入っていません。');
    if (built.rows.length === 0 && !built.holiday) out.push('営業時間も定休日も入っていません。');

    for (var n = 1; n <= ROWS; n++) {
      var r = readRow(input, n);
      if (r.open === null && r.close === null) {
        if (r.label) out.push(n + '行目の時刻が入っていません。時刻の無い行は紙に出ません。');
      } else if (r.open === null) {
        out.push(n + '行目の開く時刻が入っていません。');
      } else if (r.close === null) {
        out.push(n + '行目の閉める時刻が入っていません。');
      } else if (r.open === r.close) {
        out.push(n + '行目の開く時刻と閉める時刻が同じです。');
      }
      if (chars(r.label) > LIMITS.label) {
        out.push(n + '行目の呼び名が' + chars(r.label) + '字あります。' + LIMITS.label + '字までにしてください。');
      }
    }

    if (!built.shop) out.push('店や事務所の名前が入っていません。');

    ['holiday', 'message', 'shop', 'contact'].forEach(function (k) {
      var label = { holiday: '定休日', message: 'ひとこと', shop: '店や事務所の名前', contact: '連絡先' }[k];
      if (chars(built[k]) > LIMITS[k]) {
        out.push(label + 'が' + chars(built[k]) + '字あります。' + LIMITS[k] + '字までにしてください。');
      }
    });
    return out;
  }

  var api = {
    TITLES: TITLES,
    CHANGE_TITLE: CHANGE_TITLE,
    CUSTOM: CUSTOM,
    ROWS: ROWS,
    LIMITS: LIMITS,
    parseTime: parseTime,
    formatTime: formatTime,
    parseIso: parseIso,
    formatDateWd: formatDateWd,
    buildSheet: buildSheet,
    rowTimeText: rowTimeText,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EigyoJikan = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
