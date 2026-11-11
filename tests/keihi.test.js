/*
 * 経費精算書(/keihi)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/keihi.test.js
 *
 * 前半は keihi-core.js の判断(空行・15行の上限・合計・仮払金の差引・警告)を直接確かめる。
 * 後半は keihi.js を小さな偽の DOM で実際に動かし、下書きの保存と「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SK = require('../public/shukkin-core.js');
const KH = require('../public/keihi-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'keihi.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'keihi.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const ROW = { date: '2026-11-12', payee: '東京メトロ', memo: '新宿→大手町 往復', amount: '400', receipt: false };
const base = (rows, extra) => Object.assign({ submitDate: '2026-11-12', to: '', applicant: '中村太郎', advance: '', rows }, extra || {});

console.log('keihi.test.js');

// ── 組み立て ────────────────────────────────────────────
test('4欄が空の行は数えない(領収書のチェックだけでは行にしない)', () => {
  const b = KH.buildSheet(base([ROW, { date: '', payee: '', memo: '', amount: '', receipt: true }, ROW]));
  assert.strictEqual(b.rows.length, 2);
  assert.deepStrictEqual(b.rows.map((r) => r.no), [1, 2]);
});

test('日付は「2026/11/12」、領収書は false だけ「無」、それ以外は「有」', () => {
  const b = KH.buildSheet(base([ROW, Object.assign({}, ROW, { receipt: true }), Object.assign({}, ROW, { receipt: undefined })]));
  assert.strictEqual(b.rows[0].dateText, '2026/11/12');
  assert.deepStrictEqual(b.rows.map((r) => r.receiptText), ['無', '有', '有']);
  assert.strictEqual(KH.formatDateSlash('2026-02-30'), '', '暦に無い日を受け付けた');
});

test('合計は読めた金額だけを足す。読めない金額は空欄のまま(0円扱いにしない)', () => {
  const b = KH.buildSheet(base([ROW, Object.assign({}, ROW, { amount: '1,200円' }), Object.assign({}, ROW, { amount: '12万' })]));
  assert.strictEqual(b.total, 1600);
  assert.strictEqual(b.totalText, '1,600');
  assert.strictEqual(b.rows[2].amount, null);
  assert.strictEqual(b.rows[2].amountText, '');
});

test('仮払金が空なら差引を出さない', () => {
  const b = KH.buildSheet(base([ROW]));
  assert.strictEqual(b.advance, null);
  assert.strictEqual(b.diff, null);
  assert.strictEqual(b.diffLabel, '');
});

test('仮払金より多く使ったら「差引 支給額」、少なければ「差引 返金額」(どちらも差の絶対値)', () => {
  const more = KH.buildSheet(base([Object.assign({}, ROW, { amount: '12000' })], { advance: '10000' }));
  assert.strictEqual(more.diffLabel, '差引 支給額');
  assert.strictEqual(more.diffText, '2,000');
  const less = KH.buildSheet(base([Object.assign({}, ROW, { amount: '8500' })], { advance: '１０，０００' }));
  assert.strictEqual(less.diffLabel, '差引 返金額');
  assert.strictEqual(less.diffText, '1,500');
  const even = KH.buildSheet(base([Object.assign({}, ROW, { amount: '5000' })], { advance: '5000' }));
  assert.strictEqual(even.diffLabel, '差引 支給額');
  assert.strictEqual(even.diffText, '0');
});

test('16行目以降は紙面に出さず、overflow に数を残す', () => {
  const rows = Array.from({ length: 17 }, () => ROW);
  const b = KH.buildSheet(base(rows));
  assert.strictEqual(b.rows.length, KH.MAX_ROWS);
  assert.strictEqual(b.overflow, 2);
});

// ── 警告 ────────────────────────────────────────────────
test('申請者が空・明細が0行なら、そう言う', () => {
  const p = KH.findProblems(base([], { applicant: '' }));
  assert.ok(p.some((m) => m.includes('申請者')));
  assert.ok(p.some((m) => m.includes('明細が1行もありません')));
});

test('欠けた欄・読めない金額・読めない仮払金・上限超えを、行番号つきで言う', () => {
  const rows = [Object.assign({}, ROW, { payee: '', amount: '12万' }), Object.assign({}, ROW, { memo: 'あ'.repeat(KH.LIMITS.memo + 1), amount: '' })];
  const p = KH.findProblems(base(rows, { advance: '一万' }));
  assert.ok(p.includes('1行目: 支払先が入っていません。'));
  assert.ok(p.includes('1行目: 金額を読めません。数字だけで入れてください(例: 1200)。'));
  assert.ok(p.includes('2行目: 金額が入っていません。'));
  assert.ok(p.some((m) => m.startsWith('2行目: 内容が' + (KH.LIMITS.memo + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('仮払金を読めません')));
  const over = KH.findProblems(base(Array.from({ length: 16 }, () => ROW)));
  assert.ok(over.some((m) => m.includes('16行目以降は紙面に出ていません')));
});

test('そろった入力には警告を出さない', () => {
  assert.deepStrictEqual(KH.findProblems(base([ROW], { advance: '1000' })), []);
});

test('金額の読み取りは出金伝票と同じ規則(同じ関数を使っている)', () => {
  for (const s of ['400', '1,200', '¥1200', '1200円', '１２００', '0', '12万', '']) {
    const b = KH.buildSheet(base([Object.assign({}, ROW, { amount: s })]));
    assert.strictEqual(b.rows[0].amount, SK.parseAmount(s), s);
  }
});

// ── ページ ──────────────────────────────────────────────
test('「送信しない」の表示が、ヘッダーと本文の両方に在る', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.includes('入力内容は送信されません'));
  assert.ok(html.includes('サーバーへ送信・保存されることはありません'));
});

test('<title> と <h1> が同じで、title は32文字以内、前半に「経費精算書」', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)[1];
  assert.strictEqual(title, h1);
  assert.ok([...title].length <= 32, 'title が ' + [...title].length + ' 文字');
  assert.ok(title.startsWith('経費精算書'));
});

test('説明文が約束した「交通費・備品代・会社設立・仮払金」が本文に在る', () => {
  const body = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
  for (const w of ['交通費', '備品代', '会社設立', '仮払金']) assert.ok(body.includes(w), w);
});

test('shukkin-core.js を keihi-core.js より先に読む(window.Shukkin を使うため)', () => {
  const a = html.indexOf('<script src="/shukkin-core.js"></script>');
  const b = html.indexOf('<script src="/keihi-core.js"></script>');
  const c = html.indexOf('<script src="/keihi.js"></script>');
  assert.ok(a >= 0 && a < b && b < c);
});

test('出金伝票・入金伝票・母屋と相互にリンクしている', () => {
  for (const f of ['shukkin.html', 'nyukin.html', 'kaigyo.html']) {
    assert.ok(fs.readFileSync(path.join(PUBLIC, f), 'utf8').includes('href="/keihi"'), f + ' から /keihi へのリンクが無い');
  }
  assert.ok(html.includes('href="/shukkin"') && html.includes('href="/nyukin"') && html.includes('href="/kaigyo"'));
});

// ── keihi.js を偽の DOM で動かす ───────────────────────────
function fakeEl(tag) {
  const node = {
    tagName: String(tag || 'div').toUpperCase(), value: '', type: '', placeholder: '', className: '', checked: false,
    hidden: false, disabled: false, dataset: {}, attrs: {}, children: [], parentNode: null, listeners: {},
    _text: '',
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; this.children.forEach((c) => { c.parentNode = null; }); this.children = []; },
    get lastElementChild() { return this.children[this.children.length - 1] || null; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    querySelectorAll(sel) {
      const m = /^input\[data-key(?:="([^"]+)")?\]$/.exec(sel);
      const out = [];
      (function walk(n) {
        n.children.forEach((c) => {
          if (c.tagName === 'INPUT' && 'key' in c.dataset && (!m[1] || c.dataset.key === m[1])) out.push(c);
          walk(c);
        });
      })(this);
      return out;
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  };
  return node;
}

function runView(storage) {
  const els = {};
  const document = {
    getElementById: (id) => (els[id] = els[id] || fakeEl()),
    createElement: (tag) => fakeEl(tag)
  };
  const localStorage = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  };
  const window = { Shukkin: SK, Keihi: KH, confirm: () => true, print() {} };
  new Function('window', 'document', 'localStorage', view)(window, document, localStorage);
  const fire = (node, type) => (node.listeners[type] || []).forEach((f) => f());
  const rowInputs = (i) => els.kiRows.children[i].querySelectorAll('input[data-key]');
  const typeRow = (i, key, v) => {
    const inp = rowInputs(i).find((x) => x.dataset.key === key);
    if (inp.type === 'checkbox') { inp.checked = v; fire(inp, 'change'); } else { inp.value = v; fire(inp, 'input'); }
  };
  const type = (id, v) => { els[id].value = v; fire(els[id], 'input'); };
  const click = (id) => fire(els[id], 'click');
  return { els, type, typeRow, click, rowInputs };
}

test('開いた直後は1行ぶんの入力欄があり、日付と提出日だけが入り、領収書は「あり」', () => {
  const v = runView({});
  assert.strictEqual(v.els.kiRows.children.length, 1);
  const inputs = v.rowInputs(0);
  const vals = Object.fromEntries(inputs.map((x) => [x.dataset.key, x.type === 'checkbox' ? x.checked : x.value]));
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(vals.date));
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(v.els.kiSubmitDate.value));
  assert.deepStrictEqual([vals.payee, vals.memo, vals.amount, vals.receipt], ['', '', '', true]);
});

test('紙面は常に15行の枠を引き、入れた行が上から埋まる', () => {
  const v = runView({});
  v.typeRow(0, 'payee', 'ZZ支払先'); v.typeRow(0, 'memo', 'ZZ内容'); v.typeRow(0, 'amount', '960');
  const paper = v.els.kiSheet.children[0];
  const table = paper.children.find((c) => c.className === 'ki-table');
  const tbody = table.children[1];
  assert.strictEqual(tbody.children.length, KH.MAX_ROWS);
  assert.strictEqual(tbody.children[0].children[2].textContent, 'ZZ支払先');
  assert.strictEqual(tbody.children[1].children[2].textContent, '');
});

test('15行で「行を足す」ボタンが止まる', () => {
  const v = runView({});
  for (let i = 0; i < 20; i++) v.click('kiAdd');
  assert.strictEqual(v.els.kiRows.children.length, KH.MAX_ROWS);
  assert.strictEqual(v.els.kiAdd.disabled, true);
});

test('入力は keihi-draft-v1 に下書きされ、開き直すと戻る(領収書「無」も戻る)', () => {
  const storage = {};
  const a = runView(storage);
  a.type('kiApplicant', 'ZZ申請者');
  a.typeRow(0, 'memo', 'ZZ精算の内容');
  a.typeRow(0, 'receipt', false);
  assert.ok(storage['keihi-draft-v1'].includes('ZZ精算の内容'));
  const b = runView(storage);
  assert.strictEqual(b.els.kiApplicant.value, 'ZZ申請者');
  const receipt = b.rowInputs(0).find((x) => x.dataset.key === 'receipt');
  assert.strictEqual(receipt.checked, false);
});

test('「入力をすべて消す」は keihi の下書きだけを消し、出金伝票・入金伝票の下書きは残す', () => {
  const storage = { 'shukkin-draft-v1': '{"x":1}', 'nyukin-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('kiApplicant', 'ZZ');
  v.click('kiClear');
  assert.strictEqual(v.els.kiApplicant.value, '');
  assert.ok(!String(storage['keihi-draft-v1'] || '').includes('ZZ'));
  assert.strictEqual(storage['shukkin-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['nyukin-draft-v1'], '{"y":1}');
});

console.log('keihi.test.js: ' + passed + ' 件すべて通過');
