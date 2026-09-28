/*
 * 催促状(/saisoku)の文面を組み立てる純粋関数。画面にも DOM にも触らない。
 * saisoku.js(画面)と tests/saisoku.test.js の両方から使う。
 *
 * ここに置いた「判断」は次の4つ。文面の好みではなく、外すと相手が動かない箇所だけを扱う。
 *   1. 感情を書かない。書くのは金額・期日・経過日数だけ
 *   2. 1回目は行き違いの可能性を残し、請求書の再送を申し出る
 *      (請求書を見失っている・担当が代わって引き継がれていない、はどちらも実際に起きる)
 *   3. どちらの段階も、相手にしてほしい行動を1つ、曜日つきの日付で指定して閉じる。
 *      「ご確認ください」で終わる文面は動かない
 *   4. 遅延損害金・法的手続きには触れない。そこから先は契約と専門家の領分で、
 *      このツールが文面を用意してよい範囲の外にある
 *
 * ブラウザでは window.Saisoku、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  /** 段階ごとの表題。本文の組み立ては buildDocument の中で段階ごとに分ける。 */
  var STAGES = {
    first: { label: '1回目 — 入金の確認をお願いする', title: 'お支払いについてのご確認' },
    second: { label: '2回目 — 期限を決めて改めてお願いする', title: 'お支払いについてのお願い(再送)' }
  };

  /** 「2026-09-29」を UTC の日付として読む。読めなければ null。 */
  function parseIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    var t = Date.UTC(y, mo - 1, d);
    var back = new Date(t);
    /* 2026-02-30 のような、暦に無い日付を受け付けない */
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return t;
  }

  /** 「2026年9月29日」。空・不正なら空文字(勝手に今日にしない)。 */
  function formatDateJa(iso) {
    var t = parseIso(iso);
    if (t === null) return '';
    var d = new Date(t);
    return d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日';
  }

  /** 「2026年9月29日(火)」。回答期限は曜日つきで書く(3の判断)。 */
  function formatDateWithWeekday(iso) {
    var t = parseIso(iso);
    if (t === null) return '';
    return formatDateJa(iso) + '(' + WEEKDAYS[new Date(t).getUTCDay()] + ')';
  }

  /** from から to まで何日か。to が後なら正。どちらかが読めなければ null。 */
  function daysBetween(fromIso, toIso) {
    var a = parseIso(fromIso), b = parseIso(toIso);
    if (a === null || b === null) return null;
    return Math.round((b - a) / 86400000);
  }

  /** iso の n 日後を iso で返す。読めなければ空文字。 */
  function addDays(iso, n) {
    var t = parseIso(iso);
    if (t === null) return '';
    var d = new Date(t + n * 86400000);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  /**
   * 金額の入力を円の整数にする。「110,000」「¥110000」「11万」のうち、数字とカンマ以外が
   * 混じるものは読まない(null)。読み違えた金額を催促するより、空欄で止めるほうが安全である。
   */
  function parseAmount(s) {
    var t = String(s == null ? '' : s)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[，,]/g, '')
      .replace(/^[¥￥]\s*/, '')
      .replace(/円$/, '')
      .trim();
    if (!/^\d+$/.test(t)) return null;
    var n = Number(t);
    return n > 0 ? n : null;
  }

  /** 110000 → 「110,000円」 */
  function formatYen(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円';
  }

  /**
   * 催促状1枚ぶんを組み立てる。
   *
   * input: {
   *   stage('first'|'second'), date(発行日), dueDate(支払期日), replyBy(回答期限),
   *   invoiceDate, invoiceNo, subject, amount,
   *   toName, toHonorific, toDept, fromName, fromAddress, bank
   * }
   */
  function buildDocument(input) {
    input = input || {};
    var stageKey = STAGES[input.stage] ? input.stage : 'first';
    var stage = STAGES[stageKey];

    var dueText = formatDateJa(input.dueDate);
    var replyText = formatDateWithWeekday(input.replyBy);
    var elapsed = daysBetween(input.dueDate, input.date);
    var overdue = elapsed !== null && elapsed > 0;
    var amount = parseAmount(input.amount);
    var invoiceDateText = formatDateJa(input.invoiceDate);

    var which = invoiceDateText ? invoiceDateText + '付けでお送りいたしました下記の請求書' : '下記の請求書';
    var dueClause = dueText ? 'お支払期日の' + dueText : 'お支払期日';

    var body = [];
    if (stageKey === 'first') {
      body.push('さて、' + which + 'につきまして、' + dueClause + 'を過ぎましたが、本日現在、ご入金の確認がとれておりません。');
      body.push('お手数ですが、' + (replyText ? replyText + 'までに、' : '') + 'ご入金のご予定日をお知らせくださいますようお願い申し上げます。');
      body.push('請求書がお手元に見当たらない場合は、すぐに再送いたしますのでお申し付けください。');
      body.push('なお、本状と行き違いでお手続きいただいておりましたら、失礼をお詫び申し上げますとともに、本状はお読み捨てください。');
    } else {
      body.push('さて、' + which + 'につきまして、'
        + (overdue && dueText ? dueClause + 'から本日で' + elapsed + '日が経過いたしましたが、' : dueClause + 'を過ぎましたが、')
        + 'ご入金の確認がとれておりません。');
      body.push('先日もご確認のお願いをお送りいたしましたが、ご返答をいただけておりませんので、改めてご連絡いたします。');
      body.push('つきましては、' + (replyText ? replyText + 'までに' : '') + 'ご入金いただくか、ご入金のご予定日をお知らせくださいますようお願い申し上げます。');
      body.push('なお、本状と行き違いでお手続きいただいておりましたら、ご容赦ください。');
    }

    var record = [];
    var invoiceNo = String(input.invoiceNo || '').trim();
    var subject = String(input.subject || '').trim();
    if (invoiceNo) record.push({ label: '請求書番号', value: invoiceNo });
    if (invoiceDateText) record.push({ label: '請求日', value: invoiceDateText });
    if (subject) record.push({ label: '件名', value: subject });
    if (amount !== null) record.push({ label: '請求金額', value: formatYen(amount) });
    if (dueText) record.push({ label: 'お支払期日', value: dueText });
    var bank = String(input.bank || '').trim();
    if (bank) record.push({ label: 'お振込先', value: bank });

    var toName = String(input.toName || '').trim();
    var honorific = String(input.toHonorific || '').trim();

    return {
      stage: stageKey,
      dateText: formatDateJa(input.date),
      to: {
        name: toName ? (toName + (honorific ? '　' + honorific : '')) : '',
        dept: String(input.toDept || '').trim()
      },
      from: {
        name: String(input.fromName || '').trim(),
        address: String(input.fromAddress || '').trim()
      },
      title: stage.title,
      opening: '拝啓',
      lead: '時下ますますご清栄のこととお慶び申し上げます。平素は格別のご高配を賜り、厚く御礼申し上げます。',
      body: body,
      closing: '敬具',
      record: record,
      hasRecord: record.length > 0,
      elapsed: elapsed,
      overdue: overdue,
      amountReadable: amount !== null
    };
  }

  /**
   * 送る前に止めたいものだけを挙げる。文体の好みは対象にしない。
   * 期日前の催促と、発行日より前の回答期限は、どちらも相手から見て誤りになる。
   */
  function findProblems(input, doc) {
    var out = [];
    if (!doc.to.name) out.push('宛名が空です');
    if (!doc.from.name) out.push('差出人が空です');
    if (!doc.dateText) out.push('発行日が空です');
    if (!formatDateJa(input.dueDate)) out.push('支払期日が空です');
    if (String(input.amount || '').trim() === '') out.push('請求金額が空です');
    else if (!doc.amountReadable) out.push('請求金額が数字として読めません(例: 110000 または 110,000)');
    if (doc.elapsed !== null && doc.elapsed <= 0) {
      out.push('発行日が支払期日を過ぎていません。期日前に送るなら、催促ではなく「お支払期日のご案内」として送ってください');
    }
    var reply = daysBetween(input.date, input.replyBy);
    if (!formatDateJa(input.replyBy)) out.push('回答期限が空です');
    else if (reply !== null && reply <= 0) out.push('回答期限が発行日より後になっていません');
    return out;
  }

  var api = {
    STAGES: STAGES,
    parseIso: parseIso,
    formatDateJa: formatDateJa,
    formatDateWithWeekday: formatDateWithWeekday,
    daysBetween: daysBetween,
    addDays: addDays,
    parseAmount: parseAmount,
    formatYen: formatYen,
    buildDocument: buildDocument,
    findProblems: findProblems
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Saisoku = api;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
