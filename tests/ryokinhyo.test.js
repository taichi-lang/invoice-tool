/*
 * 料金表(/ryokinhyo)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/ryokinhyo.test.js
 *
 * 前半は ryokinhyo-core.js の判断(金額の読み取り・空行・税の書き添え・警告)を直接確かめる。
 * 後半は ryokinhyo.js を小さな偽の DOM で実際に動かし、紙面・下書きの保存・「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const RK = require('../public/ryokinhyo-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'ryokinhyo.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'ryokinhyo.js'), 'utf8');
const core = fs.readFileSync(path.join(PUBLIC, 'ryokinhyo-core.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

function base(extra) {
  const o = { titlePreset: '料金表', titleCustom: '', taxNote: 'incl', message: '', shop: '山田ヘアサロン', contact: '' };
  for (let n = 1; n <= RK.ROWS; n++) { o['name' + n] = ''; o['note' + n] = ''; o['price' + n] = ''; }
  o.name1 = 'カット'; o.note1 = '60分'; o.price1 = '4400';
  o.name2 = 'カラー'; o.price2 = '6600';
  return Object.assign(o, extra || {});
}

console.log('ryokinhyo.test.js');

// ── 金額 ────────────────────────────────────────────────
test('金額は「3000」「3,000」「３０００円」「¥3,000」「￥３，０００」を読み、「3,000円」の形で出す', () => {
  for (const v of ['3000', '3,000', '３０００円', '¥3,000', '￥３，０００', ' 3000 ', '3000円']) {
    assert.strictEqual(RK.parsePrice(v), 3000, v);
    assert.strictEqual(RK.formatPrice(RK.parsePrice(v)), '3,000円', v);
  }
  assert.strictEqual(RK.formatPrice(0), '0円');
  assert.strictEqual(RK.formatPrice(1234567), '1,234,567円');
  assert.strictEqual(RK.formatPrice(999), '999円');
});

test('小数・マイナス・「〜」・漢数字・カンマの位置違いは読まない(null)。空は空のまま(0にしない)', () => {
  for (const v of ['1.5', '-100', '4400〜', '3千', 'abc', '30,00', '1,0000', '¥', '円']) {
    assert.strictEqual(RK.parsePrice(v), null, v);
  }
  assert.strictEqual(RK.parsePrice(''), '');
  assert.strictEqual(RK.parsePrice('   '), '');
  assert.strictEqual(RK.formatPrice(''), '');
  assert.strictEqual(RK.formatPrice(null), '');
});

test('桁が大きすぎて整数として正確に持てない金額は読まない', () => {
  assert.strictEqual(RK.parsePrice('99999999999999999999'), null);
});

// ── 紙面の組み立て ──────────────────────────────────────
test('品名か金額を入れた行だけが、入れた順で紙に出る。空の行は詰める', () => {
  const b = RK.buildSheet(base({ name2: '', price2: '', name5: 'パーマ', note5: '90分', price5: '8800' }));
  assert.deepStrictEqual(b.rows.map((r) => [r.n, r.name, r.note, r.priceText]),
    [[1, 'カット', '60分', '4,400円'], [5, 'パーマ', '90分', '8,800円']]);
});

test('読めない金額の行は、金額を空けて出す(勝手に丸めたり0にしたりしない)', () => {
  const b = RK.buildSheet(base({ price1: '4400〜' }));
  assert.strictEqual(b.rows[0].name, 'カット');
  assert.strictEqual(b.rows[0].priceText, '');
});

test('税の書き添えは既定で「表示はすべて税込価格です」。「何も書かない」なら空。知らない値は既定に戻す', () => {
  assert.strictEqual(RK.buildSheet(base()).taxNote, '表示はすべて税込価格です');
  assert.strictEqual(RK.buildSheet(base({ taxNote: 'none' })).taxNote, '');
  assert.strictEqual(RK.buildSheet(base({ taxNote: 'zzz' })).taxNote, '表示はすべて税込価格です');
  assert.strictEqual(RK.buildSheet(base({ taxNote: 'hasOwnProperty' })).taxNote, '表示はすべて税込価格です');
});

test('税込の書き添えを出しても、金額は入れたとおり(税を足したり引いたりしない)', () => {
  assert.strictEqual(RK.buildSheet(base({ taxNote: 'incl' })).rows[0].priceText, '4,400円');
  assert.strictEqual(RK.buildSheet(base({ taxNote: 'none' })).rows[0].priceText, '4,400円');
  assert.ok(!/税率|0\.1|1\.1|\* ?10|\/ ?110/.test(core.replace(/\/\*[\s\S]*?\*\//g, '')), 'core に税の計算らしい式がある');
});

test('見出しは決まった4つから。「自分で書く」なら書いた見出し、知らない値は「料金表」', () => {
  assert.strictEqual(RK.buildSheet(base({ titlePreset: 'メニュー' })).title, 'メニュー');
  assert.strictEqual(RK.buildSheet(base({ titlePreset: 'custom', titleCustom: ' 施術メニュー ' })).title, '施術メニュー');
  assert.strictEqual(RK.buildSheet(base({ titlePreset: 'zzz' })).title, '料金表');
});

// ── 警告 ────────────────────────────────────────────────
test('ふつうの入力では警告が出ない', () => {
  assert.deepStrictEqual(RK.findProblems(base()), []);
});

test('品名だけ・金額だけ・読めない金額・補足だけの行を、行番号つきで知らせる', () => {
  const p = RK.findProblems(base({ price1: '', name2: '', note4: '60分', price3: '1.5' }));
  assert.ok(p.some((m) => m.startsWith('1行目の金額が入っていません')), p.join('\n'));
  assert.ok(p.some((m) => m.startsWith('2行目の品名が入っていません')), p.join('\n'));
  assert.ok(p.some((m) => m.startsWith('3行目の金額「1.5」は読めませんでした')), p.join('\n'));
  assert.ok(p.some((m) => m.startsWith('4行目は補足だけが入っています')), p.join('\n'));
});

test('品目が1つも無い・店の名前が無い・見出しが空のときに知らせる', () => {
  const empty = base({ name1: '', note1: '', price1: '', name2: '', price2: '', shop: '', titlePreset: 'custom' });
  const p = RK.findProblems(empty);
  assert.ok(p.includes('品名と金額が1つも入っていません。'));
  assert.ok(p.includes('店や事務所の名前が入っていません。'));
  assert.ok(p.some((m) => m.startsWith('見出しが入っていません')));
});

test('文字数・桁数の上限を超えたら知らせる(切り詰めはしない)', () => {
  const long = (n) => 'あ'.repeat(n);
  const input = base({
    titlePreset: 'custom', titleCustom: long(RK.LIMITS.title + 1),
    name1: long(RK.LIMITS.name + 1), note1: long(RK.LIMITS.note + 1), price1: '1' + '0'.repeat(RK.LIMITS.price),
    message: long(RK.LIMITS.message + 1), shop: long(RK.LIMITS.shop + 1), contact: long(RK.LIMITS.contact + 1)
  });
  const p = RK.findProblems(input);
  for (const head of ['見出しが', '1行目の品名が', '1行目の補足が', '1行目の金額が', 'ひとことが', '店や事務所の名前が', '連絡先が']) {
    assert.ok(p.some((m) => m.startsWith(head)), head + ' の警告が無い\n' + p.join('\n'));
  }
  assert.strictEqual(RK.buildSheet(input).rows[0].name, long(RK.LIMITS.name + 1));
});

// ── ページ ──────────────────────────────────────────────
test('「入力内容は送信されません」がページにあり、外へ通信するコードが無い', () => {
  assert.ok(html.includes('入力内容は送信されません'));
  for (const src of [view, core]) assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.share/.test(src));
  assert.ok(!/<script[^>]*src="https?:/.test(html), '外部のスクリプトを読んでいる');
  assert.ok(!/<script>(?!\s*<\/script>)/.test(html), 'インラインのスクリプトがある(CSP で止まる)');
});

test('タイトルは前半に「料金表」があり32字以内。canonical は自分のURL', () => {
  const title = /<title>([^<]*)<\/title>/.exec(html)[1];
  assert.ok(title.startsWith('料金表'));
  assert.ok(Array.from(title).length <= 32, title);
  assert.ok(html.includes('<link rel="canonical" href="https://invoice-tool-kohl.vercel.app/ryokinhyo">'));
});

test('母屋 /kaigyo と /eigyo-jikan から料金表へ、料金表から母屋と /eigyo-jikan へリンクがある(双方向)', () => {
  const hub = fs.readFileSync(path.join(PUBLIC, 'kaigyo.html'), 'utf8');
  const ej = fs.readFileSync(path.join(PUBLIC, 'eigyo-jikan.html'), 'utf8');
  assert.ok(hub.includes('href="/ryokinhyo"'));
  assert.ok(ej.includes('href="/ryokinhyo"'));
  assert.ok(html.includes('href="/kaigyo"'));
  assert.ok(html.includes('href="/eigyo-jikan"'));
});

test('サイトマップに1回だけ載っている', () => {
  const map = fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
  assert.strictEqual(map.split('<loc>https://invoice-tool-kohl.vercel.app/ryokinhyo</loc>').length - 1, 1);
});

// ── ryokinhyo.js を偽の DOM で動かす ───────────────────
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
  const window = { Ryokinhyo: RK, confirm: () => true, print() {} };
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
  const paper = () => els.rkSheet.children[0];
  const texts = (cls) => findAll(paper(), cls).map((n) => n.textContent);
  const text = (cls) => { const t = texts(cls); return t.length ? t[0] : null; };
  return { els, type, click, paper, text, texts };
}

test('画面が読む入力欄の id は、すべてページに在る(名前の食い違いで欄が死なない)', () => {
  const v = runView({});
  const ids = Object.keys(v.els);
  assert.strictEqual(ids.length, 3 + RK.ROWS * 3 + 3 + 4);
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), id + ' がページに無い');
});

test('開いた直後は見出し「料金表」・税込の書き添えあり。品目は空で、勝手に入れない', () => {
  const v = runView({});
  assert.strictEqual(v.els.rkTitlePreset.value, '料金表');
  assert.strictEqual(v.els.rkTaxNote.value, 'incl');
  assert.strictEqual(v.els.rkName1.value, '');
  assert.strictEqual(v.text('rk-title'), '料金表');
  assert.deepStrictEqual(v.texts('rk-row'), []);
  assert.strictEqual(v.text('rk-tax'), '表示はすべて税込価格です');
  assert.strictEqual(v.els.rkProblems.hidden, false);
});

test('品名・補足・金額を入れた行が紙に出て、金額は「4,400円」の形になる', () => {
  const v = runView({});
  v.type('rkName1', 'カット'); v.type('rkNote1', '60分'); v.type('rkPrice1', '４４００');
  v.type('rkName2', 'カラー'); v.type('rkPrice2', '6,600');
  v.type('rkShop', 'ZZ美容室');
  assert.deepStrictEqual(v.texts('rk-name'), ['カット', 'カラー']);
  assert.deepStrictEqual(v.texts('rk-note'), ['60分']);
  assert.deepStrictEqual(v.texts('rk-price'), ['4,400円', '6,600円']);
  assert.strictEqual(v.text('rk-shop'), 'ZZ美容室');
  assert.strictEqual(v.els.rkProblems.hidden, true);
});

test('「何も書かない」にすると税の行が消える。ひとこと・連絡先は入れたときだけ出る', () => {
  const v = runView({});
  v.type('rkTaxNote', 'none');
  assert.strictEqual(v.text('rk-tax'), null);
  assert.strictEqual(v.text('rk-message'), null);
  assert.strictEqual(v.text('rk-contact'), null);
  v.type('rkMessage', 'ZZひとこと'); v.type('rkContact', 'ZZ連絡先');
  assert.strictEqual(v.text('rk-message'), 'ZZひとこと');
  assert.strictEqual(v.text('rk-contact'), 'ZZ連絡先');
});

test('見出しを自分で書く欄は、「自分で書く」を選んだときだけ使える', () => {
  const v = runView({});
  assert.strictEqual(v.els.rkTitleCustom.disabled, true);
  v.type('rkTitlePreset', 'custom'); v.type('rkTitleCustom', 'ZZ見出し');
  assert.strictEqual(v.els.rkTitleCustom.disabled, false);
  assert.strictEqual(v.text('rk-title'), 'ZZ見出し');
});

test('入力は ryokinhyo-draft-v1 に下書きされ、開き直すと戻る(見出し・税・12行目も)', () => {
  const storage = {};
  const a = runView(storage);
  a.type('rkTitlePreset', 'メニュー'); a.type('rkTaxNote', 'none'); a.type('rkName12', 'ZZ12行目'); a.type('rkShop', 'ZZ下書きの店');
  assert.ok(storage['ryokinhyo-draft-v1'].includes('ZZ下書きの店'));
  const b = runView(storage);
  assert.strictEqual(b.els.rkTitlePreset.value, 'メニュー');
  assert.strictEqual(b.els.rkTaxNote.value, 'none');
  assert.strictEqual(b.els.rkName12.value, 'ZZ12行目');
  assert.strictEqual(b.els.rkShop.value, 'ZZ下書きの店');
});

test('壊れた下書き・知らない見出しや税の値でも落ちずに開く', () => {
  assert.strictEqual(runView({ 'ryokinhyo-draft-v1': '{こわれた' }).els.rkTitlePreset.value, RK.TITLES[0]);
  const v = runView({ 'ryokinhyo-draft-v1': '{"titlePreset":"zzz","taxNote":"zzz"}' });
  assert.strictEqual(v.els.rkTitlePreset.value, RK.TITLES[0]);
  assert.strictEqual(v.els.rkTaxNote.value, 'incl');
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'eigyo-jikan-draft-v1': '{"x":1}', 'kyugyo-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('rkShop', 'ZZ'); v.type('rkName1', 'ZZ品名'); v.type('rkTaxNote', 'none');
  v.click('rkClear');
  assert.strictEqual(v.els.rkShop.value, '');
  assert.strictEqual(v.els.rkName1.value, '');
  assert.strictEqual(v.els.rkTaxNote.value, 'incl');
  assert.ok(!('ryokinhyo-draft-v1' in storage), '消したあとに下書きのキーが残っている');
  assert.strictEqual(storage['eigyo-jikan-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['kyugyo-draft-v1'], '{"y":1}');
});

console.log('ryokinhyo.test.js: ' + passed + ' 件すべて通過');
