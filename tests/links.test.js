/*
 * サイト内リンクとナビゲーションの回帰テスト。依存パッケージなしで動かす。
 *   実行: node tests/links.test.js
 *
 * 2026-09-02、納品書を追加したときに分かったこと:
 * ツールは 2026-08 の時点で「納品書」を出力できたのに、そこへ入る URL が1つも無かった。
 * 機能はあるのに入口が無い、という欠け方は、どのテストにも引っかからなかった。
 *
 * このテストが守るのは次の4点。
 *   1. サイト内リンク(href="/…")の飛び先が実在すること(リンク切れ0件)
 *   2. 全ページのナビが同じリンク集合を持つこと(1ページだけ足し忘れる事故を止める)
 *   3. canonical が自分自身のパスを指していること
 *   4. sitemap.xml の <loc> と、実在する公開ページが一致すること
 *
 * ⚠ このテストは「今ある欠陥」を落とすためではなく、今の形を固定するために書いた。
 *    修正前のコードで落ちることは確かめていない(修正前には落ちる欠陥が無かった)。
 *    代わりに、ナビのリンクを1本消すと 2 が落ちることを実際に確かめてある。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const ORIGIN = 'https://invoice-tool-kohl.vercel.app';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

/** public/ 以下の .html を、公開URLのパスに直して集める(cleanUrls: 拡張子を落とす)。 */
function listPages() {
  const pages = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, prefix + entry.name + '/');
      } else if (entry.name.endsWith('.html')) {
        const base = entry.name.replace(/\.html$/, '');
        const url = base === 'index' ? prefix : prefix + base;
        pages.push({ file: full, url, html: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(PUBLIC, '/');
  return pages;
}

const pages = listPages();
const urls = new Set(pages.map((p) => p.url));

/** そのページの <nav class="site-nav"> の中の href だけを取り出す。 */
function navLinks(html) {
  const start = html.indexOf('<nav class="site-nav">');
  if (start === -1) return null;
  const end = html.indexOf('</nav>', start);
  const block = html.slice(start, end);
  return [...block.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

console.log('links.test.js');

test('公開ページが1つ以上ある', () => {
  assert.ok(pages.length >= 8, '見つかったページ数: ' + pages.length);
});

test('サイト内リンクの飛び先がすべて実在する(リンク切れ0件)', () => {
  const broken = [];
  for (const page of pages) {
    for (const m of page.html.matchAll(/href="(\/[^"#?]*)"/g)) {
      const target = m[1];
      if (target.startsWith('//')) continue;          // プロトコル相対の外部リンク
      if (/\.(css|svg|txt|xml|js|png|ico)$/.test(target)) {
        if (!fs.existsSync(path.join(PUBLIC, target))) broken.push(page.url + ' → ' + target);
        continue;
      }
      if (!urls.has(target)) broken.push(page.url + ' → ' + target);
    }
  }
  assert.deepStrictEqual(broken, [], 'リンク切れ: ' + broken.join(' / '));
});

test('ナビを持つページは、全ページで同じリンク集合を持つ', () => {
  const withNav = pages.filter((p) => navLinks(p.html) !== null);
  assert.ok(withNav.length >= 8, 'ナビを持つページ数: ' + withNav.length);
  const expected = navLinks(withNav[0].html).join(',');
  for (const page of withNav) {
    assert.strictEqual(
      navLinks(page.html).join(','),
      expected,
      page.url + ' のナビが他ページとそろっていない'
    );
  }
});

test('ナビに4つの書類ツールがすべて並んでいる', () => {
  const withNav = pages.filter((p) => navLinks(p.html) !== null);
  for (const target of ['/', '/mitsumorisho', '/nohinsho', '/ryoshusho']) {
    assert.ok(navLinks(withNav[0].html).includes(target), 'ナビに ' + target + ' が無い');
  }
});

test('ツールが出せる書類の種類は、すべて専用ページから開ける', () => {
  const app = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
  const start = app.indexOf('DOC_TYPE_BY_QUERY');
  const block = app.slice(start, app.indexOf('}', start));
  const keys = [...block.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 4, '書類の種類が読めていない: ' + keys.join(','));
  const linked = pages.map((p) => p.html).join('\n');
  for (const key of keys) {
    if (key === 'invoice') continue;                  // 請求書はトップそのもの
    assert.ok(
      linked.includes('/?type=' + key),
      '書類の種類 ' + key + ' へ入る導線がどのページにも無い'
    );
  }
});

test('canonical が自分自身のパスを指している(noindex のページは除く)', () => {
  for (const page of pages) {
    if (/name="robots"[^>]*noindex/.test(page.html)) continue;   // /legal は索引させない設計
    const m = page.html.match(/<link rel="canonical" href="([^"]+)">/);
    assert.ok(m, page.url + ' に canonical が無い');
    assert.strictEqual(m[1], ORIGIN + page.url, page.url + ' の canonical がずれている');
  }
});

test('sitemap.xml の <loc> と、noindex でない公開ページが一致する', () => {
  const sitemap = fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(ORIGIN, ''));
  const indexable = pages.filter((p) => !/name="robots"[^>]*noindex/.test(p.html)).map((p) => p.url);
  assert.deepStrictEqual(
    locs.slice().sort(),
    indexable.slice().sort(),
    'sitemap=' + locs.sort().join(',') + ' / 実在=' + indexable.sort().join(',')
  );
});

test('各ページの h1 はちょうど1個', () => {
  for (const page of pages) {
    const n = (page.html.match(/<h1[\s>]/g) || []).length;
    assert.strictEqual(n, 1, page.url + ' の h1 が ' + n + ' 個');
  }
});

console.log('links.test.js: ' + passed + ' 件すべて通過');
