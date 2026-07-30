/*
 * 収入印紙(印紙税)判定ロジックのテスト。依存パッケージなしで動かす。
 *   実行: node tests/stamp.test.js
 *
 * 期待値は書籍『請求書&インボイス実務』第3章 3-3 の記述と一致させている。
 * 税額表は国税庁 タックスアンサー No.7141 の原文(2026-07-31 照合)と一致させている。
 */
'use strict';

const assert = require('assert');
const stamp = require('../public/stamp.js');

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

// ---------------------------------------------------------------- 税額表

test('税額表: 5万円の境界(4万9,999円は非課税・5万円ちょうどで200円)', () => {
  assert.strictEqual(stamp.dutyForAmount(49999), 0);
  assert.strictEqual(stamp.dutyForAmount(50000), 200);
});

test('税額表: 各区分の上限と、その1円上を照合する(No.7141)', () => {
  const boundaries = [
    [1000000, 200, 400],
    [2000000, 400, 600],
    [3000000, 600, 1000],
    [5000000, 1000, 2000],
    [10000000, 2000, 4000],
    [20000000, 4000, 6000],
    [30000000, 6000, 10000],
    [50000000, 10000, 20000],
    [100000000, 20000, 40000],
    [200000000, 40000, 60000],
    [300000000, 60000, 100000],
    [500000000, 100000, 150000],
    [1000000000, 150000, 200000],
  ];
  for (const [limit, at, over] of boundaries) {
    assert.strictEqual(stamp.dutyForAmount(limit), at, `${limit}円ちょうど`);
    assert.strictEqual(stamp.dutyForAmount(limit + 1), over, `${limit + 1}円`);
  }
});

test('税額表: 10億円超は一律20万円', () => {
  assert.strictEqual(stamp.dutyForAmount(9999999999), 200000);
});

test('区分ラベルが金額に対応している', () => {
  assert.strictEqual(stamp.bracketLabel(30000), '5万円未満');
  assert.strictEqual(stamp.bracketLabel(52800), '5万円以上100万円以下');
  assert.strictEqual(stamp.bracketLabel(1500000), '100万円超200万円以下');
});

test('税額表の行数と先頭・末尾(表の描画に使う)', () => {
  const rows = stamp.receiptTable();
  assert.strictEqual(rows.length, 15);
  assert.deepStrictEqual(rows[0], { label: '5万円未満', duty: 0 });
  assert.deepStrictEqual(rows[14], { label: '10億円超', duty: 200000 });
});

// -------------------------------------------------- 印紙が不要になる3ケース

test('① 記載金額が5万円未満なら不要', () => {
  const r = stamp.judge({
    delivery: 'paper', payment: 'cash', business: 'taxable',
    amountExcl: 30000, taxAmount: 3000, separateTax: false,
  });
  assert.strictEqual(r.required, false);
  assert.strictEqual(r.duty, 0);
  assert.strictEqual(r.reasonCode, 'under50000');
  assert.strictEqual(r.basisAmount, 33000);
});

test('② 電子交付(PDF)なら金額にかかわらず不要', () => {
  const r = stamp.judge({
    delivery: 'electronic', payment: 'cash', business: 'taxable',
    amountExcl: 5000000, taxAmount: 500000, separateTax: false,
  });
  assert.strictEqual(r.required, false);
  assert.strictEqual(r.duty, 0);
  assert.strictEqual(r.reasonCode, 'electronic');
  // 「印刷して手渡すと課税文書になる」注意を必ず出す
  assert.ok(r.notes.some((n) => n.includes('印刷')), '印刷時の注意が必要');
  // 一次資料で裏を取れていないことを必ず明示する
  assert.ok(r.notes.some((n) => n.includes('税務署')), '税務署確認の案内が必要');
});

test('③ クレジットカード利用を明記すれば不要', () => {
  const r = stamp.judge({
    delivery: 'paper', payment: 'credit', business: 'taxable',
    amountExcl: 100000, taxAmount: 10000, separateTax: false,
  });
  assert.strictEqual(r.required, false);
  assert.strictEqual(r.reasonCode, 'credit');
  assert.ok(r.notes.some((n) => n.includes('明記がないと')), '明記が条件である旨が必要');
});

test('判定の優先順位: 電子交付はクレカ・事業者区分より先に効く', () => {
  const r = stamp.judge({
    delivery: 'electronic', payment: 'credit', business: 'exempt',
    amountExcl: 1000000, taxAmount: 100000, separateTax: true,
  });
  assert.strictEqual(r.reasonCode, 'electronic');
});

// ------------------------------------------------ 消費税額の区分記載(No.7124)

test('課税事業者: 区分記載すると税抜判定になり、52,800円の領収書が印紙不要になる', () => {
  // 書籍 第3章 3-3 の具体例(税抜48,000 / 消費税4,800 / 合計52,800)
  const withoutSeparate = stamp.judge({
    delivery: 'paper', payment: 'cash', business: 'taxable',
    amountExcl: 48000, taxAmount: 4800, separateTax: false,
  });
  assert.strictEqual(withoutSeparate.basisAmount, 52800);
  assert.strictEqual(withoutSeparate.duty, 200);

  const withSeparate = stamp.judge({
    delivery: 'paper', payment: 'cash', business: 'taxable',
    amountExcl: 48000, taxAmount: 4800, separateTax: true,
  });
  assert.strictEqual(withSeparate.basisAmount, 48000);
  assert.strictEqual(withSeparate.duty, 0);
});

test('区分記載していない場合、200円を回避できることを案内する', () => {
  const r = stamp.judge({
    delivery: 'paper', payment: 'cash', business: 'taxable',
    amountExcl: 48000, taxAmount: 4800, separateTax: false,
  });
  assert.ok(r.notes.some((n) => n.includes('48,000円')), '税抜判定の案内が必要');
});

// ------------------------------------------- 免税事業者(書籍 第3章の最重要論点)

test('免税事業者は区分記載しても総額判定になる(課税事業者と結論が変わる)', () => {
  const r = stamp.judge({
    delivery: 'paper', payment: 'cash', business: 'exempt',
    amountExcl: 48000, taxAmount: 4800, separateTax: true,
  });
  assert.strictEqual(r.basisAmount, 52800, '免税事業者は総額で判定する');
  assert.strictEqual(r.duty, 200);
  assert.ok(r.basisLabel.includes('免税事業者'), '理由が画面に出ること');
  assert.ok(
    r.notes.some((n) => n.includes('課税事業者であれば')),
    '課税事業者との結論の違いを明示すること'
  );
});

test('免税事業者でも5万円未満なら不要(取扱いの差が出ない領域)', () => {
  const r = stamp.judge({
    delivery: 'paper', payment: 'cash', business: 'exempt',
    amountExcl: 40000, taxAmount: 4000, separateTax: true,
  });
  assert.strictEqual(r.basisAmount, 44000);
  assert.strictEqual(r.duty, 0);
});

// ---------------------------------------------------- 営業に関しない受取書

test('営業に関しない受取書は非課税(金額にかかわらず)', () => {
  const r = stamp.judge({
    delivery: 'paper', payment: 'cash', business: 'nonbusiness',
    amountExcl: 1000000, taxAmount: 100000, separateTax: false,
  });
  assert.strictEqual(r.required, false);
  assert.strictEqual(r.reasonCode, 'nonbusiness');
  assert.ok(
    r.notes.some((n) => n.includes('「会社ではないから非課税」は誤り')),
    '個人事業主の誤解に触れること'
  );
});

// ---------------------------------------------------------------- 入力の防御

test('金額が未入力・負数でも壊れない', () => {
  const r = stamp.judge({ delivery: 'paper', payment: 'cash', business: 'taxable' });
  assert.strictEqual(r.basisAmount, 0);
  assert.strictEqual(r.duty, 0);

  const neg = stamp.judge({
    delivery: 'paper', payment: 'cash', business: 'taxable',
    amountExcl: -100000, taxAmount: -1,
  });
  assert.strictEqual(neg.basisAmount, 0);
  assert.strictEqual(neg.duty, 0);
});

test('引数なしでも例外を投げない', () => {
  const r = stamp.judge();
  assert.strictEqual(r.duty, 0);
});

test('印紙が必要な場合は、消印と負担者の注意を必ず出す', () => {
  const r = stamp.judge({
    delivery: 'paper', payment: 'cash', business: 'taxable',
    amountExcl: 100000, taxAmount: 10000, separateTax: true,
  });
  assert.strictEqual(r.duty, 200);
  assert.ok(r.notes.some((n) => n.includes('消印')), '消印の注意が必要');
  assert.ok(r.notes.some((n) => n.includes('発行する側')), '負担者の注意が必要');
  assert.ok(r.notes.some((n) => n.includes('電子交付')), '回避手段の案内が必要');
});

// ---------------------------------------------------------------- 実行

let passed = 0;
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
