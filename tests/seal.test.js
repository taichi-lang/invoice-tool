/*
 * 印影(電子印)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/seal.test.js
 *
 * 守りたいこと2つ:
 *   1. 受け入れ判定 — 画像でないものや大きすぎるものを印影として通さない
 *   2. 画像が端末から出ない — 印影の経路に送信の口が生えていないこと、
 *      および表示に必要な宣言(HTML/CSS)が在り続けること
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const { checkSeal, MAX_BYTES } = require('../public/seal.js');

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

// ---------------------------------------------------------------- 受け入れ判定

test('PNG の data: URL は受け入れる', () => {
  assert.strictEqual(checkSeal('data:image/png;base64,iVBORw0KGgo=').ok, true);
});

test('JPEG と SVG も受け入れる', () => {
  assert.strictEqual(checkSeal('data:image/jpeg;base64,/9j/4AAQ').ok, true);
  assert.strictEqual(checkSeal('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=').ok, true);
});

test('画像でない data: URL は断る', () => {
  assert.strictEqual(checkSeal('data:text/html;base64,PHNjcmlwdD4=').ok, false);
});

test('外部URLは断る(端末の外を指すため)', () => {
  assert.strictEqual(checkSeal('https://example.com/seal.png').ok, false);
  assert.strictEqual(checkSeal('javascript:alert(1)').ok, false);
});

test('空・文字列でないものは断る', () => {
  assert.strictEqual(checkSeal('').ok, false);
  assert.strictEqual(checkSeal(null).ok, false);
  assert.strictEqual(checkSeal(undefined).ok, false);
  assert.strictEqual(checkSeal(123).ok, false);
});

test('上限を超える画像は断る', () => {
  const big = 'data:image/png;base64,' + 'A'.repeat(MAX_BYTES);
  assert.strictEqual(checkSeal(big).ok, false);
  assert.ok(/1MB/.test(checkSeal(big).reason), '理由に上限を書く');
});

// ------------------------------------------------------- 端末から出ないこと

test('印影の処理に送信の口が無い', () => {
  const js = pub('app.js') + pub('seal.js');
  assert.strictEqual(/fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket/.test(js), false,
    '送信に使える呼び出しがある');
});

test('CSP が外部への送信と外部画像を禁じたままである', () => {
  const csp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'))
    .headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.ok(/connect-src 'none'/.test(csp), 'connect-src が none でない');
  assert.ok(/img-src 'self' data:/.test(csp), 'img-src に data: が要る(印影の表示に使う)');
  assert.strictEqual(/img-src[^;]*https?:/.test(csp), false, 'img-src が外部を許している');
});

// ------------------------------------------------------------ 紙面に出ること

test('印影を選ぶ入力と、紙面に出す img が index.html に在る', () => {
  const html = pub('index.html');
  assert.ok(/id="sealFile"/.test(html), '印影を選ぶ input が無い');
  assert.ok(/id="sealClear"/.test(html), '印影を外すボタンが無い');
  assert.ok(/id="pSeal"/.test(html), '紙面に出す img が無い');
  assert.ok(/src="\/seal\.js"/.test(html), 'seal.js を読み込んでいない');
});

test('印影は発行元に重ね、印刷でも色が落ちない', () => {
  const css = pub('style.css');
  assert.ok(/\.from-seal/.test(css), '.from-seal の指定が無い');
  assert.ok(/print-color-adjust:\s*exact/.test(css),
    '印刷で背景色・画像の色が落ちない指定が無い(朱色が消える)');
});

test('印影があるとき、発行元の高さを確保して明細表に重ならない', () => {
  // 印影は絶対配置。高さを確保しないと下の表の見出しに重なる(本番の実物で起きた)
  assert.ok(/\.from\.has-seal\s*\{[^}]*min-height/.test(pub('style.css')),
    '.from.has-seal の min-height が無い');
  assert.ok(/has-seal/.test(pub('app.js')), 'has-seal を付け外ししていない');
});

test('印影は JSON の保存と読み込みで往復する', () => {
  const js = pub('app.js');
  assert.ok(/sealImage:\s*/.test(js), 'readState が印影を持ち出していない');
  assert.ok(/state\.sealImage/.test(js), 'writeState が印影を戻していない');
});

// ---------------------------------------------------------------- 実行

let ng = 0;
for (const c of cases) {
  try { c.fn(); console.log('  ok   ' + c.name); }
  catch (e) { ng++; console.log('  NG   ' + c.name + '\n       ' + e.message); }
}
console.log(`\n${cases.length - ng}/${cases.length} 件 通過`);
process.exit(ng ? 1 : 0);
