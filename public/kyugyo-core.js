/*
 * 休業のお知らせ(/kyugyo)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * kyugyo.js(画面)と tests/kyugyo.test.js の両方から使う。
 *
 * ここに置いた「判断」は次の4つだけ。
 *   1. 曜日は、入れた日付から暦のとおりに出す(祝日かどうかは見ない)
 *   2. 休む日数は、最初の日と最後の日を両方数える(12/29〜1/3 は6日間)
 *   3. 最後の日が空、または最初の日と同じなら「1日だけの休業」として出す
 *   4. 日付は前後だけを知らせる(最後の日が最初の日より前 / 営業を始める日が休みの中かそれより前)。
 *      いつ休むべきか、何日前に知らせるべきかは判断しない
 *
 * 見出しは4つの決まった言葉から選ぶか、自分で書く。あいさつの文は決まった文を出す。
 *
 * ブラウザでは window.Kyugyo、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  /** 見出しの決まった言葉。'custom' を選ぶと、自分で書いた見出しを出す。 */
  var TITLES = ['年末年始休業のお知らせ', '夏季休業のお知らせ', '臨時休業のお知らせ', '休業のお知らせ'];
  var CUSTOM = 'custom';

  var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  var DAY_MS = 24 * 60 * 60 * 1000;

  /*
   * 文字数の目安。超えたら警告だけ出す(切り詰めない)。
   * 2026-11-17、A4 の PDF に出して測った(全角で詰めた最悪の入力):
   *   見出し16字・ひとこと60字・店の名前20字・連絡先40字、期間は2行+日数+営業を始める日あり
   *   → A4 1枚に収まり、最下行の文字(連絡先)は紙の下端から約45mm上。これより長い入力は測っていない
   */
  var LIMITS = { title: 16, message: 60, shop: 20, contact: 40 };

  function trimmed(v) { return String(v == null ? '' : v).trim(); }
  function chars(s) { return Array.from(s).length; }

  /** 「2026-12-29」を UTC の日付として読む。暦に無い日付・読めない形は null。 */
  function parseIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed(iso));
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    var t = Date.UTC(y, mo - 1, d);
    var back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return t;
  }

  /** 「2026年12月29日(火)」。空・不正なら空文字(勝手に今日にしない)。 */
  function formatDateWd(iso) {
    var t = parseIso(iso);
    if (t === null) return '';
    var d = new Date(t);
    return d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日(' + WEEKDAYS[d.getUTCDay()] + ')';
  }

  /**
   * 休業のお知らせを組み立てる。
   *
   * input: { titlePreset, titleCustom, startDate, endDate, reopenDate, message, shop, contact }
   */
  function buildSheet(input) {
    input = input || {};
    var title;
    if (input.titlePreset === CUSTOM) title = trimmed(input.titleCustom);
    else title = TITLES.indexOf(input.titlePreset) >= 0 ? input.titlePreset : TITLES[0];

    var start = parseIso(input.startDate);
    var end = parseIso(input.endDate);
    /* 最後の日が最初の日より前のときは、日数を出さない(警告だけ出す) */
    var single = start !== null && (end === null || end === start);
    var days = null;
    if (start !== null && end !== null && end >= start) days = Math.round((end - start) / DAY_MS) + 1;
    else if (single) days = 1;

    return {
      title: title,
      startText: formatDateWd(input.startDate),
      endText: single ? '' : formatDateWd(input.endDate),
      single: single,
      days: days,
      reopenText: formatDateWd(input.reopenDate),
      message: trimmed(input.message),
      shop: trimmed(input.shop),
      contact: trimmed(input.contact)
    };
  }

  /** 印刷する前に知らせること。「どの欄が足りないか」と日付の前後だけを言う。 */
  function findProblems(input, built) {
    input = input || {};
    built = built || buildSheet(input);
    var out = [];
    if (!built.title) out.push('見出しが入っていません。「自分で書く」を選んだときは、見出しを入れてください。');
    if (chars(built.title) > LIMITS.title) {
      out.push('見出しが' + chars(built.title) + '字あります。' + LIMITS.title + '字を超えると2行になります。');
    }
    if (!built.startText) out.push('休みの最初の日が入っていません。');
    if (!built.shop) out.push('店や事務所の名前が入っていません。');

    var start = parseIso(input.startDate);
    var end = parseIso(input.endDate);
    var reopen = parseIso(input.reopenDate);
    if (start !== null && end !== null && end < start) out.push('休みの最後の日が、最初の日より前になっています。');
    var last = (end !== null && start !== null && end >= start) ? end : start;
    if (reopen !== null && last !== null && reopen <= last) {
      out.push('営業を始める日が、休みの期間の中か、それより前になっています。');
    }

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
    LIMITS: LIMITS,
    parseIso: parseIso,
    formatDateWd: formatDateWd,
    buildSheet: buildSheet,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Kyugyo = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
