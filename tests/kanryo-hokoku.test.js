/*
 * 業務完了報告書(/kanryo-hokoku)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/kanryo-hokoku.test.js
 *
 * 前半は kanryo-hokoku-core.js の判断(空行・10行の上限・日付の前後・確認欄・警告)を直接確かめる。
 * 後半は kanryo-hokoku.js を小さな偽の DOM で実際に動かし、下書きの保存と「入力をすべて消す」を確かめる。
 *
 * ⚠ 印刷の見た目は、このテストでは確かめていない。A4 の PDF に出して1ページに収まるかは別に測る。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SK = require('../public/shukkin-core.js');
const KH = require('../public/kanryo-hokoku-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'kanryo-hokoku.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'kanryo-hokoku.js'), 'utf8');
const core = fs.readFileSync(path.join(PUBLIC, 'kanryo-hokoku-core.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const ROW = { name: 'トップページのデザインと実装', qty: '1', unit: '式' };
const base = (rows, extra) => Object.assign({
  issueDate: '2026-11-15', to: '株式会社○○', honorific: '御中', from: '山田デザイン事務所', fromAddress: '', person: '',
  subject: 'コーポレートサイト制作業務', startDate: '2026-10-01', endDate: '2026-11-14', doneDate: '2026-11-14',
  place: '', note: '', confirm: 'on', rows
}, extra || {});

console.log('kanryo-hokoku.test.js');

// ── 組み立て ────────────────────────────────────────────
test('作業も数量も単位も空の行は数えない。番号は詰めて振る', () => {
  const b = KH.buildSheet(base([ROW, { name: '', qty: '', unit: '' }, ROW]));
  assert.strictEqual(b.rows.length, 2);
  assert.deepStrictEqual(b.rows.map((r) => r.no), [1, 2]);
});

test('数量と単位は任意。入れたときは書いたとおりに出す(読み替えない・計算しない)', () => {
  const b = KH.buildSheet(base([{ name: '定例の打ち合わせ', qty: ' 2回 ', unit: '' }, { name: '公開作業', qty: '', unit: '' }]));
  assert.strictEqual(b.rows[0].qty, '2回');
  assert.strictEqual(b.rows[1].qty, '');
  assert.deepStrictEqual(KH.findProblems(base([{ name: '公開作業', qty: '', unit: '' }])), []);
});

test('金額・合計・税を持たない(組み立てた結果にも、コードにも無い)', () => {
  const b = KH.buildSheet(base([ROW]));
  for (const k of Object.keys(b)) assert.ok(!/amount|total|tax|price/i.test(k), k);
  assert.ok(!/parseAmount|formatNumber/.test(core), '金額の読み取りを使っている');
});

test('日付は「2026年11月14日」の形。空・不正な日付は空欄のまま(今日にしない)', () => {
  const b = KH.buildSheet(base([ROW], { doneDate: '2026-13-40' }));
  assert.strictEqual(b.issueDateText, '2026年11月15日');
  assert.strictEqual(b.doneDateText, '');
  assert.strictEqual(KH.buildSheet(base([ROW])).doneDateText, SK.formatDateJa('2026-11-14'));
});

test('作業期間は「始まり 〜 終わり」。片方だけならその側だけ、両方空なら空欄', () => {
  assert.strictEqual(KH.buildSheet(base([ROW])).periodText, '2026年10月1日 〜 2026年11月14日');
  assert.strictEqual(KH.buildSheet(base([ROW], { endDate: '' })).periodText, '2026年10月1日 〜 ');
  assert.strictEqual(KH.buildSheet(base([ROW], { startDate: '' })).periodText, ' 〜 2026年11月14日');
  assert.strictEqual(KH.buildSheet(base([ROW], { startDate: '', endDate: '' })).periodText, '');
});

test('敬称は「御中」「様」だけ。それ以外は「御中」に戻す', () => {
  assert.strictEqual(KH.buildSheet(base([ROW], { honorific: '様' })).honorific, '様');
  assert.strictEqual(KH.buildSheet(base([ROW], { honorific: '殿<b>' })).honorific, '御中');
});

test('確認欄は「つけない」と明示したときだけ消える。知らない値は「つける」', () => {
  assert.strictEqual(KH.buildSheet(base([ROW])).confirm, 'on');
  assert.strictEqual(KH.buildSheet(base([ROW], { confirm: 'off' })).confirm, 'off');
  assert.strictEqual(KH.buildSheet(base([ROW], { confirm: 'x' })).confirm, 'on');
  assert.strictEqual(KH.buildSheet(base([ROW], { confirm: undefined })).confirm, 'on');
});

test('11行目以降は紙面に出さず、overflow に数を残す', () => {
  const b = KH.buildSheet(base(Array.from({ length: 12 }, () => ROW)));
  assert.strictEqual(b.rows.length, KH.MAX_ROWS);
  assert.strictEqual(b.overflow, 2);
  assert.ok(KH.findProblems(base(Array.from({ length: 11 }, () => ROW))).some((m) => m.includes('11行目以降は紙面に出ていません')));
});

// ── 警告 ────────────────────────────────────────────────
test('報告先・報告する側・件名・完了日・明細が空なら、そう言う', () => {
  const p = KH.findProblems(base([], { to: '', from: '', subject: '', doneDate: '' }));
  assert.ok(p.some((m) => m.startsWith('報告先')));
  assert.ok(p.some((m) => m.startsWith('報告する側')));
  assert.ok(p.some((m) => m.startsWith('件名')));
  assert.ok(p.some((m) => m.startsWith('完了日が入っていません')));
  assert.ok(p.some((m) => m.includes('明細が1行もありません')));
});

test('日付が前後していたら知らせる(同じ日は知らせない)', () => {
  const p = KH.findProblems(base([ROW], { startDate: '2026-11-10', endDate: '2026-11-05', doneDate: '2026-11-01', issueDate: '2026-10-31' }));
  assert.ok(p.includes('作業期間の終わりが、始まりより前になっています。'));
  assert.ok(p.includes('完了日が、作業期間の始まりより前になっています。'));
  assert.ok(p.includes('報告日が完了日より前になっています。'));
  assert.deepStrictEqual(KH.findProblems(base([ROW], {
    startDate: '2026-11-15', endDate: '2026-11-15', doneDate: '2026-11-15', issueDate: '2026-11-15'
  })), []);
});

test('完了日が作業期間の終わりより後でも前でも、知らせない(検品や手直しの日数は判断しない)', () => {
  assert.deepStrictEqual(KH.findProblems(base([ROW], { endDate: '2026-11-10', doneDate: '2026-11-14' })), []);
  assert.deepStrictEqual(KH.findProblems(base([ROW], { endDate: '2026-11-14', doneDate: '2026-11-10' })), []);
});

test('作業期間・作業場所・備考は任意。空でも警告しない', () => {
  assert.deepStrictEqual(KH.findProblems(base([ROW], { startDate: '', endDate: '', place: '', note: '' })), []);
});

test('欠けた欄・長すぎる文字を、場所つきで言う', () => {
  const rows = [
    { name: '', qty: '10', unit: '個' },
    { name: 'あ'.repeat(KH.LIMITS.name + 1), qty: '', unit: 'あ'.repeat(KH.LIMITS.unit + 1) },
    { name: 'x', qty: '1'.repeat(KH.LIMITS.qty + 1), unit: '' }
  ];
  const p = KH.findProblems(base(rows, {
    subject: 'あ'.repeat(KH.LIMITS.subject + 1), place: 'あ'.repeat(KH.LIMITS.place + 1),
    note: 'あ'.repeat(KH.LIMITS.note + 1)
  }));
  assert.ok(p.includes('1行目: 行った作業・成果物が入っていません。'));
  assert.ok(p.some((m) => m.startsWith('2行目: 行った作業・成果物が' + (KH.LIMITS.name + 1) + '字')));
  assert.ok(!p.some((m) => m.startsWith('2行目: 数量が入っていません')));
  assert.ok(p.some((m) => m.startsWith('2行目: 単位が' + (KH.LIMITS.unit + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('3行目: 数量が' + (KH.LIMITS.qty + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('件名が' + (KH.LIMITS.subject + 1) + '字')));
  assert.ok(p.some((m) => m.startsWith('作業場所が')));
  assert.ok(p.some((m) => m.startsWith('備考が' + (KH.LIMITS.note + 1) + '字')));
});

test('そろった入力には警告を出さない', () => {
  assert.deepStrictEqual(KH.findProblems(base([ROW])), []);
});

// ── ページ ──────────────────────────────────────────────
test('「送信しない」の表示が、ヘッダーと本文の両方に在る', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.includes('入力内容は送信されません'));
  assert.ok(html.includes('サーバーへ送信・保存されることはありません'));
});

test('<title> と <h1> が同じで、title は32文字以内、前半に「業務完了報告書」', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)[1];
  assert.strictEqual(title, h1);
  assert.ok([...title].length <= 32, 'title が ' + [...title].length + ' 文字');
  assert.ok(title.startsWith('業務完了報告書'));
});

test('説明文が約束した「業務委託・作業完了報告書・件名・作業期間・完了日・確認欄」が本文に在る', () => {
  const body = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
  for (const w of ['業務委託', '作業完了報告書', '件名', '作業期間', '完了日', '確認欄']) assert.ok(body.includes(w), w);
});

test('書き方の例は、そのまま入れても警告が出ない', () => {
  const rows = [ROW, { name: '下層ページの作成', qty: '5', unit: 'ページ' }, { name: '公開作業と表示確認', qty: '1', unit: '式' }];
  assert.deepStrictEqual(KH.findProblems(base(rows, { note: '納品データは共有フォルダに置いています' })), []);
  for (const r of rows) assert.ok(html.includes(r.name), r.name);
});

test('判断しないことを、入力欄のそばと本文の両方に書いている', () => {
  assert.ok(html.includes('相手の確認に何日かかるかは、このツールでは判断しません'));
  assert.ok(html.includes('検収が済んだことになるか'));
  assert.ok(html.includes('個別の判断は専門家にご確認ください'));
});

test('入力欄に金額を入れる場所が無い', () => {
  const editor = html.slice(html.indexOf('<section class="editor'), html.indexOf('<!-- ============ プレビュー'));
  assert.ok(!/inputmode="numeric"|金額\(円\)/.test(editor));
  assert.ok(!/金額|単価/.test(view.replace(/\/\*[\s\S]*?\*\//g, '')));
});

test('shukkin-core.js → core → 画面 の順に読む', () => {
  const a = html.indexOf('<script src="/shukkin-core.js"></script>');
  const b = html.indexOf('<script src="/kanryo-hokoku-core.js"></script>');
  const c = html.indexOf('<script src="/kanryo-hokoku.js"></script>');
  assert.ok(a >= 0 && a < b && b < c);
});

test('納品書・母屋と相互にリンクしている', () => {
  for (const f of ['nohinsho.html', 'kaigyo.html']) {
    assert.ok(fs.readFileSync(path.join(PUBLIC, f), 'utf8').includes('href="/kanryo-hokoku"'), f + ' から /kanryo-hokoku へのリンクが無い');
  }
  assert.ok(html.includes('href="/nohinsho"') && html.includes('href="/kaigyo"'));
});

// ── kanryo-hokoku.js を偽の DOM で動かす ───────────────────
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
  const window = { Shukkin: SK, KanryoHokoku: KH, confirm: () => true, print() {} };
  new Function('window', 'document', 'localStorage', view)(window, document, localStorage);
  const fire = (node, type) => (node.listeners[type] || []).forEach((f) => f());
  const typeRow = (i, key, v) => {
    const inp = els.khRows.children[i].querySelectorAll('input[data-key]').find((x) => x.dataset.key === key);
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

test('開いた直後は明細1行。報告日だけ入り、完了日は空、敬称は「御中」、確認欄は「つける」', () => {
  const v = runView({});
  assert.strictEqual(v.els.khRows.children.length, 1);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(v.els.khIssueDate.value));
  assert.strictEqual(v.els.khDoneDate.value, '');
  assert.strictEqual(v.els.khHonorific.value, '御中');
  assert.strictEqual(v.els.khConfirm.value, 'on');
});

test('紙面は常に10行の枠を引き、列は No・作業・数量・単位の4つ(金額の列は無い)', () => {
  const v = runView({});
  v.typeRow(0, 'name', 'ZZ作業'); v.typeRow(0, 'qty', '5'); v.typeRow(0, 'unit', 'ページ');
  v.type('khDoneDate', '2026-11-14'); v.type('khSubject', 'ZZ件名');
  v.type('khStartDate', '2026-10-01'); v.type('khEndDate', '2026-11-14');
  const paper = v.els.khSheet.children[0];
  const table = v.find(paper, 'kh-table');
  assert.deepStrictEqual(table.children[0].children[0].children.map((th) => th.textContent), ['No', '行った作業・成果物', '数量', '単位']);
  const tbody = table.children[1];
  assert.strictEqual(tbody.children.length, KH.MAX_ROWS);
  assert.deepStrictEqual(tbody.children[0].children.map((td) => td.textContent), ['1', 'ZZ作業', '5', 'ページ']);
  assert.strictEqual(tbody.children[1].children[1].textContent, '');
  const box = v.find(paper, 'kh-box');
  assert.deepStrictEqual(box.children.map((tr) => tr.children[0].textContent), ['件名', '作業期間', '完了日', '作業場所']);
  assert.deepStrictEqual(box.children.map((tr) => tr.children[1].textContent), ['ZZ件名', '2026年10月1日 〜 2026年11月14日', '2026年11月14日', '']);
});

test('確認欄は既定で紙に出て、中は空欄。「つけない」にすると枠ごと消える', () => {
  const v = runView({});
  v.type('khTo', 'ZZ発注者'); v.type('khFrom', 'ZZ受注者');
  const confirm = v.find(v.els.khSheet.children[0], 'kh-confirm');
  assert.ok(confirm, '確認欄が出ていない');
  const cells = confirm.children[0].children.map((c) => c.textContent);
  assert.deepStrictEqual(cells, ['確認欄', '確認日　　　　年　　月　　日', 'お名前']);
  assert.ok(!cells.join('').includes('ZZ'), '確認欄に入力値が入っている');
  v.type('khConfirm', 'off');
  assert.strictEqual(v.find(v.els.khSheet.children[0], 'kh-confirm'), null);
  assert.strictEqual(v.find(v.els.khSheet.children[0], 'kh-confirm-lead'), null);
});

test('宛名は「名前　敬称」。名前が空なら敬称だけを紙に出さない。担当者は入れたときだけ出る', () => {
  const v = runView({});
  assert.strictEqual(v.find(v.els.khSheet.children[0], 'kh-to-name').textContent, '');
  v.type('khTo', 'ZZ商事'); v.type('khPerson', 'ZZ担当');
  const paper = v.els.khSheet.children[0];
  assert.strictEqual(v.find(paper, 'kh-to-name').textContent, 'ZZ商事　御中');
  assert.ok(v.find(paper, 'kh-from').children.some((p) => p.textContent === '担当 ZZ担当'));
});

test('10行で「行を足す」ボタンが止まる', () => {
  const v = runView({});
  for (let i = 0; i < 15; i++) v.click('khAdd');
  assert.strictEqual(v.els.khRows.children.length, KH.MAX_ROWS);
  assert.strictEqual(v.els.khAdd.disabled, true);
});

test('入力は kanryo-hokoku-draft-v1 に下書きされ、開き直すと戻る(確認欄の選択も)', () => {
  const storage = {};
  const a = runView(storage);
  a.type('khTo', 'ZZ報告先');
  a.type('khHonorific', '様');
  a.type('khConfirm', 'off');
  a.typeRow(0, 'name', 'ZZ明細の作業');
  assert.ok(storage['kanryo-hokoku-draft-v1'].includes('ZZ明細の作業'));
  const b = runView(storage);
  assert.strictEqual(b.els.khTo.value, 'ZZ報告先');
  assert.strictEqual(b.els.khHonorific.value, '様');
  assert.strictEqual(b.els.khConfirm.value, 'off');
  assert.strictEqual(b.els.khRows.children[0].querySelectorAll('input[data-key]')[0].value, 'ZZ明細の作業');
});

test('「入力をすべて消す」はこのページの下書きだけを消し、他のページの下書きは残す', () => {
  const storage = { 'keihi-draft-v1': '{"x":1}', 'mitsumori-irai-draft-v1': '{"y":1}' };
  const v = runView(storage);
  v.type('khTo', 'ZZ');
  v.click('khClear');
  assert.strictEqual(v.els.khTo.value, '');
  assert.strictEqual(v.els.khConfirm.value, 'on');
  assert.ok(!String(storage['kanryo-hokoku-draft-v1'] || '').includes('ZZ'));
  assert.strictEqual(storage['keihi-draft-v1'], '{"x":1}');
  assert.strictEqual(storage['mitsumori-irai-draft-v1'], '{"y":1}');
});

console.log('kanryo-hokoku.test.js: ' + passed + ' 件すべて通過');
