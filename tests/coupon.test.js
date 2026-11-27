/*
 * クーポン券(/coupon)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/coupon.test.js
 *
 * 前半は coupon-core.js の判断(有効期限・通し番号・枚数・警告)を直接確かめる。
 * 後半は coupon.js を小さな偽の DOM で実際に動かし、紙面・下書きの保存・「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるか・
 *   券の枠から文字がはみ出さないかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const CP = require('../public/coupon-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'coupon.html'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'coupon.css'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'coupon.js'), 'utf8');
const core = fs.readFileSync(path.join(PUBLIC, 'coupon-core.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

function base(extra) {
  const o = { expiry: 'off', expiryDate: '', numbering: 'off', start: '1', sheets: '1', guides: 'on' };
  for (const k of CP.FIELDS) o[k] = '';
  o.shop = 'カフェ こもれび';
  o.offer = '全品10%引き';
  return Object.assign(o, extra || {});
}

console.log('coupon.test.js');

// ── 紙の寸法 ────────────────────────────────────────────
test('91×55mm を 2列×5段=10枚。余白は上下11mm・左右14mmで、A4(210×297)にちょうど収まる', () => {
  const L = CP.LAYOUT;
  assert.strictEqual(CP.PER_SHEET, 10);
  assert.strictEqual(L.marginLeft * 2 + L.cardW * L.cols, 210);
  assert.strictEqual(L.marginTop * 2 + L.cardH * L.rows, 297);
});

test('CSS の寸法が LAYOUT と同じ値。名前付きの余白0ページだけを持ち、紙ごとに改ページする', () => {
  const L = CP.LAYOUT;
  assert.ok(css.includes('padding: ' + L.marginTop + 'mm ' + L.marginLeft + 'mm;'));
  assert.ok(css.includes('grid-template-columns: repeat(' + L.cols + ', ' + L.cardW + 'mm);'));
  assert.ok(css.includes('grid-template-rows: repeat(' + L.rows + ', ' + L.cardH + 'mm);'));
  assert.ok(/@page coupon\s*\{[^}]*size: 210mm 297mm;[^}]*margin: 0;/.test(css));
  assert.ok(/page: coupon;/.test(css));
  assert.ok(/break-after: page;/.test(css));
  assert.ok(!/@page\s*\{/.test(css), '名前の無い @page を持つと、他のページの紙面まで変わる');
});

// ── 中身の判断 ──────────────────────────────────────────
test('見出しが空なら「クーポン券」。入れればその名前', () => {
  assert.strictEqual(CP.build(base()).cards[0].title, 'クーポン券');
  assert.strictEqual(CP.build(base({ title: ' ご優待券 ' })).cards[0].title, 'ご優待券');
});

test('通し番号なしなら同じ券が10枚・紙1枚。番号は持たない', () => {
  const p = CP.build(base());
  assert.strictEqual(p.cards.length, 10);
  assert.strictEqual(p.sheets, 1);
  assert.ok(p.cards.every((c) => c.no === undefined && !c.blank && c.offer === '全品10%引き'));
});

test('有効期限: 書かない / 日付は「年月日まで」/ 手書きの欄。暦にない日付は出さない', () => {
  assert.strictEqual(CP.build(base()).cards[0].expiry, '');
  assert.strictEqual(CP.build(base({ expiry: 'date', expiryDate: '2026-12-31' })).cards[0].expiry, '有効期限 2026年12月31日まで');
  assert.strictEqual(CP.build(base({ expiry: 'date', expiryDate: '2027-02-30' })).cards[0].expiry, '');
  assert.strictEqual(CP.build(base({ expiry: 'date', expiryDate: '' })).cards[0].expiry, '');
  assert.strictEqual(CP.build(base({ expiry: 'hand' })).cards[0].expiry, '有効期限　　年　　月　　日まで');
  assert.strictEqual(CP.build(base({ expiry: 'zzz', expiryDate: '2026-12-31' })).cards[0].expiry, '');
});

test('通し番号: 始めの番号から1ずつ・4桁。紙の枚数×10枚ぶん並ぶ', () => {
  const p = CP.build(base({ numbering: 'on', start: '101', sheets: '3' }));
  assert.strictEqual(p.sheets, 3);
  assert.strictEqual(p.count, 30);
  assert.strictEqual(p.cards[0].no, 'No.0101');
  assert.strictEqual(p.cards[29].no, 'No.0130');
  assert.strictEqual(new Set(p.cards.map((c) => c.no)).size, 30, '番号が重なっている');
});

test('全角の始めの番号も読む。読めない・範囲外は1から、枚数の範囲外は1枚', () => {
  assert.strictEqual(CP.build(base({ numbering: 'on', start: '５' })).cards[0].no, 'No.0005');
  assert.strictEqual(CP.build(base({ numbering: 'on', start: 'abc' })).cards[0].no, 'No.0001');
  assert.strictEqual(CP.build(base({ numbering: 'on', start: '0' })).cards[0].no, 'No.0001');
  assert.strictEqual(CP.build(base({ numbering: 'on', start: '10000' })).cards[0].no, 'No.0001');
  assert.strictEqual(CP.build(base({ numbering: 'on', sheets: '11' })).sheets, 1);
  assert.strictEqual(CP.build(base({ numbering: 'on', sheets: '0' })).sheets, 1);
});

test('9999 を超える番号は作らない。残りの枠は空にし、要らない紙は出さない', () => {
  const p = CP.build(base({ numbering: 'on', start: '9995', sheets: '3' }));
  assert.strictEqual(p.count, 5);
  assert.strictEqual(p.sheets, 1);
  assert.strictEqual(p.cards[4].no, 'No.9999');
  assert.ok(p.cards.slice(5).every((c) => c.blank && c.no === null));
  assert.ok(CP.findProblems(base({ numbering: 'on', start: '9995', sheets: '3' })).some((m) => m.includes('9999')));
});

test('下の2行は入れたものだけ並ぶ。切り取り線は既定でつける', () => {
  assert.deepStrictEqual(CP.build(base({ info2: 'TEL' })).cards[0].info, ['TEL']);
  assert.deepStrictEqual(CP.build(base({ info1: 'A', info2: 'B' })).cards[0].info, ['A', 'B']);
  assert.strictEqual(CP.build(base({ guides: undefined })).guides, 'on');
  assert.strictEqual(CP.build(base({ guides: 'off' })).guides, 'off');
});

test('特典・店名が無い・下の2行目だけ・日付が無い・番号が読めない、を知らせる。足りていれば何も言わない', () => {
  assert.deepStrictEqual(CP.findProblems(base()), []);
  assert.ok(CP.findProblems(base({ offer: '' }))[0].includes('特典'));
  assert.ok(CP.findProblems(base({ shop: '' }))[0].includes('店名'));
  assert.ok(CP.findProblems(base({ info2: 'x' }))[0].includes('2行目'));
  assert.ok(CP.findProblems(base({ expiry: 'date' }))[0].includes('日付'));
  assert.ok(CP.findProblems(base({ numbering: 'on', start: 'x' }))[0].includes('始めの番号'));
  assert.deepStrictEqual(CP.findProblems(base({ numbering: 'off', start: 'x' })), [], '番号をつけないなら始めの番号は見ない');
});

test('文字数の上限を超えたら知らせる(切り詰めはしない)。全部の欄で', () => {
  for (const k of CP.FIELDS) {
    const long = 'あ'.repeat(CP.LIMITS[k] + 1);
    const ok = 'あ'.repeat(CP.LIMITS[k]);
    const extra = k === 'info2' ? { info1: 'x' } : {};
    assert.ok(CP.findProblems(base(Object.assign({ [k]: long }, extra))).some((m) => m.includes(String(CP.LIMITS[k]) + '字')), k);
    assert.ok(!CP.findProblems(base(Object.assign({ [k]: ok }, extra))).some((m) => m.includes('字を超える')), k);
  }
  const c = CP.build(base({ offer: 'あ'.repeat(40) })).cards[0];
  assert.strictEqual(c.offer.length, 40);
});

// ── ページ ──────────────────────────────────────────────
test('「入力内容は送信されません」がページにあり、外へ通信するコードが無い', () => {
  assert.ok(html.includes('入力内容は送信されません'));
  for (const src of [view, core]) assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.share/.test(src));
  assert.ok(!/<script[^>]*src="https?:/.test(html), '外部のスクリプトを読んでいる');
  assert.ok(!/<script>(?!\s*<\/script>)/.test(html), 'インラインのスクリプトがある(CSP で止まる)');
  assert.ok(!/ads\.js/.test(html), '道具の画面に広告を入れない');
});

test('タイトルは前半に「クーポン券」があり32字以内。h1 と同じ。canonical は自分のURL', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  assert.ok(title.startsWith('クーポン券'));
  assert.ok(Array.from(title).length <= 32);
  assert.ok(html.includes('<h1 class="page-title no-print">' + title + '</h1>'));
  assert.ok(html.includes('<link rel="canonical" href="https://invoice-tool-kohl.vercel.app/coupon">'));
});

test('景品表示法などの判断と、券の記録・集計はしないと書いてある', () => {
  assert.ok(html.includes('景品表示法などの決まりに触れるかは判断しません'));
  assert.ok(html.includes('記録・集計もしません'));
});

test('母屋 /kaigyo と /point-card からクーポン券へ、クーポン券から母屋と /point-card へリンクがある(双方向)', () => {
  const hub = fs.readFileSync(path.join(PUBLIC, 'kaigyo.html'), 'utf8');
  const pc = fs.readFileSync(path.join(PUBLIC, 'point-card.html'), 'utf8');
  assert.strictEqual(hub.split('href="/coupon"').length - 1, 1);
  assert.strictEqual(pc.split('href="/coupon"').length - 1, 1);
  assert.ok(html.includes('href="/kaigyo"'));
  assert.ok(html.includes('href="/point-card"'));
});

test('母屋ではポイントカードの次、「登録もお金も要りません」の前に置く。番号つきの工程は増やさない', () => {
  const hub = fs.readFileSync(path.join(PUBLIC, 'kaigyo.html'), 'utf8');
  const i = hub.indexOf('href="/coupon"');
  assert.ok(hub.indexOf('href="/point-card"') < i && i < hub.indexOf('<h2>登録もお金も要りません</h2>'));
  assert.ok(!hub.includes('<h2>7.'));
});

test('サイトマップに1回だけ載っている', () => {
  const map = fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
  assert.strictEqual(map.split('<loc>https://invoice-tool-kohl.vercel.app/coupon</loc>').length - 1, 1);
});

// ── coupon.js を偽の DOM で動かす ──────────────────────
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
  const window = { Coupon: CP, confirm: () => true, print() {} };
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
  const papers = () => els.cpSheet.children;
  const cards = () => findAll(els.cpSheet, 'cp-card');
  const texts = (cls) => findAll(els.cpSheet, cls).map((n) => n.textContent);
  return { els, type, click, papers, cards, findAll, texts };
}

test('画面が読む入力欄の id は、すべてページに在る(名前の食い違いで欄が死なない)', () => {
  const v = runView({});
  const ids = Object.keys(v.els);
  assert.strictEqual(ids.length, CP.FIELDS.length + CP.OPTIONS.length + 6);
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), id + ' がページに無い');
});

test('開いた直後は紙1枚・券10枚・切り取り線つき。番号と日付の欄は隠れ、中身を勝手に入れない', () => {
  const v = runView({});
  assert.strictEqual(v.papers().length, 1);
  assert.strictEqual(v.papers()[0].className, 'cp-paper cp-guides');
  assert.strictEqual(v.cards().length, 10);
  assert.deepStrictEqual(v.texts('cp-title'), Array(10).fill('クーポン券'));
  assert.deepStrictEqual(v.texts('cp-offer'), []);
  assert.deepStrictEqual(v.texts('cp-no'), []);
  assert.strictEqual(v.els.cpNumberRow.hidden, true);
  assert.strictEqual(v.els.cpDateRow.hidden, true);
  assert.strictEqual(v.els.cpProblems.hidden, false);
});

test('入れた中身が10枚すべてに出る。日付を選ぶと日付の欄が出て、期限が紙に載る', () => {
  const v = runView({});
  v.type('cpOffer', 'ZZ無料'); v.type('cpShop', 'ZZ商店'); v.type('cpTerms', 'ZZ1枚まで'); v.type('cpInfo1', 'ZZ県');
  v.type('cpExpiry', 'date');
  assert.strictEqual(v.els.cpDateRow.hidden, false);
  v.type('cpExpiryDate', '2026-12-31');
  assert.deepStrictEqual(v.texts('cp-offer'), Array(10).fill('ZZ無料'));
  assert.deepStrictEqual(v.texts('cp-shop'), Array(10).fill('ZZ商店'));
  assert.strictEqual(v.texts('cp-expiry')[0], '有効期限 2026年12月31日まで');
  assert.strictEqual(v.texts('cp-info')[0], 'ZZ県');
  assert.strictEqual(v.els.cpProblems.hidden, true);
});

test('通し番号をつけると番号の欄が出て、選んだ枚数の紙に続きの番号が並ぶ', () => {
  const v = runView({});
  v.type('cpNumbering', 'on');
  assert.strictEqual(v.els.cpNumberRow.hidden, false);
  v.type('cpStart', '51'); v.type('cpSheets', '2');
  assert.strictEqual(v.papers().length, 2);
  const nos = v.texts('cp-no');
  assert.strictEqual(nos.length, 20);
  assert.strictEqual(nos[0], 'No.0051');
  assert.strictEqual(nos[19], 'No.0070');
});

test('切り取り線を「つけない」にすると、紙面から線の印が外れる', () => {
  const v = runView({});
  v.type('cpGuides', 'off');
  assert.strictEqual(v.papers()[0].className, 'cp-paper');
});

test('入力は coupon-draft-v1 に下書きされ、開き直すと戻る(選択肢も)', () => {
  const storage = {};
  const a = runView(storage);
  a.type('cpOffer', 'ZZ下書き'); a.type('cpNumbering', 'on'); a.type('cpSheets', '4'); a.type('cpExpiry', 'hand');
  assert.ok(storage['coupon-draft-v1'].includes('ZZ下書き'));
  const b = runView(storage);
  assert.strictEqual(b.els.cpOffer.value, 'ZZ下書き');
  assert.strictEqual(b.els.cpNumbering.value, 'on');
  assert.strictEqual(b.els.cpSheets.value, '4');
  assert.strictEqual(b.els.cpExpiry.value, 'hand');
  assert.strictEqual(b.papers().length, 4);
});

test('壊れた下書き・知らない選択肢の値でも落ちずに既定で開く', () => {
  assert.strictEqual(runView({ 'coupon-draft-v1': '{こわれた' }).els.cpExpiry.value, 'off');
  const v = runView({ 'coupon-draft-v1': '{"expiry":"x","numbering":"zzz","guides":"x","sheets":"99"}' });
  assert.strictEqual(v.els.cpExpiry.value, 'off');
  assert.strictEqual(v.els.cpNumbering.value, 'off');
  assert.strictEqual(v.els.cpGuides.value, 'on');
  assert.strictEqual(v.els.cpSheets.value, '1');
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'point-card-draft-v1': '{"x":1}', 'seiriken-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('cpOffer', 'ZZ'); v.type('cpNumbering', 'on');
  v.click('cpClear');
  assert.strictEqual(v.els.cpOffer.value, '');
  assert.strictEqual(v.els.cpNumbering.value, 'off');
  assert.ok(!('coupon-draft-v1' in storage), '消したあとに下書きのキーが残っている');
  assert.strictEqual(storage['point-card-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['seiriken-draft-v1'], '{"y":1}');
  assert.ok(html.includes('>入力をすべて消す<'));
});

console.log('coupon.test.js: ' + passed + ' 件すべて通過');
