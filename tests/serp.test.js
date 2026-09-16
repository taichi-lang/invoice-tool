/*
 * 検索結果に出る文言(<title> / meta description)の回帰テスト。依存パッケージなし。
 *   実行: node tests/serp.test.js
 *
 * 2026-09-16 に足した。これまで title と description を守るテストは1件も無かった。
 *
 * 守るのは3つだけ。見た目や文体はテストしない。
 *   1. 公開ページ全部に title と description があること(空でないこと)
 *   2. title がページ間で重複していないこと
 *   3. 母屋 /kaigyo の title と h1 が、このページが実際に答えられる語で名乗っていること
 *
 * ⚠ 3 の理由を書いておく。2026-09-16 に「開業したらやること 書類 順番」を実際に引いたところ、
 *    上位は国税庁・弥生・マネーフォワード等で、10件すべてが「開業届の提出手続き」に答えていた。
 *    当ページは設計上あえて開業届と帳簿を載せていない(businesses/starter-tools/設計.md §3)。
 *    つまり title が狙っていた語は、このページが答えられない語だった。
 *    このテストは「4書類の語で名乗る」状態を固定し、開業届側の語へ戻るのを止める。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

function htmlFiles() {
  const out = [];
  for (const f of fs.readdirSync(PUB)) if (f.endsWith('.html')) out.push(f);
  for (const f of fs.readdirSync(path.join(PUB, 'guide'))) if (f.endsWith('.html')) out.push('guide/' + f);
  return out;
}
const read = (rel) => fs.readFileSync(path.join(PUB, rel), 'utf8');
const titleOf = (html) => (html.match(/<title>([^<]*)<\/title>/) || [])[1];
const descOf = (html) => (html.match(/<meta\s+name="description"\s+content="([^"]*)"/) || [])[1];
const h1Of = (html) => (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];

console.log('serp.test.js');

/* ------------------------------------------------ 1. 全ページに title と description */

test('公開ページ全部に、空でない <title> がある', () => {
  for (const f of htmlFiles()) {
    const t = titleOf(read(f));
    assert.ok(t && t.trim().length > 0, f + ' に title が無い');
  }
});

test('公開ページ全部に、空でない meta description がある', () => {
  // legal.html は免責ページで description を持たない。そこだけ除く。
  for (const f of htmlFiles().filter((f) => f !== 'legal.html')) {
    const d = descOf(read(f));
    assert.ok(d && d.trim().length > 0, f + ' に description が無い');
  }
});

/* ------------------------------------------------------------ 2. title の重複 */

test('title がページ間で重複していない', () => {
  const seen = new Map();
  for (const f of htmlFiles()) {
    const t = titleOf(read(f));
    assert.ok(!seen.has(t), 'title が重複: ' + t + ' (' + seen.get(t) + ' / ' + f + ')');
    seen.set(t, f);
  }
});

/* ------------------------------------- 3. 母屋が、答えられる語で名乗っていること */

const HUB = 'kaigyo.html';
const DOCS = ['見積書', '納品書', '請求書', '領収書'];

test('母屋の title に、4書類の語が4つとも入っている', () => {
  const t = titleOf(read(HUB));
  for (const w of DOCS) assert.ok(t.includes(w), '母屋の title に「' + w + '」が無い: ' + t);
});

test('母屋の title と h1 が同じ文言である', () => {
  const html = read(HUB);
  assert.strictEqual(h1Of(html).trim(), titleOf(html).trim());
});

test('母屋の title は32文字以内である(検索結果で切れないため)', () => {
  const t = titleOf(read(HUB));
  assert.ok(t.length <= 32, '母屋の title が32文字を超えている: ' + t.length + '文字');
});

test('対照: 母屋は「開業届」を扱わないと決めたので、title で開業届を名乗らない', () => {
  // 設計.md §3。名乗ると、来た人が求めているものが無いページに着地する。
  const t = titleOf(read(HUB));
  assert.ok(!t.includes('開業届'), '母屋の title が開業届を名乗っている: ' + t);
});

console.log(`\n${passed} passed, 0 failed (${passed} total)`);
