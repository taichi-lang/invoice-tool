/*
 * 名刺(/meishi)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/meishi.test.js
 *
 * 前半は meishi-core.js の判断(郵便番号・空けた欄・切り取り線・警告)を直接確かめる。
 * 後半は meishi.js を小さな偽の DOM で実際に動かし、10枚の紙面・下書きの保存・「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるか・
 *   名刺の枠から文字がはみ出さないかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const MC = require('../public/meishi-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'meishi.html'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'meishi.css'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'meishi.js'), 'utf8');
const core = fs.readFileSync(path.join(PUBLIC, 'meishi-core.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

function base(extra) {
  const o = { guides: 'on' };
  for (const k of MC.FIELDS) o[k] = '';
  o.company = '山田デザイン事務所'; o.name = '山田 太郎'; o.email = 'info@example.com';
  return Object.assign(o, extra || {});
}

console.log('meishi.test.js');

// ── 紙の寸法 ────────────────────────────────────────────
test('91×55mm を 2列×5段=10枚。余白は上下11mm・左右14mmで、A4(210×297)にちょうど収まる', () => {
  const L = MC.LAYOUT;
  assert.strictEqual(MC.COUNT, 10);
  assert.strictEqual(L.marginLeft * 2 + L.cardW * L.cols, 210);
  assert.strictEqual(L.marginTop * 2 + L.cardH * L.rows, 297);
});

test('CSS の寸法が LAYOUT と同じ値(片方だけ直して位置がずれない)', () => {
  const L = MC.LAYOUT;
  assert.ok(css.includes('padding: ' + L.marginTop + 'mm ' + L.marginLeft + 'mm;'));
  assert.ok(css.includes('grid-template-columns: repeat(' + L.cols + ', ' + L.cardW + 'mm);'));
  assert.ok(css.includes('grid-template-rows: repeat(' + L.rows + ', ' + L.cardH + 'mm);'));
  assert.ok(/@page meishi\s*\{[^}]*size: 210mm 297mm;[^}]*margin: 0;/.test(css), '余白0の A4 の名前付きページが無い');
  assert.ok(/page: meishi;/.test(css));
  assert.ok(!/@page\s*\{/.test(css), '名前の無い @page を持つと、他のページの紙面まで変わる');
});

// ── 郵便番号 ────────────────────────────────────────────
test('郵便番号は頭に「〒」を付け、全角の数字とハイフンを半角にする。空は空のまま', () => {
  assert.strictEqual(MC.formatZip('123-4567'), '〒123-4567');
  assert.strictEqual(MC.formatZip('１２３－４５６７'), '〒123-4567');
  assert.strictEqual(MC.formatZip('〒123-4567'), '〒123-4567');
  assert.strictEqual(MC.formatZip('〒 1234567'), '〒1234567');
  assert.strictEqual(MC.formatZip('  '), '');
  assert.strictEqual(MC.formatZip(undefined), '');
});

// ── 空けた欄 ────────────────────────────────────────────
test('空けた欄は出さない。連絡先は入れたものだけが見出しつきで並ぶ', () => {
  const c = MC.buildCard(base());
  assert.deepStrictEqual(c.address, []);
  assert.deepStrictEqual(c.contact, [{ label: 'Mail', text: 'info@example.com' }]);
  const d = MC.buildCard(base({ tel: '03-1234-5678', web: 'example.com' }));
  assert.deepStrictEqual(d.contact.map((r) => r.label), ['TEL', 'Mail', 'URL']);
});

test('住所: 郵便番号と1行目は同じ行、2行目は次の行。郵便番号だけでも出る', () => {
  assert.deepStrictEqual(MC.buildCard(base({ zip: '1234567', addr1: '東京都', addr2: 'ビル5階' })).address,
    ['〒1234567 東京都', 'ビル5階']);
  assert.deepStrictEqual(MC.buildCard(base({ zip: '1234567' })).address, ['〒1234567']);
  assert.deepStrictEqual(MC.buildCard(base({ addr1: '東京都' })).address, ['東京都']);
});

test('切り取り線は on / off の2つ。知らない値は on(はさみで切れる側)', () => {
  assert.strictEqual(MC.buildCard(base({ guides: 'off' })).guides, 'off');
  assert.strictEqual(MC.buildCard(base({ guides: 'zzz' })).guides, 'on');
  assert.strictEqual(MC.buildCard({}).guides, 'on');
});

// ── 警告 ────────────────────────────────────────────────
test('氏名が無い・連絡先が1つも無い・住所の2行目だけ、を知らせる', () => {
  const p = MC.findProblems(base({ name: '', email: '', addr2: 'ビル5階' }));
  assert.ok(p.includes('氏名が入っていません。'));
  assert.ok(p.some((m) => m.startsWith('電話番号・メールアドレス・URL のどれも')));
  assert.ok(p.some((m) => m.startsWith('住所の2行目だけ')));
  assert.deepStrictEqual(MC.findProblems(base()), []);
});

test('文字数の上限を超えたら知らせる(切り詰めはしない)。全部の欄で', () => {
  const extra = {};
  for (const k of MC.FIELDS) extra[k] = 'あ'.repeat(MC.LIMITS[k] + 1);
  const input = base(extra);
  const p = MC.findProblems(input);
  for (const head of ['屋号・会社名が', '仕事の内容が', '肩書が', '氏名が', 'ふりがな・ローマ字が', '郵便番号が',
    '住所1行目が', '住所2行目が', '電話番号が', 'メールアドレスが', 'URLが']) {
    assert.ok(p.some((m) => m.startsWith(head)), head + ' の警告が無い\n' + p.join('\n'));
  }
  assert.strictEqual(MC.buildCard(input).name, 'あ'.repeat(MC.LIMITS.name + 1));
  const atLimit = {};
  for (const k of MC.FIELDS) atLimit[k] = 'あ'.repeat(MC.LIMITS[k]);
  assert.deepStrictEqual(MC.findProblems(base(atLimit)), []);
});

// ── ページ ──────────────────────────────────────────────
test('「入力内容は送信されません」がページにあり、外へ通信するコードが無い', () => {
  assert.ok(html.includes('入力内容は送信されません'));
  for (const src of [view, core]) assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.share/.test(src));
  assert.ok(!/<script[^>]*src="https?:/.test(html), '外部のスクリプトを読んでいる');
  assert.ok(!/<script>(?!\s*<\/script>)/.test(html), 'インラインのスクリプトがある(CSP で止まる)');
});

test('タイトルは前半に「名刺」があり32字以内。h1 と同じ。canonical は自分のURL', () => {
  const title = /<title>([^<]*)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]*)<\/h1>/.exec(html)[1];
  assert.ok(title.startsWith('名刺'));
  assert.ok(Array.from(title).length <= 32, title);
  assert.strictEqual(h1, title);
  assert.ok(html.includes('<link rel="canonical" href="https://invoice-tool-kohl.vercel.app/meishi">'));
});

test('用紙やプリンタに合うかを確かめていないこと・試し刷りを、ページに書いている', () => {
  assert.ok(html.includes('お使いの用紙やプリンタに合うかを確かめていません'));
  assert.ok(html.includes('試し刷り'));
});

test('母屋 /kaigyo と /aisatsujo から名刺へ、名刺から母屋と /aisatsujo へリンクがある(双方向)', () => {
  const hub = fs.readFileSync(path.join(PUBLIC, 'kaigyo.html'), 'utf8');
  const as = fs.readFileSync(path.join(PUBLIC, 'aisatsujo.html'), 'utf8');
  assert.ok(hub.includes('href="/meishi"'));
  assert.ok(as.includes('href="/meishi"'));
  assert.ok(html.includes('href="/kaigyo"'));
  assert.ok(html.includes('href="/aisatsujo"'));
});

test('母屋では工程1(屋号と印鑑)の中、挨拶状の次に置く。6工程の見出しは増やさない', () => {
  const hub = fs.readFileSync(path.join(PUBLIC, 'kaigyo.html'), 'utf8');
  const i = hub.indexOf('href="/meishi"');
  assert.ok(hub.indexOf('href="/aisatsujo"') < i && i < hub.indexOf('<h2>2. '));
  assert.ok(!hub.includes('<h2>7.'));
});

test('サイトマップに1回だけ載っている', () => {
  const map = fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
  assert.strictEqual(map.split('<loc>https://invoice-tool-kohl.vercel.app/meishi</loc>').length - 1, 1);
});

// ── meishi.js を偽の DOM で動かす ──────────────────────
function fakeEl(tag) {
  return {
    tagName: String(tag || 'div').toUpperCase(), value: '', className: '',
    hidden: false, disabled: false, children: [], parentNode: null, listeners: {},
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
  const window = { Meishi: MC, confirm: () => true, print() {} };
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
  const paper = () => els.mcSheet.children[0];
  const cards = () => findAll(paper(), 'mc-card');
  const texts = (cls) => findAll(cards()[0], cls).map((n) => n.textContent);
  const text = (cls) => { const t = texts(cls); return t.length ? t[0] : null; };
  return { els, type, click, paper, cards, findAll, text, texts };
}

test('画面が読む入力欄の id は、すべてページに在る(名前の食い違いで欄が死なない)', () => {
  const v = runView({});
  const ids = Object.keys(v.els);
  assert.strictEqual(ids.length, MC.FIELDS.length + 1 + 4);
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), id + ' がページに無い');
});

test('開いた直後は空の名刺が10枚・切り取り線つき。中身を勝手に入れない', () => {
  const v = runView({});
  assert.strictEqual(v.cards().length, 10);
  assert.strictEqual(v.paper().className, 'mc-paper mc-guides');
  assert.strictEqual(v.els.mcGuides.value, 'on');
  assert.strictEqual(v.text('mc-name'), '');
  assert.strictEqual(v.text('mc-company'), null);
  assert.deepStrictEqual(v.texts('mc-contact'), []);
  assert.strictEqual(v.els.mcProblems.hidden, false);
});

test('入れた中身が10枚すべてに同じく出る。空けた欄は見出しごと出ない', () => {
  const v = runView({});
  v.type('mcCompany', 'ZZ事務所'); v.type('mcName', 'ZZ太郎'); v.type('mcRole', '代表');
  v.type('mcZip', '１２３－４５６７'); v.type('mcAddr1', 'ZZ県'); v.type('mcTel', '03-0000-0000');
  assert.strictEqual(v.text('mc-company'), 'ZZ事務所');
  assert.strictEqual(v.text('mc-role'), '代表');
  assert.deepStrictEqual(v.texts('mc-addr'), ['〒123-4567 ZZ県']);
  assert.deepStrictEqual(v.texts('mc-label'), ['TEL']);
  assert.strictEqual(v.text('mc-kana'), null);
  const names = v.findAll(v.paper(), 'mc-name').map((n) => n.textContent);
  assert.deepStrictEqual(names, Array(10).fill('ZZ太郎'));
  assert.strictEqual(v.els.mcProblems.hidden, true);
});

test('切り取り線を「つけない」にすると、紙面から線の印が外れる', () => {
  const v = runView({});
  v.type('mcGuides', 'off');
  assert.strictEqual(v.paper().className, 'mc-paper');
});

test('入力は meishi-draft-v1 に下書きされ、開き直すと戻る(切り取り線も)', () => {
  const storage = {};
  const a = runView(storage);
  a.type('mcName', 'ZZ下書き'); a.type('mcWeb', 'zz.example'); a.type('mcGuides', 'off');
  assert.ok(storage['meishi-draft-v1'].includes('ZZ下書き'));
  const b = runView(storage);
  assert.strictEqual(b.els.mcName.value, 'ZZ下書き');
  assert.strictEqual(b.els.mcWeb.value, 'zz.example');
  assert.strictEqual(b.els.mcGuides.value, 'off');
});

test('壊れた下書き・知らない切り取り線の値でも落ちずに開く', () => {
  assert.strictEqual(runView({ 'meishi-draft-v1': '{こわれた' }).els.mcGuides.value, 'on');
  assert.strictEqual(runView({ 'meishi-draft-v1': '{"guides":"zzz"}' }).els.mcGuides.value, 'on');
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'ryokinhyo-draft-v1': '{"x":1}', 'aisatsujo-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('mcName', 'ZZ'); v.type('mcGuides', 'off');
  v.click('mcClear');
  assert.strictEqual(v.els.mcName.value, '');
  assert.strictEqual(v.els.mcGuides.value, 'on');
  assert.ok(!('meishi-draft-v1' in storage), '消したあとに下書きのキーが残っている');
  assert.strictEqual(storage['ryokinhyo-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['aisatsujo-draft-v1'], '{"y":1}');
  assert.ok(html.includes('>入力をすべて消す<'));
});

console.log('meishi.test.js: ' + passed + ' 件すべて通過');
