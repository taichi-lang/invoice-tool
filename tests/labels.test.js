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

const TYPES = ['請求書', '見積書', '納品書', '領収書', '発注書', '注文請書'];

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
  assert.strictEqual(DOC.dueLabelOf('発注書'), '納期', '発注書の期限の語が変わっている');
  assert.strictEqual(DOC.dueLabelOf('注文請書'), '納期', '注文請書の期限の語が変わっている');
});

// ---------------------------------------------------------------- 発注書(2026-10-03)
// 発注書は書き手が「発注する側」になる。請求書の下書きから切り替えると、
// 自分の振込先が入ったまま発注先へ印刷されてしまう。振込先は紙にも画面にも出さない。

test('発注書と注文請書だけが振込先の欄を出さない', () => {
  const NO_BANK = ['発注書', '注文請書'];
  for (const t of TYPES) {
    assert.strictEqual(DOC.showsBank(t), !NO_BANK.includes(t), `${t} の振込先の出し方が想定と違う`);
  }
});

test('画面と紙の振込先の欄を、同じ showsBank から隠している', () => {
  assert.ok(/id="pBankBlock"/.test(HTML), '紙の振込先の欄に名札が無い');
  assert.ok(/id="bankField"/.test(HTML), '画面の振込先の欄に名札が無い');
  assert.ok(/pBankBlock'\)\.hidden\s*=\s*!bankShown/.test(APP), '紙の振込先を隠していない');
  assert.ok(/bankField'\)\.hidden\s*=\s*!bankShown/.test(APP), '画面の振込先を隠していない');
  assert.ok(/bankShown\s*=\s*showsBank\(state\.docType\)/.test(APP), '隠す判定が doctype.js の表から来ていない');
});

test('/?type=order で発注書として開ける', () => {
  assert.ok(/order:\s*'発注書'/.test(APP), 'type=order が発注書に対応していない');
  assert.ok(/<option value="発注書">発注書<\/option>/.test(HTML), '書類の種類に発注書が無い');
});

// ---------------------------------------------------------------- 注文請書(2026-10-09)
// 発注書を受け取った側が返す書面。自分=受注者、宛先=注文者。支払いを求める紙ではないので振込先は出さない。

test('/?type=acceptance で注文請書として開ける', () => {
  assert.ok(/acceptance:\s*'注文請書'/.test(APP), 'type=acceptance が注文請書に対応していない');
  assert.ok(/<option value="注文請書">注文請書<\/option>/.test(HTML), '書類の種類に注文請書が無い');
});

test('注文請書の宛先と自分の欄は 注文者/受注者 で、他の書類と取り違えない', () => {
  const p = DOC.presetOf('注文請書');
  assert.strictEqual(p.to, '注文者');
  assert.strictEqual(p.from, '受注者');
  assert.ok(/お請け/.test(p.lead), '文言が「お請けします」になっていない');
});

test('/chumon-ukesho の案内が、画面の見出しと同じ語で欄を指している', () => {
  const GUIDE = read('chumon-ukesho.html');
  const p = DOC.presetOf('注文請書');
  assert.ok(GUIDE.includes(`2. ${p.to}`), `案内の宛先の欄名が「${p.to}」でない`);
  assert.ok(GUIDE.includes(`3. 自分(${p.from})`), `案内の自分の欄名が「${p.from}」でない`);
  assert.ok(GUIDE.includes(p.lead), '案内の文言が紙の文言と違う');
  assert.ok(GUIDE.includes(p.grand), '案内の金額の見出しが紙と違う');
  assert.ok(/\/\?type=acceptance/.test(GUIDE), '案内から type=acceptance へ飛んでいない');
  assert.ok(/判定しません/.test(GUIDE), '印紙の要否を判定しないと書いていない');
});

test('CSV の期限の列名も紙と同じ語で書く', () => {
  assert.ok(/preset\.due \|\| '期限'/.test(APP), 'CSV の期限の列名が「支払期限」で固定に戻っている');
});

// ------------------------------------------- 宛先と自分の欄の名前(2026-10-05)
//
// 本番 /?type=order を 375px で操作して見つけた。発注書を選んでも、画面の見出しは
// 「2. 請求先」「3. 自分(請求元)」のまま、CSV の列名も「請求先」「請求元」だった。
// 発注書の自分は払う側であり、「請求元」と名乗ると意味が逆になる。

test('対照: 宛先と自分の欄の名前は、発注書だけが 発注先・発注元 で、他の4書類は従来どおり', () => {
  for (const t of ['請求書', '見積書', '納品書', '領収書']) {
    assert.strictEqual(DOC.presetOf(t).to, '請求先', `${t} の宛先の欄の名前が変わっている`);
    assert.strictEqual(DOC.presetOf(t).from, '請求元', `${t} の自分の欄の名前が変わっている`);
  }
  assert.strictEqual(DOC.presetOf('発注書').to, '発注先', '発注書の宛先が「発注先」になっていない');
  assert.strictEqual(DOC.presetOf('発注書').from, '発注元', '発注書の自分が「発注元」になっていない');
});

test('画面の見出しの宛先・自分の語を、紙と同じ表(preset.to / preset.from)から書いている', () => {
  assert.ok(/id="toLabel"/.test(HTML) && /id="fromLabel"/.test(HTML), '見出しに書き換えるための名札が無い');
  assert.ok(/\$\('toLabel'\)\.textContent = preset\.to/.test(APP), '画面の宛先の見出しが preset.to から書かれていない');
  assert.ok(/\$\('fromLabel'\)\.textContent = preset\.from/.test(APP), '画面の自分の見出しが preset.from から書かれていない');
});

test('CSV の宛先・自分の列名も同じ表から書く(「請求先」「請求元」の固定に戻っていない)', () => {
  assert.ok(!/'請求先', '請求元'/.test(APP), 'CSV の列名が「請求先」「請求元」で固定に戻っている');
  assert.ok(/preset\.to, preset\.from/.test(APP), 'CSV の列名が preset.to / preset.from から書かれていない');
});

test('宛名が空のとき、CSV に敬称だけ(「御中」)を書かない(紙と同じ)', () => {
  assert.ok(/state\.toName \? state\.toName \+ state\.toHonorific : ''/.test(APP),
    '宛名が空でも CSV の宛先に敬称だけが出る');
});

test('/hacchusho の案内が、画面の見出しと同じ語で欄を指している', () => {
  const GUIDE = read('hacchusho.html');
  assert.ok(/2\. 発注先/.test(GUIDE) && /3\. 自分\(発注元\)/.test(GUIDE), '案内が画面に無い見出しで欄を指している');
  assert.ok(!/2\. 請求先/.test(GUIDE) && !/3\. 自分\(請求元\)/.test(GUIDE), '案内に古い見出しが残っている');
});

test('表は1か所にしかない(app.js が自前の表を持ち直していない)', () => {
  // 表が2つに戻ると、片方だけ直したときに画面と紙がまた食い違う。
  assert.ok(!/const DOC_PRESETS\s*=\s*\{/.test(APP), 'app.js に書類の文言の表が復活している');
  assert.ok(/window\.InvoiceDocType/.test(APP), 'app.js が doctype.js から文言を読んでいない');
});

// ------------------------------------------- 種類を変えたときの日付の持ち越し

test('項目名が変わる組み合わせでは、日付を持ち越さない', () => {
  // 2026-09-21。見積書の「有効期限」が納品書の「納品日」として黙って紙に出ていた。
  // 2026-10-09。発注書 → 注文請書 は紙の項目名が同じ「納期」なので持ち越してよい
  // (注文請書は発注書と同じ納期を書き写す書類)。判定は項目名の異同で行う。
  let changed = 0;
  for (const from of TYPES) {
    for (const to of TYPES) {
      if (from === to) continue;
      const same = DOC.dueLabelOf(from) === DOC.dueLabelOf(to);
      if (!same) changed++;
      assert.strictEqual(
        DOC.carriesDueDate(from, to), same,
        `${from} → ${to} の持ち越しが想定と違う(紙の項目名は ` +
        `${DOC.dueLabelOf(from) || 'なし'} → ${DOC.dueLabelOf(to) || 'なし'})`
      );
    }
  }
  assert.ok(changed >= 20, '項目名が変わる組み合わせがほとんど無い(表が壊れている)');
  assert.strictEqual(DOC.carriesDueDate('発注書', '注文請書'), true, '発注書 → 注文請書(どちらも納期)で日付が消える');
  assert.strictEqual(DOC.carriesDueDate('見積書', '納品書'), false, '見積書 → 納品書で日付が持ち越される(2026-09-21 の再発)');
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
