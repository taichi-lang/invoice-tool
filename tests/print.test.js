/*
 * 印刷紙面(@media print)の回帰テスト。依存パッケージなしで動かす。
 *   実行: node tests/print.test.js
 *
 * 2026-09-01、Chrome ヘッドレスで実際にA4のPDFを出して分かった欠陥2件を守るためのテスト。
 *   ・明細15行: 「小計・消費税」が1ページ目、「合計・源泉徴収・お振込金額」が2ページ目に割れた
 *   ・明細8行 : 見出し「お振込先」「備考」だけが1ページ目に残り、中身が2ページ目に落ちた
 * PDFそのものを毎回出すことはこのテストではできないため、
 * 割れを防いでいる宣言が @media print の中に在り続けることを確かめる。
 * 修正前の style.css では下の4件すべてが落ちる(落ちなければテストの意味がない)。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

/** @media print { ... } の中身だけを取り出す(入れ子の波かっこを数える)。 */
function printBlock(source) {
  const start = source.indexOf('@media print');
  assert.notStrictEqual(start, -1, '@media print が style.css に無い');
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error('@media print の閉じかっこが見つからない');
}

// コメントは先に落とす(セレクタの手前に付いたコメントを名前の一部と読んでしまうため)
const block = printBlock(css).replace(/\/\*[\s\S]*?\*\//g, '');
const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

/** セレクタに break-inside: avoid が当たっているか(同じ宣言に並記されていてもよい)。 */
function avoidsBreak(selector) {
  const rules = block.split('}');
  return rules.some((rule) => {
    const [head, body] = rule.split('{');
    if (!body) return false;
    const selectors = head.split(',').map((s) => s.trim());
    return selectors.includes(selector) && /break-inside\s*:\s*avoid/.test(body);
  });
}

/** @page { ... } の中身を取り出す(@media print の外にある)。 */
function pageBlock(source) {
  const m = /@page\s*\{([^}]*)\}/.exec(source);
  assert.ok(m, 'style.css に @page が無い');
  return m[1].replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 「15mm」のような長さを数値(mm)にする。0 は単位なしでも通す。 */
function mm(value) {
  const m = /^(\d+(?:\.\d+)?)(mm)?$/.exec(String(value).trim());
  assert.ok(m, '長さを mm で読めない: ' + value);
  assert.ok(m[2] || Number(m[1]) === 0, '長さの単位が mm でない: ' + value);
  return Number(m[1]);
}

/** @page の余白を「上・左右・下」で読む(margin: 15mm 14mm 0 の形を前提にする)。 */
const pageMargin = (() => {
  const decl = /margin\s*:\s*([^;]+);/.exec(pageBlock(css));
  assert.ok(decl, '@page に margin が無い');
  const p = decl[1].trim().split(/\s+/);
  // CSS の短縮記法をそのまま読む(1値〜4値)。テストが読み取りで落ちると、
  // どのテストが何を守っているのか分からなくなるため、ここでは判定しない。
  const four = p.length === 1 ? [p[0], p[0], p[0], p[0]]
    : p.length === 2 ? [p[0], p[1], p[0], p[1]]
    : p.length === 3 ? [p[0], p[1], p[2], p[1]]
    : p.slice(0, 4);
  return { top: four[0], side: four[1], bottom: four[2], raw: decl[1].trim() };
})();

test('2ページ目の本文が、紙の上端から余白なしで始まらない', function () {
  // 2026-09-14、Chrome ヘッドレスで実際にA4のPDFを出して測って分かった欠陥:
  //   明細14行(2ページになる請求書)の2ページ目の本文が、紙の上端から 0.4mm で始まっていた。
  //   明細20行・30行でも 2.8mm。1ページ目は 16.0mm で正しい。
  //   原因は、紙の余白を .paper の padding で取っていたこと。
  //   padding は箱の上端に1回しか付かないので、2ページ目には乗らない。
  //   多くのプリンタは上下 4〜5mm を印字できないため、これは欠けて出る。
  // 直し: 余白を @page に移した(すべてのページに付く)。
  //   実測: 2ページ目の本文の始まり 0.4mm → 15.5mm(明細14行)/ 2.8mm → 17.9mm(同20行・30行)。
  //   1ページ目の本文の始まりは 16.0mm のまま変わっていない。
  assert.ok(mm(pageMargin.top) >= 10, '@page の上余白が 10mm 未満(2ページ目の本文が紙の端から始まる): ' + pageMargin.top);
  assert.ok(mm(pageMargin.side) >= 10, '@page の左右余白が 10mm 未満: ' + pageMargin.side);
});

test('@page の下余白は 0 のまま(1枚に載る量を減らさない)', function () {
  // 下余白を 0 以外にすると1ページに載る量が減り、いままで1枚だった書類が2枚になる。
  // 2026-09-14 に明細 1〜30行で測り、@page の下余白を 15mm にすると
  // 明細12行・13行が1枚ぶん増えた。0 にしたときはページ数が全部そのままだった。
  assert.ok(
    /^0(mm|px|)$/.test(pageMargin.bottom),
    '@page の下余白が 0 でない(1枚に載る量が減る): ' + pageMargin.bottom
  );
});

test('書類の紙面は、自分では余白を取らない(余白は @page が持つ)', function () {
  // .paper の padding で余白を取ると、2ページ目に乗らない(上のテストの欠陥そのもの)。
  const m = /(?:^|\})\s*\.paper\s*\{([^}]*)\}/.exec(block);
  assert.ok(m, '@media print に .paper が無い');
  const pad = /padding\s*:\s*([^;]+);/.exec(m[1]);
  assert.ok(pad, '@media print の .paper に padding が無い');
  assert.ok(
    /^0(mm|px|)$/.test(pad[1].trim()),
    '.paper が自分で余白を取っている(2ページ目に乗らない): padding: ' + pad[1].trim()
  );
});

test('合計欄(小計〜お振込金額)をページで割らない', () => {
  assert.ok(avoidsBreak('.totals'), '.totals に break-inside: avoid が無い');
  assert.ok(avoidsBreak('.totals table'), '.totals table に break-inside: avoid が無い');
});

test('税率ごとの内訳をページで割らない', () => {
  assert.ok(avoidsBreak('.tax-breakdown'), '.tax-breakdown に break-inside: avoid が無い');
});

test('お振込先・備考は、見出しと中身を同じページに置く', () => {
  assert.ok(avoidsBreak('.paper-foot .bank'), '.paper-foot .bank に break-inside: avoid が無い');
  assert.ok(avoidsBreak('.paper-foot .notes'), '.paper-foot .notes に break-inside: avoid が無い');
});

test('ご請求金額の帯をページで割らない', () => {
  assert.ok(avoidsBreak('.grand'), '.grand に break-inside: avoid が無い');
});

test('明細の見出し行は、2ページ目以降にも繰り返す', () => {
  assert.ok(
    /table\.items\s+thead\s*\{[^}]*display\s*:\s*table-header-group/.test(block),
    'table.items thead に display: table-header-group が無い'
  );
});

test('明細の1行はページ内で割らない(既存の宣言が消えていないこと)', () => {
  assert.ok(avoidsBreak('table.items tr'), 'table.items tr に break-inside: avoid が無い');
});

test('印影の高さ確保が、紙面でも効いている', () => {
  // 2026-09-04、A4のPDFを実際に出して確かめた。
  //   min-height あり: 印影の下端 291.1pt / 明細見出しの上端 320.6pt(29.5pt 空く)
  //   min-height なし: 明細見出し「金額」が 282.4〜294.6pt に上がり、印影に重なる(対照)
  // 画面では 09-03 に直したが、紙面で確かめたのは 09-04 である。
  assert.ok(
    /\.from\.has-seal\s*\{[^}]*min-height\s*:\s*20mm/.test(css),
    '.from.has-seal に min-height: 20mm が無い'
  );
  assert.ok(
    !/\.from[^,{}]*\{[^}]*min-height/.test(block),
    '@media print の中で .from の min-height が打ち消されている'
  );
});

test('送付状の紙面は下余白を重ねて取らない(ほぼ白紙の2枚目を出さない)', function () {
  // 2026-09-11、本番 https://invoice-tool-kohl.vercel.app/soufujo をA4幅(794px)で開き、
  // @media print を実際に効かせて測った結果:
  //   同封物8件・本文長め: 本文は 285.4mm で終わっているのに紙面の箱は 310.4mm
  //   → 収まるはずの1枚が2枚になり、2枚目はほぼ白紙だった
  //   下余白を 0 にすると 279.5mm になり、1枚に収まった(実測 30.9mm ぶん縮んだ)
  // 下の余白は印刷側のページ余白が既に持っているため、ここで重ねて取ってはいけない。
  //
  // ⚠ 2026-09-14、上と左右の余白を @page に移した(2ページ目に余白が乗らなかったため)。
  //    そのため .sf-paper が持つのは差分だけになり、狙いの 25mm / 20mm は
  //    「@page の余白 + .sf-paper の padding」の足し算で出す。下余白が 0 なのは変わらない。
  //    実測(2026-09-14・A4のPDF): 本文の始まり 25.7mm・左 20.0mm。移す前は 25.5mm・20.0mm。
  const m = /\.sf-paper\s*\{([^}]*)\}/.exec(block);
  assert.ok(m, '@media print に .sf-paper が無い');
  const sfPad = /padding\s*:\s*([^;]+);/.exec(m[1]);
  assert.ok(sfPad, '@media print の .sf-paper に padding が無い');
  const sfParts = sfPad[1].trim().split(/\s+/);
  assert.strictEqual(sfParts.length, 3, '.sf-paper の padding は「上 左右 下」の3値で書く: ' + sfPad[1].trim());
  assert.ok(
    /^0(mm|px|)$/.test(sfParts[2]),
    '.sf-paper の下余白が 0 になっていない(ほぼ白紙の2枚目が戻る): padding: ' + sfPad[1].trim()
  );
  assert.strictEqual(mm(sfParts[0]) + mm(pageMargin.top), 25, '送付状の上余白(@page + .sf-paper)が 25mm でない');
  assert.strictEqual(mm(sfParts[1]) + mm(pageMargin.side), 20, '送付状の左右余白(@page + .sf-paper)が 20mm でない');
});

test('4書類(請求書・見積書・納品書・領収書)の紙面が、まっ白な2枚目を出さない', function () {
  // 2026-09-13、本番 https://invoice-tool-kohl.vercel.app/ を 1500px で開き、
  // @media print を実際に効かせて明細の行数を 1〜44 まで振って測った結果:
  //   明細13行(宛名・備考などが既定の状態)で
  //     本文は 289.0mm で終わっている = A4(297mm)に収まっている
  //     なのに .paper の下余白 15mm が足されて紙面の箱が 304.0mm になる
  //   → 本文が1枚に収まっているのに2枚目が出て、その2枚目には1文字も載らない
  //   下余白を 0 にして測り直すと 289.0mm になり、1枚に収まった
  // 4書類は同じ /(index.html)の同じ .paper で刷られるため、4つとも同じ13行で再現した。
  //
  // ⚠ 下余白は「本文が紙の下端に迫ったときの逃げ」に見えるが、実際にはそう働かない。
  //    本文が短ければ箱がそこで終わるので余白は要らず、
  //    本文が長ければ(箱 > 297mm)どのみち2枚目に送られる。
  //    効くのは本文が 267〜282mm のときだけで、そこはまさに白紙の2枚目が出る帯である。
  const m = /(?:^|\})\s*\.paper\s*\{([^}]*)\}/.exec(block);
  assert.ok(m, '@media print に .paper が無い');
  const pad = /padding\s*:\s*([^;]+);/.exec(m[1]);
  assert.ok(pad, '@media print の .paper に padding が無い');
  const parts = pad[1].trim().split(/\s+/);
  const bottom = parts.length >= 3 ? parts[2] : parts[0];
  assert.ok(
    /^0(mm|px|)$/.test(bottom),
    '.paper の下余白が 0 になっていない(まっ白な2枚目が戻る): padding: ' + pad[1].trim()
  );
});

test('送付状の記書きは「記・同封物・以上」で割れない', function () {
  // 記書きは3つで1つの意味になる。どれか1つだけが次のページに落ちると、
  // 受け取った人は同封物を数え直すことになる。
  assert.ok(/\.sf-items\s*\{[^}]*break-inside\s*:\s*avoid/.test(block), '.sf-items に break-inside: avoid が無い');
  assert.ok(/\.sf-kiji\s*\{[^}]*break-after\s*:\s*avoid/.test(block), '.sf-kiji に break-after: avoid が無い');
  assert.ok(/\.sf-ijo\s*\{[^}]*break-before\s*:\s*avoid/.test(block), '.sf-ijo に break-before: avoid が無い');
  assert.ok(/\.sf-closing\s*\{[^}]*break-before\s*:\s*avoid/.test(block), '.sf-closing に break-before: avoid が無い(結語だけが次ページに残る)');
});

let passed = 0;
let failed = 0;
console.log('印刷紙面(@media print)');
for (const c of cases) {
  try {
    c.fn();
    passed++;
    console.log(`  ok   ${c.name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${c.name}`);
    console.error(`       ${err.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed (${cases.length} total)`);
process.exit(failed ? 1 : 0);
