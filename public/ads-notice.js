/* `/legal` の「アクセス解析・広告」の告知を、広告の設定値にあわせて切り替える。
 *
 * なぜ要るか(2026-09-14・B2):
 * ここは「広告は導入していません」と手書きだった。一方で広告の器(`ads.js`)は
 * 実装済みで、オーナー様が発行者IDと広告ユニットIDを貼った瞬間に記事面へ描画される。
 * つまり**貼った瞬間に本ページが嘘になる**状態だった。AdSense は第三者配信と
 * Cookie の告知を求めるため、これは審査に直接ひびく。
 *
 * ⚠ このファイルは広告を1バイトも読み込まない。`/legal` に広告は置かない
 *   (`広告_設計.md` §3 の禁止事項)。ここでやるのは文章の出し分けだけである。
 *
 * ⚠ 判定は `ads.js` とまったく同じ条件(`client` と `slot` の両方)を見る。
 *   条件を別々に書くと、片方だけ直したときに告知と実態が食い違う。
 */
(function () {
  "use strict";

  var cfg = window.__ADSENSE__;
  var on = !!(cfg && cfg.client && cfg.slot);

  var off = document.getElementById("ads-notice-off");
  var onEl = document.getElementById("ads-notice-on");
  if (!off || !onEl) return;

  off.hidden = on;
  onEl.hidden = !on;
})();
