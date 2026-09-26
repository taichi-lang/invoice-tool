/*
 * 封筒の宛名(/atena)の回帰テスト。依存パッケージなしで動かす。
 *   実行: node tests/atena.test.js
 *
 * 前半は atena-core.js の決まり(敬称・数字・郵便番号)を直接確かめる。
 * 宛名の誤りは封をしてから気づいても直せないので、紙に出る文字列そのものを見る。
 * 後半は soufujo.test.js と同じ「開いた瞬間に真っ白になる」壊れ方を、ファイルの読み合わせで落とす。
 *
 * ⚠ これは実物の封筒への印刷の代わりにはならない。
 *    郵便番号の赤枠との位置合わせは、このツールでは扱っていない(ページにもそう書いてある)。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const A = require('../public/atena-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'atena.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'atena.js'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'atena.css'), 'utf8');
const baseCss = fs.readFileSync(path.join(PUBLIC, 'style.css'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const texts = (env) => env.recipient.map((r) => r.text);

console.log('atena.test.js');

/* ------------------------------------------------------------ 敬称 */

test('会社名だけなら、会社名に「御中」', () => {
  assert.deepStrictEqual(texts(A.buildEnvelope({ company: '株式会社サンプル' })), ['株式会社サンプル　御中']);
});

test('部署があれば、「御中」は会社名ではなく部署に付く', () => {
  assert.deepStrictEqual(
    texts(A.buildEnvelope({ company: '株式会社サンプル', dept: '経理部' })),
    ['株式会社サンプル', '経理部　御中']
  );
});

test('担当者名があれば「様」だけ。「御中」はどこにも出ない', () => {
  const t = texts(A.buildEnvelope({ company: '株式会社サンプル', dept: '経理部', person: '山田 太郎' }));
  assert.deepStrictEqual(t, ['株式会社サンプル', '経理部', '山田 太郎　様']);
  assert.ok(!t.join('').includes('御中'), '御中と様が重なっている');
});

test('利用者が自分で付けた敬称は二重にしない(「経理部御中」+担当者 → 御中が消える)', () => {
  const t = texts(A.buildEnvelope({ company: '株式会社サンプル御中', dept: '経理部 御中', person: '山田太郎様' }));
  assert.deepStrictEqual(t, ['株式会社サンプル', '経理部', '山田太郎　様']);
  assert.deepStrictEqual(texts(A.buildEnvelope({ company: '株式会社サンプル 御中' })), ['株式会社サンプル　御中']);
});

test('宛名が空なら、敬称だけが紙に出ることはない', () => {
  assert.deepStrictEqual(texts(A.buildEnvelope({})), []);
});

/* ------------------------------------------------------------ 数字 */

test('住所の数字は1字ずつ漢数字に、ハイフンは縦書きで縦棒になる「ー」に', () => {
  assert.strictEqual(A.toVerticalNumerals('千代田1-1'), '千代田一ー一');
  assert.strictEqual(A.toVerticalNumerals('12-305'), '一二ー三〇五');     // 位取りの「十」は使わない
  assert.strictEqual(A.toVerticalNumerals('２丁目３－４'), '二丁目三ー四'); // 全角もそろえる
  assert.strictEqual(A.toVerticalNumerals('1−2‐3'), '一ー二ー三');         // 別種のハイフン
});

test('漢数字を外したときも、ハイフンだけは縦書き用にそろえる', () => {
  const env = A.buildEnvelope({ address: '千代田1-1', kanji: false });
  assert.deepStrictEqual(env.address, ['千代田1ー1']);
});

test('住所は改行ごとに1列。空行は捨てる', () => {
  const env = A.buildEnvelope({ address: '東京都千代田区千代田1-1\n\n  サンプルビル3階  ' });
  assert.deepStrictEqual(env.address, ['東京都千代田区千代田一ー一', 'サンプルビル三階']);
});

/* ------------------------------------------------------------ 郵便番号 */

test('郵便番号は7桁として読めたときだけ 123-4567 の形にする', () => {
  assert.strictEqual(A.formatZip('1000001'), '100-0001');
  assert.strictEqual(A.formatZip('〒100-0001'), '100-0001');
  assert.strictEqual(A.formatZip('１００－０００１'), '100-0001');
  assert.strictEqual(A.formatZip('100-001'), '');   // 6桁: 推測で埋めない
  assert.strictEqual(A.formatZip('100-00011'), ''); // 8桁
  assert.strictEqual(A.formatZip(''), '');
});

test('読めない郵便番号は、空欄とは別の言い方で知らせる', () => {
  const p = A.findProblems(A.buildEnvelope({ zip: '100-001', company: 'A', address: 'x', fromName: 'b', fromAddress: 'y' }));
  assert.deepStrictEqual(p, ['宛先の郵便番号(7桁で読めません)']);
  const q = A.findProblems(A.buildEnvelope({ zip: '1000001', company: 'A', address: 'x', fromName: 'b', fromAddress: 'y' }));
  assert.deepStrictEqual(q, []);
});

test('朱書きは選択肢にある語だけ。それ以外は書かない', () => {
  assert.strictEqual(A.buildEnvelope({ enclosure: '請求書在中' }).enclosure, '請求書在中');
  assert.strictEqual(A.buildEnvelope({ enclosure: '親展' }).enclosure, '');
});

/* ------------------------------------------------------------ ページ */

test('atena.js が触る id は、すべて atena.html に在る', () => {
  const ids = [...view.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 15, '読み取れた id が ' + ids.length + ' 個しかない');
  const missing = [...new Set(ids)].filter((id) => !html.includes('id="' + id + '"'));
  assert.deepStrictEqual(missing, [], 'HTML に無い id: ' + missing.join(','));
});

test('atena-core.js を atena.js より先に読み込み、インラインの <script> は無い', () => {
  const a = html.indexOf('src="/atena-core.js"');
  const b = html.indexOf('src="/atena.js"');
  assert.ok(a !== -1 && b !== -1 && a < b, '読み込みの順が違う');
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)].map((m) => m[0]);
  assert.deepStrictEqual(inline, [], 'インラインの script: ' + inline.join(','));
});

test('紙面に付ける at- のクラスは、すべて atena.css に定義がある', () => {
  const used = [...new Set(
    [...view.matchAll(/el\('[a-z0-9]+', '(at-[a-z-]+)/g)].map((m) => m[1])
  )];
  assert.ok(used.length >= 8, '読み取れたクラスが ' + used.length + ' 個しかない');
  const missing = used.filter((cls) => !css.includes('.' + cls));
  assert.deepStrictEqual(missing, [], 'atena.css に無いクラス: ' + missing.join(','));
});

test('封筒の紙の大きさは、請求書の A4 の @page を1mmも変えずに持つ(名前付きのページ)', () => {
  assert.ok(/@page atena\s*\{[^}]*size:\s*120mm 235mm/.test(css), '長形3号の @page が無い');
  assert.ok(/\.at-sheet\s*\{[^}]*page:\s*atena/.test(css), '.at-sheet が atena のページを使っていない');
  assert.ok(!/@page\s*\{/.test(css), 'atena.css が名前の無い @page を持っている(全ページの A4 を上書きする)');
  assert.ok(/@page\s*\{\s*size:\s*A4/.test(baseCss), 'style.css の A4 の @page が消えている');
});

test('入力パネルと解説は印刷されない', () => {
  assert.ok(html.includes('<section class="editor no-print"'), '入力パネルに no-print が無い');
  assert.ok(html.includes('<article class="article no-print">'), '解説に no-print が無い');
});

test('「送信しない」の表示が、ヘッダーと本文の両方に在る', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.includes('入力内容は送信されません'), 'ヘッダーに表示が無い');
  assert.ok(html.includes('サーバーへ送信・保存されることはありません'), '本文に表示が無い');
});

test('郵便番号の赤枠に合わせていないことを、ページが断っている', () => {
  assert.ok(html.includes('郵便番号の赤い枠には合わせていません'), '断り書きが無い');
});

console.log('atena.test.js: ' + passed + ' 件すべて通過');
