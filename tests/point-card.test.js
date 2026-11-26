/*
 * ポイントカード(/point-card)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/point-card.test.js
 *
 * 前半は point-card-core.js の判断(スタンプの数とマス・欄のつける/つけない・警告)を直接確かめる。
 * 後半は point-card.js を小さな偽の DOM で実際に動かし、10枚の紙面・下書きの保存・「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるか・
 *   カードの枠から文字やマスがはみ出さないかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const PC = require('../public/point-card-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'point-card.html'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'point-card.css'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'point-card.js'), 'utf8');
const core = fs.readFileSync(path.join(PUBLIC, 'point-card-core.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

function base(extra) {
  const o = { stamps: '10', name: 'on', expiry: 'off', guides: 'on' };
  for (const k of PC.FIELDS) o[k] = '';
  o.shop = 'カフェ こもれび';
  return Object.assign(o, extra || {});
}

console.log('point-card.test.js');

// ── 紙の寸法 ────────────────────────────────────────────
test('91×55mm を 2列×5段=10枚。余白は上下11mm・左右14mmで、A4(210×297)にちょうど収まる', () => {
  const L = PC.LAYOUT;
  assert.strictEqual(PC.COUNT, 10);
  assert.strictEqual(L.marginLeft * 2 + L.cardW * L.cols, 210);
  assert.strictEqual(L.marginTop * 2 + L.cardH * L.rows, 297);
});

test('CSS の寸法が LAYOUT と同じ値。名前付きの余白0ページだけを持つ', () => {
  const L = PC.LAYOUT;
  assert.ok(css.includes('padding: ' + L.marginTop + 'mm ' + L.marginLeft + 'mm;'));
  assert.ok(css.includes('grid-template-columns: repeat(' + L.cols + ', ' + L.cardW + 'mm);'));
  assert.ok(css.includes('grid-template-rows: repeat(' + L.rows + ', ' + L.cardH + 'mm);'));
  assert.ok(/@page pointcard\s*\{[^}]*size: 210mm 297mm;[^}]*margin: 0;/.test(css));
  assert.ok(/page: pointcard;/.test(css));
  assert.ok(!/@page\s*\{/.test(css), '名前の無い @page を持つと、他のページの紙面まで変わる');
});

test('どのスタンプの数でも、マスの列がカードの内側の幅(79mm)に収まる', () => {
  for (const n of PC.STAMPS) {
    const g = PC.GRID[n];
    assert.strictEqual(g.cols * g.rows, n, n + '個のマスの数が合わない');
    const w = g.cols * g.cell + (g.cols - 1) * 1;
    assert.ok(w <= 79, n + '個: 幅 ' + w + 'mm');
  }
});

// ── スタンプのマス ──────────────────────────────────────
test('マスには1から順に番号を振り、最後のマスだけが特典のマス', () => {
  const c = PC.buildCard(base({ stamps: '15' }));
  assert.strictEqual(c.cells.length, 15);
  assert.deepStrictEqual(c.cells.map((x) => x.no), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.deepStrictEqual(c.cells.filter((x) => x.goal).map((x) => x.no), [15]);
  assert.deepStrictEqual(c.grid, PC.GRID[15]);
});

test('スタンプの数は 5/10/15/20 だけ。知らない値は10個', () => {
  for (const n of [5, 10, 15, 20]) assert.strictEqual(PC.buildCard(base({ stamps: String(n) })).stamps, n);
  assert.strictEqual(PC.buildCard(base({ stamps: '7' })).stamps, 10);
  assert.strictEqual(PC.buildCard({}).stamps, 10);
});

// ── 欄 ──────────────────────────────────────────────────
test('カード名が空なら「ポイントカード」。入れればその名前', () => {
  assert.strictEqual(PC.buildCard(base()).title, 'ポイントカード');
  assert.strictEqual(PC.buildCard(base({ title: ' スタンプカード ' })).title, 'スタンプカード');
});

test('お名前の欄は既定でつける・有効期限の欄は既定でつけない。切り取り線は既定でつける', () => {
  const c = PC.buildCard({});
  assert.strictEqual(c.name, true);
  assert.strictEqual(c.expiry, false);
  assert.strictEqual(c.guides, 'on');
  const d = PC.buildCard(base({ name: 'off', expiry: 'on', guides: 'off' }));
  assert.strictEqual(d.name, false);
  assert.strictEqual(d.expiry, true);
  assert.strictEqual(d.guides, 'off');
});

test('下の2行は入れたものだけ並ぶ', () => {
  assert.deepStrictEqual(PC.buildCard(base()).info, []);
  assert.deepStrictEqual(PC.buildCard(base({ info1: '住所', info2: 'TEL' })).info, ['住所', 'TEL']);
  assert.deepStrictEqual(PC.buildCard(base({ info2: 'TEL' })).info, ['TEL']);
});

// ── 警告 ────────────────────────────────────────────────
test('店名が無い・下の2行目だけ、を知らせる。足りていれば何も言わない', () => {
  const p = PC.findProblems(base({ shop: '', info2: 'TEL' }));
  assert.ok(p.some((m) => m.startsWith('店名が入っていません')));
  assert.ok(p.some((m) => m.startsWith('下の2行目だけ')));
  assert.deepStrictEqual(PC.findProblems(base()), []);
});

test('文字数の上限を超えたら知らせる(切り詰めはしない)。全部の欄で', () => {
  const extra = {};
  for (const k of PC.FIELDS) extra[k] = 'あ'.repeat(PC.LIMITS[k] + 1);
  const p = PC.findProblems(base(extra));
  for (const head of ['カード名が', '店名が', '特典が', '下の1行目が', '下の2行目が']) {
    assert.ok(p.some((m) => m.startsWith(head)), head + ' の警告が無い\n' + p.join('\n'));
  }
  assert.strictEqual(PC.buildCard(base(extra)).shop, 'あ'.repeat(PC.LIMITS.shop + 1));
  const atLimit = {};
  for (const k of PC.FIELDS) atLimit[k] = 'あ'.repeat(PC.LIMITS[k]);
  assert.deepStrictEqual(PC.findProblems(base(atLimit)), []);
});

// ── ページ ──────────────────────────────────────────────
test('「入力内容は送信されません」がページにあり、外へ通信するコードが無い', () => {
  assert.ok(html.includes('入力内容は送信されません'));
  for (const src of [view, core]) assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.share/.test(src));
  assert.ok(!/<script[^>]*src="https?:/.test(html), '外部のスクリプトを読んでいる');
  assert.ok(!/<script>(?!\s*<\/script>)/.test(html), 'インラインのスクリプトがある(CSP で止まる)');
});

test('タイトルは前半に「ポイントカード」があり32字以内。h1 と同じ。canonical は自分のURL', () => {
  const title = /<title>([^<]*)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]*)<\/h1>/.exec(html)[1];
  assert.ok(title.startsWith('ポイントカード'));
  assert.ok(Array.from(title).length <= 32, title);
  assert.strictEqual(h1, title);
  assert.ok(html.includes('<link rel="canonical" href="https://invoice-tool-kohl.vercel.app/point-card">'));
});

test('扱わないこと(景品表示法の判断・ポイントの管理)と、試し刷りをページに書いている', () => {
  assert.ok(html.includes('景品表示法などの決まりに触れるかは判断しません'));
  assert.ok(html.includes('ポイントの記録・集計'));
  assert.ok(html.includes('お使いの用紙やプリンタに合うかを確かめていません'));
  assert.ok(html.includes('試し刷り'));
});

test('母屋 /kaigyo と /meishi からポイントカードへ、ポイントカードから母屋と /meishi へリンクがある(双方向)', () => {
  const hub = fs.readFileSync(path.join(PUBLIC, 'kaigyo.html'), 'utf8');
  const mc = fs.readFileSync(path.join(PUBLIC, 'meishi.html'), 'utf8');
  assert.ok(hub.includes('href="/point-card"'));
  assert.ok(mc.includes('href="/point-card"'));
  assert.ok(html.includes('href="/kaigyo"'));
  assert.ok(html.includes('href="/meishi"'));
});

test('母屋では整理券の見出しのあと、「登録もお金も要りません」の前に置く。番号つきの工程は増やさない', () => {
  const hub = fs.readFileSync(path.join(PUBLIC, 'kaigyo.html'), 'utf8');
  const i = hub.indexOf('href="/point-card"');
  assert.ok(hub.indexOf('href="/seiriken"') < i && i < hub.indexOf('<h2>登録もお金も要りません</h2>'));
  assert.ok(!hub.includes('<h2>7.'));
});

test('サイトマップに1回だけ載っている', () => {
  const map = fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
  assert.strictEqual(map.split('<loc>https://invoice-tool-kohl.vercel.app/point-card</loc>').length - 1, 1);
});

// ── point-card.js を偽の DOM で動かす ──────────────────────
function fakeEl(tag) {
  return {
    tagName: String(tag || 'div').toUpperCase(), value: '', className: '',
    hidden: false, disabled: false, style: {}, children: [], parentNode: null, listeners: {},
    _text: '',
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
  const window = { PointCard: PC, confirm: () => true, print() {} };
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
  const paper = () => els.pcSheet.children[0];
  const cards = () => findAll(paper(), 'pc-card');
  const texts = (cls) => findAll(cards()[0], cls).map((n) => n.textContent);
  const text = (cls) => { const t = texts(cls); return t.length ? t[0] : null; };
  return { els, type, click, paper, cards, findAll, text, texts };
}

test('画面が読む入力欄の id は、すべてページに在る(名前の食い違いで欄が死なない)', () => {
  const v = runView({});
  const ids = Object.keys(v.els);
  assert.strictEqual(ids.length, PC.FIELDS.length + PC.OPTIONS.length + 4);
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), id + ' がページに無い');
});

test('開いた直後は10個のマスのカードが10枚・お名前の欄と切り取り線つき。中身を勝手に入れない', () => {
  const v = runView({});
  const card = v.cards()[0];
  assert.strictEqual(v.cards().length, 10);
  assert.strictEqual(v.paper().className, 'pc-paper pc-guides');
  assert.strictEqual(v.els.pcStamps.value, '10');
  assert.strictEqual(v.findAll(card, 'pc-cell').length + v.findAll(card, 'pc-cell pc-goal').length, 10);
  assert.strictEqual(v.text('pc-title'), 'ポイントカード');
  assert.strictEqual(v.text('pc-shop'), null);
  assert.strictEqual(v.text('pc-reward'), null);
  assert.strictEqual(v.findAll(card, 'pc-name').length, 1);
  assert.strictEqual(v.text('pc-expiry'), null);
  assert.strictEqual(v.els.pcProblems.hidden, false);
});

test('入れた中身が10枚すべてに同じく出る。スタンプの数を変えるとマスの数と並びが変わる', () => {
  const v = runView({});
  v.type('pcShop', 'ZZ商店'); v.type('pcReward', 'ZZ特典'); v.type('pcInfo1', 'ZZ県');
  v.type('pcStamps', '20'); v.type('pcExpiry', 'on'); v.type('pcName', 'off');
  assert.strictEqual(v.text('pc-reward'), 'ZZ特典');
  assert.deepStrictEqual(v.texts('pc-info'), ['ZZ県']);
  const card = v.cards()[0];
  assert.strictEqual(v.findAll(card, 'pc-cell').length, 19);
  assert.strictEqual(v.findAll(card, 'pc-cell pc-goal').length, 1);
  assert.strictEqual(v.findAll(card, 'pc-grid')[0].style.gridTemplateColumns, 'repeat(10, 6.8mm)');
  assert.strictEqual(v.findAll(card, 'pc-name').length, 0);
  assert.strictEqual(v.text('pc-expiry'), '有効期限　　年　　月　　日');
  const shops = v.findAll(v.paper(), 'pc-shop').map((n) => n.textContent);
  assert.deepStrictEqual(shops, Array(10).fill('ZZ商店'));
  assert.strictEqual(v.els.pcProblems.hidden, true);
});

test('切り取り線を「つけない」にすると、紙面から線の印が外れる', () => {
  const v = runView({});
  v.type('pcGuides', 'off');
  assert.strictEqual(v.paper().className, 'pc-paper');
});

test('入力は point-card-draft-v1 に下書きされ、開き直すと戻る(選択肢も)', () => {
  const storage = {};
  const a = runView(storage);
  a.type('pcShop', 'ZZ下書き'); a.type('pcStamps', '5'); a.type('pcExpiry', 'on');
  assert.ok(storage['point-card-draft-v1'].includes('ZZ下書き'));
  const b = runView(storage);
  assert.strictEqual(b.els.pcShop.value, 'ZZ下書き');
  assert.strictEqual(b.els.pcStamps.value, '5');
  assert.strictEqual(b.els.pcExpiry.value, 'on');
});

test('壊れた下書き・知らない選択肢の値でも落ちずに既定で開く', () => {
  assert.strictEqual(runView({ 'point-card-draft-v1': '{こわれた' }).els.pcStamps.value, '10');
  const v = runView({ 'point-card-draft-v1': '{"stamps":"7","name":"zzz","guides":"x"}' });
  assert.strictEqual(v.els.pcStamps.value, '10');
  assert.strictEqual(v.els.pcName.value, 'on');
  assert.strictEqual(v.els.pcGuides.value, 'on');
  assert.strictEqual(v.els.pcExpiry.value, 'off');
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'meishi-draft-v1': '{"x":1}', 'seiriken-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('pcShop', 'ZZ'); v.type('pcStamps', '20');
  v.click('pcClear');
  assert.strictEqual(v.els.pcShop.value, '');
  assert.strictEqual(v.els.pcStamps.value, '10');
  assert.ok(!('point-card-draft-v1' in storage), '消したあとに下書きのキーが残っている');
  assert.strictEqual(storage['meishi-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['seiriken-draft-v1'], '{"y":1}');
  assert.ok(html.includes('>入力をすべて消す<'));
});

console.log('point-card.test.js: ' + passed + ' 件すべて通過');
