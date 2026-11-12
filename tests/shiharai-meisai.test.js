/*
 * 支払明細書(/shiharai-meisai)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/shiharai-meisai.test.js
 *
 * 前半は shiharai-meisai-core.js の判断(空行・10行の上限・合計・差し引き・警告)を直接確かめる。
 * 後半は shiharai-meisai.js を小さな偽の DOM で実際に動かし、下書きの保存と「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SK = require('../public/shukkin-core.js');
const SM = require('../public/shiharai-meisai-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'shiharai-meisai.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'shiharai-meisai.js'), 'utf8');
const core = fs.readFileSync(path.join(PUBLIC, 'shiharai-meisai-core.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const ROW = { memo: '11月分 ロゴ制作費', amount: '55000' };
const base = (rows, extra) => Object.assign({
  issueDate: '2026-11-13', to: '山田デザイン事務所', honorific: '様', from: '株式会社テスト', fromAddress: '',
  payDate: '2026-11-30', method: '銀行振込', note: '', rows, deductions: []
}, extra || {});

console.log('shiharai-meisai.test.js');

// ── 組み立て ────────────────────────────────────────────
test('内容も金額も空の行は数えない。番号は詰めて振る', () => {
  const b = SM.buildSheet(base([ROW, { memo: '', amount: '' }, ROW]));
  assert.strictEqual(b.rows.length, 2);
  assert.deepStrictEqual(b.rows.map((r) => r.no), [1, 2]);
});

test('合計は読めた金額だけを足す。読めない金額は空欄のまま(0円扱いにしない)', () => {
  const b = SM.buildSheet(base([ROW, { memo: 'a', amount: '1,200円' }, { memo: 'b', amount: '12万' }]));
  assert.strictEqual(b.total, 56200);
  assert.strictEqual(b.totalText, '56,200');
  assert.strictEqual(b.rows[2].amount, null);
  assert.strictEqual(b.rows[2].amountText, '');
});

test('差し引くものが無ければ、差引支払額は合計と同じ', () => {
  const b = SM.buildSheet(base([ROW]));
  assert.deepStrictEqual(b.deductions, []);
  assert.strictEqual(b.net, 55000);
  assert.strictEqual(b.netText, '55,000');
});

test('差し引くものは入れた額をそのまま引く(率を掛けない・自分で計算しない)', () => {
  const b = SM.buildSheet(base([ROW], { deductions: [{ name: '源泉所得税', amount: '5105' }, { name: '', amount: '' }, { name: '振込手数料', amount: '４４０' }] }));
  assert.deepStrictEqual(b.deductions.map((d) => d.name), ['源泉所得税', '振込手数料']);
  assert.strictEqual(b.deductionTotal, 5545);
  assert.strictEqual(b.net, 49455);
  assert.strictEqual(b.netText, '49,455');
  assert.ok(!/10\.21|20\.42|0\.1021|0\.2042/.test(core), '源泉徴収の率がコードに入っている');
});

test('差し引く額が合計を超えたら、差引支払額を紙に出さない', () => {
  const b = SM.buildSheet(base([{ memo: 'a', amount: '1000' }], { deductions: [{ name: '相殺', amount: '3000' }] }));
  assert.strictEqual(b.net, -2000);
  assert.strictEqual(b.netText, '');
  assert.ok(SM.findProblems(base([{ memo: 'a', amount: '1000' }], { deductions: [{ name: '相殺', amount: '3000' }] }))
    .some((m) => m.includes('支払額の合計より大きく')));
});

test('敬称は「様」「御中」だけ。それ以外は「様」に戻す', () => {
  assert.strictEqual(SM.buildSheet(base([ROW], { honorific: '御中' })).honorific, '御中');
  assert.strictEqual(SM.buildSheet(base([ROW], { honorific: '殿<b>' })).honorific, '様');
});

test('11行目以降は紙面に出さず、overflow に数を残す。差し引くものは3つまで', () => {
  const b = SM.buildSheet(base(Array.from({ length: 12 }, () => ROW), {
    deductions: Array.from({ length: 5 }, (_, i) => ({ name: 'd' + i, amount: '1' }))
  }));
  assert.strictEqual(b.rows.length, SM.MAX_ROWS);
  assert.strictEqual(b.overflow, 2);
  assert.strictEqual(b.deductions.length, SM.MAX_DEDUCTIONS);
});

// ── 警告 ────────────────────────────────────────────────
test('支払先・支払う側・支払日・明細が空なら、そう言う', () => {
  const p = SM.findProblems(base([], { to: '', from: '', payDate: '' }));
  assert.ok(p.some((m) => m.startsWith('支払先')));
  assert.ok(p.some((m) => m.startsWith('支払う側')));
  assert.ok(p.some((m) => m.startsWith('支払日')));
  assert.ok(p.some((m) => m.includes('明細が1行もありません')));
});

test('欠けた欄・読めない金額・長すぎる文字・上限超えを、場所つきで言う', () => {
  const rows = [{ memo: '', amount: '12万' }, { memo: 'あ'.repeat(SM.LIMITS.memo + 1), amount: '' }];
  const p = SM.findProblems(base(rows, {
    deductions: [{ name: '', amount: '一万' }, { name: 'あ'.repeat(SM.LIMITS.name + 1), amount: '' }],
    note: 'あ'.repeat(SM.LIMITS.note + 1)
  }));
  assert.ok(p.includes('1行目: 内容が入っていません。'));
  assert.ok(p.includes('1行目: 金額を読めません。数字だけで入れてください(例: 55000)。'));
  assert.ok(p.includes('2行目: 金額が入っていません。'));
  assert.ok(p.some((m) => m.startsWith('2行目: 内容が' + (SM.LIMITS.memo + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('差し引くもの1: 名目が入っていません')));
  assert.ok(p.includes('差し引くもの1: 金額を読めません。数字だけで入れてください。'));
  assert.ok(p.some((m) => m.startsWith('差し引くもの2: 名目が' + (SM.LIMITS.name + 1) + '字')));
  assert.ok(p.includes('差し引くもの2: 金額が入っていません。'));
  assert.ok(p.some((m) => m.startsWith('備考が' + (SM.LIMITS.note + 1) + '字')));
  const over = SM.findProblems(base(Array.from({ length: 11 }, () => ROW)));
  assert.ok(over.some((m) => m.includes('11行目以降は紙面に出ていません')));
});

test('そろった入力には警告を出さない', () => {
  assert.deepStrictEqual(SM.findProblems(base([ROW], { deductions: [{ name: '源泉所得税', amount: '5105' }] })), []);
});

test('金額の読み取りは出金伝票と同じ規則(同じ関数を使っている)', () => {
  for (const s of ['400', '1,200', '¥1200', '1200円', '１２００', '0', '12万']) {
    const b = SM.buildSheet(base([{ memo: 'x', amount: s }]));
    assert.strictEqual(b.rows[0].amount, SK.parseAmount(s), s);
  }
});

// ── ページ ──────────────────────────────────────────────
test('「送信しない」の表示が、ヘッダーと本文の両方に在る', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.includes('入力内容は送信されません'));
  assert.ok(html.includes('サーバーへ送信・保存されることはありません'));
});

test('<title> と <h1> が同じで、title は32文字以内、前半に「支払明細書」', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)[1];
  assert.strictEqual(title, h1);
  assert.ok([...title].length <= 32, 'title が ' + [...title].length + ' 文字');
  assert.ok(title.startsWith('支払明細書'));
});

test('説明文が約束した「外注先・業務委託・源泉所得税・振込手数料・差引支払額」が本文に在る', () => {
  const body = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
  for (const w of ['外注先', '業務委託', '源泉所得税', '振込手数料', '差引支払額']) assert.ok(body.includes(w), w);
});

test('書き方の例の引き算が合っている(55,000 − 5,105 = 49,895)', () => {
  const b = SM.buildSheet(base([ROW], { deductions: [{ name: '源泉所得税', amount: '5105' }] }));
  assert.strictEqual(b.netText, '49,895');
  assert.ok(html.includes('49,895'));
});

test('判断しないことを、入力欄のそばと本文の両方に書いている', () => {
  assert.ok(html.includes('引くべきかどうか・いくら引くかは、このツールでは判断しません'));
  assert.ok(html.includes('個別の判断は所轄の税務署または税理士にご確認ください'));
});

test('shukkin-core.js → core → 画面 の順に読む', () => {
  const a = html.indexOf('<script src="/shukkin-core.js"></script>');
  const b = html.indexOf('<script src="/shiharai-meisai-core.js"></script>');
  const c = html.indexOf('<script src="/shiharai-meisai.js"></script>');
  assert.ok(a >= 0 && a < b && b < c);
});

test('発注書・母屋と相互にリンクしている', () => {
  for (const f of ['hacchusho.html', 'kaigyo.html']) {
    assert.ok(fs.readFileSync(path.join(PUBLIC, f), 'utf8').includes('href="/shiharai-meisai"'), f + ' から /shiharai-meisai へのリンクが無い');
  }
  assert.ok(html.includes('href="/hacchusho"') && html.includes('href="/kaigyo"'));
});

// ── shiharai-meisai.js を偽の DOM で動かす ───────────────────
function fakeEl(tag) {
  const node = {
    tagName: String(tag || 'div').toUpperCase(), value: '', type: '', placeholder: '', className: '',
    hidden: false, disabled: false, dataset: {}, attrs: {}, children: [], parentNode: null, listeners: {},
    _text: '',
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; this.children.forEach((c) => { c.parentNode = null; }); this.children = []; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    querySelectorAll(sel) {
      assert.strictEqual(sel, 'input[data-key]');
      const out = [];
      (function walk(n) {
        n.children.forEach((c) => {
          if (c.tagName === 'INPUT' && 'key' in c.dataset) out.push(c);
          walk(c);
        });
      })(this);
      return out;
    }
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
  const window = { Shukkin: SK, ShiharaiMeisai: SM, confirm: () => true, print() {} };
  new Function('window', 'document', 'localStorage', view)(window, document, localStorage);
  const fire = (node, type) => (node.listeners[type] || []).forEach((f) => f());
  const typeCard = (boxId, i, key, v) => {
    const inp = els[boxId].children[i].querySelectorAll('input[data-key]').find((x) => x.dataset.key === key);
    inp.value = v; fire(inp, 'input');
  };
  const type = (id, v) => { els[id].value = v; fire(els[id], 'input'); };
  const click = (id) => fire(els[id], 'click');
  const find = (node, cls) => {
    if (node.className === cls) return node;
    for (const c of node.children) { const hit = find(c, cls); if (hit) return hit; }
    return null;
  };
  return { els, type, typeCard, click, find };
}

test('開いた直後は明細1行・差し引くもの3欄。発行日だけ入り、敬称は「様」', () => {
  const v = runView({});
  assert.strictEqual(v.els.smRows.children.length, 1);
  assert.strictEqual(v.els.smDeds.children.length, SM.MAX_DEDUCTIONS);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(v.els.smIssueDate.value));
  assert.strictEqual(v.els.smPayDate.value, '');
  assert.strictEqual(v.els.smHonorific.value, '様');
});

test('紙面は常に10行の枠を引き、差引支払額が箱と合計欄の両方に出る', () => {
  const v = runView({});
  v.typeCard('smRows', 0, 'memo', 'ZZ内容'); v.typeCard('smRows', 0, 'amount', '55000');
  v.typeCard('smDeds', 0, 'name', '源泉所得税'); v.typeCard('smDeds', 0, 'amount', '5105');
  const paper = v.els.smSheet.children[0];
  const tbody = v.find(paper, 'sm-table').children[1];
  assert.strictEqual(tbody.children.length, SM.MAX_ROWS);
  assert.strictEqual(tbody.children[0].children[1].textContent, 'ZZ内容');
  assert.strictEqual(tbody.children[1].children[1].textContent, '');
  assert.strictEqual(v.find(paper, 'sm-box-main').children[1].textContent, '¥49,895-');
  const sum = v.find(paper, 'sm-sum');
  assert.deepStrictEqual(sum.children.map((tr) => tr.children[0].textContent), ['支払額 合計', '差引 源泉所得税', '差引支払額']);
  assert.deepStrictEqual(sum.children.map((tr) => tr.children[1].textContent), ['¥55,000-', '-¥5,105', '¥49,895-']);
});

test('宛名は「名前　敬称」。名前が空なら敬称だけを紙に出さない', () => {
  const v = runView({});
  assert.strictEqual(v.find(v.els.smSheet.children[0], 'sm-to-name').textContent, '');
  v.type('smTo', 'ZZ商店'); v.type('smHonorific', '御中');
  assert.strictEqual(v.find(v.els.smSheet.children[0], 'sm-to-name').textContent, 'ZZ商店　御中');
});

test('10行で「行を足す」ボタンが止まる', () => {
  const v = runView({});
  for (let i = 0; i < 15; i++) v.click('smAdd');
  assert.strictEqual(v.els.smRows.children.length, SM.MAX_ROWS);
  assert.strictEqual(v.els.smAdd.disabled, true);
});

test('入力は shiharai-meisai-draft-v1 に下書きされ、開き直すと戻る(差し引くものも戻る)', () => {
  const storage = {};
  const a = runView(storage);
  a.type('smTo', 'ZZ支払先');
  a.type('smHonorific', '御中');
  a.typeCard('smRows', 0, 'memo', 'ZZ明細の内容');
  a.typeCard('smDeds', 1, 'name', 'ZZ手数料');
  assert.ok(storage['shiharai-meisai-draft-v1'].includes('ZZ明細の内容'));
  const b = runView(storage);
  assert.strictEqual(b.els.smTo.value, 'ZZ支払先');
  assert.strictEqual(b.els.smHonorific.value, '御中');
  assert.strictEqual(b.els.smDeds.children.length, SM.MAX_DEDUCTIONS);
  assert.strictEqual(b.els.smDeds.children[1].querySelectorAll('input[data-key]')[0].value, 'ZZ手数料');
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'keihi-draft-v1': '{"x":1}', 'shukkin-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('smTo', 'ZZ');
  v.click('smClear');
  assert.strictEqual(v.els.smTo.value, '');
  assert.ok(!String(storage['shiharai-meisai-draft-v1'] || '').includes('ZZ'));
  assert.strictEqual(storage['keihi-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['shukkin-draft-v1'], '{"y":1}');
});

console.log('shiharai-meisai.test.js: ' + passed + ' 件すべて通過');
