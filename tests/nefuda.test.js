/*
 * 値札(/nefuda)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/nefuda.test.js
 *
 * 前半は nefuda-core.js の判断(寸法・空行・枚数と並べきれない分・税の書き添え・警告)を直接確かめる。
 * 後半は nefuda.js を小さな偽の DOM で実際に動かし、18枠の紙面・下書きの保存・「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるか・
 *   値札の枠から文字がはみ出さないかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const NF = require('../public/nefuda-core.js');
const RY = require('../public/ryokinhyo-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'nefuda.html'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'nefuda.css'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'nefuda.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

console.log('nefuda.test.js');

// ── 紙の寸法 ────────────────────────────────────────────
test('64×46mm を 3列×6段=18枚。余白は上下10.5mm・左右9mmで、A4(210×297)にちょうど収まる', () => {
  const L = NF.LAYOUT;
  assert.strictEqual(NF.SLOTS, 18);
  assert.strictEqual(L.marginLeft * 2 + L.tagW * L.cols, 210);
  assert.strictEqual(L.marginTop * 2 + L.tagH * L.rows, 297);
});

test('CSS の寸法が LAYOUT と同じ値。名前付きページだけを持ち、他のページの紙面を変えない', () => {
  const L = NF.LAYOUT;
  assert.ok(css.includes('padding: ' + L.marginTop + 'mm ' + L.marginLeft + 'mm;'));
  assert.ok(css.includes('grid-template-columns: repeat(' + L.cols + ', ' + L.tagW + 'mm);'));
  assert.ok(css.includes('grid-template-rows: repeat(' + L.rows + ', ' + L.tagH + 'mm);'));
  assert.ok(/@page nefuda\s*\{[^}]*size: 210mm 297mm;[^}]*margin: 0;/.test(css));
  assert.ok(/page: nefuda;/.test(css));
  assert.ok(!/@page\s*\{/.test(css));
});

// ── 組み立て ────────────────────────────────────────────
test('金額は料金表と同じ読み方(全角・カンマ・円を読み飛ばし「1,500円」)。読めないものは空欄', () => {
  const b = NF.buildSheet({ name1: 'A', price1: '１５００', name2: 'B', price2: '¥2,800', name3: 'C', price3: '1.5' });
  assert.deepStrictEqual(b.tags.map((t) => t.priceText), ['1,500円', '2,800円', '']);
  assert.strictEqual(RY.formatPrice(RY.parsePrice('１５００')), '1,500円');
});

test('品名も金額も空の行は値札にしない。行の順番は詰めて並べる', () => {
  const b = NF.buildSheet({ name1: 'A', price1: '100', note2: '補足だけ', name5: 'E', price5: '500' });
  assert.deepStrictEqual(b.tags.map((t) => t.name), ['A', 'E']);
  assert.strictEqual(b.overflow, 0);
});

test('1品あたり2枚・3枚ずつ並べる。知らない値は1枚', () => {
  const inp = { name1: 'A', price1: '100', name2: 'B', price2: '200' };
  assert.deepStrictEqual(NF.buildSheet(Object.assign({ copies: '2' }, inp)).tags.map((t) => t.name), ['A', 'A', 'B', 'B']);
  assert.strictEqual(NF.buildSheet(Object.assign({ copies: '3' }, inp)).tags.length, 6);
  assert.strictEqual(NF.buildSheet(Object.assign({ copies: '9' }, inp)).tags.length, 2);
});

test('18枚を超えた分は紙に出さず、その枚数を数えて知らせる', () => {
  const inp = { copies: '3' };
  for (let n = 1; n <= 7; n++) { inp['name' + n] = 'P' + n; inp['price' + n] = '100'; }
  const b = NF.buildSheet(inp);
  assert.strictEqual(b.tags.length, 18);
  assert.strictEqual(b.overflow, 3);
  assert.ok(NF.findProblems(inp, b).some((m) => m.includes('あとの3枚は紙に出ません')));
});

test('書き添えは 税込/税抜/書かない。既定は税込。金額が空の札には付けない', () => {
  const inp = { name1: 'A', price1: '100', name2: 'B' };
  assert.deepStrictEqual(NF.buildSheet(inp).tags.map((t) => t.tax), ['税込', '']);
  assert.strictEqual(NF.buildSheet(Object.assign({ tax: 'excl' }, inp)).tags[0].tax, '税抜');
  assert.strictEqual(NF.buildSheet(Object.assign({ tax: 'none' }, inp)).tags[0].tax, '');
  assert.strictEqual(NF.buildSheet(Object.assign({ tax: 'zzz' }, inp)).tags[0].tax, '税込');
});

test('警告: 空・品名なし・金額なし・読めない金額・字数と桁の超過', () => {
  assert.deepStrictEqual(NF.findProblems({}), ['品名と金額が1つも入っていません。']);
  const p = NF.findProblems({
    price1: '100', name2: 'B', name3: 'C', price3: '3千', note4: 'x',
    name5: 'あ'.repeat(13), note5: 'い'.repeat(19), price5: '12345678'
  });
  assert.ok(p.includes('1行目の品名が入っていません。'));
  assert.ok(p.some((m) => m.startsWith('2行目の金額が入っていません')));
  assert.ok(p.some((m) => m.startsWith('3行目の金額「3千」は読めませんでした')));
  assert.ok(p.some((m) => m.startsWith('4行目は補足だけ')));
  assert.ok(p.includes('5行目の品名が13字あります。12字までにしてください。'));
  assert.ok(p.includes('5行目の補足が19字あります。18字までにしてください。'));
  assert.ok(p.includes('5行目の金額が8桁あります。7桁までにしてください。'));
});

test('消費税を計算しない(入れた金額をそのまま出す)', () => {
  const b = NF.buildSheet({ name1: 'A', price1: '1000', tax: 'excl' });
  assert.strictEqual(b.tags[0].priceText, '1,000円');
  assert.ok(!/1,100|0\.1|1\.1/.test(fs.readFileSync(path.join(PUBLIC, 'nefuda-core.js'), 'utf8')));
});

// ── ページ ──────────────────────────────────────────────
test('ページ: canonical・送信しない表示・ryokinhyo-core を先に読む・外部への通信なし', () => {
  assert.ok(html.includes('<link rel="canonical" href="https://invoice-tool-kohl.vercel.app/nefuda">'));
  assert.ok(html.includes('入力内容は送信されません'));
  assert.ok(html.indexOf('/ryokinhyo-core.js') < html.indexOf('/nefuda-core.js'));
  assert.ok(html.indexOf('/nefuda-core.js') < html.indexOf('/nefuda.js"'));
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(view));
  assert.ok(Array.from(html.match(/<title>([^<]*)<\/title>/)[1]).length <= 32);
});

test('母屋 /kaigyo と /ryokinhyo から張られ、/nefuda からも /ryokinhyo と /kaigyo へ戻る', () => {
  const kaigyo = fs.readFileSync(path.join(PUBLIC, 'kaigyo.html'), 'utf8');
  const ryokin = fs.readFileSync(path.join(PUBLIC, 'ryokinhyo.html'), 'utf8');
  assert.ok(kaigyo.includes('href="/nefuda"'));
  assert.ok(ryokin.includes('href="/nefuda"'));
  assert.ok(html.includes('href="/ryokinhyo"'));
  assert.ok(html.includes('href="/kaigyo"'));
});

test('サイトマップに1回だけ載っている', () => {
  const map = fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
  assert.strictEqual(map.split('<loc>https://invoice-tool-kohl.vercel.app/nefuda</loc>').length - 1, 1);
});

// ── nefuda.js を偽の DOM で動かす ──────────────────────
function fakeEl(tag) {
  return {
    tagName: String(tag || 'div').toUpperCase(), value: '', className: '',
    hidden: false, children: [], parentNode: null, listeners: {}, _text: '',
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; this.children.forEach((c) => { c.parentNode = null; }); this.children = []; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  };
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
  const window = { Nefuda: NF, confirm: () => true, print() {} };
  new Function('window', 'document', 'localStorage', view)(window, document, localStorage);
  const fire = (node, type) => (node.listeners[type] || []).forEach((f) => f());
  const type = (id, v) => { els[id].value = v; fire(els[id], 'input'); };
  const click = (id) => fire(els[id], 'click');
  const findAll = (node, cls, out) => {
    out = out || [];
    if (node.className === cls) out.push(node);
    for (const c of node.children) findAll(c, cls, out);
    return out;
  };
  const paper = () => els.nfSheet.children[0];
  const texts = (cls) => findAll(paper(), cls).map((n) => n.textContent);
  return { els, type, click, paper, findAll, texts };
}

test('画面が読む入力欄の id は、すべてページに在る', () => {
  const v = runView({});
  const ids = Object.keys(v.els);
  assert.strictEqual(ids.length, 3 + NF.ROWS * 3 + 4);
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), id + ' がページに無い');
});

test('開いた直後は18枠すべて空・切り取り線つき・税込。中身を勝手に入れない', () => {
  const v = runView({});
  assert.strictEqual(v.paper().children.length, 18);
  assert.strictEqual(v.findAll(v.paper(), 'nf-empty').length, 18);
  assert.strictEqual(v.paper().className, 'nf-paper nf-guides');
  assert.strictEqual(v.els.nfTax.value, 'incl');
  assert.strictEqual(v.els.nfCopies.value, '1');
  assert.strictEqual(v.els.nfProblems.hidden, false);
});

test('入れた品が値札になり、残りの枠は空のまま。2枚ずつにすると並ぶ', () => {
  const v = runView({});
  v.type('nfName1', 'ZZ石けん'); v.type('nfNote1', '80g'); v.type('nfPrice1', '600');
  assert.deepStrictEqual(v.texts('nf-name'), ['ZZ石けん']);
  assert.deepStrictEqual(v.texts('nf-note'), ['80g']);
  assert.deepStrictEqual(v.texts('nf-amount'), ['600円']);
  assert.deepStrictEqual(v.texts('nf-tax'), ['税込']);
  assert.strictEqual(v.findAll(v.paper(), 'nf-empty').length, 17);
  assert.strictEqual(v.els.nfProblems.hidden, true);
  v.type('nfCopies', '2');
  assert.deepStrictEqual(v.texts('nf-name'), ['ZZ石けん', 'ZZ石けん']);
  v.type('nfTax', 'none'); v.type('nfGuides', 'off');
  assert.deepStrictEqual(v.texts('nf-tax'), []);
  assert.strictEqual(v.paper().className, 'nf-paper');
});

test('入力は nefuda-draft-v1 に下書きされ、開き直すと戻る。壊れた下書きでも落ちない', () => {
  const storage = {};
  const a = runView(storage);
  a.type('nfName3', 'ZZ下書き'); a.type('nfCopies', '3'); a.type('nfTax', 'excl');
  assert.ok(storage['nefuda-draft-v1'].includes('ZZ下書き'));
  const b = runView(storage);
  assert.strictEqual(b.els.nfName3.value, 'ZZ下書き');
  assert.strictEqual(b.els.nfCopies.value, '3');
  assert.strictEqual(b.els.nfTax.value, 'excl');
  assert.strictEqual(runView({ 'nefuda-draft-v1': '{こわれた' }).els.nfTax.value, 'incl');
  const c = runView({ 'nefuda-draft-v1': '{"copies":"9","tax":"zzz","guides":"x"}' });
  assert.deepStrictEqual([c.els.nfCopies.value, c.els.nfTax.value, c.els.nfGuides.value], ['1', 'incl', 'on']);
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'ryokinhyo-draft-v1': '{"x":1}', 'meishi-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('nfName1', 'ZZ'); v.type('nfCopies', '2');
  v.click('nfClear');
  assert.strictEqual(v.els.nfName1.value, '');
  assert.strictEqual(v.els.nfCopies.value, '1');
  assert.ok(!('nefuda-draft-v1' in storage));
  assert.strictEqual(storage['ryokinhyo-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['meishi-draft-v1'], '{"y":1}');
  assert.ok(html.includes('>入力をすべて消す<'));
  assert.ok(view.includes("removeItem(STORAGE_KEY)") && view.includes("setItem(STORAGE_KEY"));
});

console.log('nefuda.test.js: ' + passed + ' 件すべて通過');
