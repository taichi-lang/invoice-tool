/*
 * 営業時間の張り紙(/eigyo-jikan)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/eigyo-jikan.test.js
 *
 * 前半は eigyo-jikan-core.js の判断(時刻の読み取り・「翌」・空行・いつから・警告)を直接確かめる。
 * 後半は eigyo-jikan.js を小さな偽の DOM で実際に動かし、紙面・下書きの保存・「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const EJ = require('../public/eigyo-jikan-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'eigyo-jikan.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'eigyo-jikan.js'), 'utf8');
const core = fs.readFileSync(path.join(PUBLIC, 'eigyo-jikan-core.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const base = (extra) => Object.assign({
  titlePreset: '営業時間のご案内', titleCustom: '', fromDate: '',
  label1: '平日', open1: '09:00', close1: '18:00',
  label2: '土曜', open2: '09:00', close2: '13:00',
  label3: '', open3: '', close3: '',
  holiday: '日曜・祝日', message: '', shop: '山田デザイン事務所', contact: ''
}, extra || {});

console.log('eigyo-jikan.test.js');

// ── 時刻 ────────────────────────────────────────────────
test('時刻は「09:00」「9:00」を読み、「9:00」の形で出す(頭の0は付けない。分の0は付ける)', () => {
  assert.strictEqual(EJ.formatTime(EJ.parseTime('09:00')), '9:00');
  assert.strictEqual(EJ.formatTime(EJ.parseTime('9:05')), '9:05');
  assert.strictEqual(EJ.formatTime(EJ.parseTime('00:00')), '0:00');
  assert.strictEqual(EJ.formatTime(EJ.parseTime('23:59')), '23:59');
});

test('読めない時刻・24時以降・60分以降は空欄のまま(勝手に直さない)', () => {
  for (const v of ['', '24:00', '12:60', '9時', '9:0', 'abc', '９：００', null, undefined]) {
    assert.strictEqual(EJ.parseTime(v), null, String(v));
  }
  assert.strictEqual(EJ.formatTime(null), '');
});

// ── 組み立て ────────────────────────────────────────────
test('時刻を入れた行だけが紙に出る。呼び名は書いたとおり', () => {
  const b = EJ.buildSheet(base());
  assert.strictEqual(b.rows.length, 2);
  assert.deepStrictEqual(b.rows.map((r) => r.label), ['平日', '土曜']);
  assert.deepStrictEqual(b.rows.map((r) => EJ.rowTimeText(r)), ['9:00 〜 18:00', '9:00 〜 13:00']);
  assert.strictEqual(b.holiday, '日曜・祝日');
});

test('あいだの行を空けても、入れた行は元の順のまま出る', () => {
  const b = EJ.buildSheet(base({ label2: '', open2: '', close2: '', label3: '日曜', open3: '10:00', close3: '15:00' }));
  assert.deepStrictEqual(b.rows.map((r) => r.n), [1, 3]);
});

test('閉める時刻が開く時刻より早い行は「翌」を添える。遅い行・同じ行には添えない', () => {
  const b = EJ.buildSheet(base({ open1: '18:00', close1: '02:00', open2: '18:00', close2: '18:00' }));
  assert.strictEqual(b.rows[0].nextDay, true);
  assert.strictEqual(EJ.rowTimeText(b.rows[0]), '18:00 〜 翌2:00');
  assert.strictEqual(b.rows[1].nextDay, false);
  assert.strictEqual(EJ.buildSheet(base()).rows[0].nextDay, false);
  // 0:00 に閉める店も「翌」になる
  assert.strictEqual(EJ.rowTimeText(EJ.buildSheet(base({ open1: '17:00', close1: '00:00' })).rows[0]), '17:00 〜 翌0:00');
});

test('片方だけ入れた行は、入れた側だけ出して空いた側は空ける(「翌」は付けない)', () => {
  const b = EJ.buildSheet(base({ open1: '09:00', close1: '' }));
  assert.strictEqual(b.rows[0].nextDay, false);
  assert.strictEqual(EJ.rowTimeText(b.rows[0]), '9:00 〜 　　');
  const c = EJ.buildSheet(base({ open1: '', close1: '18:00' }));
  assert.strictEqual(EJ.rowTimeText(c.rows[0]), '　　 〜 18:00');
});

test('「いつから」は曜日つきで出る。空・暦に無い日付は空欄のまま(今日にしない)', () => {
  assert.strictEqual(EJ.buildSheet(base({ fromDate: '2026-12-01' })).fromText, '2026年12月1日(火)');
  assert.strictEqual(EJ.formatDateWd('2026-11-20'), '2026年11月20日(金)');
  assert.strictEqual(EJ.formatDateWd('2024-02-29'), '2024年2月29日(木)');
  assert.strictEqual(EJ.buildSheet(base()).fromText, '');
  assert.strictEqual(EJ.buildSheet(base({ fromDate: '2026-02-30' })).fromText, '');
});

test('見出しは決まった3つから選ぶ。知らない値は先頭に戻す。「自分で書く」は書いたとおり', () => {
  assert.deepStrictEqual(EJ.TITLES, ['営業時間のご案内', '営業時間変更のお知らせ', '定休日のご案内']);
  assert.strictEqual(EJ.buildSheet(base({ titlePreset: '定休日のご案内' })).title, '定休日のご案内');
  assert.strictEqual(EJ.buildSheet(base({ titlePreset: 'zzz' })).title, EJ.TITLES[0]);
  assert.strictEqual(EJ.buildSheet(base({ titlePreset: 'custom', titleCustom: ' 年末の営業時間のお知らせ ' })).title, '年末の営業時間のお知らせ');
  assert.strictEqual(EJ.buildSheet(base({ titleCustom: 'ZZ' })).title, '営業時間のご案内');
});

test('変更のお知らせかどうかは、見出しの選択だけで決まる', () => {
  assert.strictEqual(EJ.buildSheet(base()).isChange, false);
  assert.strictEqual(EJ.buildSheet(base({ titlePreset: '営業時間変更のお知らせ' })).isChange, true);
  assert.strictEqual(EJ.buildSheet(base({ titlePreset: 'custom', titleCustom: '営業時間変更のお知らせ' })).isChange, false);
});

test('金額・祝日の判定・営業してよいかの判定・通信を持たない(コードに無い)', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/amount|price|tax|祝日|届出|許可/i.test(strip(core)));
  for (const code of [strip(core), strip(view)]) {
    assert.ok(!/fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|sessionStorage|indexedDB|document\.cookie/.test(code));
  }
});

// ── 警告 ────────────────────────────────────────────────
test('そろった入力には警告を出さない。日をまたぐ行にも出さない', () => {
  assert.deepStrictEqual(EJ.findProblems(base()), []);
  assert.deepStrictEqual(EJ.findProblems(base({ open1: '18:00', close1: '02:00' })), []);
  assert.deepStrictEqual(EJ.findProblems(base({ titlePreset: '営業時間変更のお知らせ', fromDate: '2026-12-01' })), []);
});

test('定休日だけの紙は警告なしで作れる。営業時間も定休日も無ければ知らせる', () => {
  const only = base({ titlePreset: '定休日のご案内', label1: '', open1: '', close1: '', label2: '', open2: '', close2: '' });
  assert.deepStrictEqual(EJ.findProblems(only), []);
  assert.ok(EJ.findProblems(Object.assign({}, only, { holiday: '' })).includes('営業時間も定休日も入っていません。'));
});

test('片方だけの時刻・同じ時刻・時刻の無い呼び名を、何行目かを添えて知らせる', () => {
  assert.ok(EJ.findProblems(base({ close1: '' })).includes('1行目の閉める時刻が入っていません。'));
  assert.ok(EJ.findProblems(base({ open2: '' })).includes('2行目の開く時刻が入っていません。'));
  assert.ok(EJ.findProblems(base({ open1: '09:00', close1: '09:00' })).includes('1行目の開く時刻と閉める時刻が同じです。'));
  assert.ok(EJ.findProblems(base({ label3: '日曜' })).some((m) => m.startsWith('3行目の時刻が入っていません。')));
});

test('変更のお知らせで「いつから」が無いと知らせる。ほかの見出しでは知らせない', () => {
  const msg = 'いつから変わるかが入っていません。';
  assert.ok(EJ.findProblems(base({ titlePreset: '営業時間変更のお知らせ' })).includes(msg));
  assert.ok(!EJ.findProblems(base()).includes(msg));
});

test('店の名前が無いと知らせる。「自分で書く」で見出しが空でも知らせる', () => {
  const p = EJ.findProblems(base({ shop: '', titlePreset: 'custom' }));
  assert.ok(p.includes('店や事務所の名前が入っていません。'));
  assert.ok(p.some((m) => m.startsWith('見出しが入っていません。')));
});

test('長すぎる欄は字数を添えて知らせる(切り詰めない)。上限ちょうどは知らせない', () => {
  const long = (n) => 'あ'.repeat(n);
  const L = EJ.LIMITS;
  const input = base({
    titlePreset: 'custom', titleCustom: long(L.title + 1), label1: long(L.label + 1), holiday: long(L.holiday + 1),
    message: long(L.message + 1), shop: long(L.shop + 1), contact: long(L.contact + 1)
  });
  const p = EJ.findProblems(input);
  assert.ok(p.some((m) => m.startsWith('見出しが' + (L.title + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('1行目の呼び名が' + (L.label + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('定休日が' + (L.holiday + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('ひとことが' + (L.message + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('店や事務所の名前が' + (L.shop + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('連絡先が' + (L.contact + 1) + '字')));
  assert.strictEqual([...EJ.buildSheet(input).shop].length, L.shop + 1);
  const ok = base({
    titlePreset: 'custom', titleCustom: long(L.title), label1: long(L.label), holiday: long(L.holiday),
    message: long(L.message), shop: long(L.shop), contact: long(L.contact)
  });
  assert.deepStrictEqual(EJ.findProblems(ok), []);
});

// ── ページ ──────────────────────────────────────────────
test('「送信しない」の表示が、ヘッダーと本文の両方に在る', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.includes('入力内容は送信されません'));
  assert.ok(html.includes('サーバーへ送信・保存されることはありません'));
});

test('<title> と <h1> が同じで、title は32文字以内、前半に「営業時間」', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)[1];
  assert.strictEqual(title, h1);
  assert.ok([...title].length <= 32, 'title が ' + [...title].length + ' 文字');
  assert.ok(title.startsWith('営業時間'));
});

test('説明文が約束した「営業時間・定休日・張り紙・営業時間変更のお知らせ」が本文に在る', () => {
  const body = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
  for (const w of ['営業時間', '定休日', '張り紙', '営業時間変更のお知らせ', '開く時刻', '閉める時刻']) assert.ok(body.includes(w), w);
});

test('書き方の例は、そのまま入れても警告が出ず、紙に出る時刻が本文と同じ', () => {
  const input = base({ message: '受付は閉める30分前までです。' });
  assert.deepStrictEqual(EJ.findProblems(input), []);
  const b = EJ.buildSheet(input);
  for (const r of b.rows) {
    assert.ok(html.includes(EJ.rowTimeText(r)), EJ.rowTimeText(r));
    assert.ok(html.includes(r.label), r.label);
  }
  for (const w of [b.title, b.holiday, b.message]) assert.ok(html.includes(w), w);
});

test('本文に書いた「翌」と「いつから」と結びの文が、実際に紙へ出る形と同じ', () => {
  const b = EJ.buildSheet(base({ open1: '18:00', close1: '02:00', fromDate: '2026-12-01' }));
  assert.ok(html.includes(EJ.rowTimeText(b.rows[0])));
  assert.ok(html.includes(b.fromText + 'から'));
  const closing = 'ご不便をおかけいたしますが、何とぞよろしくお願い申し上げます。';
  assert.ok(view.includes(closing));
  assert.ok(html.includes(closing));
});

test('選べる見出しは、core の決まった3つ+「自分で書く」と同じ並び', () => {
  const sel = html.slice(html.indexOf('<select id="ejTitlePreset">'), html.indexOf('</select>'));
  const values = [...sel.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]);
  assert.deepStrictEqual(values, EJ.TITLES.concat([EJ.CUSTOM]));
});

test('入力欄は core の行の数だけ在る', () => {
  for (let n = 1; n <= EJ.ROWS; n++) {
    for (const k of ['Label', 'Open', 'Close']) assert.ok(html.includes('id="ej' + k + n + '"'), k + n);
  }
  assert.ok(!html.includes('id="ejOpen' + (EJ.ROWS + 1) + '"'));
});

test('入力欄に書いた字数の上限が、core の上限と同じ', () => {
  assert.ok(html.includes('見出し(「自分で書く」のとき・' + EJ.LIMITS.title + '字まで)'));
  assert.strictEqual((html.match(new RegExp('呼び名\\(任意・' + EJ.LIMITS.label + '字まで\\)', 'g')) || []).length, EJ.ROWS);
  assert.ok(html.includes('定休日(任意・' + EJ.LIMITS.holiday + '字まで)'));
  assert.ok(html.includes('ひとこと(任意・' + EJ.LIMITS.message + '字まで)'));
  assert.ok(html.includes('店や事務所の名前(' + EJ.LIMITS.shop + '字まで)'));
  assert.ok(html.includes('連絡先(任意・' + EJ.LIMITS.contact + '字まで)'));
});

test('判断しないことを、入力欄のそばと本文の両方に書いている', () => {
  assert.ok(html.includes('その時間に営業してよいか、届出が要るかは、このツールでは判断しません'));
  assert.ok(html.includes('届出や許可が要るか'));
  assert.ok(html.includes('個別の判断は専門家にご確認ください'));
});

test('core → 画面 の順に読む。ほかのページの core は読まない', () => {
  const a = html.indexOf('<script src="/eigyo-jikan-core.js"></script>');
  const b = html.indexOf('<script src="/eigyo-jikan.js"></script>');
  assert.ok(a >= 0 && a < b);
  assert.strictEqual((html.match(/<script /g) || []).length, 2);
});

test('休業のお知らせ・母屋と相互にリンクしている', () => {
  for (const f of ['kyugyo.html', 'kaigyo.html']) {
    assert.ok(fs.readFileSync(path.join(PUBLIC, f), 'utf8').includes('href="/eigyo-jikan"'), f + ' から /eigyo-jikan へのリンクが無い');
  }
  assert.ok(html.includes('href="/kyugyo"') && html.includes('href="/kaigyo"'));
});

test('時刻は見出しより大きい字で刷る(本文の「いちばん大きく」と合わせる)', () => {
  const css = fs.readFileSync(path.join(PUBLIC, 'eigyo-jikan.css'), 'utf8');
  const size = (cls) => Number(new RegExp('\\.' + cls + ' \\{[^}]*?font-size: (\\d+)pt').exec(css)[1]);
  assert.ok(size('ej-time') > size('ej-title'));
  for (const cls of ['ej-from', 'ej-label', 'ej-holiday-text', 'ej-shop']) assert.ok(size('ej-time') > size(cls), cls);
});

test('README の説明が、変更のお知らせの決まり方(見出しの選択)と合っている', () => {
  const readme = fs.readFileSync(path.join(PUBLIC, '..', 'README.md'), 'utf8');
  assert.ok(readme.includes('見出しで「営業時間変更のお知らせ」を選んで「いつから」を入れると'));
  assert.ok(!readme.includes('「いつから」を入れると営業時間変更のお知らせになります'));
});

test('サイトマップに1回だけ載っている', () => {
  const map = fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
  assert.strictEqual(map.split('<loc>https://invoice-tool-kohl.vercel.app/eigyo-jikan</loc>').length - 1, 1);
});

// ── eigyo-jikan.js を偽の DOM で動かす ───────────────────
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
  const window = { EigyoJikan: EJ, confirm: () => true, print() {} };
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
  const paper = () => els.ejSheet.children[0];
  const texts = (cls) => findAll(paper(), cls).map((n) => n.textContent);
  const text = (cls) => { const t = texts(cls); return t.length ? t[0] : null; };
  return { els, type, click, paper, text, texts };
}

test('画面が読む入力欄の id は、すべてページに在る(名前の食い違いで欄が死なない)', () => {
  const v = runView({});
  const ids = Object.keys(v.els);
  assert.strictEqual(ids.length, 3 + EJ.ROWS * 3 + 4 + 4);
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), id + ' がページに無い');
});

test('開いた直後は見出しが「営業時間のご案内」。時刻も日付も空で、勝手に入れない', () => {
  const v = runView({});
  assert.strictEqual(v.els.ejTitlePreset.value, '営業時間のご案内');
  assert.strictEqual(v.els.ejOpen1.value, '');
  assert.strictEqual(v.els.ejFromDate.value, '');
  assert.strictEqual(v.text('ej-title'), '営業時間のご案内');
  assert.deepStrictEqual(v.texts('ej-time'), []);
  assert.strictEqual(v.text('ej-from'), null);
  assert.strictEqual(v.els.ejProblems.hidden, false);
});

test('時刻を入れた行が、呼び名と一緒に入れた順で紙に出る', () => {
  const v = runView({});
  v.type('ejLabel1', '平日'); v.type('ejOpen1', '09:00'); v.type('ejClose1', '18:00');
  v.type('ejLabel2', '土曜'); v.type('ejOpen2', '09:00'); v.type('ejClose2', '13:00');
  v.type('ejHoliday', '日曜・祝日'); v.type('ejShop', 'ZZ商店');
  assert.deepStrictEqual(v.texts('ej-label'), ['平日', '土曜']);
  assert.deepStrictEqual(v.texts('ej-time'), ['9:00 〜 18:00', '9:00 〜 13:00']);
  assert.strictEqual(v.text('ej-holiday-text'), '日曜・祝日');
  assert.strictEqual(v.text('ej-shop'), 'ZZ商店');
  assert.strictEqual(v.els.ejProblems.hidden, true);
});

test('呼び名を空けた行は、時刻だけが出る。日をまたぐ行は「翌」つきで出る', () => {
  const v = runView({});
  v.type('ejOpen1', '18:00'); v.type('ejClose1', '02:00');
  assert.deepStrictEqual(v.texts('ej-label'), []);
  assert.deepStrictEqual(v.texts('ej-time'), ['18:00 〜 翌2:00']);
});

test('結びの文は変更のお知らせを選んだときだけ、「いつから」は入れたときだけ出る', () => {
  const v = runView({});
  v.type('ejOpen1', '10:00'); v.type('ejClose1', '19:00'); v.type('ejShop', 'ZZ');
  assert.strictEqual(v.text('ej-closing'), null);
  v.type('ejTitlePreset', '営業時間変更のお知らせ');
  assert.ok(v.text('ej-closing').startsWith('ご不便をおかけいたしますが'));
  assert.strictEqual(v.els.ejProblems.hidden, false);
  v.type('ejFromDate', '2026-12-01');
  assert.strictEqual(v.text('ej-from'), '2026年12月1日(火)から');
  assert.strictEqual(v.els.ejProblems.hidden, true);
});

test('定休日・ひとこと・連絡先は入れたときだけ紙に出る。営業時間の枠も行が無ければ出ない', () => {
  const v = runView({});
  assert.strictEqual(v.text('ej-holiday-text'), null);
  assert.strictEqual(v.text('ej-message'), null);
  assert.strictEqual(v.text('ej-contact'), null);
  assert.deepStrictEqual(v.texts('ej-cap'), []);
  v.type('ejHoliday', 'ZZ水曜'); v.type('ejMessage', 'ZZひとこと'); v.type('ejContact', 'ZZ連絡先');
  assert.deepStrictEqual(v.texts('ej-cap'), ['定休日']);
  assert.strictEqual(v.text('ej-message'), 'ZZひとこと');
  assert.strictEqual(v.text('ej-contact'), 'ZZ連絡先');
});

test('見出しを自分で書く欄は、「自分で書く」を選んだときだけ使える', () => {
  const v = runView({});
  assert.strictEqual(v.els.ejTitleCustom.disabled, true);
  v.type('ejTitlePreset', 'custom'); v.type('ejTitleCustom', 'ZZ見出し');
  assert.strictEqual(v.els.ejTitleCustom.disabled, false);
  assert.strictEqual(v.text('ej-title'), 'ZZ見出し');
});

test('入力は eigyo-jikan-draft-v1 に下書きされ、開き直すと戻る(見出しの選択と時刻も)', () => {
  const storage = {};
  const a = runView(storage);
  a.type('ejTitlePreset', '定休日のご案内'); a.type('ejOpen2', '09:30'); a.type('ejShop', 'ZZ下書きの店');
  assert.ok(storage['eigyo-jikan-draft-v1'].includes('ZZ下書きの店'));
  const b = runView(storage);
  assert.strictEqual(b.els.ejTitlePreset.value, '定休日のご案内');
  assert.strictEqual(b.els.ejOpen2.value, '09:30');
  assert.strictEqual(b.els.ejShop.value, 'ZZ下書きの店');
});

test('壊れた下書き・知らない見出しの値でも落ちずに開く', () => {
  assert.strictEqual(runView({ 'eigyo-jikan-draft-v1': '{こわれた' }).els.ejTitlePreset.value, EJ.TITLES[0]);
  assert.strictEqual(runView({ 'eigyo-jikan-draft-v1': '{"titlePreset":"zzz"}' }).els.ejTitlePreset.value, EJ.TITLES[0]);
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'kyugyo-draft-v1': '{"x":1}', 'fax-soufujo-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('ejShop', 'ZZ'); v.type('ejOpen1', '09:00');
  v.click('ejClear');
  assert.strictEqual(v.els.ejShop.value, '');
  assert.strictEqual(v.els.ejOpen1.value, '');
  assert.strictEqual(v.els.ejTitlePreset.value, EJ.TITLES[0]);
  assert.ok(!('eigyo-jikan-draft-v1' in storage), '消したあとに下書きのキーが残っている');
  assert.strictEqual(storage['kyugyo-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['fax-soufujo-draft-v1'], '{"y":1}');
});

console.log('eigyo-jikan.test.js: ' + passed + ' 件すべて通過');
