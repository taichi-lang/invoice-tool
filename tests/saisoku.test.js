/*
 * 催促状(/saisoku)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/saisoku.test.js
 *
 * 前半は saisoku-core.js の判断(経過日数・曜日・金額の読み取り・段階ごとの文面)を直接確かめる。
 * 後半は画面側の読み合わせ(soufujo.test.js と同じ型)で、「開いた瞬間に真っ白になる」壊れ方を落とす。
 *
 * ⚠ 印刷の見た目・改ページは、このテストでは1件も確かめていない。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SS = require('../public/saisoku-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'saisoku.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'saisoku.js'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'style.css'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const BASE = {
  stage: 'first',
  date: '2026-10-05',
  replyBy: '2026-10-12',
  dueDate: '2026-09-30',
  invoiceDate: '2026-08-31',
  invoiceNo: '2026-0012',
  subject: '9月分 保守',
  amount: '110,000',
  toName: '株式会社サンプル',
  toHonorific: '御中',
  fromName: '中村太郎'
};
const build = (over) => SS.buildDocument(Object.assign({}, BASE, over));
const text = (doc) => [doc.title, doc.lead].concat(doc.body).join('\n');

console.log('saisoku.test.js');

// ── 日付 ─────────────────────────────────────────────
test('経過日数は支払期日から発行日までの日数(月をまたいでも数える)', () => {
  assert.strictEqual(SS.daysBetween('2026-09-30', '2026-10-05'), 5);
  assert.strictEqual(SS.daysBetween('2026-12-25', '2027-01-08'), 14);
  assert.strictEqual(SS.daysBetween('2026-10-05', '2026-10-05'), 0);
});

test('回答期限は曜日つきで書く(2026-10-12 は月曜)', () => {
  assert.strictEqual(SS.formatDateWithWeekday('2026-10-12'), '2026年10月12日(月)');
  assert.strictEqual(SS.formatDateWithWeekday('2026-09-29'), '2026年9月29日(火)');
});

test('暦に無い日付・空欄は読まない(勝手に今日にしない)', () => {
  assert.strictEqual(SS.formatDateJa('2026-02-30'), '');
  assert.strictEqual(SS.formatDateJa(''), '');
  assert.strictEqual(SS.daysBetween('', '2026-10-05'), null);
});

test('回答期限の初期値に使う n日後は、月末をまたいでも正しい', () => {
  assert.strictEqual(SS.addDays('2026-09-29', 7), '2026-10-06');
  assert.strictEqual(SS.addDays('2026-12-28', 7), '2027-01-04');
});

// ── 金額 ─────────────────────────────────────────────
test('金額は数字とカンマ・円記号だけを読む。読めないものは null(読み違えて催促しない)', () => {
  assert.strictEqual(SS.parseAmount('110,000'), 110000);
  assert.strictEqual(SS.parseAmount('¥110000'), 110000);
  assert.strictEqual(SS.parseAmount('１１００００円'), 110000);
  assert.strictEqual(SS.parseAmount('11万'), null);
  assert.strictEqual(SS.parseAmount('0'), null);
  assert.strictEqual(SS.formatYen(110000), '110,000円');
});

// ── 段階ごとの文面 ──────────────────────────────────────
test('1回目: 再送の申し出と、行き違いの断りが入る。経過日数は書かない', () => {
  const t = text(build({ stage: 'first' }));
  assert.ok(t.includes('再送いたします'), '再送の申し出が無い');
  assert.ok(t.includes('行き違い'), '行き違いの断りが無い');
  assert.ok(!/\d+日が経過/.test(t), '1回目に経過日数が入っている');
});

test('2回目: 経過日数を数字で書く', () => {
  const t = text(build({ stage: 'second' }));
  assert.ok(t.includes('本日で5日が経過'), '経過日数が無い: ' + t);
});

test('2回目でも、期日当日なら「0日が経過」とは書かない', () => {
  const t = text(build({ stage: 'second', date: '2026-09-30' }));
  assert.ok(!/日が経過/.test(t), '期日当日に経過日数が入っている: ' + t);
});

test('どちらの段階も、曜日つきの回答期限と1つの行動で閉じる', () => {
  for (const stage of ['first', 'second']) {
    const t = text(build({ stage }));
    assert.ok(t.includes('2026年10月12日(月)まで'), stage + ': 回答期限が無い');
    assert.ok(t.includes('ご入金のご予定日をお知らせ'), stage + ': してほしい行動が無い');
  }
});

test('遅延損害金・法的手続きの語は、どの段階の紙面にも出ない', () => {
  for (const stage of ['first', 'second']) {
    const t = text(build({ stage }));
    for (const w of ['損害金', '法的', '訴訟', '督促', '内容証明']) {
      assert.ok(!t.includes(w), stage + ' に「' + w + '」が出ている');
    }
  }
});

test('記書きには、入力した行だけが出る', () => {
  const full = build({ bank: '○○銀行 ○○支店 普通 0000000' });
  assert.deepStrictEqual(full.record.map((r) => r.label),
    ['請求書番号', '請求日', '件名', '請求金額', 'お支払期日', 'お振込先']);
  assert.strictEqual(full.record[3].value, '110,000円');
  const bare = build({ invoiceNo: '', invoiceDate: '', subject: '', amount: '', dueDate: '' });
  assert.strictEqual(bare.hasRecord, false);
});

// ── 送る前に止めるもの ───────────────────────────────────
test('期日を過ぎていない日付では、催促ではないと注意する(期日当日も含む)', () => {
  const same = Object.assign({}, BASE, { date: '2026-09-30' });
  const p = SS.findProblems(same, SS.buildDocument(same));
  assert.ok(p.some((m) => m.includes('支払期日を過ぎていません')), p.join('/'));
  const ok = SS.findProblems(BASE, SS.buildDocument(BASE));
  assert.deepStrictEqual(ok, []);
});

test('読めない金額と、発行日より前の回答期限を止める', () => {
  const bad = Object.assign({}, BASE, { amount: '11万', replyBy: '2026-10-01' });
  const p = SS.findProblems(bad, SS.buildDocument(bad));
  assert.ok(p.some((m) => m.includes('数字として読めません')), p.join('/'));
  assert.ok(p.some((m) => m.includes('回答期限が発行日より後')), p.join('/'));
});

// ── 画面側の読み合わせ ───────────────────────────────────
test('saisoku.js が触る id は、すべて saisoku.html に在る', () => {
  const ids = [...view.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 15, '読み取れた id が ' + ids.length + ' 個しかない');
  const missing = [...new Set(ids)].filter((id) => !html.includes('id="' + id + '"'));
  assert.deepStrictEqual(missing, [], 'HTML に無い id: ' + missing.join(','));
});

test('saisoku-core.js を saisoku.js より先に読み込み、インラインの <script> が無い', () => {
  const a = html.indexOf('src="/saisoku-core.js"');
  const b = html.indexOf('src="/saisoku.js"');
  assert.ok(a !== -1 && b !== -1 && a < b, '読み込みの順が違う');
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)].map((m) => m[0]);
  assert.deepStrictEqual(inline, []);
});

test('紙面に付ける sf- のクラスは、すべて style.css に定義がある(送付状と同じ部品)', () => {
  const used = [...new Set([...view.matchAll(/el\('[a-z0-9]+', '(sf-[a-z-]+)'/g)].map((m) => m[1]))];
  assert.ok(used.length >= 8, '読み取れたクラスが ' + used.length + ' 個しかない');
  const missing = used.filter((cls) => !css.includes('.' + cls));
  assert.deepStrictEqual(missing, [], 'style.css に無いクラス: ' + missing.join(','));
});

test('「送信しない」の表示が、ヘッダーと本文の両方に在る', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.includes('入力内容は送信されません'));
  assert.ok(html.includes('サーバーへ送信・保存されることはありません'));
});

// ── 下書きの保存と「入力をすべて消す」を、saisoku.js を実際に動かして確かめる ──
// storage-claims.test.js は removeItem が書かれていることまでしか見ない。
// 消したあと render() → save() が同じキーへ書き戻すので、書き戻す値に利用者の入力が残っていないかは
// 動かさないと分からない(2026-09-30 本番で 8欄 → 0 を実測。その結果をここに固定する)。
function runView(storage) {
  const els = {};
  const fakeEl = () => ({
    value: '', textContent: '', hidden: false, className: '', listeners: {},
    appendChild() {}, addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  });
  const document = {
    getElementById: (id) => (els[id] = els[id] || fakeEl()),
    createElement: () => fakeEl()
  };
  const localStorage = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  };
  const window = { Saisoku: SS, confirm: () => true, print() {} };
  new Function('window', 'document', 'localStorage', view)(window, document, localStorage);
  const type = (id, v) => { els[id].value = v; els[id].listeners.input.forEach((f) => f()); };
  const click = (id) => els[id].listeners.click.forEach((f) => f());
  return { els, type, click };
}

const TYPED = {
  ssToName: 'ZZ宛名', ssToDept: 'ZZ部署', ssInvoiceNo: 'ZZ-0012', ssSubject: 'ZZ件名',
  ssAmount: '987654', ssBank: 'ZZ銀行', ssFromName: 'ZZ差出人', ssFromAddress: 'ZZ住所'
};

test('入力は下書きとして残り、開き直すと戻る', () => {
  const storage = {};
  const a = runView(storage);
  Object.entries(TYPED).forEach(([id, v]) => a.type(id, v));
  const b = runView(storage);
  Object.entries(TYPED).forEach(([id, v]) => assert.strictEqual(b.els[id].value, v, id));
});

test('「入力をすべて消す」のあと、保存にも画面にも入力が1つも残らない', () => {
  const storage = {};
  const v = runView(storage);
  Object.entries(TYPED).forEach(([id, val]) => v.type(id, val));
  v.click('ssClear');
  const saved = Object.values(storage).join('\n');
  const left = Object.values(TYPED).filter((val) => saved.includes(val));
  assert.deepStrictEqual(left, [], '保存に残った入力: ' + left.join(','));
  const onScreen = Object.keys(TYPED).filter((id) => v.els[id].value !== '');
  assert.deepStrictEqual(onScreen, [], '画面に残った欄: ' + onScreen.join(','));
});

test('<title> と <h1> が同じ', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)[1];
  assert.strictEqual(title, h1);
});

console.log('saisoku.test.js: ' + passed + ' 件すべて通過');
