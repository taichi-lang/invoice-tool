/*
 * 広告の入れ物(第1段の収益)の回帰テスト。依存パッケージなしで動かす。
 *   実行: node tests/ads.test.js
 *
 * 設計は AIBusiness `businesses/starter-tools/広告_設計.md`。
 * このテストが守っているのは、設計の「禁止事項」3つである。
 *
 *   ① 書類を作る画面に広告を置かない(§3)
 *      速さと静かさがこのツール唯一の強みで、広告を1枚置けばそれが消える。
 *   ② 請求書の紙に広告を混ぜない(§4)
 *      出力はそのまま取引先へ渡る。1ミリでも乗ったら成果物の欠陥である。
 *   ③ 「入力内容を送信しない」という約束を、広告の都合で緩めない
 *      書類を作る画面の CSP は `connect-src 'none'` のままであること。
 *      約束は index.html と legal.html に文章で書いてある。文章だけでなく
 *      ヘッダでも止まっていることを、ここで固定する。
 *
 * さらに「未設定のあいだは1バイトも描画しない」ことを、
 * tools/build-ads.mjs を実際に走らせて確かめる(下の「ビルド」節)。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

/** 広告を置くページ(記事と母屋)。 */
const AD_PAGES = [
  'guide/seikyusho-kakikata.html',
  'guide/seikyusho-teisei-saihakko.html',
  'guide/gensen-choshu-keisan.html',
  'kaigyo.html',
];

/** 広告を置かないページ。書類を作る画面と、取引条件の画面と、記事の一覧。 */
const NO_AD_PAGES = [
  'index.html',
  'mitsumorisho.html',
  'ryoshusho.html',
  'nohinsho.html',
  'soufujo.html',
  'inshi.html',
  'legal.html',
  'soudan.html',
  'guide/index.html',
];

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

// ── ① 置く面と置かない面 ────────────────────────────────────
test('広告の読み込みは、記事と母屋の4ページにだけ入っている', () => {
  for (const p of AD_PAGES) {
    const html = read(pub, p);
    assert.ok(html.includes('/ads.js'), `${p} に ads.js が無い`);
    assert.ok(html.includes('/ads-config.js'), `${p} に ads-config.js が無い`);
  }
});

test('書類を作る画面・/legal・記事一覧には、広告の読み込みが1つも無い', () => {
  for (const p of NO_AD_PAGES) {
    const html = read(pub, p);
    assert.ok(!html.includes('ads.js'), `${p} に広告の読み込みが入っている`);
  }
});

test('1ページに2枚出さない(ads.js の読み込みは1ページ1回)', () => {
  for (const p of AD_PAGES) {
    const hits = read(pub, p).split('src="/ads.js"').length - 1;
    assert.strictEqual(hits, 1, `${p} の ads.js が ${hits} 回`);
  }
});

// ── ② 紙に混ぜない ─────────────────────────────────────────
test('印刷時に .ad-slot を消す規則が、no-print とは別に独立して在る', () => {
  const css = read(pub, 'style.css');
  const re = /@media\s+print\s*\{[^}]*\.ad-slot\s*\{\s*display:\s*none\s*!important/;
  assert.ok(re.test(css), '.ad-slot 単独の印刷規則が style.css に無い');
});

test('器そのものにも no-print が付いている(対策の二重化)', () => {
  assert.ok(
    /className|class/.test(read(pub, 'ads.js')) &&
      read(pub, 'ads.js').includes('"ad-slot no-print"'),
    'ads.js が器に no-print を付けていない',
  );
});

// ── ③ 「送信しない」の約束を緩めない ──────────────────────────
const vercel = JSON.parse(read(root, 'vercel.json'));
const cspOf = (source) => {
  const rule = vercel.headers.find((h) => h.source === source);
  assert.ok(rule, `vercel.json に source ${source} が無い`);
  const csp = rule.headers.find((h) => h.key === 'Content-Security-Policy');
  assert.ok(csp, `${source} に CSP が無い`);
  return csp.value;
};

test('書類を作る画面の CSP は connect-src none のままである', () => {
  const csp = cspOf("/((?!guide|kaigyo).*)");
  assert.ok(csp.includes("connect-src 'none'"), `緩んでいる: ${csp}`);
  assert.ok(csp.includes("script-src 'self';"), `外部スクリプトが許されている: ${csp}`);
});

/* ⚠ seal.test.js は vercel.json の headers[0] から CSP を読み、
   「印影が端末の外へ出ない」ことを守っている。広告のために CSP を面ごとに
   分けたとき、順番を入れ替えるとあちらのテストが黙って別の規則を見にいく。
   だから「先頭は書類を作る画面の厳しいほうである」をここで固定する。 */
test('vercel.json の先頭は、書類を作る画面の厳しい CSP である', () => {
  const first = vercel.headers[0];
  assert.strictEqual(first.source, "/((?!guide|kaigyo).*)", `先頭が違う: ${first.source}`);
  const csp = first.headers.find((h) => h.key === 'Content-Security-Policy');
  assert.ok(csp && csp.value.includes("connect-src 'none'"), '先頭に厳しい CSP が無い');
});

test('広告を許すのは記事と母屋の CSP だけで、その2つに限られている', () => {
  const relaxed = vercel.headers.filter((h) =>
    (h.headers.find((x) => x.key === 'Content-Security-Policy') || {}).value
      ?.includes('googlesyndication'),
  );
  const sources = relaxed.map((h) => h.source).sort();
  assert.deepStrictEqual(sources, ['/guide/:path*', '/kaigyo'], `対象が違う: ${sources}`);
});

test('記事の CSP でも、フォームの送信先と埋め込み元は閉じたままである', () => {
  for (const s of ['/guide/:path*', '/kaigyo']) {
    const csp = cspOf(s);
    assert.ok(csp.includes("form-action 'none'"), `${s} の form-action が開いている`);
    assert.ok(csp.includes("frame-ancestors 'none'"), `${s} の frame-ancestors が開いている`);
    assert.ok(csp.includes("default-src 'none'"), `${s} の default-src が開いている`);
  }
});

// ── ④ 広告の告知が、広告の実態と必ず一致する ──────────────────
/* 2026-09-14(B2): `/legal` の「アクセス解析・広告」は「導入していません」と
   手書きだった。広告の器は実装済みで、IDが入った瞬間に記事へ描画されるので、
   貼った瞬間に本ページが嘘になる。AdSense は第三者配信と Cookie の告知を
   求めるため、審査に直接ひびく。告知を ads-notice.js で出し分けるようにした。 */

test('/legal に、広告あり・なしの両方の告知が置いてある', () => {
  const html = read(pub, 'legal.html');
  assert.ok(html.includes('id="ads-notice-off"'), 'なし側の告知が無い');
  assert.ok(html.includes('id="ads-notice-on"'), 'あり側の告知が無い');
  assert.ok(/id="ads-notice-on"[^>]*\shidden/.test(html), 'あり側が既定で hidden になっていない');
});

test('あり側の告知に、第三者配信・Cookie・無効化手段がそろっている', () => {
  const html = read(pub, 'legal.html');
  for (const w of ['第三者配信', 'Cookie', 'パーソナライズ広告', 'https://policies.google.com/technologies/ads']) {
    assert.ok(html.includes(w), `あり側の告知に「${w}」が無い`);
  }
});

test('/legal は告知だけを読み込み、広告そのものは1バイトも読み込まない', () => {
  const html = read(pub, 'legal.html');
  assert.ok(html.includes('/ads-notice.js'), '告知の出し分けが読み込まれていない');
  assert.ok(html.includes('/ads-config.js'), '設定値が読み込まれていない');
  assert.ok(!html.includes('adsbygoogle'), '/legal に広告の器がある');
  assert.ok(!html.includes('googlesyndication'), '/legal が広告配信元を読み込んでいる');
});

test('告知の判定は ads.js とまったく同じ条件(client と slot の両方)を見る', () => {
  // 条件を別々に書くと、片方だけ直したときに告知と実態が食い違う。
  const notice = read(pub, 'ads-notice.js');
  assert.ok(/cfg\s*&&\s*cfg\.client\s*&&\s*cfg\.slot/.test(notice), notice);
  assert.ok(read(pub, 'ads.js').includes('!cfg || !cfg.client || !cfg.slot'), 'ads.js 側の条件が変わっている');
});

test('ads-notice.js は広告を1バイトも読み込まない', () => {
  const notice = read(pub, 'ads-notice.js');
  assert.ok(!notice.includes('googlesyndication'), 'ads-notice.js が配信元を読み込んでいる');
  assert.ok(!notice.includes('adsbygoogle'), 'ads-notice.js が広告を push している');
  assert.ok(!notice.includes('createElement'), 'ads-notice.js が要素を作っている');
});

/* 文字列の一致だけでは「切り替わる」ことの証明にならないので、
   ads-notice.js を実際に走らせて hidden の値を読む。DOM は最小限の作りもので、
   ブラウザは使わない(●全社-26: 長く返らない呼び出しを稼働の途中に置かない)。 */
const runNotice = (cfg) => {
  const els = {
    'ads-notice-off': { hidden: false },
    'ads-notice-on': { hidden: true },
  };
  const sandbox = {
    window: { __ADSENSE__: cfg },
    document: { getElementById: (id) => els[id] || null },
  };
  new Function('window', 'document', read(pub, 'ads-notice.js'))(sandbox.window, sandbox.document);
  return els;
};

test('未設定なら「導入していません」側だけが出る', () => {
  const els = runNotice(null);
  assert.strictEqual(els['ads-notice-off'].hidden, false);
  assert.strictEqual(els['ads-notice-on'].hidden, true);
});

test('両方の値がそろったときだけ、第三者配信の告知に切り替わる', () => {
  const els = runNotice({ client: 'ca-pub-0000000000000000', slot: '1234567890' });
  assert.strictEqual(els['ads-notice-off'].hidden, true);
  assert.strictEqual(els['ads-notice-on'].hidden, false);
});

test('片方だけ設定された状態は「広告あり」と見なさない(ads.js と同じ扱い)', () => {
  for (const cfg of [{ client: 'ca-pub-0000000000000000' }, { slot: '1234567890' }]) {
    const els = runNotice(cfg);
    assert.strictEqual(els['ads-notice-off'].hidden, false, JSON.stringify(cfg));
    assert.strictEqual(els['ads-notice-on'].hidden, true, JSON.stringify(cfg));
  }
});

// ── ビルド: 未設定なら1バイトも描画しない ──────────────────────
const buildScript = path.join(root, 'tools', 'build-ads.mjs');
const adsTxt = path.join(pub, 'ads.txt');
const runBuild = (env) =>
  execFileSync(process.execPath, [buildScript], {
    env: { ...process.env, ADSENSE_CLIENT: '', ADSENSE_ARTICLE_SLOT: '', ...env },
    encoding: 'utf8',
  });

test('未設定でビルドすると、設定値は null で ads.txt は作られない', () => {
  runBuild({});
  assert.ok(read(pub, 'ads-config.js').includes('window.__ADSENSE__ = null'));
  assert.ok(!fs.existsSync(adsTxt), '未設定なのに ads.txt がある(404 にならない)');
});

test('片方だけ設定しても有効にしない(発行者IDだけ)', () => {
  runBuild({ ADSENSE_CLIENT: 'ca-pub-0000000000000000' });
  assert.ok(read(pub, 'ads-config.js').includes('window.__ADSENSE__ = null'));
  assert.ok(fs.existsSync(adsTxt), '発行者IDがあるなら ads.txt は出す');
});

/* ── 審査する側の動線(2026-09-17 B2)──────────────────────────
   AdSense は所有者確認にルート直下の /ads.txt を読む。
   ⚠ 広告ユニットID(ADSENSE_ARTICLE_SLOT)は審査に通るまで発行されないので、
     審査に出す時点で手元にあるのは発行者IDだけである。
     その状態で ads.txt の中身が正しくないと、審査が始まらない。
   これまで「ファイルが在るか」は測っていたが、中身は1文字も測っていなかった。 */

test('審査時の状態(発行者IDだけ)で、ads.txt の中身が Google の1行そのものである', () => {
  runBuild({ ADSENSE_CLIENT: 'ca-pub-0000000000000000' });
  const body = fs.readFileSync(adsTxt, 'utf8');
  assert.strictEqual(body, 'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0\n');
  assert.strictEqual(body.trimEnd().split('\n').length, 1, '余計な行がある');
  assert.ok(!body.includes('ca-pub-'), '`ca-` を落とさないと読まれない: ' + body);
});

test('広告ユニットIDが増えても ads.txt の中身は変わらず、IDも混ざらない', () => {
  runBuild({ ADSENSE_CLIENT: 'ca-pub-0000000000000000' });
  const before = fs.readFileSync(adsTxt, 'utf8');
  runBuild({ ADSENSE_CLIENT: 'ca-pub-0000000000000000', ADSENSE_ARTICLE_SLOT: '1234567890' });
  const after = fs.readFileSync(adsTxt, 'utf8');
  assert.strictEqual(after, before);
  assert.ok(!after.includes('1234567890'), '広告ユニットIDが ads.txt に混ざっている');
});

test('形が違う発行者IDでは ads.txt を出さない(対照)', () => {
  for (const bad of ['pub-0000000000000000', 'ca-pub-', 'ca-pub-123', 'ca-pub-abcdefghij', '   ']) {
    runBuild({ ADSENSE_CLIENT: bad });
    assert.ok(!fs.existsSync(adsTxt), '発行者IDが ' + JSON.stringify(bad) + ' なのに ads.txt がある');
  }
});

test('片方だけ設定しても有効にしない(広告ユニットIDだけ)', () => {
  runBuild({ ADSENSE_ARTICLE_SLOT: '1234567890' });
  assert.ok(read(pub, 'ads-config.js').includes('window.__ADSENSE__ = null'));
  assert.ok(!fs.existsSync(adsTxt), '発行者IDが無いのに ads.txt がある');
});

test('形が違う値は受け付けない', () => {
  runBuild({ ADSENSE_CLIENT: 'pub-123', ADSENSE_ARTICLE_SLOT: '12' });
  assert.ok(read(pub, 'ads-config.js').includes('window.__ADSENSE__ = null'));
});

test('両方そろうと有効になり、ads.txt も出る', () => {
  runBuild({ ADSENSE_CLIENT: 'ca-pub-0000000000000000', ADSENSE_ARTICLE_SLOT: '1234567890' });
  const cfg = read(pub, 'ads-config.js');
  assert.ok(cfg.includes('"client":"ca-pub-0000000000000000"'), cfg);
  assert.ok(cfg.includes('"slot":"1234567890"'), cfg);
  assert.strictEqual(
    read(pub, 'ads.txt'),
    'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0\n',
  );
});

/* ── 404 を読むための目印(2026-09-18 B2)────────────────────────
   本番の /ads.txt の 404 は、存在しないパスの 404 と1バイトも違わない
   (2026-09-17 実測: どちらも text/plain 79B・中身も同じ)。
   静的サイトなので当然で、欠陥ではない。だが打ち分けが成立しない以上、
   その 404 単体からは何も言えない。
   ⚠ 打ち分けのために経路を1つ増やすのではなく、既にある ads-config.js を目印に使う。
     ads-config.js は4状態すべてで必ず出力されるので、
     「200 が返る = ビルド工程が走った」と読める。組み合わせで意味が決まる:
       ads-config.js 200(null)+ ads.txt 404 → 走ったうえで発行者ID未設定(=設計どおり)
       ads-config.js 404            + ads.txt 404 → ビルド工程が走っていない(=欠陥)
   この節は、その読み方が成り立つ前提そのものを固定する。 */

const BUILD_STATES = [
  {},
  { ADSENSE_CLIENT: 'ca-pub-0000000000000000' },
  { ADSENSE_ARTICLE_SLOT: '1234567890' },
  { ADSENSE_CLIENT: 'ca-pub-0000000000000000', ADSENSE_ARTICLE_SLOT: '1234567890' },
  { ADSENSE_CLIENT: 'pub-123', ADSENSE_ARTICLE_SLOT: '12' },
];

test('ads-config.js は、どの状態でも必ず出力される(ads.txt の 404 を読む目印)', () => {
  const cfg = path.join(pub, 'ads-config.js');
  for (const env of BUILD_STATES) {
    /* ⚠ 毎回消してから走らせる。消さないと、前の状態が書いたファイルが
       残っているだけで「出力された」と読めてしまい、試験が欠陥を見逃す
       (2026-09-18、負の対照で実際に見逃した)。 */
    if (fs.existsSync(cfg)) fs.rmSync(cfg);
    runBuild(env);
    assert.ok(fs.existsSync(cfg), 'ads-config.js が無い状態がある: ' + JSON.stringify(env));
  }
});

test('設定値が有効なのに ads.txt が無い、という組み合わせは作れない', () => {
  for (const env of BUILD_STATES) {
    runBuild(env);
    const enabled = /window\.__ADSENSE__ = \{/.test(read(pub, 'ads-config.js'));
    if (enabled) {
      assert.ok(
        fs.existsSync(adsTxt),
        '広告が有効なのに ads.txt が無い(本番で見えたら欠陥): ' + JSON.stringify(env),
      );
    }
  }
});

test('後片付け: リポジトリの状態を未設定に戻す', () => {
  runBuild({});
  assert.ok(read(pub, 'ads-config.js').includes('window.__ADSENSE__ = null'));
  assert.ok(!fs.existsSync(adsTxt));
});

// ── ⑥ 名簿が、実際に在るページを取りこぼしていないか ──────────
/** public/ 以下の .html を、public/ からの相対パスで全部返す。
 *  ⚠ AD_PAGES / NO_AD_PAGES は手書きの名簿なので、新しいページが1枚増えた日に
 *     どちらにも載らないまま素通りする。2026-09-24 に実測した: 広告付きの14枚目を
 *     置いても、12ファイル201件が1件も落ちなかった。
 *     「書類を作る画面に広告を置かない」は、名簿に載っているページしか守れない。 */
function allPages(dir = pub, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...allPages(path.join(dir, e.name), prefix + e.name + '/'));
    else if (e.name.endsWith('.html')) out.push(prefix + e.name);
  }
  return out.sort();
}

test('公開ページは1枚残らず、広告の名簿のどちらかに載っている', () => {
  const known = new Set([...AD_PAGES, ...NO_AD_PAGES]);
  const missing = allPages().filter((p) => !known.has(p));
  assert.deepStrictEqual(
    missing,
    [],
    [
      `どちらの名簿にも載っていないページがある: ${missing.join(', ')}`,
      '→ 記事面なら AD_PAGES、ツール面・取引条件の画面なら NO_AD_PAGES へ1行足す。',
      '→ 迷ったら NO_AD_PAGES。広告は後から足せるが、出た広告は取り消せない。',
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
  const ghosts = [...AD_PAGES, ...NO_AD_PAGES].filter((p) => !real.has(p));
  assert.deepStrictEqual(ghosts, [], `名簿に実在しないページがある: ${ghosts.join(', ')}`);
});

test('同じページが、置く名簿と置かない名簿の両方に載っていない', () => {
  const dup = AD_PAGES.filter((p) => NO_AD_PAGES.includes(p));
  assert.deepStrictEqual(dup, [], `両方の名簿に載っている: ${dup.join(', ')}`);
});

let passed = 0;
let failed = 0;
console.log('広告の入れ物(第1段の収益)');
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
