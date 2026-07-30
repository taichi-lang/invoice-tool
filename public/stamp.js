/*
 * 収入印紙(印紙税)の判定ロジック — 領収書 = 第17号文書の1(売上代金に係る金銭の受取書)
 *
 * DOMに依存しない純粋関数。ブラウザからは window.StampDuty、
 * テスト(Node)からは require() で利用する。
 *
 * 出典:
 *   国税庁 タックスアンサー No.7105(金銭又は有価証券の受取書、領収書)
 *   国税庁 タックスアンサー No.7141(印紙税額の一覧表(その2)第5号文書から第20号文書まで)
 *   国税庁 タックスアンサー No.7124(消費税額等が区分記載された契約書等の記載金額)
 *
 * ※ 税額表は 2026-07-31 に No.7141 の原文で全区分を照合済み。
 * ※ 「電子交付」「クレジットカード利用の明記」の2つの取扱いは、
 *    国税庁の該当ページに到達できず一次資料で裏を取れていない。
 *    そのため本ツールは、この2つを結論として断定せず注意書きを必ず添える。
 */
'use strict';

(function (root) {

  /**
   * 第17号文書の1(売上代金に係る金銭又は有価証券の受取書)の税額表。
   * limit は「その金額以下」の上限。最後の行は上限なし(Infinity)。
   */
  var RECEIPT_TABLE = [
    { limit: 50000, duty: 0, label: '5万円未満' },
    { limit: 1000000, duty: 200, label: '5万円以上100万円以下' },
    { limit: 2000000, duty: 400, label: '100万円超200万円以下' },
    { limit: 3000000, duty: 600, label: '200万円超300万円以下' },
    { limit: 5000000, duty: 1000, label: '300万円超500万円以下' },
    { limit: 10000000, duty: 2000, label: '500万円超1,000万円以下' },
    { limit: 20000000, duty: 4000, label: '1,000万円超2,000万円以下' },
    { limit: 30000000, duty: 6000, label: '2,000万円超3,000万円以下' },
    { limit: 50000000, duty: 10000, label: '3,000万円超5,000万円以下' },
    { limit: 100000000, duty: 20000, label: '5,000万円超1億円以下' },
    { limit: 200000000, duty: 40000, label: '1億円超2億円以下' },
    { limit: 300000000, duty: 60000, label: '2億円超3億円以下' },
    { limit: 500000000, duty: 100000, label: '3億円超5億円以下' },
    { limit: 1000000000, duty: 150000, label: '5億円超10億円以下' },
    { limit: Infinity, duty: 200000, label: '10億円超' }
  ];

  /**
   * 記載金額(円)から印紙税額を引く。
   * 5万円未満は非課税。**5万円ちょうどは課税(200円)** — 先頭行の上限だけは
   * 「未満」なので、境界を取り違えないよう先に判定してから2行目以降を走査する。
   */
  function dutyForAmount(amount) {
    var value = Number(amount) || 0;
    if (value < 50000) return 0;
    for (var i = 1; i < RECEIPT_TABLE.length; i++) {
      if (value <= RECEIPT_TABLE[i].limit) return RECEIPT_TABLE[i].duty;
    }
    return 200000;
  }

  /** 税額表の行(区分ラベル付き)を返す。表の描画に使う。 */
  function receiptTable() {
    return RECEIPT_TABLE.map(function (row) {
      return { label: row.label, duty: row.duty };
    });
  }

  /**
   * 印紙税の要否と金額を判定する。
   *
   * @param {object} input
   * @param {'paper'|'electronic'} input.delivery   交付方法。electronic = PDF等の電子データのまま渡す
   * @param {'cash'|'credit'}      input.payment    受領方法。credit = クレジットカード利用であることを領収書に明記する
   * @param {'taxable'|'exempt'|'nonbusiness'} input.business
   *        taxable = 課税事業者 / exempt = 免税事業者 / nonbusiness = 営業に関しない受取書
   * @param {number}  input.amountExcl   税抜金額
   * @param {number}  input.taxAmount    消費税額
   * @param {boolean} input.separateTax  消費税額を金額で区分記載するか
   *
   * @returns {{
   *   duty:number, required:boolean, basisAmount:number, basisLabel:string,
   *   reason:string, reasonCode:string, notes:string[], bracket:string|null
   * }}
   */
  function judge(input) {
    var opt = input || {};
    var amountExcl = Math.max(0, Number(opt.amountExcl) || 0);
    var taxAmount = Math.max(0, Number(opt.taxAmount) || 0);
    var gross = amountExcl + taxAmount;
    var notes = [];

    // ① 電子データのまま交付した場合 — 課税文書(紙)を作っていない
    if (opt.delivery === 'electronic') {
      return {
        duty: 0,
        required: false,
        basisAmount: gross,
        basisLabel: '判定不要(課税文書を作成していないため)',
        reasonCode: 'electronic',
        reason: 'PDFなどの電子データのまま交付するため、紙の課税文書を作成したことになりません。収入印紙は不要です。',
        bracket: null,
        notes: [
          '受け取った側が印刷しても課税されません。課税されるのは「作成して交付した」文書です。',
          '発行者が自分で印刷して手渡し・郵送した場合は、その紙が課税文書になります。電子で渡すところまで一貫させてください。',
          'この取扱いは国税庁の一次資料で確認できていません。金額が大きい場合は所轄の税務署にご確認ください。'
        ]
      };
    }

    // ② 営業に関しない受取書 — 非課税物件
    if (opt.business === 'nonbusiness') {
      return {
        duty: 0,
        required: false,
        basisAmount: gross,
        basisLabel: '判定不要(非課税物件のため)',
        reasonCode: 'nonbusiness',
        reason: '「営業に関しない受取書」は非課税です(国税庁 No.7105)。収入印紙は不要です。',
        bracket: null,
        notes: [
          '医師・弁護士・公認会計士などの自由職業者が受け取る領収書、個人が私物を売ったときの領収書などが該当します。',
          '通常の個人事業主が事業として行う取引は「営業」に当たります。「会社ではないから非課税」は誤りです。',
          '自分の業種が該当するか迷う場合は、自己判断せず所轄の税務署にご確認ください(電話で回答を得られます)。'
        ]
      };
    }

    // ③ クレジットカード利用であることを明記した場合 — 金銭の受取書に当たらない
    if (opt.payment === 'credit') {
      return {
        duty: 0,
        required: false,
        basisAmount: gross,
        basisLabel: '判定不要(金銭を受領していないため)',
        reasonCode: 'credit',
        reason: 'クレジットカード払いは信用取引で、その場で金銭を受け取っていません。領収書に「クレジットカード利用」と明記すれば収入印紙は不要です。',
        bracket: null,
        notes: [
          '明記がないと、通常の金銭の受取書として課税されます。但し書きや備考に必ず一文を入れてください。',
          'この取扱いは国税庁の一次資料で確認できていません。金額が大きい場合は所轄の税務署にご確認ください。'
        ]
      };
    }

    // ④ 記載金額を決める
    //    消費税額を金額で区分記載した場合、その消費税額等は記載金額に含めない(No.7124)。
    //    ただし免税事業者はこの取扱いを受けられず、受け取った総額で判定される。
    var basisAmount;
    var basisLabel;
    var isExempt = opt.business === 'exempt';

    if (opt.separateTax && !isExempt) {
      basisAmount = amountExcl;
      basisLabel = '税抜金額(消費税額を区分記載したため、消費税額は記載金額に含めません)';
      notes.push('「税込」とだけ書くのでは足りません。消費税額そのものを金額で書いてください(単価と税率から一通りに計算できる場合を除く)。');
    } else if (opt.separateTax && isExempt) {
      basisAmount = gross;
      basisLabel = '税込の総額(免税事業者は区分記載の取扱いを使えません)';
      notes.push('免税事業者は、消費税額を区分記載しても印紙税の記載金額から差し引けません。受け取った総額で判定されます。');
      if (taxAmount > 0 && amountExcl < 50000 && gross >= 50000) {
        notes.push('課税事業者であれば同じ書き方で ' + formatYen(amountExcl) + ' 判定=印紙不要になる金額です。自分がどちらかを取り違えないでください。');
      }
    } else {
      basisAmount = gross;
      basisLabel = '税込の総額(消費税額を区分記載しないため)';
      if (!isExempt && taxAmount > 0 && amountExcl < 50000 && gross >= 50000) {
        notes.push('消費税額を金額で区分記載すれば、記載金額は ' + formatYen(amountExcl) + ' となり印紙が不要になります。書き方だけで200円変わります。');
      }
    }

    var duty = dutyForAmount(basisAmount);
    var bracket = bracketLabel(basisAmount);

    if (duty === 0) {
      return {
        duty: 0,
        required: false,
        basisAmount: basisAmount,
        basisLabel: basisLabel,
        reasonCode: 'under50000',
        reason: '印紙税の記載金額が5万円未満のため非課税です。収入印紙は不要です。',
        bracket: bracket,
        notes: notes
      };
    }

    notes.push('印紙税を負担するのは、領収書を発行する側(お金を受け取った側)です。');
    notes.push('貼っただけでは納付になりません。印紙と台紙にまたがるように、印章または署名で消印してください。');
    notes.push('PDFのまま電子交付すれば、この ' + formatYen(duty) + ' はかかりません。');

    return {
      duty: duty,
      required: true,
      basisAmount: basisAmount,
      basisLabel: basisLabel,
      reasonCode: 'taxable',
      reason: '印紙税の記載金額は ' + formatYen(basisAmount) + '(' + bracket + ')。'
        + formatYen(duty) + ' の収入印紙が必要です。',
      bracket: bracket,
      notes: notes
    };
  }

  /** 記載金額が属する税額表の区分ラベル。 */
  function bracketLabel(amount) {
    var value = Number(amount) || 0;
    if (value < 50000) return '5万円未満';
    for (var i = 1; i < RECEIPT_TABLE.length; i++) {
      if (value <= RECEIPT_TABLE[i].limit) return RECEIPT_TABLE[i].label;
    }
    return '10億円超';
  }

  /** 3桁区切りの円表記。 */
  function formatYen(value) {
    return (Number(value) || 0).toLocaleString('ja-JP') + '円';
  }

  var api = {
    judge: judge,
    dutyForAmount: dutyForAmount,
    bracketLabel: bracketLabel,
    receiptTable: receiptTable,
    formatYen: formatYen
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.StampDuty = api;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
