/*
 * 第3段(factory=特注業務システム)への出口の回帰テスト。依存パッケージなしで動かす。
 *   実行: node tests/soudan.test.js
 *
 * 設計は AIBusiness `businesses/starter-tools/factory送客_設計.md`。
 * このテストが守っているのは、設計の「禁止事項」である。
 *
 *   ① 出口は1本だけ。 増やせば押し売りになる(§2)
 *   ② 書類を作る6画面と解説記事に混ぜない(§2)
 *      手を動かしている最中の人に営業を差し込まない。記事の末尾は広告の面である
 *   ③ 受け口にフォームを置かない(§2)
 *      「入力内容を送信しない」が本サイトの売りである。送信する箱を同居させない
 *   ④ 金額・実績・納期・外部URLを書かない(§3)
 *      価格は個別見積、顧客はまだ納品前。書けば捏造になる
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const read = (p) => fs.readFileSync(path.join(pub, p), 'utf8');

const SOUDAN = 'soudan.html';

/** 出口を置いてよい唯一のページ(母屋の本文末尾)。 */
const EXIT_PAGE = 'kaigyo.html';

/** 出口を置かないページ。書類を作る6画面・免責・記事3本・記事一覧。 */
const NO_EXIT_PAGES = [
  'index.html',
  'mitsumorisho.html',
  'ryoshusho.html',
  'nohinsho.html',
  'soufujo.html',
  'inshi.html',
  'legal.html',
  'guide/index.html',
  'guide/seikyusho-kakikata.html',
  'guide/seikyusho-teisei-saihakko.html',
  'guide/gensen-choshu-keisan.html',
];

/** そのページの本文から /soudan へ向かうリンクの数。
 *  soudan.html 自身のフッターや戻り導線は数えない(別ページからの出口ではない)。 */
function exitLinks(html) {
  return (html.match(/href="\/soudan"/g) || []).length;
}

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

// ── ① 出口は1本だけ ────────────────────────────────────────
test('出口は母屋 /kaigyo にちょうど1本だけある', () => {
  assert.strictEqual(exitLinks(read(EXIT_PAGE)), 1, '/kaigyo の出口が1本ではない');
});

test('出口は /legal ではなく /soudan に着地する(2ホップを解いた)', () => {
  const html = read(EXIT_PAGE);
  const i = html.indexOf('自社の業務に合わせて作りたい方へ');
  assert.ok(i > 0, '/kaigyo の出口の見出しが消えている');
  const tail = html.slice(i);
  assert.ok(tail.includes('href="/soudan"'), '出口が /soudan を指していない');
  assert.ok(!tail.includes('href="/legal">運営者情報'), '出口がまだ /legal を経由している');
});

// ── ② 混ぜてよい面と、混ぜない面(正負の対照) ──────────────
test('書類を作る6画面・免責・記事には出口が1本も無い', () => {
  for (const p of NO_EXIT_PAGES) {
    assert.strictEqual(exitLinks(read(p)), 0, `${p} に出口が混入している`);
  }
});

test('対照: 同じ数え方で /kaigyo は1本を返す(数え方が壊れていない)', () => {
  assert.strictEqual(exitLinks(read(EXIT_PAGE)), 1);
  assert.strictEqual(exitLinks('<a href="/legal">x</a>'), 0);
});

// ── ③ 受け口はフォームではなく mailto 1本 ────────────────────
test('受け口に <form> は1つも無い', () => {
  assert.ok(!/<form\b/i.test(read(SOUDAN)), 'soudan に form がある');
});

test('受け口は mailto: リンクがちょうど1本', () => {
  const n = (read(SOUDAN).match(/href="mailto:/g) || []).length;
  assert.strictEqual(n, 1, `mailto が ${n} 本ある`);
});

test('mailto の雛形に、聞くべき5項目がすべて入っている', () => {
  const href = read(SOUDAN).match(/href="(mailto:[^"]+)"/)[1];
  const decoded = decodeURIComponent(href.replace(/&amp;/g, '&'));
  assert.ok(decoded.startsWith('mailto:nks.taichi@gmail.com?'), '宛先が違う');
  assert.ok(decoded.includes('subject=業務システムのご相談'), '件名が入っていない');
  for (const item of ['業種', 'いま見積・請求をどう作っているか', '困っていること', '希望時期', 'ご連絡先']) {
    assert.ok(decoded.includes(item), `雛形に「${item}」が無い`);
  }
});

test('受け口は外部へ1バイトも送らない(当方サーバーへの送信経路が無い)', () => {
  const html = read(SOUDAN);
  for (const bad of ['fetch(', 'XMLHttpRequest', 'action=', '<script']) {
    assert.ok(!html.includes(bad), `soudan に ${bad} がある`);
  }
});

// ── ④ 書いてはいけないもの ──────────────────────────────────
test('金額を1つも書いていない(価格は個別見積)', () => {
  const html = read(SOUDAN);
  assert.ok(!/[0-9０-９]\s*[万円]/.test(html.replace(/無料/g, '')), '金額らしき表記がある');
  assert.ok(html.includes('個別のお見積り'), '個別見積の断り書きが無い');
});

test('実績・お客様の声・納期を書いていない(まだ納品前である)', () => {
  const html = read(SOUDAN);
  for (const bad of ['導入実績', 'お客様の声', '実績多数', '社導入', '最短', '納期']) {
    assert.ok(!html.includes(bad), `soudan に「${bad}」がある`);
  }
});

test('外部URLを1つも書いていない(偽URL禁止 / factory に公開サイトは無い)', () => {
  const html = read(SOUDAN);
  // 数えるのは本文の <a> だけ。<link rel="canonical"> は索引のための自己参照であり、
  // 読者を外へ出す導線ではないので対象外(対照: canonical は実在することを下で確かめる)。
  const anchors = html.match(/<a[^>]*href="https?:\/\/[^"]*"/g) || [];
  assert.strictEqual(anchors.length, 0, '外部リンクがある: ' + anchors.join(' | '));
  assert.ok(/<link rel="canonical" href="https:\/\/[^"]+\/soudan">/.test(html), 'canonical が無い');
});

// ── ⑤ 無料ツールの約束を殺していない ────────────────────────
test('無料ツールが今までどおりであることを明記している', () => {
  const html = read(SOUDAN);
  assert.ok(html.includes('登録不要'), '登録不要の明記が無い');
  assert.ok(html.includes('送信'), '送信しない旨の記載が無い');
  assert.ok(html.includes('有料版に切り替わることはありません'), '無料継続の明記が無い');
});

test('相談せずにツールへ戻る導線がある(行き止まりにしない)', () => {
  const html = read(SOUDAN);
  assert.ok(html.includes('href="/"'), 'ツールへ戻る導線が無い');
});

// ── ⑥ 索引 ────────────────────────────────────────────────
test('sitemap に /soudan が1件だけある', () => {
  const xml = read('sitemap.xml');
  const n = (xml.match(/\/soudan</g) || []).length;
  assert.strictEqual(n, 1, `sitemap の /soudan が ${n} 件`);
});

test('/soudan は noindex ではない(出口の着地点が索引から外れない)', () => {
  assert.ok(!/name="robots"[^>]*noindex/.test(read(SOUDAN)), 'soudan が noindex になっている');
  // 対照: /legal は noindex のままであること(B4 の持ち物なので触っていない)
  assert.ok(/name="robots"[^>]*noindex/.test(read('legal.html')), 'legal の noindex を勝手に外している');
});

let passed = 0;
let failed = 0;
console.log('第3段(factory)への出口');
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
