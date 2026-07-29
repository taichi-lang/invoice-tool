/*
 * 金額計算ロジックのテスト。依存パッケージなしで動かす。
 *   実行: node tests/calc.test.js
 *
 * 期待値は書籍『請求書&インボイス実務』第2章・第4章の計算例と一致させている。
 */
'use strict';

const assert = require('assert');
const calc = require('../public/calc.js');

let passed = 0;
const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

// ---------------------------------------------------------------- 端数処理

test('端数処理: 切り捨て・四捨五入・切り上げ', () => {
  assert.strictEqual(calc.applyRounding(666.6, 'floor'), 666);
  assert.strictEqual(calc.applyRounding(666.6, 'round'), 667);
  assert.strictEqual(calc.applyRounding(666.6, 'ceil'), 667);
  assert.strictEqual(calc.applyRounding(666.4, 'round'), 666);
  assert.strictEqual(calc.applyRounding(666.1, 'ceil'), 667);
  // モード未指定は切り捨て
  assert.strictEqual(calc.applyRounding(666.9), 666);
});

// ---------------------------------------------------------------- 消費税

test('消費税の端数処理は税率ごとに1回だけ行う(行ごとには行わない)', () => {
  // 単価3,333円の商品を2行。行ごとに処理すると 333+333=666 だが、
  // 税率ごとに1回なら 6,666 × 10% = 666.6 → 666(切り捨て)。
  const items = [
    { name: 'A', qty: 1, price: 3333, rate: 10 },
    { name: 'B', qty: 1, price: 3333, rate: 10 },
  ];
  const t = calc.calcTotals(items, 'floor', { enabled: false });
  assert.strictEqual(t.subtotal, 6666);
  assert.strictEqual(t.taxTotal, 666);
  assert.strictEqual(t.total, 7332);
});

test('複数税率: 10%と8%をそれぞれ集計する', () => {
  const items = [
    { name: '制作費', qty: 1, price: 100000, rate: 10 },
    { name: '書籍代', qty: 3, price: 1500, rate: 8 },
  ];
  const t = calc.calcTotals(items, 'floor', { enabled: false });
  assert.strictEqual(t.rates.length, 2);

  const r10 = t.rates.find((r) => r.rate === 10);
  const r8 = t.rates.find((r) => r.rate === 8);
  assert.strictEqual(r10.subtotal, 100000);
  assert.strictEqual(r10.tax, 10000);
  assert.strictEqual(r8.subtotal, 4500);
  assert.strictEqual(r8.tax, 360);

  assert.strictEqual(t.subtotal, 104500);
  assert.strictEqual(t.taxTotal, 10360);
  assert.strictEqual(t.total, 114860);
});

test('非課税(0%)の行には消費税を課さない', () => {
  const items = [
    { name: '課税分', qty: 1, price: 10000, rate: 10 },
    { name: '非課税分', qty: 1, price: 5000, rate: 0 },
  ];
  const t = calc.calcTotals(items, 'floor', { enabled: false });
  assert.strictEqual(t.subtotal, 15000);
  assert.strictEqual(t.taxTotal, 1000);
  assert.strictEqual(t.total, 16000);
});

test('空の明細は集計に含めない', () => {
  const t = calc.calcTotals([{ name: '', qty: 1, price: 0, rate: 10 }], 'floor', { enabled: false });
  assert.strictEqual(t.subtotal, 0);
  assert.strictEqual(t.total, 0);
  assert.strictEqual(t.rates.length, 0);
});

// ---------------------------------------------------------------- 源泉徴収

test('源泉徴収: 100万円以下は 10.21%', () => {
  assert.strictEqual(calc.calcWithholding(100000), 10210);
  assert.strictEqual(calc.calcWithholding(1000000), 102100);
});

test('源泉徴収: 100万円超は超過分に 20.42% + 102,100円', () => {
  // 1,500,000 → (500,000 × 20.42%) + 102,100 = 102,100 + 102,100 = 204,200
  assert.strictEqual(calc.calcWithholding(1500000), 204200);
});

test('源泉徴収: 1円未満は切り捨てる', () => {
  // 12,345 × 10.21% = 1,260.4245 → 1,260
  assert.strictEqual(calc.calcWithholding(12345), 1260);
});

test('源泉徴収: 0円以下は0円', () => {
  assert.strictEqual(calc.calcWithholding(0), 0);
  assert.strictEqual(calc.calcWithholding(-100), 0);
});

test('計算例1: 消費税を区分した場合(報酬10万円)→ 振込額 99,790円', () => {
  const items = [{ name: '原稿執筆料', qty: 1, price: 100000, rate: 10 }];
  const t = calc.calcTotals(items, 'floor', { enabled: true, base: 'excl' });
  assert.strictEqual(t.subtotal, 100000);
  assert.strictEqual(t.taxTotal, 10000);
  assert.strictEqual(t.total, 110000);
  assert.strictEqual(t.withholdingTax, 10210);
  assert.strictEqual(t.payable, 99790);
});

test('計算例2: 消費税を区分しない場合 → 源泉徴収は税込110,000円が対象', () => {
  const items = [{ name: '原稿執筆料', qty: 1, price: 100000, rate: 10 }];
  const t = calc.calcTotals(items, 'floor', { enabled: true, base: 'incl' });
  assert.strictEqual(t.withholdingTax, 11231);
  assert.strictEqual(t.payable, 98769);
});

test('源泉徴収: 対象外の行(wh:false)を除いて対象額を求める', () => {
  const items = [
    { name: '原稿執筆料', qty: 1, price: 100000, rate: 10, wh: true },
    { name: '参考書籍代(実費)', qty: 3, price: 1500, rate: 8, wh: false },
  ];
  const t = calc.calcTotals(items, 'floor', { enabled: true, base: 'excl' });
  assert.strictEqual(t.total, 114860);
  // 書籍代4,500円は源泉徴収の対象に含めない
  assert.strictEqual(t.withholdingBase, 100000);
  assert.strictEqual(t.withholdingTax, 10210);
  assert.strictEqual(t.payable, 104650);
});

test('源泉徴収: 税込対象のときは対象行の消費税も対象額に含める', () => {
  const items = [
    { name: '原稿執筆料', qty: 1, price: 100000, rate: 10, wh: true },
    { name: '書籍代', qty: 3, price: 1500, rate: 8, wh: false },
  ];
  const t = calc.calcTotals(items, 'floor', { enabled: true, base: 'incl' });
  assert.strictEqual(t.withholdingBase, 110000);
  assert.strictEqual(t.withholdingTax, 11231);
});

test('源泉徴収: wh 未指定の行は対象として扱う(既存データとの互換)', () => {
  const items = [{ name: '制作費', qty: 1, price: 100000, rate: 10 }];
  const t = calc.calcTotals(items, 'floor', { enabled: true, base: 'excl' });
  assert.strictEqual(t.withholdingBase, 100000);
  assert.strictEqual(t.withholdingTax, 10210);
});

test('源泉徴収を使わない場合は振込額 = 合計', () => {
  const items = [{ name: '制作費', qty: 1, price: 50000, rate: 10 }];
  const t = calc.calcTotals(items, 'floor', { enabled: false });
  assert.strictEqual(t.withholdingTax, 0);
  assert.strictEqual(t.payable, t.total);
});

// ---------------------------------------------------------------- 登録番号

test('登録番号は T + 数字13桁のみ有効', () => {
  assert.strictEqual(calc.isValidInvoiceNo('T1234567890123'), true);
  assert.strictEqual(calc.isValidInvoiceNo('  T1234567890123  '), true);
  assert.strictEqual(calc.isValidInvoiceNo('T123456789012'), false);   // 12桁
  assert.strictEqual(calc.isValidInvoiceNo('T12345678901234'), false); // 14桁
  assert.strictEqual(calc.isValidInvoiceNo('1234567890123'), false);   // T なし
  assert.strictEqual(calc.isValidInvoiceNo('t1234567890123'), false);  // 小文字
  assert.strictEqual(calc.isValidInvoiceNo(''), false);
});

// ---------------------------------------------------------------- 実行

let failed = 0;
for (const c of cases) {
  try {
    c.fn();
    passed++;
    console.log(`  ok   ${c.name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${c.name}`);
    console.error(`       ${err.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed (${cases.length} total)`);
process.exit(failed ? 1 : 0);
