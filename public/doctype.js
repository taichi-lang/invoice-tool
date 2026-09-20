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
   */
  var PRESETS = {
    '請求書': { lead: '下記のとおりご請求申し上げます。', grand: 'ご請求金額', bank: 'お振込先', due: '支払期限' },
    '見積書': { lead: '下記のとおりお見積り申し上げます。', grand: 'お見積金額', bank: 'お振込先', due: '有効期限' },
    '納品書': { lead: '下記のとおり納品いたしました。', grand: '納品金額合計', bank: 'お振込先', due: '納品日' },
    '領収書': { lead: '下記のとおり領収いたしました。', grand: '領収金額', bank: 'お振込先', due: '' },
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

  var api = {
    PRESETS: PRESETS,
    DEFAULT_TYPE: DEFAULT_TYPE,
    presetOf: presetOf,
    dueLabelOf: dueLabelOf,
    carriesDueDate: carriesDueDate,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.InvoiceDocType = api;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
