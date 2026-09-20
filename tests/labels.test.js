/*
 * 画面の項目名と、紙に出る項目名が食い違わないことの回帰テスト。
 *   実行: node tests/labels.test.js
 *
 * 2026-09-20、本番の画面で実際に確かめて見つけた欠陥を固定する。
 *
 *   見積書で「有効期限」に日付を入れ、/?type=delivery を開くと、
 *   下書きが引き継がれて紙には「納品日 2026年10月20日」と出る。
 *   ところが画面の入力欄の名前は、4書類のどれを選んでも「支払期限」で固定だった。
 *   → 画面で「支払期限」と名乗った欄の中身が、紙では「納品日」として印刷される。
 *     利用者は、自分が納品日を入れたつもりがないことに気づけない。
 *
 * このテストが守るのは次の2つである。
 *   ① 画面の期限欄の名前は、書類の種類ごとに紙と同じ語になる
 *   ② 紙に期限の行が出ない書類(領収書)では、画面にもその欄を出さない
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const read = (p) => fs.readFileSync(path.join(pub, p), 'utf8');

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

const HTML = read('index.html');
const APP = read('app.js');
const DOC = require('../public/doctype.js');

const TYPES = ['請求書', '見積書', '納品書', '領収書'];

// ---------------------------------------------------------------- 画面の側

test('画面の期限欄に、書き換えるための名札(#dueLabel)がある', () => {
  assert.ok(
    /id="dueLabel"/.test(HTML),
    '期限欄の名前が固定の文字列のままで、書類の種類に追従できない'
  );
});

test('期限欄そのものにも名札(#dueField)がある(紙に出ない書類で隠すため)', () => {
  assert.ok(/id="dueField"/.test(HTML), '期限欄を隠す手がかりが index.html に無い');
});

// ---------------------------------------------------------------- 紙の側との一致

test('画面の期限欄の名前を、紙と同じ preset.due から書いている', () => {
  assert.ok(
    /dueLabel[\s\S]{0,120}preset\.due/.test(APP),
    '画面の期限欄の名前が、紙に出る語(preset.due)と別の出どころになっている'
  );
});

test('紙に期限の行が出ない書類では、画面の期限欄も隠す', () => {
  assert.ok(
    /dueField[\s\S]{0,120}preset\.due/.test(APP),
    '領収書のように紙に出ない書類でも、画面には期限欄が出たままになる'
  );
});

// ---------------------------------------------------------------- 対照

test('対照: 4書類の紙の期限の語は、いまも 支払期限・有効期限・納品日・なし である', () => {
  // ここが変わったら、上の4件が守っている前提そのものが変わっている。
  assert.strictEqual(DOC.dueLabelOf('請求書'), '支払期限', '請求書の期限の語が変わっている');
  assert.strictEqual(DOC.dueLabelOf('見積書'), '有効期限', '見積書の期限の語が変わっている');
  assert.strictEqual(DOC.dueLabelOf('納品書'), '納品日', '納品書の期限の語が変わっている');
  assert.strictEqual(DOC.dueLabelOf('領収書'), '', '領収書に期限の語が付いた(紙に行が出るようになった)');
});

test('表は1か所にしかない(app.js が自前の表を持ち直していない)', () => {
  // 表が2つに戻ると、片方だけ直したときに画面と紙がまた食い違う。
  assert.ok(!/const DOC_PRESETS\s*=\s*\{/.test(APP), 'app.js に書類の文言の表が復活している');
  assert.ok(/window\.InvoiceDocType/.test(APP), 'app.js が doctype.js から文言を読んでいない');
});

// ------------------------------------------- 種類を変えたときの日付の持ち越し

test('項目名が変わる組み合わせでは、日付を持ち越さない', () => {
  // 2026-09-21。見積書の「有効期限」が納品書の「納品日」として黙って紙に出ていた。
  for (const from of TYPES) {
    for (const to of TYPES) {
      if (from === to) continue;
      assert.strictEqual(
        DOC.carriesDueDate(from, to), false,
        `${from} → ${to} で日付が持ち越される(紙の項目名は ` +
        `${DOC.dueLabelOf(from) || 'なし'} → ${DOC.dueLabelOf(to) || 'なし'} と変わる)`
      );
    }
  }
});

test('同じ種類のままなら持ち越す(消しすぎていない)', () => {
  for (const t of TYPES) {
    assert.strictEqual(DOC.carriesDueDate(t, t), true, `${t} のままで日付が消えている`);
  }
});

test('起動直後(比較する前が無い)は消さない', () => {
  // 下書きを読み込んだ直後にここで消すと、保存した日付が毎回消える。
  assert.strictEqual(DOC.carriesDueDate(null, '請求書'), true, '起動直後に日付が消される');
  assert.strictEqual(DOC.carriesDueDate(undefined, '納品書'), true, '起動直後に日付が消される');
});

test('未知の種類が来ても落ちない(請求書の語に倒す)', () => {
  assert.strictEqual(DOC.dueLabelOf('注文書'), '支払期限');
  assert.strictEqual(DOC.carriesDueDate('注文書', '請求書'), true);
});

// ------------------------------------------- 画面の側の実装(消したことを伝える)

test('日付を消したことを伝える断り書きが画面にある', () => {
  assert.ok(/id="dueResetNotice"/.test(HTML), '黙って日付が消える(利用者に伝える場所が無い)');
});

test('断り書きは、実際に消したときだけ出す', () => {
  assert.ok(
    /dueResetShown\s*=\s*dropped/.test(APP),
    '消していないときにも断り書きが出る書き方になっている'
  );
});

test('種類の判定は、読み取り(readState)より先に通す', () => {
  // あとに置くと、消す前の日付がそのまま紙に回る。
  const body = APP.slice(APP.indexOf('function update()'));
  assert.ok(
    body.indexOf('syncDueDate()') < body.indexOf('readState()'),
    'syncDueDate() が readState() より後にある'
  );
});

let passed = 0;
let failed = 0;
console.log('画面の項目名と紙の項目名の一致');
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
