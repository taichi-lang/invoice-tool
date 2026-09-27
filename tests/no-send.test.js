/*
 * 「入力内容を送信しない」が、入力欄のあるページで機械に守られていることの回帰テスト。
 * 依存パッケージなしで動かす。
 *   実行: node tests/no-send.test.js
 *
 * `/legal` は「本ツールに入力された内容は…サーバーへ送信されることも…ありません」と
 * 全ツールについて約束し、各画面のヘッダーも「入力内容は送信されません」と書く。
 * この約束を「文字」ではなく「機械」で保証しているのは、vercel.json の CSP
 * (`connect-src 'none'` / `form-action 'none'` ほか)である。
 *
 * ⚠ ところが、既存の試験が見ていたのは「vercel.json の特定の source に厳しい CSP が在るか」だけで、
 *   「入力欄のあるページに、実際にどの CSP が当たるか」は1件も見ていなかった。
 *   2026-09-28 に `/kaigyo`(広告のために CSP を緩めてあるページ)へ `<input>` を1つ注入したところ、
 *   14ファイルすべてが終了コード0で通った。→ この試験で塞ぐ。
 *
 * 判定の向き: 入力欄があるページ(または入力欄を作りうるスクリプトを読むページ)には、
 * 厳しい CSP が「当たっていなければならない」。緩い CSP のページには入力欄を置けない。
 * 迷ったら厳しい側に倒す(入力欄の判定は広めに取る)。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
const read = (p) => fs.readFileSync(path.join(pub, p), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

/** public/ 以下の全 HTML(名簿は手書きしない。ディスクを見る)。 */
function htmlFiles(dir = pub, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) return htmlFiles(path.join(dir, e.name), rel);
    return e.name.endsWith('.html') ? [rel] : [];
  });
}

/** cleanUrls: true のもとで、そのファイルが配信されるパス。 */
function urlOf(file) {
  const p = '/' + file.replace(/\.html$/, '');
  if (p === '/index') return '/';
  return p.replace(/\/index$/, '');
}

/** vercel.json の source を正規表現にする。知らない形は黙って通さず、落とす。 */
function sourceRegex(source) {
  if (source.includes('(')) return new RegExp(`^${source}$`);
  if (/^[\w/-]+\/:path\*$/.test(source)) {
    return new RegExp(`^${source.replace(/\/:path\*$/, '')}(?:/.*)?$`);
  }
  if (/^[\w/-]+$/.test(source)) return new RegExp(`^${source}$`);
  throw new Error(`この試験が解釈できない source の形: ${source}(判定を足してから通すこと)`);
}

/** そのパスに当たる CSP をすべて返す(Vercel は一致した規則のヘッダーをすべて付ける)。 */
function cspsFor(url) {
  return vercel.headers
    .filter((h) => sourceRegex(h.source).test(url))
    .flatMap((h) => h.headers.filter((x) => x.key.toLowerCase() === 'content-security-policy'))
    .map((x) => x.value);
}

/** CSP を { 指令: 値 } にする。 */
function directives(csp) {
  const out = {};
  for (const part of csp.split(';')) {
    const [name, ...vals] = part.trim().split(/\s+/);
    if (name) out[name] = vals.join(' ');
  }
  return out;
}

/** 送信を機械で止めている、と言ってよい CSP か。1つでも欠ければ false。 */
function forbidsSending(csp) {
  const d = directives(csp);
  return d['default-src'] === "'none'" &&
    d['connect-src'] === "'none'" &&
    d['form-action'] === "'none'" &&
    d['script-src'] === "'self'" &&
    d['img-src'] === "'self' data:" &&
    !('frame-src' in d);
}

/** 厳しい CSP が1つ以上当たり、当たったものがすべて厳しいか。 */
const guarded = (p) => p.csps.length >= 1 && p.csps.every(forbidsSending);

/** 文字を打ち込める器の数(soudan.test.js と同じ数え方)。 */
function inputWidgets(html) {
  return (html.match(/<(?:input|textarea|select)\b|contenteditable\s*=/gi) || []).length;
}

/** 読み込む同一オリジンのスクリプトが、入力欄を作りうるか(広めに取る)。 */
const MAKES_INPUT = /createElement\(\s*['"](?:input|textarea|select)['"]|contentEditable|innerHTML|insertAdjacentHTML|outerHTML/;
function scriptsMakeInputs(html) {
  const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="\/([^"]+)"/g)].map((m) => m[1]);
  return srcs.filter((s) => MAKES_INPUT.test(fs.readFileSync(path.join(pub, s), 'utf8')));
}

const pages = htmlFiles().map((file) => {
  const html = read(file);
  const url = urlOf(file);
  return { file, url, widgets: inputWidgets(html), makers: scriptsMakeInputs(html), csps: cspsFor(url) };
});
const inputPages = pages.filter((p) => p.widgets > 0 || p.makers.length > 0);

// ── 本体 ────────────────────────────────────────────────

test('入力欄のあるページには、送信を止める CSP が当たっている', () => {
  const bad = inputPages
    .filter((p) => !guarded(p))
    .map((p) => `${p.url}(入力欄${p.widgets}・作るJS[${p.makers.join(',')}]・CSP ${p.csps.length}件)`);
  assert.deepStrictEqual(bad, [], `送信を機械で止めていない入力ページ: ${bad.join(' / ')}`);
});

test('送信を止めていない CSP のページには、入力欄も入力欄を作るJSも無い', () => {
  const loose = pages.filter((p) => !guarded(p));
  const bad = loose.filter((p) => p.widgets > 0 || p.makers.length > 0).map((p) => p.url);
  assert.deepStrictEqual(bad, [], `緩い CSP のページに入力欄がある: ${bad.join(', ')}`);
  // 素通り防止: 緩いページが1枚も無いなら、この判定は何も見ていない
  assert.ok(loose.length >= 1, '緩い CSP のページが0枚(判定が空回りしている)');
});

test('素通り防止: 入力ページを実際に数えている(書類の画面が含まれる)', () => {
  const urls = inputPages.map((p) => p.url);
  for (const u of ['/', '/inshi', '/soufujo', '/atena']) {
    assert.ok(urls.includes(u), `${u} が入力ページとして数えられていない: ${urls.join(', ')}`);
  }
});

test('/legal の約束の文言と、各画面の表示が在る(文字の側)', () => {
  const legal = read('legal.html');
  assert.ok(legal.includes('お使いのブラウザの中だけで処理されます'), '/legal の約束が無い');
  assert.ok(legal.includes('サーバーへ送信されることも'), '/legal の約束が無い');
  for (const f of ['inshi.html', 'soufujo.html', 'atena.html']) {
    assert.ok(read(f).includes('入力内容は送信されません'), `${f} のヘッダー表示が無い`);
  }
  assert.ok(read('index.html').includes('サーバーへ送信・保存されることはありません'), 'index の表示が無い');
});

// ── 対照(判定の関数が 0/true を返すだけでないこと) ──────────────

test('対照: 当たる CSP の解決は、厳しい面と緩い面を打ち分ける', () => {
  assert.ok(guarded({ csps: cspsFor('/') }), '/ が厳しくない');
  assert.ok(guarded({ csps: cspsFor('/inshi') }), '/inshi が厳しくない');
  assert.ok(!guarded({ csps: cspsFor('/kaigyo') }), '/kaigyo が厳しいと出た(緩いはず)');
  assert.ok(!guarded({ csps: cspsFor('/guide/seikyusho-kakikata') }), '記事が厳しいと出た');
});

test('対照: 緩い CSP・欠けた CSP は forbidsSending が false を返す', () => {
  const strict = vercel.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.strictEqual(forbidsSending(strict), true);
  assert.strictEqual(forbidsSending(strict.replace("connect-src 'none'", 'connect-src https:')), false);
  assert.strictEqual(forbidsSending(strict.replace("img-src 'self' data:", "img-src 'self' data: https:")), false);
  assert.strictEqual(forbidsSending(strict.replace("form-action 'none'", "form-action 'self'")), false);
  assert.strictEqual(forbidsSending(strict.replace("script-src 'self'", "script-src 'self' https://x.test")), false);
});

test('対照: 入力欄を作るJSの判定は、作るものを拾い、作らないものを拾わない', () => {
  assert.ok(MAKES_INPUT.test("document.createElement('input')"));
  assert.ok(MAKES_INPUT.test('el.innerHTML = s'));
  assert.ok(!MAKES_INPUT.test('document.createElement("aside")'));
  assert.deepStrictEqual(scriptsMakeInputs(read('kaigyo.html')), [], 'ads.js が入力欄を作ると出た');
});

test('既知の穴(記録): `/kaigyo` や `/guide` で始まる直下の新ページには、CSP が1つも当たらない', () => {
  // vercel.json 先頭の source は /((?!guide|kaigyo).*) で、否定先読みが「前方一致」で効く。
  // いまそういうページは無いので実害は0。入力欄を持つ形で足されたら、上の本体の試験が落ちる。
  assert.strictEqual(cspsFor('/kaigyo-checklist').length, 0);
  assert.strictEqual(cspsFor('/guidebook').length, 0);
  const hit = pages.filter((p) => p.csps.length === 0).map((p) => p.url);
  assert.deepStrictEqual(hit, [], `CSP が1つも当たらないページが実在する: ${hit.join(', ')}`);
});

let passed = 0;
let failed = 0;
console.log('「入力内容を送信しない」の機械の側');
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
