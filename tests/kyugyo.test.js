/*
 * 休業のお知らせ(/kyugyo)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/kyugyo.test.js
 *
 * 前半は kyugyo-core.js の判断(曜日・日数・1日だけの休業・日付の前後・警告)を直接確かめる。
 * 後半は kyugyo.js を小さな偽の DOM で実際に動かし、紙面・下書きの保存・「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const KY = require('../public/kyugyo-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'kyugyo.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'kyugyo.js'), 'utf8');
const core = fs.readFileSync(path.join(PUBLIC, 'kyugyo-core.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const base = (extra) => Object.assign({
  titlePreset: '年末年始休業のお知らせ', titleCustom: '', startDate: '2026-12-29', endDate: '2027-01-03',
  reopenDate: '2027-01-04', message: '', shop: '山田デザイン事務所', contact: ''
}, extra || {});

console.log('kyugyo.test.js');

// ── 組み立て ────────────────────────────────────────────
test('曜日は暦のとおりに出る(2026-12-29 は火、2027-01-03 は日、2027-01-04 は月)', () => {
  const b = KY.buildSheet(base());
  assert.strictEqual(b.startText, '2026年12月29日(火)');
  assert.strictEqual(b.endText, '2027年1月3日(日)');
  assert.strictEqual(b.reopenText, '2027年1月4日(月)');
});

test('曜日の読み取りを、曜日が分かっている日で確かめる(2026-11-17 は火、2024-02-29 は木)', () => {
  assert.strictEqual(KY.formatDateWd('2026-11-17'), '2026年11月17日(火)');
  assert.strictEqual(KY.formatDateWd('2024-02-29'), '2024年2月29日(木)');
  assert.strictEqual(KY.formatDateWd('2000-01-01'), '2000年1月1日(土)');
});

test('日数は最初の日と最後の日を両方数える。年をまたいでも数えられる', () => {
  assert.strictEqual(KY.buildSheet(base()).days, 6);
  assert.strictEqual(KY.buildSheet(base({ startDate: '2026-08-13', endDate: '2026-08-16' })).days, 4);
  assert.strictEqual(KY.buildSheet(base({ startDate: '2028-02-28', endDate: '2028-03-01' })).days, 3);
});

test('最後の日が空、または最初の日と同じなら「1日だけの休業」。最後の日は紙に出さない', () => {
  for (const endDate of ['', '2026-11-20']) {
    const b = KY.buildSheet(base({ startDate: '2026-11-20', endDate, reopenDate: '' }));
    assert.strictEqual(b.single, true);
    assert.strictEqual(b.days, 1);
    assert.strictEqual(b.endText, '');
    assert.strictEqual(b.startText, '2026年11月20日(金)');
  }
});

test('空・暦に無い日付は空欄のまま(今日にしない)。最初の日が無ければ日数も出さない', () => {
  const b = KY.buildSheet(base({ startDate: '2026-02-30', endDate: '' }));
  assert.strictEqual(b.startText, '');
  assert.strictEqual(b.days, null);
  assert.strictEqual(b.single, false);
  assert.strictEqual(KY.formatDateWd(''), '');
  assert.strictEqual(KY.formatDateWd('2026/12/29'), '');
});

test('見出しは決まった4つから選ぶ。知らない値は先頭に戻す。「自分で書く」は書いたとおり', () => {
  assert.deepStrictEqual(KY.TITLES, ['年末年始休業のお知らせ', '夏季休業のお知らせ', '臨時休業のお知らせ', '休業のお知らせ']);
  assert.strictEqual(KY.buildSheet(base({ titlePreset: '夏季休業のお知らせ' })).title, '夏季休業のお知らせ');
  assert.strictEqual(KY.buildSheet(base({ titlePreset: 'zzz' })).title, KY.TITLES[0]);
  assert.strictEqual(KY.buildSheet(base({ titlePreset: 'custom', titleCustom: ' 棚卸しによる休業のお知らせ ' })).title, '棚卸しによる休業のお知らせ');
  // 決まった見出しを選んでいるあいだは、自分で書いた欄を使わない
  assert.strictEqual(KY.buildSheet(base({ titleCustom: 'ZZ' })).title, '年末年始休業のお知らせ');
});

test('金額・祝日の判定を持たない(コードに無い)', () => {
  const code = core.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/amount|price|tax|holiday|祝日/i.test(code));
});

// ── 警告 ────────────────────────────────────────────────
test('そろった入力には警告を出さない', () => {
  assert.deepStrictEqual(KY.findProblems(base()), []);
  assert.deepStrictEqual(KY.findProblems(base({ endDate: '', reopenDate: '' })), []);
});

test('最初の日・店の名前が無いと知らせる。「自分で書く」で見出しが空でも知らせる', () => {
  const p = KY.findProblems(base({ startDate: '', shop: '', titlePreset: 'custom' }));
  assert.ok(p.includes('休みの最初の日が入っていません。'));
  assert.ok(p.includes('店や事務所の名前が入っていません。'));
  assert.ok(p.some((m) => m.startsWith('見出しが入っていません。')));
});

test('最後の日が最初の日より前なら知らせ、日数は出さない', () => {
  const input = base({ startDate: '2027-01-03', endDate: '2026-12-29', reopenDate: '' });
  assert.ok(KY.findProblems(input).includes('休みの最後の日が、最初の日より前になっています。'));
  assert.strictEqual(KY.buildSheet(input).days, null);
});

test('営業を始める日が、休みの中・最後の日と同じ・それより前なら知らせる。翌日なら知らせない', () => {
  const msg = '営業を始める日が、休みの期間の中か、それより前になっています。';
  assert.ok(KY.findProblems(base({ reopenDate: '2027-01-01' })).includes(msg));
  assert.ok(KY.findProblems(base({ reopenDate: '2027-01-03' })).includes(msg));
  assert.ok(KY.findProblems(base({ reopenDate: '2026-12-01' })).includes(msg));
  assert.ok(!KY.findProblems(base({ reopenDate: '2027-01-04' })).includes(msg));
  // 1日だけの休業でも同じ
  assert.ok(KY.findProblems(base({ startDate: '2026-11-20', endDate: '', reopenDate: '2026-11-20' })).includes(msg));
  assert.ok(!KY.findProblems(base({ startDate: '2026-11-20', endDate: '', reopenDate: '2026-11-21' })).includes(msg));
});

test('長すぎる欄は字数を添えて知らせる(切り詰めない)', () => {
  const long = (n) => 'あ'.repeat(n);
  const input = base({
    titlePreset: 'custom', titleCustom: long(KY.LIMITS.title + 1), message: long(KY.LIMITS.message + 1),
    shop: long(KY.LIMITS.shop + 1), contact: long(KY.LIMITS.contact + 1)
  });
  const p = KY.findProblems(input);
  assert.ok(p.some((m) => m.startsWith('見出しが' + (KY.LIMITS.title + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('ひとことが' + (KY.LIMITS.message + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('店や事務所の名前が' + (KY.LIMITS.shop + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('連絡先が' + (KY.LIMITS.contact + 1) + '字')));
  assert.strictEqual([...KY.buildSheet(input).shop].length, KY.LIMITS.shop + 1);
  const ok = base({ titlePreset: 'custom', titleCustom: long(KY.LIMITS.title), message: long(KY.LIMITS.message), shop: long(KY.LIMITS.shop), contact: long(KY.LIMITS.contact) });
  assert.deepStrictEqual(KY.findProblems(ok), []);
});

// ── ページ ──────────────────────────────────────────────
test('「送信しない」の表示が、ヘッダーと本文の両方に在る', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.includes('入力内容は送信されません'));
  assert.ok(html.includes('サーバーへ送信・保存されることはありません'));
});

test('<title> と <h1> が同じで、title は32文字以内、前半に「休業のお知らせ」', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)[1];
  assert.strictEqual(title, h1);
  assert.ok([...title].length <= 32, 'title が ' + [...title].length + ' 文字');
  assert.ok(title.startsWith('休業のお知らせ'));
});

test('説明文が約束した「年末年始・夏季・臨時休業・曜日・日数・張り紙」が本文に在る', () => {
  const body = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
  for (const w of ['年末年始', '夏季', '臨時休業', '曜日', '日数', '張り紙']) assert.ok(body.includes(w), w);
});

test('書き方の例は、そのまま入れても警告が出ず、紙に出る日付と日数が本文と同じ', () => {
  const input = base({ message: '休業中にいただいたメールは、1月4日から順にお返事します。' });
  assert.deepStrictEqual(KY.findProblems(input), []);
  const b = KY.buildSheet(input);
  for (const w of [b.startText, b.endText, b.reopenText, b.message, b.days + '日間']) assert.ok(html.includes(w), w);
});

test('選べる見出しは、core の決まった4つ+「自分で書く」と同じ並び', () => {
  const sel = html.slice(html.indexOf('<select id="kyTitlePreset">'), html.indexOf('</select>'));
  const values = [...sel.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]);
  assert.deepStrictEqual(values, KY.TITLES.concat([KY.CUSTOM]));
});

test('判断しないことを、入力欄のそばと本文の両方に書いている', () => {
  assert.ok(html.includes('祝日かどうかは、このツールでは判断しません'));
  assert.ok(html.includes('その日が祝日かどうかは見ません'));
  assert.ok(html.includes('従業員の休みや給与の扱い'));
  assert.ok(html.includes('個別の判断は専門家にご確認ください'));
});

test('core → 画面 の順に読む。ほかのページの core は読まない', () => {
  const a = html.indexOf('<script src="/kyugyo-core.js"></script>');
  const b = html.indexOf('<script src="/kyugyo.js"></script>');
  assert.ok(a >= 0 && a < b);
  assert.strictEqual((html.match(/<script /g) || []).length, 2);
});

test('開業挨拶状・母屋と相互にリンクしている', () => {
  for (const f of ['aisatsujo.html', 'kaigyo.html']) {
    assert.ok(fs.readFileSync(path.join(PUBLIC, f), 'utf8').includes('href="/kyugyo"'), f + ' から /kyugyo へのリンクが無い');
  }
  assert.ok(html.includes('href="/aisatsujo"') && html.includes('href="/kaigyo"'));
});

test('母屋は「6工程」の数を変えていない(休業のお知らせは番号なしの見出しに置く)', () => {
  const hub = fs.readFileSync(path.join(PUBLIC, 'kaigyo.html'), 'utf8');
  assert.ok(!/<h2>7\./.test(hub));
  assert.ok(hub.includes('<h2>店や事務所を休む日を知らせるとき</h2>'));
});

// ── kyugyo.js を偽の DOM で動かす ───────────────────
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
  const window = { Kyugyo: KY, confirm: () => true, print() {} };
  new Function('window', 'document', 'localStorage', view)(window, document, localStorage);
  const fire = (node, type) => (node.listeners[type] || []).forEach((f) => f());
  const type = (id, v) => { els[id].value = v; fire(els[id], 'input'); };
  const click = (id) => fire(els[id], 'click');
  const find = (node, cls) => {
    if (node.className === cls) return node;
    for (const c of node.children) { const hit = find(c, cls); if (hit) return hit; }
    return null;
  };
  const paper = () => els.kySheet.children[0];
  const text = (cls) => { const n = find(paper(), cls); return n ? n.textContent : null; };
  return { els, type, click, find, paper, text };
}

test('開いた直後は見出しが「年末年始休業のお知らせ」。日付は空で、今日を勝手に入れない', () => {
  const v = runView({});
  assert.strictEqual(v.els.kyTitlePreset.value, '年末年始休業のお知らせ');
  assert.strictEqual(v.els.kyStartDate.value, '');
  assert.strictEqual(v.els.kyEndDate.value, '');
  assert.strictEqual(v.text('ky-title'), '年末年始休業のお知らせ');
  assert.strictEqual(v.text('ky-days'), null);
  assert.strictEqual(v.els.kyProblems.hidden, false);
});

test('期間を入れると「から」「まで」と日数が紙に出て、営業を始める日は入れたときだけ出る', () => {
  const v = runView({});
  v.type('kyStartDate', '2026-12-29'); v.type('kyEndDate', '2027-01-03'); v.type('kyShop', 'ZZ商店');
  assert.strictEqual(v.text('ky-period-cap'), '休業期間');
  assert.strictEqual(v.text('ky-start'), '2026年12月29日(火)から');
  assert.strictEqual(v.text('ky-end'), '2027年1月3日(日)まで');
  assert.strictEqual(v.text('ky-days'), '(6日間)');
  assert.strictEqual(v.text('ky-reopen'), null);
  assert.strictEqual(v.els.kyProblems.hidden, true);
  v.type('kyReopenDate', '2027-01-04');
  assert.strictEqual(v.text('ky-reopen'), '2027年1月4日(月)から通常どおり営業いたします。');
});

test('1日だけの休業は「休業日」として1行だけ出る(「から」「まで」と日数を出さない)', () => {
  const v = runView({});
  v.type('kyTitlePreset', '臨時休業のお知らせ'); v.type('kyStartDate', '2026-11-20');
  assert.strictEqual(v.text('ky-period-cap'), '休業日');
  assert.strictEqual(v.text('ky-start'), '2026年11月20日(金)');
  assert.strictEqual(v.text('ky-end'), null);
  assert.strictEqual(v.text('ky-days'), null);
  assert.ok(v.text('ky-lead').includes('下記の日を'));
});

test('ひとこと・連絡先は入れたときだけ紙に出る。店の名前は書いたとおり', () => {
  const v = runView({});
  assert.strictEqual(v.text('ky-message'), null);
  assert.strictEqual(v.text('ky-contact'), null);
  v.type('kyShop', 'ZZ商店'); v.type('kyMessage', 'ZZひとこと'); v.type('kyContact', 'ZZ連絡先');
  assert.strictEqual(v.text('ky-shop'), 'ZZ商店');
  assert.strictEqual(v.text('ky-message'), 'ZZひとこと');
  assert.strictEqual(v.text('ky-contact'), 'ZZ連絡先');
});

test('見出しを自分で書く欄は、「自分で書く」を選んだときだけ使える', () => {
  const v = runView({});
  assert.strictEqual(v.els.kyTitleCustom.disabled, true);
  v.type('kyTitlePreset', 'custom'); v.type('kyTitleCustom', 'ZZ見出し');
  assert.strictEqual(v.els.kyTitleCustom.disabled, false);
  assert.strictEqual(v.text('ky-title'), 'ZZ見出し');
});

test('入力は kyugyo-draft-v1 に下書きされ、開き直すと戻る(見出しの選択も)', () => {
  const storage = {};
  const a = runView(storage);
  a.type('kyTitlePreset', '夏季休業のお知らせ'); a.type('kyStartDate', '2026-08-13'); a.type('kyShop', 'ZZ下書きの店');
  assert.ok(storage['kyugyo-draft-v1'].includes('ZZ下書きの店'));
  const b = runView(storage);
  assert.strictEqual(b.els.kyTitlePreset.value, '夏季休業のお知らせ');
  assert.strictEqual(b.els.kyStartDate.value, '2026-08-13');
  assert.strictEqual(b.els.kyShop.value, 'ZZ下書きの店');
});

test('壊れた下書き・知らない見出しの値でも落ちずに開く', () => {
  assert.strictEqual(runView({ 'kyugyo-draft-v1': '{こわれた' }).els.kyTitlePreset.value, KY.TITLES[0]);
  assert.strictEqual(runView({ 'kyugyo-draft-v1': '{"titlePreset":"zzz"}' }).els.kyTitlePreset.value, KY.TITLES[0]);
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'keihi-draft-v1': '{"x":1}', 'juryosho-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('kyShop', 'ZZ');
  v.click('kyClear');
  assert.strictEqual(v.els.kyShop.value, '');
  assert.strictEqual(v.els.kyTitlePreset.value, KY.TITLES[0]);
  assert.ok(!String(storage['kyugyo-draft-v1'] || '').includes('ZZ'));
  assert.strictEqual(storage['keihi-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['juryosho-draft-v1'], '{"y":1}');
});

console.log('kyugyo.test.js: ' + passed + ' 件すべて通過');
