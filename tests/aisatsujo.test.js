/*
 * 開業挨拶状(/aisatsujo)のテスト。依存パッケージなしで動かす。
 *   実行: node tests/aisatsujo.test.js
 *
 * 前半は aisatsujo-core.js の判断(和暦・漢数字・時候の挨拶・句読点・独立の文面)を直接確かめる。
 * 後半はページ側の読み合わせ。記事に載せた例文がツールの出力と一字違わないか、
 * 画面が参照する id がすべて HTML に在るか、紙面の位置が紙端から 10mm 以上か。
 *
 * ⚠ 実物のはがき・実機のプリンターでは1度も確かめていない。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AS = require('../public/aisatsujo-core.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'aisatsujo.html'), 'utf8');
const view = fs.readFileSync(path.join(PUBLIC, 'aisatsujo.js'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'aisatsujo.css'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const BASE = {
  kind: 'new',
  openDate: '2026-10-01',
  letterDate: '2026-10-05',
  shopName: '中村デザイン事務所',
  business: 'Webサイトの制作',
  formerEmployer: '',
  title: '代表',
  name: '中村 太郎',
  zip: '1000001',
  address: '東京都千代田区千代田1-2-3\nサンプルビル2階',
  tel: '03-1234-5678',
  email: 'info@example.com',
  punctuation: false,
  kanji: true
};
const build = (over) => AS.buildLetter(Object.assign({}, BASE, over));

console.log('aisatsujo.test.js');

// ── 数字と日付 ───────────────────────────────────────
test('日付の漢数字は位取りする(10 → 十、21 → 二十一)', () => {
  assert.strictEqual(AS.toKanjiNumber(1), '一');
  assert.strictEqual(AS.toKanjiNumber(10), '十');
  assert.strictEqual(AS.toKanjiNumber(12), '十二');
  assert.strictEqual(AS.toKanjiNumber(21), '二十一');
  assert.strictEqual(AS.toKanjiNumber(30), '三十');
  assert.strictEqual(AS.toKanjiNumber(0), '');
  assert.strictEqual(AS.toKanjiNumber(100), '');
});

test('番地と電話番号は1字ずつ(12 → 一二)。/atena と同じ規則', () => {
  assert.strictEqual(AS.toVerticalNumerals('1-2-12'), '一ー二ー一二');
  assert.strictEqual(AS.toVerticalNumerals('０３−１２'), '〇三ー一二');
});

test('開業日は令和で日まで、差出日は月まで', () => {
  assert.strictEqual(AS.formatOpenDate('2026-10-01'), '令和八年十月一日');
  assert.strictEqual(AS.formatOpenDate('2027-12-31'), '令和九年十二月三十一日');
  assert.strictEqual(AS.formatLetterMonth('2026-10-05'), '令和八年十月');
});

test('令和元年は「元年」。令和より前と暦に無い日付は読まない', () => {
  assert.strictEqual(AS.formatOpenDate('2019-05-01'), '令和元年五月一日');
  assert.strictEqual(AS.formatOpenDate('2019-04-30'), '');
  assert.strictEqual(AS.formatOpenDate('2026-02-30'), '');
  assert.strictEqual(AS.formatOpenDate(''), '');
});

test('時候の挨拶は差出日の月で1つに決まり、12か月とも別の語', () => {
  assert.strictEqual(AS.seasonFor('2026-10-05'), '秋冷');
  assert.strictEqual(AS.seasonFor('2027-01-10'), '新春');
  assert.strictEqual(AS.seasonFor('2026-07-01'), '盛夏');
  const all = Object.keys(AS.SEASONS).map((k) => AS.SEASONS[k]);
  assert.strictEqual(all.length, 12);
  assert.strictEqual(new Set(all).size, 12);
  assert.ok(build({ letterDate: '2026-07-01' }).body[0].includes('盛夏の候'));
});

// ── 文面 ─────────────────────────────────────────────
test('既定は句読点を打たない。本文のどこにも「、」「。」が無い', () => {
  const l = build();
  l.body.forEach((p) => assert.ok(!/[、。]/.test(p), p));
});

test('句読点を選ぶと、各段落が「。」で終わり、空白の区切りが「、」になる', () => {
  const l = build({ punctuation: true });
  l.body.forEach((p) => assert.ok(p.endsWith('。'), p));
  assert.ok(l.body[0].includes('秋冷の候、皆様には'), l.body[0]);
});

test('拝啓で始めたら敬具で閉じる', () => {
  const l = build();
  assert.ok(l.body[0].startsWith('拝啓'));
  assert.strictEqual(l.closing, '敬具');
});

test('新しく始めた場合は、退職・在職の語を出さない', () => {
  const t = build().body.join('\n');
  assert.ok(!/退職|在職/.test(t), t);
});

test('独立の場合は、退職の報告と在職中のお礼が入る。前職が空なら「勤務先を退職し」', () => {
  const a = build({ kind: 'independent', formerEmployer: '株式会社サンプル' }).body.join('\n');
  assert.ok(a.includes('株式会社サンプルを退職し'), a);
  assert.ok(a.includes('在職中は'), a);
  const b = build({ kind: 'independent' }).body.join('\n');
  assert.ok(b.includes('勤務先を退職し'), b);
});

test('すべて埋めれば、紙面に仮置きの「〇〇」は残らない', () => {
  const l = build();
  const all = l.body.concat([l.date, l.shopName, l.representative]).join('\n');
  assert.ok(!all.includes('〇〇'), all);
  assert.deepStrictEqual(AS.findProblems(l, BASE), []);
});

test('空欄は警告に出る。読めない日付は「読めません」と言う', () => {
  const input = Object.assign({}, BASE, { shopName: '', openDate: '2018-01-01', zip: '12' });
  const p = AS.findProblems(AS.buildLetter(input), input);
  assert.ok(p.includes('屋号・会社名'), p);
  assert.ok(p.some((s) => s.startsWith('開業日(')), p);
  assert.ok(p.some((s) => s.startsWith('郵便番号(')), p);
});

test('住所と電話は漢数字、漢数字を外せば半角のまま', () => {
  const l = build();
  assert.strictEqual(l.address[0], '東京都千代田区千代田一ー二ー三');
  assert.strictEqual(l.tel, '電話　〇三ー一二三四ー五六七八');
  assert.strictEqual(build({ kanji: false }).address[0], '東京都千代田区千代田1ー2ー3');
});

test('会計・税務・法的な判断に触れる語を紙面に出さない', () => {
  const t = build({ kind: 'independent', formerEmployer: 'X' }).body.join('\n');
  assert.ok(!/税|開業届|競業|法的|契約/.test(t), t);
});

// ── ページ ───────────────────────────────────────────
test('記事に載せた例文は、ツールの出力と一字違わない(新規・独立の両方)', () => {
  const notes = [...html.matchAll(/<div class="note">([\s\S]*?)<\/div>/g)].map((m) =>
    [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((p) => p[1]));
  const input = Object.assign({}, BASE, { letterDate: '2026-10-01' });
  const l = AS.buildLetter(input);
  assert.deepStrictEqual(notes[0], l.body.concat([l.closing, l.date]));
  const ind = AS.buildLetter(Object.assign({}, input, { kind: 'independent', formerEmployer: '株式会社サンプル' }));
  assert.deepStrictEqual(notes[1], ind.body.slice(1, 3));
});

test('記事の時候の挨拶の表は、ツールの表と同じ', () => {
  for (let m = 1; m <= 12; m++) {
    assert.ok(html.includes('<td>' + m + '月</td><td>' + AS.SEASONS[m] + 'の候</td>'), m + '月');
  }
});

test('画面のスクリプトが参照する id は、すべて HTML に在る', () => {
  const ids = [...view.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 15, ids.length);
  ids.forEach((id) => assert.ok(html.includes('id="' + id + '"'), id));
});

test('title と h1 は同じで、32字以内で「開業挨拶状」から始まる', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)[1];
  assert.strictEqual(title, h1);
  assert.ok(title.startsWith('開業挨拶状'), title);
  assert.ok([...title].length <= 32, [...title].length);
});

test('紙面の位置はすべて mm で、紙端から 10mm 以上(@page は余白0の名前付き)', () => {
  assert.ok(/@page aisatsujo\s*\{[^}]*size:\s*100mm 148mm;[^}]*margin:\s*0;/.test(css));
  assert.ok(!/@page\s*\{/.test(css), '名前の無い @page は A4 の設定を壊す');
  const block = /\.as-text\s*\{([^}]*)\}/.exec(css)[1];
  ['top', 'right', 'bottom', 'left'].forEach((side) => {
    const m = new RegExp('\\b' + side + ':\\s*([0-9.]+)(\\w+);').exec(block);
    assert.ok(m, side);
    assert.strictEqual(m[2], 'mm', side);
    assert.ok(Number(m[1]) >= 10, side + ' ' + m[1]);
  });
});

test('母屋 /kaigyo と sitemap から辿れる', () => {
  const hub = fs.readFileSync(path.join(PUBLIC, 'kaigyo.html'), 'utf8');
  const sitemap = fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
  assert.ok(hub.includes('href="/aisatsujo"'));
  assert.ok(sitemap.includes('<loc>https://invoice-tool-kohl.vercel.app/aisatsujo</loc>'));
});

console.log(passed + ' passed');
