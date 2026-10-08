/*
 * 書類の種類ごとの文言と、種類を切り替えたときに日付を持ち越してよいかの判定。
 *
 * ここを別ファイルにしてあるのは、画面(app.js)と紙(index.html のプレビュー)と
 * 「持ち越してよいか」の判定の3つが、同じ1つの表を読むようにするためである。
 * 表が2か所にあると、片方だけ直したときに画面と紙が食い違う。
 * 2026-09-20 に実際に食い違いが1件出ている(画面「支払期限」/ 紙「納品日」)。
 *
 * ブラウザでは window.InvoiceDocType、node では module.exports から使う。
 */
(function (root) {
  'use strict';

  /**
   * 書類の種類ごとの表示文言。
   * due は「期限の欄の項目名」で、書類ごとに別物である。
   * 空文字は「その書類では期限の行を出さない」を意味する。
   * to / from は画面の見出しと CSV の列名に使う「宛先」「自分」の欄の名前。
   */
  var PRESETS = {
    '請求書': { lead: '下記のとおりご請求申し上げます。', grand: 'ご請求金額', bank: 'お振込先', due: '支払期限', to: '請求先', from: '請求元' },
    '見積書': { lead: '下記のとおりお見積り申し上げます。', grand: 'お見積金額', bank: 'お振込先', due: '有効期限', to: '請求先', from: '請求元' },
    '納品書': { lead: '下記のとおり納品いたしました。', grand: '納品金額合計', bank: 'お振込先', due: '納品日', to: '請求先', from: '請求元' },
    '領収書': { lead: '下記のとおり領収いたしました。', grand: '領収金額', bank: 'お振込先', due: '', to: '請求先', from: '請求元' },
    // 発注書は書き手と受け手が逆になる(自分=発注する側)。自分の振込先を載せる書類ではないので、
    // bank を空にして振込先の欄ごと出さない。期限の欄は「納期」(相手に納めてもらう日)。
    '発注書': { lead: '下記のとおり発注いたします。', grand: '発注金額', bank: '', due: '納期', to: '発注先', from: '発注元' },
    // 注文請書は、受け取った発注書に対して受注した側が返す「お請けします」の書面。
    // 支払いを求める書類ではないので、振込先の欄は出さない(請求はあとで請求書で行う)。
    '注文請書': { lead: '下記のとおり、ご注文をお請けいたします。', grand: '受注金額', bank: '', due: '納期', to: '注文者', from: '受注者' },
  };

  var DEFAULT_TYPE = '請求書';

  /** 未知の種類が来ても画面が壊れないよう、請求書の文言に倒す。 */
  function presetOf(docType) {
    return Object.prototype.hasOwnProperty.call(PRESETS, docType)
      ? PRESETS[docType]
      : PRESETS[DEFAULT_TYPE];
  }

  /** その書類で、期限の欄が紙に出るときの項目名。出ないときは空文字。 */
  function dueLabelOf(docType) {
    return presetOf(docType).due;
  }

  /**
   * 書類の種類を from → to に変えたとき、期限の欄に入っている日付を持ち越してよいか。
   *
   * 判定は「紙に出る項目名が同じかどうか」で行う。
   * 項目名が変われば、同じ日付が別の意味になって印刷される。
   * 例: 見積書で入れた「有効期限」が、納品書では「納品日」として紙に出る。
   *     利用者は納品日を入れた覚えがないので、誤りに気づけない。
   */
  function carriesDueDate(from, to) {
    if (from === null || from === undefined) return true;   // 比較する前がない(起動直後)
    return dueLabelOf(from) === dueLabelOf(to);
  }

  /** その書類で、振込先の欄を紙と画面に出すか。 */
  function showsBank(docType) {
    return presetOf(docType).bank !== '';
  }

  var api = {
    PRESETS: PRESETS,
    DEFAULT_TYPE: DEFAULT_TYPE,
    presetOf: presetOf,
    dueLabelOf: dueLabelOf,
    carriesDueDate: carriesDueDate,
    showsBank: showsBank,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.InvoiceDocType = api;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
