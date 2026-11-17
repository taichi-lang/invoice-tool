/*
 * FAX送付状(/fax-soufujo)の紙面を組み立てる純粋関数。画面にも DOM にも触らない。
 * fax-soufujo.js(画面)と tests/fax-soufujo.test.js の両方から使う。
 *
 * ここに置いた「判断」は次の4つだけ。
 *   1. 敬称は、担当者名があれば担当者に「様」、会社名だけなら会社名に「御中」(重ねない)
 *   2. 送付枚数は、入れた数字をそのまま出す(全角の数字は半角に直す)。数え直さない
 *   3. 用件のしるしは、決まった4つから1つだけ選ぶ。選ばなければ4つとも空のまま出す
 *   4. 警告は「どの欄が空か」「字数と行数」だけを言う。FAX番号が正しいかは見ない
 *
 * FAXを送る機能は持たない。作るのは、原稿の1枚目に重ねる紙だけ。
 *
 * ブラウザでは window.FaxSoufujo、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  /** 用件のしるし。'none' なら、どれにもしるしを付けない(手で書く人のため)。 */
  var REQUESTS = ['ご確認ください', 'ご返信ください', 'ご査収ください', '至急'];
  var NONE = 'none';

  /*
   * 文字数・行数の目安。超えたら警告だけ出す(切り詰めない)。
   * 2026-11-18、A4 の PDF に出して測った(全角で詰めた最悪の入力):
   *   会社名30字・担当者名20字・番号20字・件名40字・枚数999・通信欄は紙の上で12行
   *   → A4 1枚に収まり、最下行の文字は紙の下端から約20mm上。これより長い入力は測っていない
   * 通信欄は1行に全角で約40字入る(同じ日の実測)。折り返しを数えるときは、控えめに38字で数える。
   */
  var LIMITS = { company: 30, name: 20, number: 20, subject: 40, message: 300, messageLines: 12, lineChars: 38 };

  function trimmed(v) { return String(v == null ? '' : v).trim(); }
  function chars(s) { return Array.from(s).length; }

  /** 「2026-11-18」を UTC の日付として読む。暦に無い日付・読めない形は null。 */
  function parseIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed(iso));
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    var t = Date.UTC(y, mo - 1, d);
    var back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return t;
  }

  /** 「2026年11月18日」。空・不正なら空文字(勝手に今日にしない)。 */
  function formatDate(iso) {
    var t = parseIso(iso);
    if (t === null) return '';
    var d = new Date(t);
    return d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日';
  }

  /** 送付枚数。1〜999 の整数だけを数として読む(全角の数字は半角に直す)。それ以外は null。 */
  function parsePages(v) {
    var s = trimmed(v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    if (!/^\d{1,3}$/.test(s)) return null;
    var n = Number(s);
    return n >= 1 ? n : null;
  }

  /** 宛名の行。担当者名があれば「様」、会社名だけなら「御中」。どちらも空なら行なし。 */
  function toLines(company, name) {
    if (company && name) return [company, name + ' 様'];
    if (name) return [name + ' 様'];
    if (company) return [company + ' 御中'];
    return [];
  }

  /** 通信欄が紙の上で何行になるかの見積もり。長い行は lineChars 字ごとに折り返すものとして数える。 */
  function visualLines(lines) {
    return lines.reduce(function (sum, l) { return sum + Math.max(1, Math.ceil(chars(l) / LIMITS.lineChars)); }, 0);
  }

  /** 通信欄を行に分ける。前後の空行は捨て、途中の空行は残す。 */
  function messageLines(v) {
    var lines = String(v == null ? '' : v).replace(/\r\n?/g, '\n').split('\n')
      .map(function (l) { return l.replace(/\s+$/, ''); });
    while (lines.length && lines[0].trim() === '') lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    return lines;
  }

  /**
   * FAX送付状を組み立てる。
   *
   * input: { date, toCompany, toName, toFax, fromCompany, fromName, fromTel, fromFax,
   *          subject, pages, request, message }
   */
  function buildSheet(input) {
    input = input || {};
    var pages = parsePages(input.pages);
    return {
      dateText: formatDate(input.date),
      toLines: toLines(trimmed(input.toCompany), trimmed(input.toName)),
      toFax: trimmed(input.toFax),
      fromCompany: trimmed(input.fromCompany),
      fromName: trimmed(input.fromName),
      fromTel: trimmed(input.fromTel),
      fromFax: trimmed(input.fromFax),
      subject: trimmed(input.subject),
      pages: pages,
      pagesText: pages === null ? '' : pages + '枚',
      request: REQUESTS.indexOf(input.request) >= 0 ? input.request : NONE,
      messageLines: messageLines(input.message)
    };
  }

  /** 印刷する前に知らせること。「どの欄が空か」と字数・行数だけを言う。 */
  function findProblems(input, built) {
    input = input || {};
    built = built || buildSheet(input);
    var out = [];
    if (built.toLines.length === 0) out.push('送付先(会社名か担当者名)が入っていません。');
    if (!built.toFax) out.push('送付先のFAX番号が入っていません。');
    if (!built.fromCompany && !built.fromName) out.push('発信元(会社名か担当者名)が入っていません。');
    if (!built.fromTel && !built.fromFax) out.push('発信元の電話番号とFAX番号が、どちらも入っていません。');
    if (trimmed(input.pages) === '') out.push('送付枚数が入っていません。');
    else if (built.pages === null) out.push('送付枚数は、1以上の数字で入れてください。');

    [
      ['送付先の会社名', trimmed(input.toCompany), LIMITS.company],
      ['送付先の担当者名', trimmed(input.toName), LIMITS.name],
      ['送付先のFAX番号', built.toFax, LIMITS.number],
      ['発信元の会社名', built.fromCompany, LIMITS.company],
      ['発信元の担当者名', built.fromName, LIMITS.name],
      ['発信元の電話番号', built.fromTel, LIMITS.number],
      ['発信元のFAX番号', built.fromFax, LIMITS.number],
      ['件名', built.subject, LIMITS.subject]
    ].forEach(function (row) {
      if (chars(row[1]) > row[2]) out.push(row[0] + 'が' + chars(row[1]) + '字あります。' + row[2] + '字までにしてください。');
    });

    var total = chars(built.messageLines.join(''));
    if (total > LIMITS.message) out.push('通信欄が' + total + '字あります。' + LIMITS.message + '字までにしてください。');
    var rows = visualLines(built.messageLines);
    if (rows > LIMITS.messageLines) {
      out.push('通信欄が、紙の上でおよそ' + rows + '行になります。' + LIMITS.messageLines + '行までにしてください。');
    }
    return out;
  }

  var api = {
    REQUESTS: REQUESTS,
    NONE: NONE,
    LIMITS: LIMITS,
    parseIso: parseIso,
    formatDate: formatDate,
    parsePages: parsePages,
    visualLines: visualLines,
    buildSheet: buildSheet,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.FaxSoufujo = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
