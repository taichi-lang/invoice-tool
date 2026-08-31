/*
 * 印刷紙面(@media print)の回帰テスト。依存パッケージなしで動かす。
 *   実行: node tests/print.test.js
 *
 * 2026-09-01、Chrome ヘッドレスで実際にA4のPDFを出して分かった欠陥2件を守るためのテスト。
 *   ・明細15行: 「小計・消費税」が1ページ目、「合計・源泉徴収・お振込金額」が2ページ目に割れた
 *   ・明細8行 : 見出し「お振込先」「備考」だけが1ページ目に残り、中身が2ページ目に落ちた
 * PDFそのものを毎回出すことはこのテストではできないため、
 * 割れを防いでいる宣言が @media print の中に在り続けることを確かめる。
 * 修正前の style.css では下の4件すべてが落ちる(落ちなければテストの意味がない)。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

/** @media print { ... } の中身だけを取り出す(入れ子の波かっこを数える)。 */
function printBlock(source) {
  const start = source.indexOf('@media print');
  assert.notStrictEqual(start, -1, '@media print が style.css に無い');
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error('@media print の閉じかっこが見つからない');
}

// コメントは先に落とす(セレクタの手前に付いたコメントを名前の一部と読んでしまうため)
const block = printBlock(css).replace(/\/\*[\s\S]*?\*\//g, '');
const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

/** セレクタに break-inside: avoid が当たっているか(同じ宣言に並記されていてもよい)。 */
function avoidsBreak(selector) {
  const rules = block.split('}');
  return rules.some((rule) => {
    const [head, body] = rule.split('{');
    if (!body) return false;
    const selectors = head.split(',').map((s) => s.trim());
    return selectors.includes(selector) && /break-inside\s*:\s*avoid/.test(body);
  });
}

test('合計欄(小計〜お振込金額)をページで割らない', () => {
  assert.ok(avoidsBreak('.totals'), '.totals に break-inside: avoid が無い');
  assert.ok(avoidsBreak('.totals table'), '.totals table に break-inside: avoid が無い');
});

test('税率ごとの内訳をページで割らない', () => {
  assert.ok(avoidsBreak('.tax-breakdown'), '.tax-breakdown に break-inside: avoid が無い');
});

test('お振込先・備考は、見出しと中身を同じページに置く', () => {
  assert.ok(avoidsBreak('.paper-foot .bank'), '.paper-foot .bank に break-inside: avoid が無い');
  assert.ok(avoidsBreak('.paper-foot .notes'), '.paper-foot .notes に break-inside: avoid が無い');
});

test('ご請求金額の帯をページで割らない', () => {
  assert.ok(avoidsBreak('.grand'), '.grand に break-inside: avoid が無い');
});

test('明細の見出し行は、2ページ目以降にも繰り返す', () => {
  assert.ok(
    /table\.items\s+thead\s*\{[^}]*display\s*:\s*table-header-group/.test(block),
    'table.items thead に display: table-header-group が無い'
  );
});

test('明細の1行はページ内で割らない(既存の宣言が消えていないこと)', () => {
  assert.ok(avoidsBreak('table.items tr'), 'table.items tr に break-inside: avoid が無い');
});

let passed = 0;
let failed = 0;
console.log('印刷紙面(@media print)');
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
