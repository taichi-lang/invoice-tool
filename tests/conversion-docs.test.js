/*
 * 解説ページに書いた「変換手順」が、ツールの実際の挙動と食い違わないことの回帰テスト。
 *   実行: node tests/conversion-docs.test.js
 *
 * 2026-09-22、本番の画面で実際に確かめて見つけた食い違いを固定する。
 *
 *   09-21 に「書類の種類を変えたら期限の日付を消す」変更を出した。
 *   ところが、その手順を説明している解説ページ2枚は変更前のままだった。
 *
 *     /mitsumorisho 手順4「書類番号・発行日・支払期限を書き換え」
 *     /nohinsho     手順4「発行日と支払期限を書き換えます」
 *
 *   → 書いてあるとおりに操作すると、期限の欄は空で、
 *     ページが一言も触れていない断り書きが画面に出る。
 *     利用者は「書き換える」つもりで来て、消えた欄と知らない文言に出会う。
 *
 * このテストが守るのは1つだけである。
 *   その書類から請求書へ変えたときに日付が消える(= doctype.js の表がそう言う)なら、
 *   その変換手順を載せているページは、消えることを本文で断っていなければならない。
 *
 * ⚠ 判定の向きは doctype.js の表から取る。ページ側に直書きしない。
 *   表とページの2か所に同じ知識を置くと、09-20 と同じ食い違いがまた起きる。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const read = (p) => fs.readFileSync(path.join(pub, p), 'utf8');

const DOC = require('../public/doctype.js');

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

/** 「受注したら請求書に流用する」手順を載せているページと、その元の書類。 */
const CONVERSION_PAGES = [
  { file: 'mitsumorisho.html', from: '見積書' },
  { file: 'nohinsho.html', from: '納品書' },
];

const TO = '請求書';

/** app.js が実際に出す断り書きの本文。ページはこれと同じ文言で予告する。 */
const NOTICE = '書類の種類が変わったため、前に入れた日付は空にしました。';

// ------------------------------------------------- 前提: 表とアプリが一致している

test('断り書きの本文は app.js に実在する(テストの前提)', () => {
  assert.ok(
    read('app.js').includes(NOTICE) || read('index.html').includes(NOTICE),
    `断り書き「${NOTICE}」がアプリ側に見つからない。文言を変えたならこのテストも直す`
  );
});

// ------------------------------------------------- 本体

for (const { file, from } of CONVERSION_PAGES) {
  const html = read(file);
  const carries = DOC.carriesDueDate(from, TO);

  test(`${file}: ${from}→${TO} で日付が消えることを本文で断っている`, () => {
    if (carries) return;  // 消えないなら断る必要はない
    assert.ok(
      html.includes('空になります'),
      `${from}の期限(${DOC.dueLabelOf(from)})は${TO}(${DOC.dueLabelOf(TO)})に変えると消えるのに、`
        + `${file} は消えることに触れていない`
    );
  });

  test(`${file}: 画面に出る断り書きと同じ文言で予告している`, () => {
    if (carries) return;
    assert.ok(
      html.includes(NOTICE),
      `${file} が予告している文言が、画面に実際に出る文言と違う。`
        + '別の言い回しだと、出た断り書きが「予告されていたもの」だと分からない'
    );
  });

  test(`${file}: 消えない項目を「消える」と書いていない`, () => {
    // 消しすぎの側の対照。取引先や明細まで消えると書くと、使える手順が使えなく見える。
    assert.ok(
      !/取引先.{0,12}空になります/.test(html) && !/明細.{0,12}空になります/.test(html),
      `${file} が、実際には残る項目まで消えると書いている`
    );
  });

  test(`${file}: 期限を「書き換える」とだけ書いた手順が残っていない`, () => {
    if (carries) return;
    assert.ok(
      !/(支払期限|有効期限|納品日)を書き換え/.test(html),
      `${file} に「期限を書き換える」という手順が残っている。`
        + '欄は空なので、書き換えるものが無い'
    );
  });
}

// ------------------------------------------------- 切り替えで何が変わるかを列挙したページ
//
// 2026-09-23 に数えて見つけた残り。
//
//   上の CONVERSION_PAGES は「その書類から請求書をつくる手順」を載せたページを守る。
//   ところが「書類の種類を切り替えると何が変わるか」を列挙しているページが別に在り、
//   そちらは 09-21 の変更のあとも「表題と文言が変わります」のままだった。
//
//     /guide/seikyusho-kakikata FAQ「見積書や領収書も作れますか」
//
//   → 何が変わるかを数え上げて答えている場所で、いちばん驚く1件が抜けている。
//     読んだとおりに切り替えた人は、入れたはずの日付が消えた画面に出会う。
//
// 守るのは1つ。切り替えの結果を列挙するなら、消える欄も列挙に入っていること。

/** 「書類の種類を切り替えると何が変わるか」を列挙している場所。 */
const SWITCH_PAGES = [
  { file: 'guide/seikyusho-kakikata.html', from: '請求書', to: '見積書' },
];

for (const { file, from, to } of SWITCH_PAGES) {
  const html = read(file);
  const carries = DOC.carriesDueDate(from, to);

  test(`${file}: 切り替えの結果を数え上げた場所に、消える欄も入っている`, () => {
    if (carries) return;
    assert.ok(
      html.includes('空になります'),
      `${file} は「種類を切り替えると何が変わるか」を列挙しているのに、`
        + `${DOC.dueLabelOf(from)}→${DOC.dueLabelOf(to)} で欄が空になることが列挙に入っていない`
    );
  });

  test(`${file}: 画面に出る断り書きと同じ文言で予告している`, () => {
    if (carries) return;
    assert.ok(html.includes(NOTICE), `${file} の予告が、画面に実際に出る文言と違う`);
  });
}

let passed = 0;
let failed = 0;
console.log('解説ページの変換手順と、ツールの挙動の一致');
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
