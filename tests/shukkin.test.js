/*
 * 出金伝票(/shukkin)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/shukkin.test.js
 *
 * 前半は shukkin-core.js の判断(金額の読み取り・空行の扱い・番号・3枚ずつの改ページ・警告)を直接確かめる。
 * 後半は shukkin.js を小さな偽の DOM で実際に動かし、下書きの保存と「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。紙面の高さは CSS の数値の足し算で見ているだけで、
 *    実際に A4 の PDF に出して何mmになったかは tools/paper_probe.py で別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SK = require('../public/shukkin-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'shukkin.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'shukkin.js'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'shukkin.css'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const ROW = { date: '2026-10-06', payee: '東京メトロ', account: '', memo: '新宿→渋谷 往復', amount: '400' };
const row = (over) => Object.assign({}, ROW, over);

console.log('shukkin.test.js');

// ── 金額と日付 ─────────────────────────────────────────
test('金額は数字とカンマ・円記号だけを読む。読めないもの・0円は null', () => {
  assert.strictEqual(SK.parseAmount('1,200'), 1200);
  assert.strictEqual(SK.parseAmount('¥1200'), 1200);
  assert.strictEqual(SK.parseAmount('１２００円'), 1200);
  assert.strictEqual(SK.parseAmount('1.2千'), null);
  assert.strictEqual(SK.parseAmount('12万'), null);
  assert.strictEqual(SK.parseAmount('0'), null);
  assert.strictEqual(SK.parseAmount(''), null);
  assert.strictEqual(SK.formatNumber(1234567), '1,234,567');
});

test('暦に無い日付・空欄は紙に出さない(勝手に今日にしない)', () => {
  assert.strictEqual(SK.formatDateJa('2026-10-06'), '2026年10月6日');
  assert.strictEqual(SK.formatDateJa('2026-02-30'), '');
  assert.strictEqual(SK.formatDateJa(''), '');
});

// ── 伝票の組み立て ───────────────────────────────────────
test('空の行は伝票にしない。番号は残った伝票に最初の番号から振る', () => {
  const b = SK.buildSlips({ startNo: '12', rows: [row(), {}, row({ amount: '1,000' })] });
  assert.deepStrictEqual(b.slips.map((s) => s.no), [12, 13]);
  assert.strictEqual(b.total, 1400);
  assert.strictEqual(b.slips[1].amountText, '1,000');
});

test('最初の番号が読めなければ 1 から', () => {
  assert.strictEqual(SK.parseStartNo(''), 1);
  assert.strictEqual(SK.parseStartNo('abc'), 1);
  assert.strictEqual(SK.parseStartNo('0'), 1);
  assert.strictEqual(SK.parseStartNo('７'), 7);
});

test('A4 1枚に3枚ずつ。4枚目から2ページ目、6枚を超えた分は紙に出ない', () => {
  const rows = Array.from({ length: 7 }, (_, i) => row({ amount: String(100 * (i + 1)) }));
  const b = SK.buildSlips({ rows });
  assert.strictEqual(b.slips.length, 6);
  assert.deepStrictEqual(b.pages.map((p) => p.length), [3, 3]);
  assert.ok(SK.findProblems({ rows }, b).some((m) => m.includes('6枚まで')));
  assert.deepStrictEqual(SK.buildSlips({ rows: rows.slice(0, 4) }).pages.map((p) => p.length), [3, 1]);
});

test('勘定科目は書いたとおりに出し、空なら空のまま(候補を補わない)', () => {
  assert.strictEqual(SK.buildSlips({ rows: [row({ account: '  旅費交通費 ' })] }).slips[0].account, '旅費交通費');
  assert.strictEqual(SK.buildSlips({ rows: [row({ account: '' })] }).slips[0].account, '');
  /* 科目の候補表を持たない。持った日に落ちて、税務の判断を始めていないかを人が見直す */
  const core = fs.readFileSync(path.join(PUBLIC, 'shukkin-core.js'), 'utf8');
  for (const w of ['旅費交通費', '会議費', '接待交際費', '消耗品費']) {
    assert.ok(!core.includes(w), 'shukkin-core.js に勘定科目「' + w + '」が書かれている');
  }
});

// ── 警告 ─────────────────────────────────────────────
test('4つの欄がそろえば警告0件', () => {
  assert.deepStrictEqual(SK.findProblems({ rows: [row()] }), []);
});

test('欠けた欄を伝票の番号つきで1つずつ言う', () => {
  const p = SK.findProblems({ startNo: '5', rows: [row({ date: '', payee: '', memo: '', amount: '', account: 'ZZ' })] });
  assert.deepStrictEqual(p, [
    'No.5: 日付が入っていません。',
    'No.5: 支払先が入っていません。',
    'No.5: 摘要(何に払ったか)が入っていません。',
    'No.5: 金額が入っていません。'
  ]);
});

test('金額が書いてあるのに読めないときは「入っていない」と言わない', () => {
  const p = SK.findProblems({ rows: [row({ amount: '12万' })] });
  assert.deepStrictEqual(p, ['No.1: 金額を読めません。数字だけで入れてください(例: 1200)。']);
});

test('枠に収まる字数(実測)を超えたら、どの欄が何字かを言う。ちょうどなら言わない', () => {
  const rep = (n) => '摘'.repeat(n);
  assert.deepStrictEqual(SK.findProblems({ rows: [row({ memo: rep(80), payee: rep(40), account: rep(12) })] }), []);
  const p = SK.findProblems({ rows: [row({ memo: rep(81) })] });
  assert.deepStrictEqual(p, ['No.1: 摘要が81字あります。80字を超えると伝票の枠からはみ出すことがあります。']);
  /* 切り詰めない。紙に出るのは書いたとおり */
  assert.strictEqual(SK.buildSlips({ rows: [row({ memo: rep(81) })] }).slips[0].memo.length, 81);
});

test('伝票が1枚も無ければ、それだけを言う', () => {
  assert.deepStrictEqual(SK.findProblems({ rows: [{}, {}] }).length, 1);
});

// ── ページ ───────────────────────────────────────────
test('画面の JS が参照する id は、すべて HTML に在る', () => {
  const ids = [...view.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 8, '読み取れた id が ' + ids.length + ' 個しかない');
  const missing = [...new Set(ids)].filter((id) => !html.includes('id="' + id + '"'));
  assert.deepStrictEqual(missing, []);
});

test('core → 画面の順に読み込み、インラインのスクリプトは無い', () => {
  const a = html.indexOf('src="/shukkin-core.js"');
  const b = html.indexOf('src="/shukkin.js"');
  assert.ok(a !== -1 && b !== -1 && a < b, '読み込みの順が違う');
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)].map((m) => m[0]);
  assert.deepStrictEqual(inline, []);
});

test('紙面に付ける sk- のクラスは、すべて shukkin.css に定義がある', () => {
  const used = [...new Set([...view.matchAll(/el\('[a-z0-9]+', '(?:paper )?(sk-[a-z-]+)'/g)].map((m) => m[1]))];
  assert.ok(used.length >= 12, '読み取れたクラスが ' + used.length + ' 個しかない');
  const missing = used.filter((cls) => !css.includes('.' + cls));
  assert.deepStrictEqual(missing, [], 'shukkin.css に無いクラス: ' + missing.join(','));
});

test('shukkin.css は @page を持たない(A4 の余白は style.css の実測値をそのまま使う)', () => {
  assert.ok(!/@page/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));
});

test('伝票3枚と間2か所が、A4 の印字できる高さ 274mm に収まる', () => {
  const h = Number(/\.sk-slip\s*\{[^}]*\bheight:\s*([\d.]+)mm/.exec(css)[1]);
  const gap = Number(/\.sk-slip \+ \.sk-slip\s*\{[^}]*margin-top:\s*([\d.]+)mm/.exec(css)[1]);
  assert.ok(h * 3 + gap * 2 <= 274, '3枚で ' + (h * 3 + gap * 2) + 'mm');
  assert.ok(/\.sk-paper \+ \.sk-paper\s*\{\s*break-before:\s*page/.test(css), '2ページ目の改ページが無い');
});

test('「送信しない」の表示が、ヘッダーと本文の両方に在る', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.includes('入力内容は送信されません'));
  assert.ok(html.includes('サーバーへ送信・保存されることはありません'));
});

test('<title> と <h1> が同じで、title は32文字以内', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)[1];
  assert.strictEqual(title, h1);
  assert.ok([...title].length <= 32, 'title が ' + [...title].length + ' 文字');
});

test('説明文が約束した「交通費・自販機・香典」の書き方例が本文に在る', () => {
  const body = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
  for (const w of ['交通費', '自販機', '香典']) assert.ok(body.includes(w), w);
});

// ── shukkin.js を偽の DOM で動かす ─────────────────────────
function fakeEl(tag) {
  const node = {
    tagName: String(tag || 'div').toUpperCase(), value: '', type: '', placeholder: '', className: '',
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
  const window = { Shukkin: SK, confirm: () => true, print() {} };
  new Function('window', 'document', 'localStorage', view)(window, document, localStorage);
  const fire = (node, type) => (node.listeners[type] || []).forEach((f) => f());
  const rowInputs = (i) => els.skRows.children[i].querySelectorAll('input[data-key]');
  const typeRow = (i, key, v) => {
    const inp = rowInputs(i).find((x) => x.dataset.key === key);
    inp.value = v; fire(inp, 'input');
  };
  const type = (id, v) => { els[id].value = v; fire(els[id], 'input'); };
  const click = (id) => fire(els[id], 'click');
  return { els, type, typeRow, click, rowInputs };
}

const TYPED = { payee: 'ZZ支払先', memo: 'ZZ摘要', amount: '98765', account: 'ZZ科目' };

test('開いた直後は伝票1枚ぶんの入力欄があり、日付だけが入っている', () => {
  const v = runView({});
  assert.strictEqual(v.els.skRows.children.length, 1);
  const vals = Object.fromEntries(v.rowInputs(0).map((x) => [x.dataset.key, x.value]));
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(vals.date));
  assert.deepStrictEqual([vals.payee, vals.memo, vals.amount, vals.account], ['', '', '', '']);
});

test('伝票を足すと紙面が2枚になり、6枚で足すボタンが止まる', () => {
  const v = runView({});
  Object.entries(TYPED).forEach(([k, val]) => v.typeRow(0, k, val));
  v.click('skAdd');
  v.typeRow(1, 'payee', 'B'); v.typeRow(1, 'memo', 'B'); v.typeRow(1, 'amount', '1');
  const slips = v.els.skSheets.children[0].children;
  assert.strictEqual(slips.length, 2);
  for (let i = 0; i < 10; i++) v.click('skAdd');
  assert.strictEqual(v.els.skRows.children.length, 6);
  assert.strictEqual(v.els.skAdd.disabled, true);
});

test('入力は下書きとして残り、開き直すと戻る', () => {
  const storage = {};
  const a = runView(storage);
  a.type('skIssuer', 'ZZ起票者');
  Object.entries(TYPED).forEach(([k, val]) => a.typeRow(0, k, val));
  a.click('skAdd');
  a.typeRow(1, 'memo', 'ZZ二枚目');
  const b = runView(storage);
  assert.strictEqual(b.els.skIssuer.value, 'ZZ起票者');
  assert.strictEqual(b.els.skRows.children.length, 2);
  Object.entries(TYPED).forEach(([k, val]) => {
    assert.strictEqual(b.rowInputs(0).find((x) => x.dataset.key === k).value, val, k);
  });
  assert.strictEqual(b.rowInputs(1).find((x) => x.dataset.key === 'memo').value, 'ZZ二枚目');
});

test('「入力をすべて消す」のあと、保存にも画面にも入力が1つも残らない', () => {
  const storage = {};
  const v = runView(storage);
  v.type('skIssuer', 'ZZ起票者');
  Object.entries(TYPED).forEach(([k, val]) => v.typeRow(0, k, val));
  v.click('skAdd');
  v.typeRow(1, 'memo', 'ZZ二枚目');
  v.click('skClear');
  const saved = Object.values(storage).join('\n');
  const all = ['ZZ起票者', 'ZZ二枚目'].concat(Object.values(TYPED));
  assert.deepStrictEqual(all.filter((val) => saved.includes(val)), [], '保存に残った入力');
  assert.strictEqual(v.els.skRows.children.length, 1);
  const left = v.rowInputs(0).filter((x) => x.dataset.key !== 'date' && x.value !== '');
  assert.deepStrictEqual(left.map((x) => x.dataset.key), [], '画面に残った欄');
  assert.strictEqual(v.els.skIssuer.value, '');
});

console.log('shukkin.test.js: ' + passed + ' 件すべて通過');
