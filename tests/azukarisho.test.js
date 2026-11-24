/*
 * 預り証(/azukarisho)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/azukarisho.test.js
 *
 * 前半は azukarisho-core.js の判断(空行・8行の上限・日付の前後・3つの切り替え・警告)を直接確かめる。
 * 後半は azukarisho.js を小さな偽の DOM で実際に動かし、紙面・下書きの保存・「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SK = require('../public/shukkin-core.js');
const AZ = require('../public/azukarisho-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'azukarisho.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'azukarisho.js'), 'utf8');
const core = fs.readFileSync(path.join(PUBLIC, 'azukarisho-core.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const ROW = { name: '腕時計', qty: '1', unit: '点', condition: 'ベルトにすり傷・箱あり' };
const base = (rows, extra) => Object.assign({
  issueDate: '2026-11-25', to: '山田 花子', honorific: '様', from: 'さくら時計店', fromAddress: '', person: '',
  subject: '電池交換と点検のため', receivedDate: '2026-11-25', returnDate: '2026-12-02', refNo: 'A-0012', note: '',
  stamp: 'on', returnBox: 'on', pickup: 'on', rows
}, extra || {});

console.log('azukarisho.test.js');

// ── 組み立て ────────────────────────────────────────────
test('品名・数量・単位・状態がすべて空の行は数えない。番号は詰めて振る', () => {
  const b = AZ.buildSheet(base([ROW, { name: '', qty: '', unit: '', condition: '' }, ROW]));
  assert.strictEqual(b.rows.length, 2);
  assert.deepStrictEqual(b.rows.map((r) => r.no), [1, 2]);
});

test('状態だけ入った行は空行と見なさず、品名が無いと警告する', () => {
  const p = AZ.findProblems(base([{ name: '', qty: '', unit: '', condition: '箱あり' }]));
  assert.ok(p.includes('1行目: 預かった品物の名前が入っていません。'));
});

test('数量・単位・状態は任意。入れたときは書いたとおりに出す(読み替えない)', () => {
  const b = AZ.buildSheet(base([{ name: '保証書', qty: ' 1枚 ', unit: '', condition: '' }]));
  assert.strictEqual(b.rows[0].qty, '1枚');
  assert.strictEqual(b.rows[0].condition, '');
  assert.deepStrictEqual(AZ.findProblems(base([{ name: '保証書' }])), []);
});

test('金額・合計・税を持たない(組み立てた結果にも、コードにも無い)', () => {
  const b = AZ.buildSheet(base([ROW]));
  for (const k of Object.keys(b)) assert.ok(!/amount|total|tax|price/i.test(k), k);
  assert.ok(!/parseAmount|formatNumber/.test(core), '金額の読み取りを使っている');
});

test('日付は「2026年11月25日」の形。空・不正な日付は空欄のまま(今日にしない)', () => {
  const b = AZ.buildSheet(base([ROW], { returnDate: '2026-13-40', receivedDate: '' }));
  assert.strictEqual(b.issueDateText, '2026年11月25日');
  assert.strictEqual(b.receivedDateText, '');
  assert.strictEqual(b.returnDateText, '');
  assert.strictEqual(AZ.buildSheet(base([ROW])).returnDateText, SK.formatDateJa('2026-12-02'));
});

test('敬称は「様」「御中」だけ。既定と知らない値は「様」', () => {
  assert.strictEqual(AZ.buildSheet(base([ROW], { honorific: '御中' })).honorific, '御中');
  assert.strictEqual(AZ.buildSheet(base([ROW], { honorific: '殿<b>' })).honorific, '様');
  assert.strictEqual(AZ.buildSheet(base([ROW], { honorific: undefined })).honorific, '様');
});

test('印の枠・お返しの欄・引き取りの一文は「つけない」と明示したときだけ消える', () => {
  for (const k of ['stamp', 'returnBox', 'pickup']) {
    assert.strictEqual(AZ.buildSheet(base([ROW]))[k], 'on', k);
    assert.strictEqual(AZ.buildSheet(base([ROW], { [k]: 'off' }))[k], 'off', k);
    assert.strictEqual(AZ.buildSheet(base([ROW], { [k]: 'x' }))[k], 'on', k);
    assert.strictEqual(AZ.buildSheet(base([ROW], { [k]: undefined }))[k], 'on', k);
  }
});

test('9行目以降は紙面に出さず、overflow に数を残す', () => {
  const b = AZ.buildSheet(base(Array.from({ length: 11 }, () => ROW)));
  assert.strictEqual(AZ.MAX_ROWS, 8);
  assert.strictEqual(b.rows.length, 8);
  assert.strictEqual(b.overflow, 3);
  assert.ok(AZ.findProblems(base(Array.from({ length: 9 }, () => ROW))).some((m) => m.includes('9行目以降は紙面に出ていません')));
});

// ── 警告 ────────────────────────────────────────────────
test('宛先・預かった側・預かった日・明細が空なら、そう言う', () => {
  const p = AZ.findProblems(base([], { to: '', from: '', receivedDate: '', returnDate: '' }));
  assert.ok(p.some((m) => m.startsWith('宛先')));
  assert.ok(p.some((m) => m.startsWith('預かった側')));
  assert.ok(p.includes('預かった日が入っていません。'));
  assert.ok(p.some((m) => m.includes('明細が1行もありません')));
});

test('返す予定日が預かった日より前なら知らせる(同じ日・後の日・空は知らせない)', () => {
  const msg = 'お返しする予定日が預かった日より前になっています。';
  assert.ok(AZ.findProblems(base([ROW], { returnDate: '2026-11-24' })).includes(msg));
  assert.deepStrictEqual(AZ.findProblems(base([ROW], { returnDate: '2026-11-25' })), []);
  assert.deepStrictEqual(AZ.findProblems(base([ROW], { returnDate: '' })), []);
});

test('発行日が預かった日より前なら知らせる', () => {
  assert.ok(AZ.findProblems(base([ROW], { issueDate: '2026-11-24' })).includes('発行日が預かった日より前になっています。'));
});

test('用件・預り番号・備考・返す予定日は任意。空でも警告しない', () => {
  assert.deepStrictEqual(AZ.findProblems(base([ROW], { subject: '', refNo: '', note: '', returnDate: '' })), []);
});

test('長すぎる文字を、場所つきで言う', () => {
  const L = AZ.LIMITS;
  const rows = [
    { name: 'あ'.repeat(L.name + 1), qty: '1'.repeat(L.qty + 1), unit: 'あ'.repeat(L.unit + 1), condition: 'あ'.repeat(L.condition + 1) }
  ];
  const p = AZ.findProblems(base(rows, {
    subject: 'あ'.repeat(L.subject + 1), refNo: 'あ'.repeat(L.refNo + 1), note: 'あ'.repeat(L.note + 1)
  }));
  assert.ok(p.some((m) => m.startsWith('1行目: 品物の名前が' + (L.name + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('1行目: 数量が' + (L.qty + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('1行目: 単位が' + (L.unit + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('1行目: 状態・付属品が' + (L.condition + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('用件が' + (L.subject + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('預り番号が' + (L.refNo + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('備考が' + (L.note + 1) + '字')));
});

test('ちょうど上限の文字数なら警告しない', () => {
  const L = AZ.LIMITS;
  const rows = [{ name: 'あ'.repeat(L.name), qty: '1'.repeat(L.qty), unit: 'あ'.repeat(L.unit), condition: 'あ'.repeat(L.condition) }];
  assert.deepStrictEqual(AZ.findProblems(base(rows, { subject: 'あ'.repeat(L.subject), refNo: 'あ'.repeat(L.refNo), note: 'あ'.repeat(L.note) })), []);
});

// ── ページ ──────────────────────────────────────────────
test('「送信しない」の表示が、ヘッダーと本文の両方に在る', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.includes('入力内容は送信されません'));
  assert.ok(html.includes('サーバーへ送信・保存されることはありません'));
});

test('<title> と <h1> が同じで、title は32文字以内、前半に「預り証」', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)[1];
  assert.strictEqual(title, h1);
  assert.ok([...title].length <= 32, 'title が ' + [...title].length + ' 文字');
  assert.ok(title.startsWith('預り証'));
});

test('説明文が約束した「預かり証・品名・状態・お返しの欄・印の枠」がページに在る', () => {
  for (const w of ['預かり証', '品名', '状態・付属品', 'お返しの欄', '預かった側の印']) assert.ok(html.includes(w), w);
});

test('書き方の例は、そのまま入れても警告が出ない', () => {
  const rows = [ROW, { name: '保証書', qty: '1', unit: '枚', condition: '' }];
  assert.deepStrictEqual(AZ.findProblems(base(rows, { note: '仕上がりのご連絡はお電話で差し上げます' })), []);
  for (const w of ['腕時計', 'ベルトにすり傷・箱あり', '保証書', '電池交換と点検のため', 'A-0012']) assert.ok(html.includes(w), w);
});

test('判断しないことを、入力欄のそばと本文の両方に書いている', () => {
  const editor = html.slice(html.indexOf('<section class="editor'), html.indexOf('<!-- ============ プレビュー'));
  assert.ok(editor.includes('期限を過ぎたときの扱いは、このツールでは決めません'));
  assert.ok(editor.includes('お金(保証金・敷金など)を預かるときの紙は扱いません'));
  assert.ok(html.includes('この紙に収入印紙が要るかは扱いません'));
  assert.ok(html.includes('個別の判断は専門家にご確認ください'));
});

test('入力欄に金額を入れる場所が無い', () => {
  const editor = html.slice(html.indexOf('<section class="editor'), html.indexOf('<!-- ============ プレビュー'));
  assert.ok(!/inputmode="numeric"|金額\(円\)/.test(editor));
  assert.ok(!/金額|単価/.test(view.replace(/\/\*[\s\S]*?\*\//g, '')));
});

test('shukkin-core.js → core → 画面 の順に読む', () => {
  const a = html.indexOf('<script src="/shukkin-core.js"></script>');
  const b = html.indexOf('<script src="/azukarisho-core.js"></script>');
  const c = html.indexOf('<script src="/azukarisho.js"></script>');
  assert.ok(a >= 0 && a < b && b < c);
});

test('受領書・母屋と相互にリンクし、sitemap に載っている', () => {
  for (const f of ['juryosho.html', 'kaigyo.html']) {
    assert.ok(fs.readFileSync(path.join(PUBLIC, f), 'utf8').includes('href="/azukarisho"'), f + ' から /azukarisho へのリンクが無い');
  }
  assert.ok(html.includes('href="/juryosho"') && html.includes('href="/kaigyo"'));
  assert.ok(fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8').includes('<loc>https://invoice-tool-kohl.vercel.app/azukarisho</loc>'));
});

// ── azukarisho.js を偽の DOM で動かす ───────────────────
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
  const window = { Shukkin: SK, Azukarisho: AZ, confirm: () => true, print() {} };
  new Function('window', 'document', 'localStorage', view)(window, document, localStorage);
  const fire = (node, type) => (node.listeners[type] || []).forEach((f) => f());
  const typeRow = (i, key, v) => {
    const inp = els.azRows.children[i].querySelectorAll('input[data-key]').find((x) => x.dataset.key === key);
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

test('開いた直後は明細1行。発行日だけ入り、預かった日は空、敬称は「様」、3つの切り替えは「つける」', () => {
  const v = runView({});
  assert.strictEqual(v.els.azRows.children.length, 1);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(v.els.azIssueDate.value));
  assert.strictEqual(v.els.azReceivedDate.value, '');
  assert.strictEqual(v.els.azHonorific.value, '様');
  for (const id of ['azStamp', 'azReturnBox', 'azPickup']) assert.strictEqual(v.els[id].value, 'on', id);
});

test('紙面は常に8行の枠を引き、列は No・品名・数量・単位・状態・付属品の5つ', () => {
  const v = runView({});
  v.typeRow(0, 'name', 'ZZ品名'); v.typeRow(0, 'qty', '1'); v.typeRow(0, 'unit', '点'); v.typeRow(0, 'condition', 'ZZ傷');
  v.type('azReceivedDate', '2026-11-25'); v.type('azReturnDate', '2026-12-02'); v.type('azSubject', 'ZZ用件'); v.type('azRefNo', 'ZZ-1');
  const paper = v.els.azSheet.children[0];
  const table = v.find(paper, 'az-table');
  assert.deepStrictEqual(table.children[0].children[0].children.map((th) => th.textContent), ['No', '品名', '数量', '単位', '状態・付属品']);
  const tbody = table.children[1];
  assert.strictEqual(tbody.children.length, AZ.MAX_ROWS);
  assert.deepStrictEqual(tbody.children[0].children.map((td) => td.textContent), ['1', 'ZZ品名', '1', '点', 'ZZ傷']);
  const box = v.find(paper, 'az-box');
  assert.deepStrictEqual(box.children.map((tr) => tr.children[0].textContent), ['お預かりした日', 'お返しする予定日', '用件', '預り番号']);
  assert.deepStrictEqual(box.children.map((tr) => tr.children[1].textContent), ['2026年11月25日', '2026年12月2日', 'ZZ用件', 'ZZ-1']);
});

test('お返しの欄・印の枠は既定で紙に出て中は空欄。「つけない」で消え、両方消すと下の段ごと出ない', () => {
  const v = runView({});
  let paper = v.els.azSheet.children[0];
  const ret = v.find(paper, 'az-return');
  assert.ok(ret, 'お返しの欄が出ていない');
  assert.strictEqual(ret.children[2].children[1].textContent, '');
  const stamp = v.find(paper, 'az-stamp');
  assert.deepStrictEqual(stamp.children[0].children.map((c) => c.textContent), ['預かった側の印', '']);
  v.type('azReturnBox', 'off');
  paper = v.els.azSheet.children[0];
  assert.strictEqual(v.find(paper, 'az-return'), null);
  assert.ok(v.find(paper, 'az-stamp'));
  v.type('azStamp', 'off');
  assert.strictEqual(v.find(v.els.azSheet.children[0], 'az-foot'), null);
});

test('引き取りの一文は既定で出て、「つけない」で消える', () => {
  const v = runView({});
  assert.strictEqual(v.find(v.els.azSheet.children[0], 'az-pickup').textContent, AZ.PICKUP_TEXT);
  v.type('azPickup', 'off');
  assert.strictEqual(v.find(v.els.azSheet.children[0], 'az-pickup'), null);
});

test('宛名は「名前　敬称」。名前が空なら敬称だけを紙に出さない', () => {
  const v = runView({});
  assert.strictEqual(v.find(v.els.azSheet.children[0], 'az-to-name').textContent, '');
  v.type('azTo', 'ZZ花子');
  assert.strictEqual(v.find(v.els.azSheet.children[0], 'az-to-name').textContent, 'ZZ花子　様');
});

test('8行で「行を足す」ボタンが止まる', () => {
  const v = runView({});
  for (let i = 0; i < 15; i++) v.click('azAdd');
  assert.strictEqual(v.els.azRows.children.length, AZ.MAX_ROWS);
  assert.strictEqual(v.els.azAdd.disabled, true);
});

test('入力は azukarisho-draft-v1 に下書きされ、開き直すと戻る(切り替えの選択も)', () => {
  const storage = {};
  const a = runView(storage);
  a.type('azTo', 'ZZ宛先');
  a.type('azHonorific', '御中');
  a.type('azReturnBox', 'off');
  a.typeRow(0, 'condition', 'ZZ状態');
  assert.ok(storage['azukarisho-draft-v1'].includes('ZZ状態'));
  const b = runView(storage);
  assert.strictEqual(b.els.azTo.value, 'ZZ宛先');
  assert.strictEqual(b.els.azHonorific.value, '御中');
  assert.strictEqual(b.els.azReturnBox.value, 'off');
  assert.strictEqual(b.els.azRows.children[0].querySelectorAll('input[data-key]')[3].value, 'ZZ状態');
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'juryosho-draft-v1': '{"x":1}', 'nefuda-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('azTo', 'ZZ');
  v.click('azClear');
  assert.strictEqual(v.els.azTo.value, '');
  assert.strictEqual(v.els.azStamp.value, 'on');
  assert.ok(!String(storage['azukarisho-draft-v1'] || '').includes('ZZ'));
  assert.strictEqual(storage['juryosho-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['nefuda-draft-v1'], '{"y":1}');
});

console.log('azukarisho.test.js: ' + passed + ' 件すべて通過');
