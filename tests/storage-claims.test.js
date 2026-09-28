/*
 * `/legal`「データの取り扱い」が述べる保存の事実を、ディスクの側に繋ぐ回帰テスト。
 * 依存パッケージなしで動かす。
 *   実行: node tests/storage-claims.test.js
 *
 * `/legal` は送信しないこと(no-send.test.js が CSP で縛る)に加えて、保存について2つの事実を述べる。
 *   (a)「下書きは、お使いの端末のブラウザ内 (localStorage) にのみ保存されます」
 *   (b)「画面の『入力をすべて消す』を押すと、その保存データは削除されます」
 * 2026-09-29 時点で、この2つを見ている判定は0件だった。ツールは1本から5本に増えており、
 * 次の1本が sessionStorage や IndexedDB に書いたり、消すボタンを付け忘れたりしても何も落ちなかった。
 *
 * 判定の向き:
 *   - localStorage 以外の保存手段(sessionStorage / IndexedDB / Cookie / Cache API / Service Worker)は
 *     public/ のどこにも在ってはならない
 *   - localStorage に書くページには「入力をすべて消す」ボタンが在り、そのボタンの id がページの
 *     スクリプトから参照され、書いたのと同じキーを removeItem していなければならない
 * 名簿は手書きしない。ページとスクリプトはディスクから列挙する。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const read = (p) => fs.readFileSync(path.join(pub, p), 'utf8');

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

function filesUnder(dir = pub, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = base ? `${base}/${e.name}` : e.name;
    return e.isDirectory() ? filesUnder(path.join(dir, e.name), rel) : [rel];
  });
}
const all = filesUnder();
const htmlFiles = all.filter((f) => f.endsWith('.html'));
const codeFiles = all.filter((f) => /\.(js|html)$/.test(f));

/** ページが読む自前のスクリプト(外部 URL は含めない)と、インラインのスクリプト本文。 */
function pageCode(html) {
  const src = [...html.matchAll(/<script\b[^>]*\bsrc="\/([^"]+)"/g)].map((m) => read(m[1]));
  const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return [...src, ...inline].join('\n');
}

/** HTML コメントを除いた本文(コメントの中の語で判定が通らないように)。 */
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

const OTHER_STORAGE = /\bsessionStorage\b|\bindexedDB\b|document\.cookie|\bcaches\s*\.|\bserviceWorker\b|\bopenDatabase\b/;
const SETS = /localStorage\.setItem\(\s*([A-Za-z_$][\w$]*)/g;
const CLEAR_BUTTON = /<button\b[^>]*\bid="([^"]+)"[^>]*>\s*入力をすべて消す\s*<\/button>/;

const pages = htmlFiles.map((file) => {
  const html = read(file);
  const code = pageCode(html);
  return { file, html, code, keys: [...new Set([...code.matchAll(SETS)].map((m) => m[1]))] };
});

test('(a) localStorage 以外の保存手段が public/ のどこにも無い', () => {
  const hit = codeFiles.filter((f) => OTHER_STORAGE.test(stripComments(read(f))));
  assert.deepStrictEqual(hit, [], `localStorage 以外に保存しうる箇所: ${hit.join(', ')}`);
});

test('(b) localStorage に書くページには「入力をすべて消す」ボタンが在る', () => {
  const missing = pages.filter((p) => p.keys.length && !CLEAR_BUTTON.test(stripComments(p.html))).map((p) => p.file);
  assert.deepStrictEqual(missing, [], `書くのに消すボタンが無いページ: ${missing.join(', ')}`);
});

test('(b) そのボタンの id がページのスクリプトから参照され、書いたのと同じキーを removeItem する', () => {
  const bad = [];
  for (const p of pages.filter((q) => q.keys.length)) {
    const m = stripComments(p.html).match(CLEAR_BUTTON);
    if (!m) continue; // 上の試験が落とす
    if (!new RegExp(`['"]${m[1]}['"]`).test(p.code)) bad.push(`${p.file}: #${m[1]} を参照していない`);
    for (const key of p.keys) {
      if (!new RegExp(`localStorage\\.removeItem\\(\\s*${key.replace(/\$/g, '\\$')}\\s*\\)`).test(p.code)) {
        bad.push(`${p.file}: ${key} を removeItem していない`);
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('対照: 判定が実物に当たっている(書くページが0枚なら、上の2件は何も見ていない)', () => {
  const writers = pages.filter((p) => p.keys.length).map((p) => p.file).sort();
  assert.ok(writers.length >= 4, `localStorage に書くページが ${writers.length} 枚しか見つからない: ${writers.join(', ')}`);
  assert.ok(writers.includes('index.html'), '請求書本体(index.html)が書くページとして見つからない');
});

test('対照: 判定の部品が正負両方に反応する', () => {
  assert.ok(OTHER_STORAGE.test('sessionStorage.setItem("k", v)'));
  assert.ok(OTHER_STORAGE.test('const r = indexedDB.open("x")'));
  assert.ok(OTHER_STORAGE.test('document.cookie = "a=b"'));
  assert.ok(!OTHER_STORAGE.test('localStorage.setItem(STORAGE_KEY, s)'));
  assert.ok(CLEAR_BUTTON.test('<button type="button" id="x" class="y">入力をすべて消す</button>'));
  assert.ok(!CLEAR_BUTTON.test('<button id="x">リセット</button>'));
  assert.deepStrictEqual([...'localStorage.setItem(K, v); localStorage.setItem( K2 ,v)'.matchAll(SETS)].map((m) => m[1]), ['K', 'K2']);
});

let passed = 0;
let failed = 0;
console.log('/legal「データの取り扱い」の保存の事実');
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
