/*
 * FAX送付状(/fax-soufujo)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/fax-soufujo.test.js
 *
 * 前半は fax-soufujo-core.js の判断(敬称・枚数・しるし・通信欄・警告)を直接確かめる。
 * 後半は fax-soufujo.js を小さな偽の DOM で実際に動かし、紙面・下書きの保存・「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const FX = require('../public/fax-soufujo-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'fax-soufujo.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'fax-soufujo.js'), 'utf8');
const core = fs.readFileSync(path.join(PUBLIC, 'fax-soufujo-core.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const base = (extra) => Object.assign({
  date: '2026-11-18', toCompany: '株式会社サンプル', toName: '営業部 鈴木一郎', toFax: '03-0000-0000',
  fromCompany: '山田デザイン事務所', fromName: '山田太郎', fromTel: '03-0000-0001', fromFax: '03-0000-0002',
  subject: 'お見積書送付の件', pages: '3', request: 'ご確認ください', message: ''
}, extra || {});

console.log('fax-soufujo.test.js');

// ── 組み立て ────────────────────────────────────────────
test('担当者名があれば担当者に「様」、会社名には何も付けない(御中と様を重ねない)', () => {
  const b = FX.buildSheet(base());
  assert.deepStrictEqual(b.toLines, ['株式会社サンプル', '営業部 鈴木一郎 様']);
  assert.ok(!b.toLines.join('').includes('御中'));
});

test('会社名だけなら「御中」。担当者名だけなら「様」。どちらも空なら行を出さない', () => {
  assert.deepStrictEqual(FX.buildSheet(base({ toName: '' })).toLines, ['株式会社サンプル 御中']);
  assert.deepStrictEqual(FX.buildSheet(base({ toCompany: '' })).toLines, ['営業部 鈴木一郎 様']);
  assert.deepStrictEqual(FX.buildSheet(base({ toCompany: ' ', toName: '' })).toLines, []);
});

test('枚数は入れた数字をそのまま出す。全角の数字は半角に直す。数え直さない', () => {
  assert.strictEqual(FX.buildSheet(base()).pagesText, '3枚');
  assert.strictEqual(FX.buildSheet(base({ pages: '12' })).pagesText, '12枚');
  assert.strictEqual(FX.parsePages(' 1 '), 1);
  assert.strictEqual(FX.parsePages('999'), 999);
  assert.strictEqual(FX.parsePages('３'), 3);
  assert.strictEqual(FX.buildSheet(base({ pages: '１２' })).pagesText, '12枚');
});

test('枚数に読めない値(0・小数・負・文字・4桁)は空欄にする(0枚と出さない)', () => {
  for (const v of ['', '0', '1.5', '-2', '三', '3枚', '1000', 'abc']) {
    assert.strictEqual(FX.parsePages(v), null, v);
    assert.strictEqual(FX.buildSheet(base({ pages: v })).pagesText, '', v);
  }
});

test('日付は「2026年11月18日」。空・暦に無い日付は空欄のまま(今日にしない)', () => {
  assert.strictEqual(FX.buildSheet(base()).dateText, '2026年11月18日');
  assert.strictEqual(FX.formatDate(''), '');
  assert.strictEqual(FX.formatDate('2026-02-30'), '');
  assert.strictEqual(FX.formatDate('2026/11/18'), '');
});

test('しるしは決まった4つから1つ。知らない値は「付けない」に戻す', () => {
  assert.deepStrictEqual(FX.REQUESTS, ['ご確認ください', 'ご返信ください', 'ご査収ください', '至急']);
  assert.strictEqual(FX.buildSheet(base({ request: '至急' })).request, '至急');
  assert.strictEqual(FX.buildSheet(base({ request: 'zzz' })).request, FX.NONE);
  assert.strictEqual(FX.buildSheet(base({ request: undefined })).request, FX.NONE);
});

test('通信欄は行に分ける。前後の空行は捨て、途中の空行は残す', () => {
  const b = FX.buildSheet(base({ message: '\n\nいつもお世話になっております。\r\n\r\nご確認をお願いいたします。  \n\n' }));
  assert.deepStrictEqual(b.messageLines, ['いつもお世話になっております。', '', 'ご確認をお願いいたします。']);
  assert.deepStrictEqual(FX.buildSheet(base({ message: '  \n ' })).messageLines, []);
});

test('FAXを送る処理・通信・金額の計算を持たない(コードに無い)', () => {
  for (const src of [core, view]) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.|amount|price|tax/i.test(code));
  }
});

// ── 警告 ────────────────────────────────────────────────
test('そろった入力には警告を出さない(件名・日付・しるし・通信欄は空でも出さない)', () => {
  assert.deepStrictEqual(FX.findProblems(base()), []);
  assert.deepStrictEqual(FX.findProblems(base({ subject: '', date: '', request: 'none', toName: '', fromCompany: '', fromFax: '' })), []);
});

test('送付先・送付先のFAX番号・発信元・発信元の連絡先・枚数が空なら知らせる', () => {
  const p = FX.findProblems(base({ toCompany: '', toName: '', toFax: '', fromCompany: '', fromName: '', fromTel: '', fromFax: '', pages: '' }));
  assert.deepStrictEqual(p, [
    '送付先(会社名か担当者名)が入っていません。',
    '送付先のFAX番号が入っていません。',
    '発信元(会社名か担当者名)が入っていません。',
    '発信元の電話番号とFAX番号が、どちらも入っていません。',
    '送付枚数が入っていません。'
  ]);
});

test('枚数が数字として読めないときは、空のときと別の文で知らせる', () => {
  assert.ok(FX.findProblems(base({ pages: '0' })).includes('送付枚数は、1以上の数字で入れてください。'));
  assert.ok(FX.findProblems(base({ pages: '三枚' })).includes('送付枚数は、1以上の数字で入れてください。'));
  assert.ok(!FX.findProblems(base({ pages: '3' })).some((m) => m.startsWith('送付枚数')));
});

test('FAX番号の形は確かめない(どんな書き方でも警告しない)', () => {
  for (const toFax of ['0300000000', '(03)0000-0000', '+81-3-0000-0000', '内線12']) {
    assert.deepStrictEqual(FX.findProblems(base({ toFax })), [], toFax);
    assert.strictEqual(FX.buildSheet(base({ toFax })).toFax, toFax);
  }
});

test('長すぎる欄は字数を添えて知らせる(切り詰めない)。上限ちょうどは知らせない', () => {
  const long = (n) => 'あ'.repeat(n);
  const L = FX.LIMITS;
  const over = base({
    toCompany: long(L.company + 1), toName: long(L.name + 1), toFax: long(L.number + 1),
    fromCompany: long(L.company + 1), fromName: long(L.name + 1), fromTel: long(L.number + 1), fromFax: long(L.number + 1),
    subject: long(L.subject + 1), message: long(L.message + 1)
  });
  const p = FX.findProblems(over);
  for (const head of ['送付先の会社名が' + (L.company + 1), '送付先の担当者名が' + (L.name + 1), '送付先のFAX番号が' + (L.number + 1),
    '発信元の会社名が' + (L.company + 1), '発信元の担当者名が' + (L.name + 1), '発信元の電話番号が' + (L.number + 1),
    '発信元のFAX番号が' + (L.number + 1), '件名が' + (L.subject + 1), '通信欄が' + (L.message + 1) + '字']) {
    assert.ok(p.some((m) => m.startsWith(head)), head);
  }
  assert.strictEqual([...FX.buildSheet(over).subject].length, L.subject + 1);
  const ok = base({
    toCompany: long(L.company), toName: long(L.name), toFax: long(L.number),
    fromCompany: long(L.company), fromName: long(L.name), fromTel: long(L.number), fromFax: long(L.number),
    subject: long(L.subject), message: Array(L.messageLines).fill(long(L.message / L.messageLines)).join('\n')
  });
  assert.deepStrictEqual(FX.findProblems(ok), []);
});

test('通信欄の行数が多すぎるときも知らせる(折り返しも数える)', () => {
  const L = FX.LIMITS;
  const msg = '通信欄が、紙の上でおよそ' + (L.messageLines + 1) + '行になります。' + L.messageLines + '行までにしてください。';
  assert.ok(FX.findProblems(base({ message: Array(L.messageLines + 1).fill('あ').join('\n') })).includes(msg));
  // 行の数は12でも、長い行が折り返して13行になるなら知らせる
  const wrapped = Array(L.messageLines - 1).fill('あ').concat(['あ'.repeat(L.lineChars + 1)]).join('\n');
  assert.ok(FX.findProblems(base({ message: wrapped })).includes(msg));
  const fits = Array(L.messageLines - 1).fill('あ').concat(['あ'.repeat(L.lineChars)]).join('\n');
  assert.deepStrictEqual(FX.findProblems(base({ message: fits })), []);
  assert.strictEqual(FX.visualLines(['', 'あ'.repeat(L.lineChars * 2 + 1)]), 4);
});

// ── ページ ──────────────────────────────────────────────
test('「送信しない」の表示が、ヘッダーと本文の両方に在る。FAXを送る機能が無いことも書いている', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.includes('入力内容は送信されません'));
  assert.ok(html.includes('サーバーへ送信・保存されることはありません'));
  assert.ok(html.includes('このページにFAXを送る機能はありません'));
  assert.ok(html.includes('FAXを送る機能はありません。入れたFAX番号が正しいかどうか'));
});

test('<title> と <h1> が同じで、title は32文字以内、前半に「FAX送付状」', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)[1];
  assert.strictEqual(title, h1);
  assert.ok([...title].length <= 32, 'title が ' + [...title].length + ' 文字');
  assert.ok(title.startsWith('FAX送付状'));
});

test('説明文が約束した「送付先・発信元・件名・送付枚数・しるし・通信欄・書き方・例文・手書き」が本文に在る', () => {
  const body = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
  for (const w of ['送付先', '発信元', '件名', '送付枚数', 'しるし', '通信欄', '書き方', '例文', '手書き']) assert.ok(body.includes(w), w);
});

test('書き方の例は、そのまま入れても警告が出ず、紙に出る宛名・日付・枚数が本文と同じ', () => {
  const input = base({ message: 'いつもお世話になっております。お見積書を2枚お送りします。ご確認をお願いいたします。' });
  assert.deepStrictEqual(FX.findProblems(input), []);
  const b = FX.buildSheet(input);
  for (const w of b.toLines.concat([b.dateText, b.pagesText + '(この送付状を含む)', b.subject, b.toFax, b.request, b.messageLines[0]])) {
    assert.ok(html.includes(w), w);
  }
});

test('選べるしるしは、「付けない」+ core の決まった4つと同じ並び', () => {
  const sel = html.slice(html.indexOf('<select id="fxRequest">'), html.indexOf('</select>'));
  const values = [...sel.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]);
  assert.deepStrictEqual(values, [FX.NONE].concat(FX.REQUESTS));
});

test('入力欄の説明に書いた字数・行数は、core の上限と同じ', () => {
  assert.ok(html.includes('(' + FX.LIMITS.message + '字・' + FX.LIMITS.messageLines + '行まで)'));
});

test('判断しないことを、入力欄のそばと本文の両方に書いている', () => {
  assert.ok(html.includes('FAX番号が正しいかは、このツールでは確かめません'));
  assert.ok(html.includes('その書類をFAXで送ってよいか'));
  assert.ok(html.includes('原本を郵送する必要があるか'));
  assert.ok(html.includes('個別の判断は専門家にご確認ください'));
});

test('core → 画面 の順に読む。ほかのページの core は読まない', () => {
  const a = html.indexOf('<script src="/fax-soufujo-core.js"></script>');
  const b = html.indexOf('<script src="/fax-soufujo.js"></script>');
  assert.ok(a >= 0 && a < b);
  assert.strictEqual((html.match(/<script /g) || []).length, 2);
});

test('送付状・母屋と相互にリンクしている。sitemap に載っている', () => {
  for (const f of ['soufujo.html', 'kaigyo.html']) {
    assert.ok(fs.readFileSync(path.join(PUBLIC, f), 'utf8').includes('href="/fax-soufujo"'), f + ' から /fax-soufujo へのリンクが無い');
  }
  assert.ok(html.includes('href="/soufujo"') && html.includes('href="/kaigyo"'));
  assert.ok(fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8').includes('<loc>https://invoice-tool-kohl.vercel.app/fax-soufujo</loc>'));
});

test('母屋は「6工程」の数を変えていない(FAX送付状は「送る」の工程の中に置く)', () => {
  const hub = fs.readFileSync(path.join(PUBLIC, 'kaigyo.html'), 'utf8');
  assert.ok(!/<h2>7\./.test(hub));
  assert.ok(hub.indexOf('href="/soufujo"') < hub.indexOf('href="/fax-soufujo"'));
  assert.ok(hub.indexOf('href="/fax-soufujo"') < hub.indexOf('href="/atena"'));
});

// ── fax-soufujo.js を偽の DOM で動かす ───────────────────
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
  const window = { FaxSoufujo: FX, confirm: () => true, print() {} };
  new Function('window', 'document', 'localStorage', view)(window, document, localStorage);
  const fire = (node, type) => (node.listeners[type] || []).forEach((f) => f());
  const type = (id, v) => { els[id].value = v; fire(els[id], 'input'); };
  const click = (id) => fire(els[id], 'click');
  const findAll = (node, cls, out) => {
    out = out || [];
    if (node.className === cls) out.push(node);
    node.children.forEach((c) => findAll(c, cls, out));
    return out;
  };
  const paper = () => els.fxSheet.children[0];
  const texts = (cls) => findAll(paper(), cls).map((n) => n.textContent);
  const text = (cls) => { const t = texts(cls); return t.length ? t[0] : null; };
  return { els, type, click, paper, text, texts };
}

test('開いた直後は、枠だけの送付状が出る(日付は空・しるしは4つとも空・今日を勝手に入れない)', () => {
  const v = runView({});
  assert.strictEqual(v.els.fxRequest.value, 'none');
  assert.strictEqual(v.els.fxDate.value, '');
  assert.strictEqual(v.text('fx-title'), 'FAX送付状');
  assert.strictEqual(v.text('fx-date'), '　　　　年　　月　　日');
  assert.deepStrictEqual(v.texts('fx-to-line'), []);
  assert.strictEqual(v.text('fx-to-fax'), 'FAX　');
  assert.strictEqual(v.text('fx-pages'), '　　　枚(この送付状を含む)');
  assert.deepStrictEqual(v.texts('fx-box'), ['', '', '', '']);
  assert.deepStrictEqual(v.texts('fx-req-label'), FX.REQUESTS);
  assert.deepStrictEqual(v.texts('fx-message-line'), []);
  assert.strictEqual(v.els.fxProblems.hidden, false);
});

test('入れた内容が紙に出て、そろうと警告が消える', () => {
  const v = runView({});
  v.type('fxToCompany', 'ZZ商事'); v.type('fxToName', 'ZZ太郎'); v.type('fxToFax', '03-1111-2222');
  v.type('fxFromCompany', 'ZZ事務所'); v.type('fxFromName', 'ZZ花子'); v.type('fxFromTel', '03-3333-4444'); v.type('fxFromFax', '03-5555-6666');
  v.type('fxDate', '2026-11-18'); v.type('fxSubject', 'ZZの件'); v.type('fxPages', '3');
  assert.deepStrictEqual(v.texts('fx-to-line'), ['ZZ商事', 'ZZ太郎 様']);
  assert.strictEqual(v.text('fx-to-fax'), 'FAX　03-1111-2222');
  assert.strictEqual(v.text('fx-from-company'), 'ZZ事務所');
  assert.strictEqual(v.text('fx-from-person'), 'ZZ花子');
  assert.strictEqual(v.text('fx-from-tel'), 'TEL　03-3333-4444');
  assert.strictEqual(v.text('fx-from-fax'), 'FAX　03-5555-6666');
  assert.strictEqual(v.text('fx-date'), '2026年11月18日');
  assert.strictEqual(v.text('fx-subject'), 'ZZの件');
  assert.strictEqual(v.text('fx-pages'), '3枚(この送付状を含む)');
  assert.strictEqual(v.els.fxProblems.hidden, true);
});

test('担当者名を消すと、会社名に「御中」が付く', () => {
  const v = runView({});
  v.type('fxToCompany', 'ZZ商事'); v.type('fxToName', 'ZZ太郎'); v.type('fxToName', '');
  assert.deepStrictEqual(v.texts('fx-to-line'), ['ZZ商事 御中']);
});

test('しるしは選んだ1つにだけ「レ」が入る。選び直すと移る', () => {
  const v = runView({});
  v.type('fxRequest', 'ご返信ください');
  assert.deepStrictEqual(v.texts('fx-box'), ['', 'レ', '', '']);
  v.type('fxRequest', '至急');
  assert.deepStrictEqual(v.texts('fx-box'), ['', '', '', 'レ']);
  v.type('fxRequest', 'none');
  assert.deepStrictEqual(v.texts('fx-box'), ['', '', '', '']);
});

test('通信欄は書いた行のとおりに出る。途中の空行は全角の空白1つで高さを保つ', () => {
  const v = runView({});
  v.type('fxMessage', 'ZZ1行目\n\nZZ3行目');
  assert.deepStrictEqual(v.texts('fx-message-line'), ['ZZ1行目', '　', 'ZZ3行目']);
});

test('入力は fax-soufujo-draft-v1 に下書きされ、開き直すと戻る(しるしの選択も)', () => {
  const storage = {};
  const a = runView(storage);
  a.type('fxRequest', 'ご査収ください'); a.type('fxPages', '5'); a.type('fxFromCompany', 'ZZ下書きの店');
  assert.ok(storage['fax-soufujo-draft-v1'].includes('ZZ下書きの店'));
  const b = runView(storage);
  assert.strictEqual(b.els.fxRequest.value, 'ご査収ください');
  assert.strictEqual(b.els.fxPages.value, '5');
  assert.strictEqual(b.els.fxFromCompany.value, 'ZZ下書きの店');
});

test('壊れた下書き・知らないしるしの値でも落ちずに開く', () => {
  assert.strictEqual(runView({ 'fax-soufujo-draft-v1': '{こわれた' }).els.fxRequest.value, FX.NONE);
  assert.strictEqual(runView({ 'fax-soufujo-draft-v1': '{"request":"zzz"}' }).els.fxRequest.value, FX.NONE);
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'kyugyo-draft-v1': '{"x":1}', 'juryosho-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('fxFromCompany', 'ZZ');
  v.click('fxClear');
  assert.strictEqual(v.els.fxFromCompany.value, '');
  assert.strictEqual(v.els.fxRequest.value, FX.NONE);
  assert.ok(!String(storage['fax-soufujo-draft-v1'] || '').includes('ZZ'));
  assert.strictEqual(storage['kyugyo-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['juryosho-draft-v1'], '{"y":1}');
});

console.log('fax-soufujo.test.js: ' + passed + ' 件すべて通過');
