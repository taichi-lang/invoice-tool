/*
 * 広告の入れ物(第1段の収益)の回帰テスト。依存パッケージなしで動かす。
 *   実行: node tests/ads.test.js
 *
 * 設計は AIBusiness `businesses/starter-tools/広告_設計.md`。
 * このテストが守っているのは、設計の「禁止事項」3つである。
 *
 *   ① 書類を作る画面に広告を置かない(§3)
 *      速さと静かさがこのツール唯一の強みで、広告を1枚置けばそれが消える。
 *   ② 請求書の紙に広告を混ぜない(§4)
 *      出力はそのまま取引先へ渡る。1ミリでも乗ったら成果物の欠陥である。
 *   ③ 「入力内容を送信しない」という約束を、広告の都合で緩めない
 *      書類を作る画面の CSP は `connect-src 'none'` のままであること。
 *      約束は index.html と legal.html に文章で書いてある。文章だけでなく
 *      ヘッダでも止まっていることを、ここで固定する。
 *
 * さらに「未設定のあいだは1バイトも描画しない」ことを、
 * tools/build-ads.mjs を実際に走らせて確かめる(下の「ビルド」節)。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

/** 広告を置くページ(記事と母屋)。 */
const AD_PAGES = [
  'guide/seikyusho-kakikata.html',
  'guide/seikyusho-teisei-saihakko.html',
  'guide/gensen-choshu-keisan.html',
  'kaigyo.html',
];

/** 広告を置かないページ。書類を作る画面と、取引条件の画面と、記事の一覧。 */
const NO_AD_PAGES = [
  'index.html',
  'mitsumorisho.html',
  'ryoshusho.html',
  'nohinsho.html',
  'soufujo.html',
  'inshi.html',
  'legal.html',
  'guide/index.html',
];

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

// ── ① 置く面と置かない面 ────────────────────────────────────
test('広告の読み込みは、記事と母屋の4ページにだけ入っている', () => {
  for (const p of AD_PAGES) {
    const html = read(pub, p);
    assert.ok(html.includes('/ads.js'), `${p} に ads.js が無い`);
    assert.ok(html.includes('/ads-config.js'), `${p} に ads-config.js が無い`);
  }
});

test('書類を作る画面・/legal・記事一覧には、広告の読み込みが1つも無い', () => {
  for (const p of NO_AD_PAGES) {
    const html = read(pub, p);
    assert.ok(!html.includes('ads.js'), `${p} に広告の読み込みが入っている`);
  }
});

test('1ページに2枚出さない(ads.js の読み込みは1ページ1回)', () => {
  for (const p of AD_PAGES) {
    const hits = read(pub, p).split('src="/ads.js"').length - 1;
    assert.strictEqual(hits, 1, `${p} の ads.js が ${hits} 回`);
  }
});

// ── ② 紙に混ぜない ─────────────────────────────────────────
test('印刷時に .ad-slot を消す規則が、no-print とは別に独立して在る', () => {
  const css = read(pub, 'style.css');
  const re = /@media\s+print\s*\{[^}]*\.ad-slot\s*\{\s*display:\s*none\s*!important/;
  assert.ok(re.test(css), '.ad-slot 単独の印刷規則が style.css に無い');
});

test('器そのものにも no-print が付いている(対策の二重化)', () => {
  assert.ok(
    /className|class/.test(read(pub, 'ads.js')) &&
      read(pub, 'ads.js').includes('"ad-slot no-print"'),
    'ads.js が器に no-print を付けていない',
  );
});

// ── ③ 「送信しない」の約束を緩めない ──────────────────────────
const vercel = JSON.parse(read(root, 'vercel.json'));
const cspOf = (source) => {
  const rule = vercel.headers.find((h) => h.source === source);
  assert.ok(rule, `vercel.json に source ${source} が無い`);
  const csp = rule.headers.find((h) => h.key === 'Content-Security-Policy');
  assert.ok(csp, `${source} に CSP が無い`);
  return csp.value;
};

test('書類を作る画面の CSP は connect-src none のままである', () => {
  const csp = cspOf("/((?!guide|kaigyo).*)");
  assert.ok(csp.includes("connect-src 'none'"), `緩んでいる: ${csp}`);
  assert.ok(csp.includes("script-src 'self';"), `外部スクリプトが許されている: ${csp}`);
});

/* ⚠ seal.test.js は vercel.json の headers[0] から CSP を読み、
   「印影が端末の外へ出ない」ことを守っている。広告のために CSP を面ごとに
   分けたとき、順番を入れ替えるとあちらのテストが黙って別の規則を見にいく。
   だから「先頭は書類を作る画面の厳しいほうである」をここで固定する。 */
test('vercel.json の先頭は、書類を作る画面の厳しい CSP である', () => {
  const first = vercel.headers[0];
  assert.strictEqual(first.source, "/((?!guide|kaigyo).*)", `先頭が違う: ${first.source}`);
  const csp = first.headers.find((h) => h.key === 'Content-Security-Policy');
  assert.ok(csp && csp.value.includes("connect-src 'none'"), '先頭に厳しい CSP が無い');
});

test('広告を許すのは記事と母屋の CSP だけで、その2つに限られている', () => {
  const relaxed = vercel.headers.filter((h) =>
    (h.headers.find((x) => x.key === 'Content-Security-Policy') || {}).value
      ?.includes('googlesyndication'),
  );
  const sources = relaxed.map((h) => h.source).sort();
  assert.deepStrictEqual(sources, ['/guide/:path*', '/kaigyo'], `対象が違う: ${sources}`);
});

test('記事の CSP でも、フォームの送信先と埋め込み元は閉じたままである', () => {
  for (const s of ['/guide/:path*', '/kaigyo']) {
    const csp = cspOf(s);
    assert.ok(csp.includes("form-action 'none'"), `${s} の form-action が開いている`);
    assert.ok(csp.includes("frame-ancestors 'none'"), `${s} の frame-ancestors が開いている`);
    assert.ok(csp.includes("default-src 'none'"), `${s} の default-src が開いている`);
  }
});

// ── ビルド: 未設定なら1バイトも描画しない ──────────────────────
const buildScript = path.join(root, 'tools', 'build-ads.mjs');
const adsTxt = path.join(pub, 'ads.txt');
const runBuild = (env) =>
  execFileSync(process.execPath, [buildScript], {
    env: { ...process.env, ADSENSE_CLIENT: '', ADSENSE_ARTICLE_SLOT: '', ...env },
    encoding: 'utf8',
  });

test('未設定でビルドすると、設定値は null で ads.txt は作られない', () => {
  runBuild({});
  assert.ok(read(pub, 'ads-config.js').includes('window.__ADSENSE__ = null'));
  assert.ok(!fs.existsSync(adsTxt), '未設定なのに ads.txt がある(404 にならない)');
});

test('片方だけ設定しても有効にしない(発行者IDだけ)', () => {
  runBuild({ ADSENSE_CLIENT: 'ca-pub-0000000000000000' });
  assert.ok(read(pub, 'ads-config.js').includes('window.__ADSENSE__ = null'));
  assert.ok(fs.existsSync(adsTxt), '発行者IDがあるなら ads.txt は出す');
});

test('片方だけ設定しても有効にしない(広告ユニットIDだけ)', () => {
  runBuild({ ADSENSE_ARTICLE_SLOT: '1234567890' });
  assert.ok(read(pub, 'ads-config.js').includes('window.__ADSENSE__ = null'));
  assert.ok(!fs.existsSync(adsTxt), '発行者IDが無いのに ads.txt がある');
});

test('形が違う値は受け付けない', () => {
  runBuild({ ADSENSE_CLIENT: 'pub-123', ADSENSE_ARTICLE_SLOT: '12' });
  assert.ok(read(pub, 'ads-config.js').includes('window.__ADSENSE__ = null'));
});

test('両方そろうと有効になり、ads.txt も出る', () => {
  runBuild({ ADSENSE_CLIENT: 'ca-pub-0000000000000000', ADSENSE_ARTICLE_SLOT: '1234567890' });
  const cfg = read(pub, 'ads-config.js');
  assert.ok(cfg.includes('"client":"ca-pub-0000000000000000"'), cfg);
  assert.ok(cfg.includes('"slot":"1234567890"'), cfg);
  assert.strictEqual(
    read(pub, 'ads.txt'),
    'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0\n',
  );
});

test('後片付け: リポジトリの状態を未設定に戻す', () => {
  runBuild({});
  assert.ok(read(pub, 'ads-config.js').includes('window.__ADSENSE__ = null'));
  assert.ok(!fs.existsSync(adsTxt));
});

let passed = 0;
let failed = 0;
console.log('広告の入れ物(第1段の収益)');
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
