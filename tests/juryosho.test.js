/*
 * 受領書(/juryosho)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/juryosho.test.js
 *
 * 前半は juryosho-core.js の判断(空行・10行の上限・日付の前後・受領印の枠・警告)を直接確かめる。
 * 後半は juryosho.js を小さな偽の DOM で実際に動かし、下書きの保存と「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SK = require('../public/shukkin-core.js');
const JR = require('../public/juryosho-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'juryosho.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'juryosho.js'), 'utf8');
const core = fs.readFileSync(path.join(PUBLIC, 'juryosho-core.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const ROW = { name: 'コピー用紙 A4', qty: '5', unit: '箱' };
const base = (rows, extra) => Object.assign({
  issueDate: '2026-11-16', to: '株式会社○○', honorific: '御中', from: '山田デザイン事務所', fromAddress: '', person: '',
  subject: '11月分の事務用品', receivedDate: '2026-11-16', refNo: 'N-2026-0123', note: '', stamp: 'on', rows
}, extra || {});

console.log('juryosho.test.js');

// ── 組み立て ────────────────────────────────────────────
test('品名も数量も単位も空の行は数えない。番号は詰めて振る', () => {
  const b = JR.buildSheet(base([ROW, { name: '', qty: '', unit: '' }, ROW]));
  assert.strictEqual(b.rows.length, 2);
  assert.deepStrictEqual(b.rows.map((r) => r.no), [1, 2]);
});

test('数量と単位は任意。入れたときは書いたとおりに出す(読み替えない・計算しない)', () => {
  const b = JR.buildSheet(base([{ name: '契約書の原本', qty: ' 2通 ', unit: '' }, { name: '見本品', qty: '', unit: '' }]));
  assert.strictEqual(b.rows[0].qty, '2通');
  assert.strictEqual(b.rows[1].qty, '');
  assert.deepStrictEqual(JR.findProblems(base([{ name: '見本品', qty: '', unit: '' }])), []);
});

test('金額・合計・税を持たない(組み立てた結果にも、コードにも無い)', () => {
  const b = JR.buildSheet(base([ROW]));
  for (const k of Object.keys(b)) assert.ok(!/amount|total|tax|price/i.test(k), k);
  assert.ok(!/parseAmount|formatNumber/.test(core), '金額の読み取りを使っている');
});

test('日付は「2026年11月16日」の形。空・不正な日付は空欄のまま(今日にしない)', () => {
  const b = JR.buildSheet(base([ROW], { receivedDate: '2026-13-40' }));
  assert.strictEqual(b.issueDateText, '2026年11月16日');
  assert.strictEqual(b.receivedDateText, '');
  assert.strictEqual(JR.buildSheet(base([ROW])).receivedDateText, SK.formatDateJa('2026-11-16'));
});

test('敬称は「御中」「様」だけ。それ以外は「御中」に戻す', () => {
  assert.strictEqual(JR.buildSheet(base([ROW], { honorific: '様' })).honorific, '様');
  assert.strictEqual(JR.buildSheet(base([ROW], { honorific: '殿<b>' })).honorific, '御中');
});

test('受領印の枠は「つけない」と明示したときだけ消える。知らない値は「つける」', () => {
  assert.strictEqual(JR.buildSheet(base([ROW])).stamp, 'on');
  assert.strictEqual(JR.buildSheet(base([ROW], { stamp: 'off' })).stamp, 'off');
  assert.strictEqual(JR.buildSheet(base([ROW], { stamp: 'x' })).stamp, 'on');
  assert.strictEqual(JR.buildSheet(base([ROW], { stamp: undefined })).stamp, 'on');
});

test('11行目以降は紙面に出さず、overflow に数を残す', () => {
  const b = JR.buildSheet(base(Array.from({ length: 12 }, () => ROW)));
  assert.strictEqual(b.rows.length, JR.MAX_ROWS);
  assert.strictEqual(b.overflow, 2);
  assert.ok(JR.findProblems(base(Array.from({ length: 11 }, () => ROW))).some((m) => m.includes('11行目以降は紙面に出ていません')));
});

// ── 警告 ────────────────────────────────────────────────
test('宛先・受け取った側・受領日・明細が空なら、そう言う', () => {
  const p = JR.findProblems(base([], { to: '', from: '', receivedDate: '' }));
  assert.ok(p.some((m) => m.startsWith('宛先')));
  assert.ok(p.some((m) => m.startsWith('受け取った側')));
  assert.ok(p.some((m) => m.startsWith('受領日が入っていません')));
  assert.ok(p.some((m) => m.includes('明細が1行もありません')));
});

test('発行日が受領日より前なら知らせる(同じ日・後の日は知らせない)', () => {
  assert.ok(JR.findProblems(base([ROW], { issueDate: '2026-11-15' })).includes('発行日が受領日より前になっています。'));
  assert.deepStrictEqual(JR.findProblems(base([ROW], { issueDate: '2026-11-16' })), []);
  assert.deepStrictEqual(JR.findProblems(base([ROW], { issueDate: '2026-11-20' })), []);
});

test('件名・納品書の番号・備考は任意。空でも警告しない', () => {
  assert.deepStrictEqual(JR.findProblems(base([ROW], { subject: '', refNo: '', note: '' })), []);
});

test('欠けた欄・長すぎる文字を、場所つきで言う', () => {
  const rows = [
    { name: '', qty: '10', unit: '個' },
    { name: 'あ'.repeat(JR.LIMITS.name + 1), qty: '', unit: 'あ'.repeat(JR.LIMITS.unit + 1) },
    { name: 'x', qty: '1'.repeat(JR.LIMITS.qty + 1), unit: '' }
  ];
  const p = JR.findProblems(base(rows, {
    subject: 'あ'.repeat(JR.LIMITS.subject + 1), refNo: 'あ'.repeat(JR.LIMITS.refNo + 1),
    note: 'あ'.repeat(JR.LIMITS.note + 1)
  }));
  assert.ok(p.includes('1行目: 受け取った物の名前が入っていません。'));
  assert.ok(p.some((m) => m.startsWith('2行目: 受け取った物の名前が' + (JR.LIMITS.name + 1) + '字')));
  assert.ok(!p.some((m) => m.startsWith('2行目: 数量が入っていません')));
  assert.ok(p.some((m) => m.startsWith('2行目: 単位が' + (JR.LIMITS.unit + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('3行目: 数量が' + (JR.LIMITS.qty + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('件名が' + (JR.LIMITS.subject + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('納品書の番号が')));
  assert.ok(p.some((m) => m.startsWith('備考が' + (JR.LIMITS.note + 1) + '字')));
});

test('そろった入力には警告を出さない', () => {
  assert.deepStrictEqual(JR.findProblems(base([ROW])), []);
});

// ── ページ ──────────────────────────────────────────────
test('「送信しない」の表示が、ヘッダーと本文の両方に在る', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.includes('入力内容は送信されません'));
  assert.ok(html.includes('サーバーへ送信・保存されることはありません'));
});

test('<title> と <h1> が同じで、title は32文字以内、前半に「受領書」', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)[1];
  assert.strictEqual(title, h1);
  assert.ok([...title].length <= 32, 'title が ' + [...title].length + ' 文字');
  assert.ok(title.startsWith('受領書'));
});

test('説明文が約束した「物品受領書・受領日・品名・数量・受領印」が本文に在る', () => {
  const body = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
  for (const w of ['物品受領書', '受領日', '品名', '数量', '受領印']) assert.ok(body.includes(w), w);
});

test('書き方の例は、そのまま入れても警告が出ない', () => {
  const rows = [ROW, { name: 'トナーカートリッジ 黒', qty: '2', unit: '本' }, { name: 'クリアファイル', qty: '100', unit: '枚' }];
  assert.deepStrictEqual(JR.findProblems(base(rows, { note: '外箱に小さなへこみがありました' })), []);
  for (const r of rows) assert.ok(html.includes(r.name), r.name);
});

test('判断しないことを、入力欄のそばと本文の両方に書いている', () => {
  assert.ok(html.includes('注文どおりかは、このツールでは判断しません'));
  assert.ok(html.includes('検収が済んだことになるか'));
  assert.ok(html.includes('この紙に収入印紙が要るか'));
  assert.ok(html.includes('個別の判断は専門家にご確認ください'));
});

test('入力欄に金額を入れる場所が無い。お金のときは領収書へ案内する', () => {
  const editor = html.slice(html.indexOf('<section class="editor'), html.indexOf('<!-- ============ プレビュー'));
  assert.ok(!/inputmode="numeric"|金額\(円\)/.test(editor));
  assert.ok(!/金額|単価/.test(view.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(editor.includes('href="/ryoshusho"'));
});

test('shukkin-core.js → core → 画面 の順に読む', () => {
  const a = html.indexOf('<script src="/shukkin-core.js"></script>');
  const b = html.indexOf('<script src="/juryosho-core.js"></script>');
  const c = html.indexOf('<script src="/juryosho.js"></script>');
  assert.ok(a >= 0 && a < b && b < c);
});

test('納品書・母屋と相互にリンクしている', () => {
  for (const f of ['nohinsho.html', 'kaigyo.html']) {
    assert.ok(fs.readFileSync(path.join(PUBLIC, f), 'utf8').includes('href="/juryosho"'), f + ' から /juryosho へのリンクが無い');
  }
  assert.ok(html.includes('href="/nohinsho"') && html.includes('href="/kaigyo"'));
});

// ── juryosho.js を偽の DOM で動かす ───────────────────
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
  const window = { Shukkin: SK, Juryosho: JR, confirm: () => true, print() {} };
  new Function('window', 'document', 'localStorage', view)(window, document, localStorage);
  const fire = (node, type) => (node.listeners[type] || []).forEach((f) => f());
  const typeRow = (i, key, v) => {
    const inp = els.jrRows.children[i].querySelectorAll('input[data-key]').find((x) => x.dataset.key === key);
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

test('開いた直後は明細1行。発行日だけ入り、受領日は空、敬称は「御中」、受領印の枠は「つける」', () => {
  const v = runView({});
  assert.strictEqual(v.els.jrRows.children.length, 1);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(v.els.jrIssueDate.value));
  assert.strictEqual(v.els.jrReceivedDate.value, '');
  assert.strictEqual(v.els.jrHonorific.value, '御中');
  assert.strictEqual(v.els.jrStamp.value, 'on');
});

test('紙面は常に10行の枠を引き、列は No・品名・数量・単位の4つ(金額の列は無い)', () => {
  const v = runView({});
  v.typeRow(0, 'name', 'ZZ品名'); v.typeRow(0, 'qty', '5'); v.typeRow(0, 'unit', '箱');
  v.type('jrReceivedDate', '2026-11-16'); v.type('jrSubject', 'ZZ件名'); v.type('jrRefNo', 'ZZ-1');
  const paper = v.els.jrSheet.children[0];
  const table = v.find(paper, 'jr-table');
  assert.deepStrictEqual(table.children[0].children[0].children.map((th) => th.textContent), ['No', '品名', '数量', '単位']);
  const tbody = table.children[1];
  assert.strictEqual(tbody.children.length, JR.MAX_ROWS);
  assert.deepStrictEqual(tbody.children[0].children.map((td) => td.textContent), ['1', 'ZZ品名', '5', '箱']);
  assert.strictEqual(tbody.children[1].children[1].textContent, '');
  const box = v.find(paper, 'jr-box');
  assert.deepStrictEqual(box.children.map((tr) => tr.children[0].textContent), ['受領日', '件名', '納品書の番号']);
  assert.deepStrictEqual(box.children.map((tr) => tr.children[1].textContent), ['2026年11月16日', 'ZZ件名', 'ZZ-1']);
});

test('受領印の枠は既定で紙に出て、中は空欄。「つけない」にすると枠ごと消える', () => {
  const v = runView({});
  v.type('jrTo', 'ZZ納入者'); v.type('jrFrom', 'ZZ受領者');
  const stamp = v.find(v.els.jrSheet.children[0], 'jr-stamp');
  assert.ok(stamp, '受領印の枠が出ていない');
  assert.deepStrictEqual(stamp.children[0].children.map((c) => c.textContent), ['受領印', '']);
  v.type('jrStamp', 'off');
  assert.strictEqual(v.find(v.els.jrSheet.children[0], 'jr-stamp'), null);
});

test('宛名は「名前　敬称」。名前が空なら敬称だけを紙に出さない。担当者は入れたときだけ出る', () => {
  const v = runView({});
  assert.strictEqual(v.find(v.els.jrSheet.children[0], 'jr-to-name').textContent, '');
  v.type('jrTo', 'ZZ商事'); v.type('jrPerson', 'ZZ担当');
  const paper = v.els.jrSheet.children[0];
  assert.strictEqual(v.find(paper, 'jr-to-name').textContent, 'ZZ商事　御中');
  assert.ok(v.find(paper, 'jr-from').children.some((p) => p.textContent === '担当 ZZ担当'));
});

test('10行で「行を足す」ボタンが止まる', () => {
  const v = runView({});
  for (let i = 0; i < 15; i++) v.click('jrAdd');
  assert.strictEqual(v.els.jrRows.children.length, JR.MAX_ROWS);
  assert.strictEqual(v.els.jrAdd.disabled, true);
});

test('入力は juryosho-draft-v1 に下書きされ、開き直すと戻る(受領印の枠の選択も)', () => {
  const storage = {};
  const a = runView(storage);
  a.type('jrTo', 'ZZ宛先');
  a.type('jrHonorific', '様');
  a.type('jrStamp', 'off');
  a.typeRow(0, 'name', 'ZZ明細の品名');
  assert.ok(storage['juryosho-draft-v1'].includes('ZZ明細の品名'));
  const b = runView(storage);
  assert.strictEqual(b.els.jrTo.value, 'ZZ宛先');
  assert.strictEqual(b.els.jrHonorific.value, '様');
  assert.strictEqual(b.els.jrStamp.value, 'off');
  assert.strictEqual(b.els.jrRows.children[0].querySelectorAll('input[data-key]')[0].value, 'ZZ明細の品名');
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'keihi-draft-v1': '{"x":1}', 'kanryo-hokoku-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('jrTo', 'ZZ');
  v.click('jrClear');
  assert.strictEqual(v.els.jrTo.value, '');
  assert.strictEqual(v.els.jrStamp.value, 'on');
  assert.ok(!String(storage['juryosho-draft-v1'] || '').includes('ZZ'));
  assert.strictEqual(storage['keihi-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['kanryo-hokoku-draft-v1'], '{"y":1}');
});

console.log('juryosho.test.js: ' + passed + ' 件すべて通過');
