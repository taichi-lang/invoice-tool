/*
 * 送付状ページ(/soufujo)の画面側の回帰テスト。依存パッケージなしで動かす。
 *   実行: node tests/soufujo.test.js
 *
 * なぜこれを書いたか。
 * 2026-09-10 の稼働では、ブラウザで実際に開いて確かめることができなかった
 * (この稼働環境では開発サーバーを起こせない)。ページを一度も描画せずに出すことになるため、
 * 「開いた瞬間に真っ白になる」種類の壊れ方だけでも、ファイルの読み合わせで落としておく。
 *
 * 落とせるのは次の4つ。
 *   1. soufujo.js が触る id が、HTML に1つでも無い(= 起動時に例外で止まり、紙面が出ない)
 *   2. cover.js より先に soufujo.js を読み込んでいる(= CoverLetter が未定義)
 *   3. インラインの <script> がある(= vercel.json の CSP script-src 'self' に弾かれる)
 *   4. soufujo.js が付ける sf- のクラスが、style.css に1つも定義されていない(= 素のまま出る)
 *
 * ⚠ これは描画の代わりにはならない。横あふれ・改ページ・印刷の見た目は、
 *    このテストでは1件も確かめていない。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'soufujo.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'soufujo.js'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'style.css'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

console.log('soufujo.test.js');

test('soufujo.js が触る id は、すべて soufujo.html に在る', () => {
  const ids = [...view.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 15, '読み取れた id が ' + ids.length + ' 個しかない');
  const missing = [...new Set(ids)].filter((id) => !html.includes('id="' + id + '"'));
  assert.deepStrictEqual(missing, [], 'HTML に無い id: ' + missing.join(','));
});

test('cover.js を soufujo.js より先に読み込んでいる', () => {
  const a = html.indexOf('src="/cover.js"');
  const b = html.indexOf('src="/soufujo.js"');
  assert.notStrictEqual(a, -1, 'cover.js を読み込んでいない');
  assert.notStrictEqual(b, -1, 'soufujo.js を読み込んでいない');
  assert.ok(a < b, '読み込みの順が逆になっている');
});

test('インラインの <script> が無い(CSP script-src \'self\' に弾かれるため)', () => {
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)].map((m) => m[0]);
  assert.deepStrictEqual(inline, [], 'インラインの script: ' + inline.join(','));
});

test('紙面に付ける sf- のクラスは、すべて style.css に定義がある', () => {
  const used = [...new Set(
    [...view.matchAll(/el\('[a-z0-9]+', '(sf-[a-z-]+)'/g)].map((m) => m[1])
  )];
  assert.ok(used.length >= 8, '読み取れたクラスが ' + used.length + ' 個しかない');
  const missing = used.filter((cls) => !css.includes('.' + cls));
  assert.deepStrictEqual(missing, [], 'style.css に無いクラス: ' + missing.join(','));
});

test('用紙は請求書と同じ .paper を使い、送付状ぶんの余白を重ねている', () => {
  assert.ok(/class="paper sf-paper"/.test(html), '用紙のクラスが違う');
  assert.ok(css.includes('.sf-paper'), '.sf-paper の定義が無い');
});

test('入力パネルと解説は印刷されない(紙面だけが出る)', () => {
  assert.ok(html.includes('<section class="editor no-print"'), '入力パネルに no-print が無い');
  assert.ok(html.includes('<article class="article no-print">'), '解説に no-print が無い');
});

test('「送信しない」の表示が、ヘッダーと本文の両方に在る', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.includes('入力内容は送信されません'), 'ヘッダーに表示が無い');
  assert.ok(html.includes('サーバーへ送信・保存されることはありません'), '本文に表示が無い');
});

test('用途のひな形は、画面側で二重に持たない(cover.js が唯一の出どころ)', () => {
  assert.ok(view.includes('CL.PRESETS'), 'ひな形を cover.js から引いていない');
  assert.ok(!/label:\s*'/.test(view), '画面側にひな形の文言が直書きされている');
});

console.log('soufujo.test.js: ' + passed + ' 件すべて通過');
