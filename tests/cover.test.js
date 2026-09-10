/*
 * 送付状(/soufujo)の文面組み立ての回帰テスト。依存パッケージなしで動かす。
 *   実行: node tests/cover.test.js
 *
 * 守るのは「間違えると相手に届いてから恥をかく」3点だけで、
 * 文体の好みや見た目はテストしない。
 *   1. 頭語と結語が対になること(拝啓→敬具 / 前略→草々)
 *   2. 前略のときは時候の挨拶を出さないこと
 *   3. 同封物が0件のときは「記〜以上」を出さないこと
 *
 * ⚠ 正直に書いておく。このテストは実装のあとに書いた(テストが先ではない)。
 *    そのぶん「今の実装をなぞっただけ」になっていないかを、変異を入れて確かめた。
 *    確かめた結果は日報に残してある。
 */
'use strict';

const assert = require('assert');
const CL = require('../public/cover.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const BASE = {
  date: '2026-09-10',
  toName: '株式会社サンプル',
  toHonorific: '御中',
  fromName: '中村太郎',
  salutation: 'haikei',
  useGreeting: true,
  body: '下記のとおり請求書をお送りいたします。',
  itemsText: '請求書 1通'
};

console.log('cover.test.js');

/* ------------------------------------------------------------ 1. 頭語と結語 */

test('頭語を選ぶと、対になる結語がそろう', () => {
  assert.strictEqual(CL.buildDocument({ salutation: 'haikei' }).closing, '敬具');
  assert.strictEqual(CL.buildDocument({ salutation: 'zenryaku' }).closing, '草々');
});

test('「付けない」を選ぶと、頭語も結語も出ない', () => {
  const doc = CL.buildDocument({ salutation: 'none' });
  assert.strictEqual(doc.opening, '');
  assert.strictEqual(doc.closing, '');
});

test('知らない頭語を渡されたら、拝啓に倒す(空の紙面を出さない)', () => {
  const doc = CL.buildDocument({ salutation: 'nazono-tougo' });
  assert.strictEqual(doc.opening, '拝啓');
  assert.strictEqual(doc.closing, '敬具');
});

/* -------------------------------------------------------- 2. 時候の挨拶 */

test('拝啓なら、日付の月に合う時候の挨拶が入る', () => {
  const doc = CL.buildDocument(BASE);
  assert.ok(doc.lead.startsWith('初秋の候'), 'lead=' + doc.lead);
});

test('前略のときは、利用者が入れる設定でも時候の挨拶を出さない', () => {
  const doc = CL.buildDocument(Object.assign({}, BASE, { salutation: 'zenryaku', useGreeting: true }));
  assert.strictEqual(doc.lead, '');
});

test('チェックを外したら、拝啓でも時候の挨拶を出さない', () => {
  const doc = CL.buildDocument(Object.assign({}, BASE, { useGreeting: false }));
  assert.strictEqual(doc.lead, '');
});

test('12か月すべてに挨拶がある(月を跨いで空にならない)', () => {
  for (let m = 1; m <= 12; m++) {
    const iso = '2026-' + (m < 10 ? '0' + m : m) + '-01';
    assert.ok(CL.greetingFor(iso), m + '月の挨拶が無い');
  }
});

test('日付が空・不正なら、挨拶も日付表記も空にする(今日で埋めない)', () => {
  assert.strictEqual(CL.greetingFor(''), '');
  assert.strictEqual(CL.greetingFor('2026/09/10'), '');
  assert.strictEqual(CL.formatDateJa(''), '');
  assert.strictEqual(CL.formatDateJa('2026-9-10'), '');
});

test('日付は「2026年9月10日」の形になる(0埋めしない)', () => {
  assert.strictEqual(CL.formatDateJa('2026-09-10'), '2026年9月10日');
  assert.strictEqual(CL.formatDateJa('2026-12-01'), '2026年12月1日');
});

/* ------------------------------------------------------------ 3. 記書き */

test('同封物が1件でもあれば、記書きを出す', () => {
  assert.strictEqual(CL.buildDocument(BASE).hasRecord, true);
});

test('同封物が0件なら、記書きを出さない', () => {
  const doc = CL.buildDocument(Object.assign({}, BASE, { itemsText: '' }));
  assert.strictEqual(doc.hasRecord, false);
  assert.deepStrictEqual(doc.items, []);
});

test('空行だけの入力は、同封物0件として扱う', () => {
  const doc = CL.buildDocument(Object.assign({}, BASE, { itemsText: '\n  \n　\n' }));
  assert.strictEqual(doc.hasRecord, false);
});

/* -------------------------------------------------------- 同封物の読み取り */

test('「請求書 1通」を名前と数量に分ける', () => {
  assert.deepStrictEqual(CL.parseItems('請求書 1通'), [{ name: '請求書', count: 1, unit: '通' }]);
});

test('全角の空白でも分けられる', () => {
  assert.deepStrictEqual(CL.parseItems('契約書　2通'), [{ name: '契約書', count: 2, unit: '通' }]);
});

test('数量だけで単位が無くても読める', () => {
  assert.deepStrictEqual(CL.parseItems('返信用封筒 1'), [{ name: '返信用封筒', count: 1, unit: '通' }]);
});

test('数量が書いていない行は1通として扱う', () => {
  assert.deepStrictEqual(CL.parseItems('返信用封筒'), [{ name: '返信用封筒', count: 1, unit: '通' }]);
});

test('「通」以外の単位も残す(部・枚)', () => {
  assert.deepStrictEqual(CL.parseItems('会社案内 3部'), [{ name: '会社案内', count: 3, unit: '部' }]);
  assert.deepStrictEqual(CL.parseItems('図面 5枚'), [{ name: '図面', count: 5, unit: '枚' }]);
});

test('名前に数字が入っていても、末尾の数量だけを数量として読む', () => {
  assert.deepStrictEqual(CL.parseItems('2026年度 契約書 2通'),
    [{ name: '2026年度 契約書', count: 2, unit: '通' }]);
});

test('紙面に出す形は「請求書　1通」', () => {
  assert.strictEqual(CL.formatItem({ name: '請求書', count: 1, unit: '通' }), '請求書　1通');
});

/* ------------------------------------------------------------ 宛名と抜け */

test('敬称は宛名のうしろに全角空白で付く', () => {
  assert.strictEqual(CL.buildDocument(BASE).to.name, '株式会社サンプル　御中');
});

test('敬称を「なし」にすると、会社名だけになる(御中と様を重ねないため)', () => {
  const doc = CL.buildDocument(Object.assign({}, BASE, { toHonorific: '' }));
  assert.strictEqual(doc.to.name, '株式会社サンプル');
});

test('宛名が空なら、敬称だけが浮かないようにする', () => {
  const doc = CL.buildDocument(Object.assign({}, BASE, { toName: '' }));
  assert.strictEqual(doc.to.name, '');
});

test('届いてから困る抜けだけを挙げる(宛名・差出人・日付・本文)', () => {
  assert.deepStrictEqual(CL.findMissing(CL.buildDocument(BASE)), []);
  assert.deepStrictEqual(CL.findMissing(CL.buildDocument({})),
    ['宛名', '差出人', '日付', '本文']);
});

/* ------------------------------------------------------------ ひな形 */

test('ひな形はすべて、本文が「送った」と「してほしい」の2文になっている', () => {
  Object.keys(CL.PRESETS).forEach((key) => {
    if (key === 'free') return;                       // 自分で書く欄は空で正しい
    const body = CL.PRESETS[key].body;
    assert.ok(body.indexOf('\n') !== -1, key + ' の本文が1文しかない');
    assert.ok(body.trim().length > 20, key + ' の本文が短すぎる');
  });
});

test('ひな形の同封物は、そのまま parseItems で読み戻せる', () => {
  Object.keys(CL.PRESETS).forEach((key) => {
    const text = CL.PRESETS[key].items.map(CL.formatItem).join('\n');
    const back = CL.parseItems(text);
    assert.strictEqual(back.length, CL.PRESETS[key].items.length, key);
    back.forEach((item, i) => {
      assert.strictEqual(item.name, CL.PRESETS[key].items[i].name, key);
      assert.strictEqual(item.count, CL.PRESETS[key].items[i].count, key);
    });
  });
});

test('契約書のひな形には、返送をお願いする文と返信用封筒が入っている', () => {
  const preset = CL.PRESETS.contract;
  assert.ok(preset.body.includes('ご返送'), '返送をお願いする文が無い');
  assert.ok(preset.items.some((i) => i.name === '返信用封筒'), '返信用封筒が同封物に無い');
});

console.log('cover.test.js: ' + passed + ' 件すべて通過');
