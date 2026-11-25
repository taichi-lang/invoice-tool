/*
 * 整理券(/seiriken)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/seiriken.test.js
 *
 * 前半は seiriken-core.js の判断(寸法・番号の並び・桁・ページ分け・上限・警告)を直接確かめる。
 * 後半は seiriken.js を小さな偽の DOM で実際に動かし、紙面・下書きの保存・「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1面1ページに収まるか・
 *   枠から文字がはみ出さないかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SR = require('../public/seiriken-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'seiriken.html'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'seiriken.css'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'seiriken.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

console.log('seiriken.test.js');

// ── 紙の寸法 ────────────────────────────────────────────
test('64×46mm を 3列×6段=18枚。余白は上下10.5mm・左右9mmで、A4(210×297)にちょうど収まる', () => {
  const L = SR.LAYOUT;
  assert.strictEqual(SR.PER_PAGE, 18);
  assert.strictEqual(L.marginLeft * 2 + L.tagW * L.cols, 210);
  assert.strictEqual(L.marginTop * 2 + L.tagH * L.rows, 297);
  assert.ok(/@page seiriken\s*\{[^}]*size: 210mm 297mm;[^}]*margin: 0;/.test(css));
  assert.ok(/page: seiriken;/.test(css));
  assert.ok(/break-after: page;/.test(css));
  assert.ok(css.includes('padding: 10.5mm 9mm;') && css.includes('repeat(3, 64mm)') && css.includes('repeat(6, 46mm)'));
});

// ── 番号の並び ──────────────────────────────────────────
test('始めの番号から1ずつ増やし、18枚ごとに次の紙へ。余りの枠は作らない', () => {
  const b = SR.buildSheet({ shop: 'ZZ店', start: '5', count: '20' });
  assert.strictEqual(b.count, 20);
  assert.strictEqual(b.pages.length, 2);
  assert.strictEqual(b.pages[0].length, 18);
  assert.strictEqual(b.pages[1].length, 2);
  assert.strictEqual(b.pages[0][0].number, '5');
  assert.strictEqual(b.pages[1][1].number, '24');
});

test('全角数字も読む。3桁にそろえると 001。4桁以上はそのまま', () => {
  assert.strictEqual(SR.parseInt0('１２'), 12);
  assert.strictEqual(SR.parseInt0(''), '');
  assert.strictEqual(SR.parseInt0('1.5'), null);
  assert.strictEqual(SR.parseInt0('-1'), null);
  assert.strictEqual(SR.formatNumber(7, '3'), '007');
  assert.strictEqual(SR.formatNumber(1234, '3'), '1234');
  assert.strictEqual(SR.formatNumber(7, 'none'), '7');
  const b = SR.buildSheet({ start: '９', count: '2', pad: '3' });
  assert.deepStrictEqual(b.pages[0].map((t) => t.number), ['009', '010']);
});

test('見出しを空けると「整理券」。変えた見出しはそのまま出る', () => {
  assert.strictEqual(SR.buildSheet({ start: '1', count: '1' }).pages[0][0].title, '整理券');
  assert.strictEqual(SR.buildSheet({ title: '引換券', start: '1', count: '1' }).pages[0][0].title, '引換券');
});

test('90枚(5ページ)と番号9999で止め、超えた分は紙に出さずに知らせる', () => {
  const big = { shop: 'ZZ', start: '1', count: '100' };
  const b = SR.buildSheet(big);
  assert.strictEqual(b.count, 90);
  assert.strictEqual(b.pages.length, 5);
  assert.ok(SR.findProblems(big).some((m) => m.includes('あとの10枚は紙に出ません')));
  const top = { shop: 'ZZ', start: '9998', count: '5' };
  assert.strictEqual(SR.buildSheet(top).count, 2);
  assert.ok(SR.findProblems(top).some((m) => m.includes('9999を超える分は紙に出ません')));
});

test('読めない番号・枚数0は紙を作らず、どの欄かを言う', () => {
  const bad = { shop: 'ZZ', start: 'あ', count: '0' };
  assert.strictEqual(SR.buildSheet(bad).pages.length, 0);
  const p = SR.findProblems(bad);
  assert.ok(p.some((m) => m.includes('始めの番号「あ」は読めませんでした')));
  assert.ok(p.some((m) => m.includes('枚数は1枚以上')));
  assert.ok(SR.findProblems({}).some((m) => m === '始めの番号が入っていません。'));
  assert.ok(SR.findProblems({}).some((m) => m === '枚数が入っていません。'));
});

test('文字数の上限を超えると警告だけ出し、切り詰めない', () => {
  const long = { title: 'あいうえおかき', shop: 'あ'.repeat(15), event: 'い'.repeat(19), note: 'う'.repeat(23), start: '1', count: '1' };
  const p = SR.findProblems(long);
  assert.strictEqual(p.filter((m) => m.includes('字までにしてください')).length, 4);
  assert.strictEqual(SR.buildSheet(long).pages[0][0].shop, 'あ'.repeat(15));
  assert.deepStrictEqual(SR.findProblems({ shop: 'ZZ', start: '1', count: '18' }), []);
});

// ── ページの約束 ────────────────────────────────────────
test('canonical・送信しない表示・スクリプトの順・外部への通信なし', () => {
  assert.ok(html.includes('<link rel="canonical" href="https://invoice-tool-kohl.vercel.app/seiriken">'));
  assert.ok(html.includes('<strong>入力内容は送信されません</strong>'));
  assert.ok(html.indexOf('/seiriken-core.js') < html.indexOf('/seiriken.js"'));
  for (const src of [view, fs.readFileSync(path.join(PUBLIC, 'seiriken-core.js'), 'utf8')]) {
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|sessionStorage|indexedDB|document\.cookie/.test(src));
  }
  assert.ok(!/<script[^>]+src="https?:/.test(html));
});

test('母屋 /kaigyo と /aisatsujo から張られ、/seiriken からも /kaigyo へ戻る。sitemap に1回', () => {
  const kaigyo = fs.readFileSync(path.join(PUBLIC, 'kaigyo.html'), 'utf8');
  const aisatsu = fs.readFileSync(path.join(PUBLIC, 'aisatsujo.html'), 'utf8');
  assert.ok(kaigyo.includes('href="/seiriken"'));
  assert.ok(aisatsu.includes('href="/seiriken"'));
  assert.ok(html.includes('href="/kaigyo"') && html.includes('href="/aisatsujo"'));
  const map = fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
  assert.strictEqual(map.split('<loc>https://invoice-tool-kohl.vercel.app/seiriken</loc>').length - 1, 1);
});

// ── seiriken.js を偽の DOM で動かす ─────────────────────
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
  const window = { Seiriken: SR, confirm: () => true, print() {} };
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
  const texts = (cls) => findAll(els.srSheet, cls).map((n) => n.textContent);
  return { els, type, click, findAll, texts };
}

test('画面が読む入力欄の id は、すべてページに在る', () => {
  const v = runView({});
  const ids = Object.keys(v.els);
  assert.strictEqual(ids.length, 8 + 4);
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), id + ' がページに無い');
});

test('開いた直後は 1〜18 の整理券が1枚の紙に並び、切り取り線つき。店名が空だと知らせる', () => {
  const v = runView({});
  assert.strictEqual(v.els.srSheet.children.length, 1);
  assert.strictEqual(v.els.srSheet.children[0].className, 'sr-paper sr-guides');
  assert.deepStrictEqual(v.texts('sr-digits'), Array.from({ length: 18 }, (_, i) => String(i + 1)));
  assert.strictEqual(v.els.srProblems.hidden, false);
});

test('枚数を増やすと紙が増え、余りの枠は空のまま。線を消せる', () => {
  const v = runView({});
  v.type('srShop', 'ZZ店'); v.type('srEvent', 'ZZ日'); v.type('srCount', '20');
  assert.strictEqual(v.els.srSheet.children.length, 2);
  assert.strictEqual(v.findAll(v.els.srSheet, 'sr-empty').length, 16);
  assert.strictEqual(v.texts('sr-shop').length, 20);
  assert.deepStrictEqual(v.texts('sr-note'), []);
  assert.strictEqual(v.els.srProblems.hidden, true);
  v.type('srGuides', 'off');
  assert.strictEqual(v.els.srSheet.children[0].className, 'sr-paper');
});

test('入力は seiriken-draft-v1 に下書きされ、開き直すと戻る。壊れた下書きでも落ちない', () => {
  const storage = {};
  const a = runView(storage);
  a.type('srShop', 'ZZ下書き'); a.type('srPad', '3');
  assert.ok(storage['seiriken-draft-v1'].includes('ZZ下書き'));
  const b = runView(storage);
  assert.strictEqual(b.els.srShop.value, 'ZZ下書き');
  assert.strictEqual(b.els.srPad.value, '3');
  assert.strictEqual(runView({ 'seiriken-draft-v1': '{こわれた' }).els.srCount.value, '18');
  const c = runView({ 'seiriken-draft-v1': '{"pad":"9","guides":"x"}' });
  assert.deepStrictEqual([c.els.srPad.value, c.els.srGuides.value], ['none', 'on']);
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'nefuda-draft-v1': '{"x":1}', 'aisatsujo-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('srShop', 'ZZ'); v.type('srCount', '40');
  v.click('srClear');
  assert.strictEqual(v.els.srShop.value, '');
  assert.strictEqual(v.els.srCount.value, '18');
  assert.ok(!('seiriken-draft-v1' in storage));
  assert.strictEqual(storage['nefuda-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['aisatsujo-draft-v1'], '{"y":1}');
  assert.ok(html.includes('>入力をすべて消す<'));
  assert.ok(view.includes('removeItem(STORAGE_KEY)') && view.includes('setItem(STORAGE_KEY'));
});

console.log('seiriken.test.js: ' + passed + ' 件すべて通過');
