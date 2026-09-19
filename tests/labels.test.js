/*
 * 画面の項目名と、紙に出る項目名が食い違わないことの回帰テスト。
 *   実行: node tests/labels.test.js
 *
 * 2026-09-20、本番の画面で実際に確かめて見つけた欠陥を固定する。
 *
 *   見積書で「有効期限」に日付を入れ、/?type=delivery を開くと、
 *   下書きが引き継がれて紙には「納品日 2026年10月20日」と出る。
 *   ところが画面の入力欄の名前は、4書類のどれを選んでも「支払期限」で固定だった。
 *   → 画面で「支払期限」と名乗った欄の中身が、紙では「納品日」として印刷される。
 *     利用者は、自分が納品日を入れたつもりがないことに気づけない。
 *
 * このテストが守るのは次の2つである。
 *   ① 画面の期限欄の名前は、書類の種類ごとに紙と同じ語になる
 *   ② 紙に期限の行が出ない書類(領収書)では、画面にもその欄を出さない
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const read = (p) => fs.readFileSync(path.join(pub, p), 'utf8');

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

const HTML = read('index.html');
const APP = read('app.js');

// ---------------------------------------------------------------- 画面の側

test('画面の期限欄に、書き換えるための名札(#dueLabel)がある', () => {
  assert.ok(
    /id="dueLabel"/.test(HTML),
    '期限欄の名前が固定の文字列のままで、書類の種類に追従できない'
  );
});

test('期限欄そのものにも名札(#dueField)がある(紙に出ない書類で隠すため)', () => {
  assert.ok(/id="dueField"/.test(HTML), '期限欄を隠す手がかりが index.html に無い');
});

// ---------------------------------------------------------------- 紙の側との一致

test('画面の期限欄の名前を、紙と同じ preset.due から書いている', () => {
  assert.ok(
    /dueLabel[\s\S]{0,120}preset\.due/.test(APP),
    '画面の期限欄の名前が、紙に出る語(preset.due)と別の出どころになっている'
  );
});

test('紙に期限の行が出ない書類では、画面の期限欄も隠す', () => {
  assert.ok(
    /dueField[\s\S]{0,120}preset\.due/.test(APP),
    '領収書のように紙に出ない書類でも、画面には期限欄が出たままになる'
  );
});

// ---------------------------------------------------------------- 対照

test('対照: 4書類の紙の期限の語は、いまも 支払期限・有効期限・納品日・なし である', () => {
  // ここが変わったら、上の4件が守っている前提そのものが変わっている。
  assert.ok(/'請求書':[^}]*due: '支払期限'/.test(APP), '請求書の期限の語が変わっている');
  assert.ok(/'見積書':[^}]*due: '有効期限'/.test(APP), '見積書の期限の語が変わっている');
  assert.ok(/'納品書':[^}]*due: '納品日'/.test(APP), '納品書の期限の語が変わっている');
  assert.ok(/'領収書':[^}]*due: ''/.test(APP), '領収書に期限の語が付いた(紙に行が出るようになった)');
});

let passed = 0;
let failed = 0;
console.log('画面の項目名と紙の項目名の一致');
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
