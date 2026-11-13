/*
 * 見積依頼書(/mitsumori-irai)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/mitsumori-irai.test.js
 *
 * 前半は mitsumori-irai-core.js の判断(空行・10行の上限・日付の前後・警告)を直接確かめる。
 * 後半は mitsumori-irai.js を小さな偽の DOM で実際に動かし、下書きの保存と「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SK = require('../public/shukkin-core.js');
const MI = require('../public/mitsumori-irai-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'mitsumori-irai.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'mitsumori-irai.js'), 'utf8');
const core = fs.readFileSync(path.join(PUBLIC, 'mitsumori-irai-core.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const ROW = { name: 'A4チラシ 両面カラー コート紙90kg', qty: '1000', unit: '枚' };
const base = (rows, extra) => Object.assign({
  issueDate: '2026-11-14', to: '○○印刷株式会社', honorific: '御中', from: '山田商店', fromAddress: '', person: '',
  subject: '開店告知チラシの印刷', replyDate: '2026-11-20', deliveryDate: '2026-12-05',
  place: '当店', payTerms: '月末締め・翌月末払い', note: '', rows
}, extra || {});

console.log('mitsumori-irai.test.js');

// ── 組み立て ────────────────────────────────────────────
test('品名も数量も単位も空の行は数えない。番号は詰めて振る', () => {
  const b = MI.buildSheet(base([ROW, { name: '', qty: '', unit: '' }, ROW]));
  assert.strictEqual(b.rows.length, 2);
  assert.deepStrictEqual(b.rows.map((r) => r.no), [1, 2]);
});

test('数量と単位は書いたとおりに出す(読み替えない・計算しない)', () => {
  const b = MI.buildSheet(base([{ name: 'ロゴ制作', qty: ' 一式 ', unit: '' }, { name: '名刺', qty: '2〜3', unit: '箱' }]));
  assert.strictEqual(b.rows[0].qty, '一式');
  assert.strictEqual(b.rows[0].unit, '');
  assert.strictEqual(b.rows[1].qty, '2〜3');
  assert.deepStrictEqual(MI.findProblems(base([{ name: 'ロゴ制作', qty: '一式', unit: '' }])), []);
});

test('金額・合計・税を持たない(組み立てた結果にも、コードにも無い)', () => {
  const b = MI.buildSheet(base([ROW]));
  for (const k of Object.keys(b)) assert.ok(!/amount|total|tax|price/i.test(k), k);
  assert.ok(!/parseAmount|formatNumber/.test(core), '金額の読み取りを使っている');
});

test('日付は「2026年11月20日」の形。空・不正な日付は空欄のまま(今日にしない)', () => {
  const b = MI.buildSheet(base([ROW], { deliveryDate: '', replyDate: '2026-13-40' }));
  assert.strictEqual(b.issueDateText, '2026年11月14日');
  assert.strictEqual(b.deliveryDateText, '');
  assert.strictEqual(b.replyDateText, '');
  assert.strictEqual(MI.buildSheet(base([ROW])).replyDateText, SK.formatDateJa('2026-11-20'));
});

test('敬称は「御中」「様」だけ。それ以外は「御中」に戻す', () => {
  assert.strictEqual(MI.buildSheet(base([ROW], { honorific: '様' })).honorific, '様');
  assert.strictEqual(MI.buildSheet(base([ROW], { honorific: '殿<b>' })).honorific, '御中');
});

test('11行目以降は紙面に出さず、overflow に数を残す', () => {
  const b = MI.buildSheet(base(Array.from({ length: 12 }, () => ROW)));
  assert.strictEqual(b.rows.length, MI.MAX_ROWS);
  assert.strictEqual(b.overflow, 2);
  assert.ok(MI.findProblems(base(Array.from({ length: 11 }, () => ROW))).some((m) => m.includes('11行目以降は紙面に出ていません')));
});

// ── 警告 ────────────────────────────────────────────────
test('依頼先・依頼する側・回答期限・明細が空なら、そう言う', () => {
  const p = MI.findProblems(base([], { to: '', from: '', replyDate: '' }));
  assert.ok(p.some((m) => m.startsWith('依頼先')));
  assert.ok(p.some((m) => m.startsWith('依頼する側')));
  assert.ok(p.some((m) => m.startsWith('回答期限が入っていません')));
  assert.ok(p.some((m) => m.includes('明細が1行もありません')));
});

test('回答期限・希望納期が前後していたら知らせる(同じ日は知らせない)', () => {
  const p = MI.findProblems(base([ROW], { replyDate: '2026-11-13', deliveryDate: '2026-11-10' }));
  assert.ok(p.includes('回答期限が発行日より前になっています。'));
  assert.ok(p.includes('希望納期が発行日より前になっています。'));
  assert.ok(p.includes('希望納期が回答期限より前になっています。'));
  assert.deepStrictEqual(MI.findProblems(base([ROW], { replyDate: '2026-11-14', deliveryDate: '2026-11-14' })), []);
});

test('希望納期・件名・納入場所・支払条件は任意。空でも警告しない', () => {
  assert.deepStrictEqual(MI.findProblems(base([ROW], { deliveryDate: '', subject: '', place: '', payTerms: '' })), []);
});

test('欠けた欄・長すぎる文字を、場所つきで言う', () => {
  const rows = [
    { name: '', qty: '10', unit: '個' },
    { name: 'あ'.repeat(MI.LIMITS.name + 1), qty: '', unit: 'あ'.repeat(MI.LIMITS.unit + 1) },
    { name: 'x', qty: '1'.repeat(MI.LIMITS.qty + 1), unit: '' }
  ];
  const p = MI.findProblems(base(rows, {
    subject: 'あ'.repeat(MI.LIMITS.subject + 1), place: 'あ'.repeat(MI.LIMITS.place + 1),
    payTerms: 'あ'.repeat(MI.LIMITS.payTerms + 1), note: 'あ'.repeat(MI.LIMITS.note + 1)
  }));
  assert.ok(p.includes('1行目: 品名・仕様が入っていません。'));
  assert.ok(p.some((m) => m.startsWith('2行目: 品名・仕様が' + (MI.LIMITS.name + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('2行目: 数量が入っていません')));
  assert.ok(p.some((m) => m.startsWith('2行目: 単位が' + (MI.LIMITS.unit + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('3行目: 数量が' + (MI.LIMITS.qty + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('件名が' + (MI.LIMITS.subject + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('納入場所が')));
  assert.ok(p.some((m) => m.startsWith('支払条件が')));
  assert.ok(p.some((m) => m.startsWith('備考が' + (MI.LIMITS.note + 1) + '字')));
});

test('そろった入力には警告を出さない', () => {
  assert.deepStrictEqual(MI.findProblems(base([ROW])), []);
});

// ── ページ ──────────────────────────────────────────────
test('「送信しない」の表示が、ヘッダーと本文の両方に在る', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.includes('入力内容は送信されません'));
  assert.ok(html.includes('サーバーへ送信・保存されることはありません'));
});

test('<title> と <h1> が同じで、title は32文字以内、前半に「見積依頼書」', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)[1];
  assert.strictEqual(title, h1);
  assert.ok([...title].length <= 32, 'title が ' + [...title].length + ' 文字');
  assert.ok(title.startsWith('見積依頼書'));
});

test('説明文が約束した「外注先・仕入先・回答期限・希望納期・納入場所・支払条件・相見積もり」が本文に在る', () => {
  const body = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
  for (const w of ['外注先', '仕入先', '回答期限', '希望納期', '納入場所', '支払条件', '相見積もり']) assert.ok(body.includes(w), w);
});

test('書き方の例は、そのまま入れても警告が出ない', () => {
  assert.deepStrictEqual(MI.findProblems(base([ROW], { note: '送料を含めた金額でお願いします' })), []);
  assert.ok(html.includes(ROW.name));
});

test('判断しないことを、入力欄のそばと本文の両方に書いている', () => {
  assert.ok(html.includes('何日あれば見積もりや納品に足りるかは、このツールでは判断しません'));
  assert.ok(html.includes('個別の判断は専門家にご確認ください'));
});

test('入力欄に金額を入れる場所が無い', () => {
  const editor = html.slice(html.indexOf('<section class="editor'), html.indexOf('<!-- ============ プレビュー'));
  assert.ok(!/inputmode="numeric"|金額\(円\)/.test(editor));
  assert.ok(!/金額|単価/.test(view.replace(/\/\*[\s\S]*?\*\//g, '')));
});

test('shukkin-core.js → core → 画面 の順に読む', () => {
  const a = html.indexOf('<script src="/shukkin-core.js"></script>');
  const b = html.indexOf('<script src="/mitsumori-irai-core.js"></script>');
  const c = html.indexOf('<script src="/mitsumori-irai.js"></script>');
  assert.ok(a >= 0 && a < b && b < c);
});

test('発注書・母屋と相互にリンクしている', () => {
  for (const f of ['hacchusho.html', 'kaigyo.html']) {
    assert.ok(fs.readFileSync(path.join(PUBLIC, f), 'utf8').includes('href="/mitsumori-irai"'), f + ' から /mitsumori-irai へのリンクが無い');
  }
  assert.ok(html.includes('href="/hacchusho"') && html.includes('href="/kaigyo"'));
});

// ── mitsumori-irai.js を偽の DOM で動かす ───────────────────
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
  const window = { Shukkin: SK, MitsumoriIrai: MI, confirm: () => true, print() {} };
  new Function('window', 'document', 'localStorage', view)(window, document, localStorage);
  const fire = (node, type) => (node.listeners[type] || []).forEach((f) => f());
  const typeRow = (i, key, v) => {
    const inp = els.miRows.children[i].querySelectorAll('input[data-key]').find((x) => x.dataset.key === key);
    inp.value = v; fire(inp, 'input');
  };
  const type = (id, v) => { els[id].value = v; fire(els[id], 'input'); };
  const click = (id) => fire(els[id], 'click');
  const find = (node, cls) => {
    if (node.className === cls) return node;
    for (const c of node.children) { const hit = find(c, cls); if (hit) return hit; }
    return null;
  };
  return { els, type, typeRow, click, find };
}

test('開いた直後は明細1行。発行日だけ入り、回答期限は空、敬称は「御中」', () => {
  const v = runView({});
  assert.strictEqual(v.els.miRows.children.length, 1);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(v.els.miIssueDate.value));
  assert.strictEqual(v.els.miReplyDate.value, '');
  assert.strictEqual(v.els.miHonorific.value, '御中');
});

test('紙面は常に10行の枠を引き、列は No・品名・数量・単位の4つ(金額の列は無い)', () => {
  const v = runView({});
  v.typeRow(0, 'name', 'ZZ品名'); v.typeRow(0, 'qty', '1000'); v.typeRow(0, 'unit', '枚');
  v.type('miReplyDate', '2026-11-20'); v.type('miSubject', 'ZZ件名');
  const paper = v.els.miSheet.children[0];
  const table = v.find(paper, 'mi-table');
  assert.deepStrictEqual(table.children[0].children[0].children.map((th) => th.textContent), ['No', '品名・仕様', '数量', '単位']);
  const tbody = table.children[1];
  assert.strictEqual(tbody.children.length, MI.MAX_ROWS);
  assert.deepStrictEqual(tbody.children[0].children.map((td) => td.textContent), ['1', 'ZZ品名', '1000', '枚']);
  assert.strictEqual(tbody.children[1].children[1].textContent, '');
  const box = v.find(paper, 'mi-box');
  assert.deepStrictEqual(box.children.map((tr) => tr.children[0].textContent), ['件名', '回答期限', '希望納期', '納入場所', '支払条件']);
  assert.deepStrictEqual(box.children.map((tr) => tr.children[1].textContent), ['ZZ件名', '2026年11月20日', '', '', '']);
});

test('宛名は「名前　敬称」。名前が空なら敬称だけを紙に出さない。担当者は入れたときだけ出る', () => {
  const v = runView({});
  assert.strictEqual(v.find(v.els.miSheet.children[0], 'mi-to-name').textContent, '');
  v.type('miTo', 'ZZ印刷'); v.type('miPerson', 'ZZ担当');
  const paper = v.els.miSheet.children[0];
  assert.strictEqual(v.find(paper, 'mi-to-name').textContent, 'ZZ印刷　御中');
  assert.ok(v.find(paper, 'mi-from').children.some((p) => p.textContent === '担当 ZZ担当'));
});

test('10行で「行を足す」ボタンが止まる', () => {
  const v = runView({});
  for (let i = 0; i < 15; i++) v.click('miAdd');
  assert.strictEqual(v.els.miRows.children.length, MI.MAX_ROWS);
  assert.strictEqual(v.els.miAdd.disabled, true);
});

test('入力は mitsumori-irai-draft-v1 に下書きされ、開き直すと戻る', () => {
  const storage = {};
  const a = runView(storage);
  a.type('miTo', 'ZZ依頼先');
  a.type('miHonorific', '様');
  a.typeRow(0, 'name', 'ZZ明細の品名');
  assert.ok(storage['mitsumori-irai-draft-v1'].includes('ZZ明細の品名'));
  const b = runView(storage);
  assert.strictEqual(b.els.miTo.value, 'ZZ依頼先');
  assert.strictEqual(b.els.miHonorific.value, '様');
  assert.strictEqual(b.els.miRows.children[0].querySelectorAll('input[data-key]')[0].value, 'ZZ明細の品名');
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'keihi-draft-v1': '{"x":1}', 'shiharai-meisai-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('miTo', 'ZZ');
  v.click('miClear');
  assert.strictEqual(v.els.miTo.value, '');
  assert.ok(!String(storage['mitsumori-irai-draft-v1'] || '').includes('ZZ'));
  assert.strictEqual(storage['keihi-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['shiharai-meisai-draft-v1'], '{"y":1}');
});

console.log('mitsumori-irai.test.js: ' + passed + ' 件すべて通過');
