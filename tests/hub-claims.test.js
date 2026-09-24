/*
 * 母屋 /kaigyo のリンク説明文が、着地先で回収できる中身を約束しているかを見る。
 *   実行: node tests/hub-claims.test.js
 *
 * 2026-09-25 に足した。この日に見つけた欠陥:
 *   工程1の説明文が「そもそも押す必要があるのか、角印と代表者印のどちらか、紙面のどの位置か。」
 *   と3つ約束していたが、着地先(姉妹サイトの角印の記事)に「代表者印」も「丸印」も
 *   「どちら」も 0 件だった。あのページは角印だけを扱っており、2つを比べていない。
 *   クリック前の約束は着地先で回収できねばならない(2026-09-19 の判断)。
 *
 * ⚠ このテストで止められるのは「当サイト内へ送り出す説明文」だけである。
 *    今回の欠陥は外部サイトへの link で、**このテストでは止められない**。
 *    だから下に「名簿」を置き、外部リンクが1本増えた日に必ず落ちるようにしてある。
 *    増やした人は、その説明文の句を着地先で1つずつ数えてから名簿を更新すること。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

/*
 * 中身を持たない汎用語。これらは「着地先に同じ語が出るか」では判定できない。
 * 例: 「端数処理のルール」の着地先は h2「消費税の端数処理は『税率ごとに1回』」で
 *     中身は回収できているが、「ルール」という語自体は書かれていない。
 * ⚠ ここに語を足すのは、その語が主題を1つも指していないときだけにする。
 */
const GENERIC = ['ルール', 'コツ', 'ポイント', '仕組み', '一覧', 'まとめ', 'ところ'];

/** 母屋の <main> から、工程のリンク1本ずつを {href, desc} で取り出す。 */
function hubLinks() {
  const hub = fs.readFileSync(path.join(PUBLIC, 'kaigyo.html'), 'utf8');
  const body = hub.slice(hub.indexOf('<main'), hub.indexOf('</main>'));
  const re = /<li><a href="([^"]+)"[^>]*>([^<]*)<\/a>\s*<p>([\s\S]*?)<\/p><\/li>/g;
  const out = [];
  let m;
  while ((m = re.exec(body))) {
    out.push({ href: m[1], label: m[2], desc: m[3].replace(/<[^>]+>/g, '') });
  }
  return out;
}

/** 公開URL → public/ のファイル。 */
function pageText(href) {
  const file = href === '/' ? 'index.html' : href.replace(/^\//, '') + '.html';
  return fs.readFileSync(path.join(PUBLIC, file), 'utf8').replace(/<[^>]+>/g, '');
}

const links = hubLinks();

test('母屋のリンク説明文は、9本ぶん取り出せている', () => {
  assert.ok(links.length >= 9, '説明文つきのリンクが ' + links.length + ' 本しか取れていない');
});

test('母屋が当サイトへ送り出す説明文の語は、すべて着地先に在る', () => {
  const bad = [];
  for (const link of links) {
    if (!link.href.startsWith('/')) continue;
    const landing = pageText(link.href);
    const words = [...new Set(link.desc.match(/[一-龥ァ-ヶー]{3,}/g) || [])]
      .filter((w) => GENERIC.indexOf(w) === -1);
    for (const w of words) {
      if (!landing.includes(w)) bad.push(link.href + ' が約束した「' + w + '」が着地先に0件');
    }
  }
  assert.deepStrictEqual(bad, [], bad.join(' / '));
});

/*
 * 外部リンクの名簿。**このテストは中身を確かめていない。**
 * 数が合っているかだけを見る。増えた日に落ちて、人の目を1回通させるためにある。
 */
const EXTERNAL_KNOWN = [
  'https://seal-generator.vercel.app/',
  'https://seal-generator.vercel.app/guide/kakuin-tsukaikata',
];

test('母屋の外部リンクは名簿どおり2本。増えたら手で数え直す', () => {
  const found = links.filter((l) => !l.href.startsWith('/')).map((l) => l.href);
  assert.deepStrictEqual(
    found.sort(),
    EXTERNAL_KNOWN.slice().sort(),
    '外部リンクが名簿と違う。説明文の句を着地先で数えてから EXTERNAL_KNOWN を直すこと',
  );
});

test('工程1の説明文は、着地先が扱っていない比較を約束していない', () => {
  const link = links.find((l) => l.href.endsWith('/guide/kakuin-tsukaikata'));
  assert.ok(link, '工程1の角印の記事へのリンクが無い');
  for (const w of ['代表者印', '丸印', 'どちら']) {
    assert.ok(
      !link.desc.includes(w),
      '着地先は角印だけを扱っている。説明文に「' + w + '」を書くと回収できない',
    );
  }
});

console.log('hub-claims.test.js: ' + passed + ' 件すべて通過');
