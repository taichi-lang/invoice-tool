/*
 * 請求書ジェネレーター — 金額計算ロジック(DOMに依存しない純粋関数)
 *
 * ブラウザからは window.InvoiceCalc、テスト(Node)からは require() で利用する。
 */
'use strict';

(function (root) {

  /** 端数処理。mode は 'floor' | 'round' | 'ceil'。既定は切り捨て。 */
  function applyRounding(value, mode) {
    if (mode === 'ceil') return Math.ceil(value);
    if (mode === 'round') return Math.round(value);
    return Math.floor(value);
  }

  /**
   * 源泉徴収税額を求める(国税庁 タックスアンサー No.2795)。
   *   100万円以下 : 支払金額 × 10.21%
   *   100万円超   : (支払金額 - 100万円) × 20.42% + 102,100円
   * 1円未満は切り捨てる。
   */
  function calcWithholding(base) {
    if (base <= 0) return 0;
    const tax = base <= 1000000
      ? base * 0.1021
      : (base - 1000000) * 0.2042 + 102100;
    return Math.floor(tax);
  }

  /**
   * 明細を集計する。
   * 消費税の端数処理は「一の請求書につき、税率ごとに1回」だけ行い、明細行ごとには行わない。
   *
   * 源泉徴収の対象額は、明細の `wh` が true の行のみを合計して求める
   * (実費立替や物品代など、源泉徴収の対象外となる行を除けるようにするため)。
   * `wh` が未指定の行は対象として扱う。
   *
   * @param {Array<{name?:string, qty:number, price:number, rate:number, wh?:boolean}>} items
   * @param {string} roundingMode 'floor' | 'round' | 'ceil'
   * @param {{enabled:boolean, base:'excl'|'incl'}} withholding
   */
  function calcTotals(items, roundingMode, withholding) {
    const byRate = new Map();
    for (const item of items || []) {
      const amount = (Number(item.qty) || 0) * (Number(item.price) || 0);
      if (!amount && !item.name) continue;
      const rate = Number(item.rate) || 0;
      const entry = byRate.get(rate) || { rate: rate, subtotal: 0, tax: 0, whSubtotal: 0, whTax: 0 };
      entry.subtotal += amount;
      if (item.wh !== false) entry.whSubtotal += amount;
      byRate.set(rate, entry);
    }

    const rates = [...byRate.values()].sort((a, b) => b.rate - a.rate);
    for (const entry of rates) {
      entry.subtotal = applyRounding(entry.subtotal, roundingMode);
      entry.tax = applyRounding(entry.subtotal * entry.rate / 100, roundingMode);
      entry.whSubtotal = applyRounding(entry.whSubtotal, roundingMode);
      entry.whTax = applyRounding(entry.whSubtotal * entry.rate / 100, roundingMode);
    }

    const subtotal = rates.reduce((sum, r) => sum + r.subtotal, 0);
    const taxTotal = rates.reduce((sum, r) => sum + r.tax, 0);
    const total = subtotal + taxTotal;

    const wh = withholding || {};
    let withholdingBase = 0;
    let withholdingTax = 0;
    if (wh.enabled) {
      withholdingBase = rates.reduce(
        (sum, r) => sum + r.whSubtotal + (wh.base === 'incl' ? r.whTax : 0),
        0
      );
      withholdingTax = calcWithholding(withholdingBase);
    }

    return {
      rates: rates,
      subtotal: subtotal,
      taxTotal: taxTotal,
      total: total,
      withholdingBase: withholdingBase,
      withholdingTax: withholdingTax,
      payable: total - withholdingTax,
    };
  }

  /** 登録番号が「T + 数字13桁」の形式かどうか。実在確認は行わない。 */
  function isValidInvoiceNo(value) {
    return /^T\d{13}$/.test(String(value || '').trim());
  }

  /**
   * 明細の1行に中身があるか。品目名も金額も無い行は「書きかけの空行」なので、
   * 印刷にもCSVにも出さない。判定をここ1か所に置き、書類とCSVで行数がずれないようにする。
   */
  function hasContent(item) {
    if (!item) return false;
    return Boolean(item.name) || Boolean(Number(item.qty) * Number(item.price));
  }

  const api = {
    applyRounding: applyRounding,
    hasContent: hasContent,
    calcWithholding: calcWithholding,
    calcTotals: calcTotals,
    isValidInvoiceNo: isValidInvoiceNo,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.InvoiceCalc = api;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
