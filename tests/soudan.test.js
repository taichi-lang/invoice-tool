/*
 * 第3段(factory=特注業務システム)への出口の回帰テスト。依存パッケージなしで動かす。
 *   実行: node tests/soudan.test.js
 *
 * 設計は AIBusiness `businesses/starter-tools/factory送客_設計.md`。
 * このテストが守っているのは、設計の「禁止事項」である。
 *
 *   ① 出口は1本だけ。 増やせば押し売りになる(§2)
 *   ② 書類を作る6画面と解説記事に混ぜない(§2)
 *      手を動かしている最中の人に営業を差し込まない。記事の末尾は広告の面である
 *   ③ 受け口にフォームを置かない(§2)
 *      「入力内容を送信しない」が本サイトの売りである。送信する箱を同居させない
 *   ④ 金額・実績・納期・外部URLを書かない(§3)
 *      価格は個別見積、顧客はまだ納品前。書けば捏造になる
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const read = (p) => fs.readFileSync(path.join(pub, p), 'utf8');

const SOUDAN = 'soudan.html';

/** 出口を置いてよい唯一のページ(母屋の本文末尾)。 */
const EXIT_PAGE = 'kaigyo.html';

/** 出口を置かないページ。書類を作る6画面・免責・記事3本・記事一覧。 */
const NO_EXIT_PAGES = [
  'index.html',
  'mitsumorisho.html',
  'ryoshusho.html',
  'nohinsho.html',
  'soufujo.html',
  'inshi.html',
  'legal.html',
  'guide/index.html',
  'guide/seikyusho-kakikata.html',
  'guide/seikyusho-teisei-saihakko.html',
  'guide/gensen-choshu-keisan.html',
];

/** そのページの本文から /soudan へ向かうリンクの数。
 *  soudan.html 自身のフッターや戻り導線は数えない(別ページからの出口ではない)。 */
function exitLinks(html) {
  return (html.match(/href="\/soudan"/g) || []).length;
}

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

// ── ① 出口は1本だけ ────────────────────────────────────────
test('出口は母屋 /kaigyo にちょうど1本だけある', () => {
  assert.strictEqual(exitLinks(read(EXIT_PAGE)), 1, '/kaigyo の出口が1本ではない');
});

test('出口は /legal ではなく /soudan に着地する(2ホップを解いた)', () => {
  const html = read(EXIT_PAGE);
  const i = html.indexOf('自社の業務に合わせて作りたい方へ');
  assert.ok(i > 0, '/kaigyo の出口の見出しが消えている');
  const tail = html.slice(i);
  assert.ok(tail.includes('href="/soudan"'), '出口が /soudan を指していない');
  assert.ok(!tail.includes('href="/legal">運営者情報'), '出口がまだ /legal を経由している');
});

// ── ② 混ぜてよい面と、混ぜない面(正負の対照) ──────────────
test('書類を作る6画面・免責・記事には出口が1本も無い', () => {
  for (const p of NO_EXIT_PAGES) {
    assert.strictEqual(exitLinks(read(p)), 0, `${p} に出口が混入している`);
  }
});

test('対照: 同じ数え方で /kaigyo は1本を返す(数え方が壊れていない)', () => {
  assert.strictEqual(exitLinks(read(EXIT_PAGE)), 1);
  assert.strictEqual(exitLinks('<a href="/legal">x</a>'), 0);
});

// ── ③ 受け口はフォームではなく mailto 1本 ────────────────────
test('受け口に <form> は1つも無い', () => {
  assert.ok(!/<form\b/i.test(read(SOUDAN)), 'soudan に form がある');
});

test('受け口は mailto: リンクがちょうど1本', () => {
  const n = (read(SOUDAN).match(/href="mailto:/g) || []).length;
  assert.strictEqual(n, 1, `mailto が ${n} 本ある`);
});

test('mailto の雛形に、聞くべき5項目がすべて入っている', () => {
  const href = read(SOUDAN).match(/href="(mailto:[^"]+)"/)[1];
  const decoded = decodeURIComponent(href.replace(/&amp;/g, '&'));
  assert.ok(decoded.startsWith('mailto:nks.taichi@gmail.com?'), '宛先が違う');
  assert.ok(decoded.includes('subject=業務システムのご相談'), '件名が入っていない');
  for (const item of ['業種', 'いま見積・請求をどう作っているか', '困っていること', '希望時期', 'ご連絡先']) {
    assert.ok(decoded.includes(item), `雛形に「${item}」が無い`);
  }
});

/** 雛形の番号付き項目を数える。上の5項目は「在ること」しか見ていないので、
 *  6つ目が足された日には素通りする(2026-09-25 に実測。注入して終了コード0)。
 *  項目が増えるほど書く手間が増えて相談が来なくなるため、数のほうを固定する。 */
function templateItems(html) {
  const href = html.match(/href="(mailto:[^"]+)"/)[1];
  const decoded = decodeURIComponent(href.replace(/&amp;/g, '&'));
  return decoded.match(/^\s*\d+\.\s/gm) || [];
}

test('雛形の項目はちょうど5つ(6つ目が黙って増えない)', () => {
  const n = templateItems(read(SOUDAN)).length;
  assert.strictEqual(n, 5, `雛形の番号付き項目が ${n} 個ある`);
});

test('対照: 同じ数え方は、項目が6つなら6を返す(5を返すだけの式ではない)', () => {
  const six =
    'href="mailto:x?body=' +
    encodeURIComponent(
      ['', '1. a', '2. b', '3. c', '4. d', '5. e', '6. f'].join(String.fromCharCode(10))
    ) +
    '"';
  assert.strictEqual(templateItems(six).length, 6);
});

/** 文字を打ち込める器の数。<form> が無くても、入力欄が1つでもあれば
 *  「この画面では何も入力させない」という約束は崩れる。 */
function inputWidgets(html) {
  return (html.match(/<(?:input|textarea|select)\b|contenteditable\s*=/gi) || []).length;
}

test('受け口に入力欄が1つも無い(2026-09-20 に DOM で数えた 0 を、ここで固定する)', () => {
  const n = inputWidgets(read(SOUDAN));
  assert.strictEqual(n, 0, `soudan に入力欄が ${n} 個ある`);
});

test('対照: 同じ数え方は、入力欄が在れば数える(0 を返すだけの関数ではない)', () => {
  assert.strictEqual(inputWidgets('<input name="x">'), 1);
  assert.strictEqual(inputWidgets('<textarea></textarea><div contenteditable="true"></div>'), 2);
  assert.strictEqual(inputWidgets('<p>ただの文章</p>'), 0);
});

test('受け口に送信ボタンが無い(押して何かが起きる器を置かない)', () => {
  const html = read(SOUDAN);
  assert.ok(!/<button\b/i.test(html), 'soudan に button がある');
  assert.ok(!/type\s*=\s*"submit"/i.test(html), 'soudan に submit がある');
  // 対照: 同じ2本の判定は、在れば実際に反応する(素通りする式ではない)。
  assert.ok(/<button\b/i.test('<button>x</button>'));
  assert.ok(/type\s*=\s*"submit"/i.test('<input type="submit">'));
});

test('受け口は外部へ1バイトも送らない(当方サーバーへの送信経路が無い)', () => {
  const html = read(SOUDAN);
  for (const bad of ['fetch(', 'XMLHttpRequest', 'action=', '<script']) {
    assert.ok(!html.includes(bad), `soudan に ${bad} がある`);
  }
});

/** ブラウザにリクエストを出させる属性を、全部まとめて数える。
 *
 *  ⚠ 2026-09-25 に実測して分かったこと: 上の4語のブロックリストは、
 *    外部へリクエストを出す形を1つも止めていなかった。注入して終了コード0だったもの:
 *      <img src="https://…">  /  <iframe src="https://…">
 *      <a ping="https://…">   /  <link rel="prefetch" href="https://…">
 *    どれも 'fetch(' も 'XMLHttpRequest' も 'action=' も '<script' も含まないためである。
 *    (本番では CSP が4つとも止める。落ちていたのは「こちらが気づくか」である。)
 *
 *  覚えている語を並べるのをやめて、リクエストを起こしうる属性の側から数える。
 *  通してよいのは 相対パス / mailto: / data: と、canonical の自己参照だけ。 */
const FETCHING_ATTRS = ['src', 'srcset', 'href', 'ping', 'action', 'formaction', 'poster', 'data', 'background'];
const ATTR_RE = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;
const EXTERNAL_RE = /^(?:https?:)?\/\//i;

function externalRefs(html) {
  // canonical はリクエストを起こさない索引用の自己参照なので、数える前に外す
  // (在ることは別のテストで確かめている)。
  const scrubbed = html.replace(/<link[^>]*rel="canonical"[^>]*>/gi, '');
  const out = [];
  for (const m of scrubbed.matchAll(ATTR_RE)) {
    const attr = m[1].toLowerCase();
    if (!FETCHING_ATTRS.includes(attr)) continue;
    // srcset は "URL 1x, URL 2x" の形なので、URLの部分だけを取り出す
    for (const url of m[2].split(',').map((v) => v.trim().split(/\s+/)[0]).filter(Boolean)) {
      if (EXTERNAL_RE.test(url)) out.push(attr + '="' + url + '"');
    }
  }
  return out;
}

test('受け口から外部へリクエストを起こす属性が1つも無い', () => {
  const refs = externalRefs(read(SOUDAN));
  assert.deepStrictEqual(
    refs,
    [],
    '外部へリクエストを起こす属性がある: ' + refs.join(' | ') +
      ' → 受け口は mailto: 1本だけである。外部の画像・iframe・ping・prefetch は置かない。'
  );
});

test('対照: 同じ数え方は、素通りしていた4つの形をすべて拾う', () => {
  assert.deepStrictEqual(externalRefs('<img src="https://e.net/p.gif">'), ['src="https://e.net/p.gif"']);
  assert.strictEqual(externalRefs('<iframe src="https://e.net/f"></iframe>').length, 1);
  assert.strictEqual(externalRefs('<a href="/" ping="https://e.net/t">x</a>').length, 1);
  assert.strictEqual(externalRefs('<link rel="prefetch" href="https://e.net/p">').length, 1);
  // scheme を省いた形("//" 始まり)と srcset も取りこぼさない
  assert.strictEqual(externalRefs('<img src="//e.net/a.png">').length, 1);
  assert.strictEqual(externalRefs('<img srcset="https://e.net/a.png 1x, /b.png 2x">').length, 1);
  // 通してよいもの: 相対・mailto・canonical の自己参照
  assert.deepStrictEqual(externalRefs('<a href="/">x</a><a href="mailto:a@b.c">y</a><img src="/i.svg">'), []);
  assert.deepStrictEqual(
    externalRefs('<link rel="canonical" href="https://invoice-tool-kohl.vercel.app/soudan">'),
    []
  );
});

// ── ④ 書いてはいけないもの ──────────────────────────────────
test('金額を1つも書いていない(価格は個別見積)', () => {
  const html = read(SOUDAN);
  assert.ok(!/[0-9０-９]\s*[万円]/.test(html.replace(/無料/g, '')), '金額らしき表記がある');
  assert.ok(html.includes('個別のお見積り'), '個別見積の断り書きが無い');
});

test('実績・お客様の声・納期を書いていない(まだ納品前である)', () => {
  const html = read(SOUDAN);
  for (const bad of ['導入実績', 'お客様の声', '実績多数', '社導入', '最短', '納期']) {
    assert.ok(!html.includes(bad), `soudan に「${bad}」がある`);
  }
});

test('外部URLを1つも書いていない(偽URL禁止 / factory に公開サイトは無い)', () => {
  const html = read(SOUDAN);
  // 数えるのは本文の <a> だけ。<link rel="canonical"> は索引のための自己参照であり、
  // 読者を外へ出す導線ではないので対象外(対照: canonical は実在することを下で確かめる)。
  const anchors = html.match(/<a[^a-zA-Z0-9][^>]*href="https?:\/\/[^"]*"/g) || [];
  assert.strictEqual(anchors.length, 0, '外部リンクがある: ' + anchors.join(' | '));
  assert.ok(/<link rel="canonical" href="https:\/\/[^"]+\/soudan">/.test(html), 'canonical が無い');
});

// ── ⑤ 無料ツールの約束を殺していない ────────────────────────
test('無料ツールが今までどおりであることを明記している', () => {
  const html = read(SOUDAN);
  assert.ok(html.includes('登録不要'), '登録不要の明記が無い');
  assert.ok(html.includes('送信'), '送信しない旨の記載が無い');
  assert.ok(html.includes('有料版に切り替わることはありません'), '無料継続の明記が無い');
});

test('相談せずにツールへ戻る導線がある(行き止まりにしない)', () => {
  const html = read(SOUDAN);
  assert.ok(html.includes('href="/"'), 'ツールへ戻る導線が無い');
});

// ── ⑥ 索引 ────────────────────────────────────────────────
test('sitemap に /soudan が1件だけある', () => {
  const xml = read('sitemap.xml');
  const n = (xml.match(/\/soudan</g) || []).length;
  assert.strictEqual(n, 1, `sitemap の /soudan が ${n} 件`);
});

test('/soudan は noindex ではない(出口の着地点が索引から外れない)', () => {
  assert.ok(!/name="robots"[^>]*noindex/.test(read(SOUDAN)), 'soudan が noindex になっている');
  // 対照: /legal も索引を拒んでいないこと。
  // ⚠ 2026-09-17 に向きが変わった。元は「/legal は noindex のまま」を確かめる行で、
  //    B2 が B4 の持ち物へ触っていないことの対照だった。2026-09-17、持ち主である B4 が
  //    索引を拒むのをやめると決めた(legal.html の <head> のコメントに理由がある)ので、
  //    同じ対照を反対向きに置き直した。行を消していないのは、どちらの向きでも
  //    「/legal の索引の扱いを誰かが黙って変えた」ことを、この1行で止めたいからである。
  assert.ok(!/name="robots"[^>]*noindex/.test(read('legal.html')), 'legal が索引拒否に戻っている');
});

// ── ⑤ 名簿が、実際に在るページを取りこぼしていないか ──────────
/** public/ 以下の .html を、public/ からの相対パスで全部返す。
 *  ⚠ 名簿(EXIT_PAGE / SOUDAN / NO_EXIT_PAGES)は手書きなので、
 *     新しいページが1枚増えた日に、どの名簿にも載らないまま素通りする。
 *     2026-09-24 に実測した: 出口・広告・フォーム・入力欄・外部URLを全部載せた
 *     14枚目を置いても、12ファイル201件が1件も落ちなかった。 */
function allPages(dir = pub, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...allPages(path.join(dir, e.name), prefix + e.name + '/'));
    else if (e.name.endsWith('.html')) out.push(prefix + e.name);
  }
  return out.sort();
}

test('公開ページは1枚残らず、出口の名簿のどれかに載っている', () => {
  const known = new Set([EXIT_PAGE, SOUDAN, ...NO_EXIT_PAGES]);
  const missing = allPages().filter((p) => !known.has(p));
  assert.deepStrictEqual(
    missing,
    [],
    [
      `どの名簿にも載っていないページがある: ${missing.join(', ')}`,
      '→ 出口を置いてよいページなら EXIT_PAGE、置かないページなら NO_EXIT_PAGES へ1行足す。',
    ].join(' ')
  );
});

test('対照: 同じ数え方は、名簿に無いページが在れば拾う(空配列を返すだけの式ではない)', () => {
  const known = new Set(['a.html']);
  assert.deepStrictEqual(['a.html', 'b.html'].filter((p) => !known.has(p)), ['b.html']);
  assert.deepStrictEqual(['a.html'].filter((p) => !known.has(p)), []);
});

test('対照: 名簿の側に、実在しないページが混ざっていない(逆向きの取りこぼし)', () => {
  const real = new Set(allPages());
  const ghosts = [EXIT_PAGE, SOUDAN, ...NO_EXIT_PAGES].filter((p) => !real.has(p));
  assert.deepStrictEqual(ghosts, [], `名簿に実在しないページがある: ${ghosts.join(', ')}`);
});

let passed = 0;
let failed = 0;
console.log('第3段(factory)への出口');
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
