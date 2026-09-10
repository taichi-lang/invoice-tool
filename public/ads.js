/* 記事の末尾に置く広告の入れ物。
 *
 * 設定値(`ads-config.js` の `window.__ADSENSE__`)が未設定のあいだは
 * 何もしない。器も余白も出さないので、未設定のうちは画面が1ピクセルも変わらない。
 *
 * 置く場所の決まり(`広告_設計.md` §3):
 * - 置くのは解説記事と母屋の「本文が終わったあと」だけ
 * - 書類を作る画面(`/` `/mitsumorisho` `/ryoshusho` `/nohinsho` `/soufujo` `/inshi`)
 *   と `/legal` には置かない。だからそれらのページはこのファイルを読み込んでいない
 * - ファーストビューには置かない。挿入先は本文の最後だけである
 *
 * ⚠ 成果物を汚さない(同 §4)。請求書の紙はそのまま取引先へ渡る。
 *   印刷対策は二重にしてある。ここで `no-print` を付け、それとは別に
 *   `style.css` の `@media print` が `.ad-slot` そのものを消す。
 *
 * ⚠ 1ページに2枚出さない。記事側からこのファイルを二重に読み込まないこと。
 */
(function () {
  "use strict";

  var cfg = window.__ADSENSE__;
  if (!cfg || !cfg.client || !cfg.slot) return;

  /* 本文の最後に置く。解説記事は <article>、母屋 /kaigyo は <main> が本文である。 */
  var host = document.querySelector("article") || document.querySelector("main");
  if (!host) return;

  /* すでに1枚あるなら足さない。 */
  if (document.querySelector(".ad-slot")) return;

  var box = document.createElement("aside");
  box.className = "ad-slot no-print";
  box.setAttribute("aria-label", "広告");

  var label = document.createElement("p");
  label.className = "ad-label";
  label.textContent = "広告";
  box.appendChild(label);

  var ins = document.createElement("ins");
  ins.className = "adsbygoogle";
  ins.style.display = "block";
  ins.setAttribute("data-ad-client", cfg.client);
  ins.setAttribute("data-ad-slot", cfg.slot);
  ins.setAttribute("data-ad-format", "auto");
  ins.setAttribute("data-full-width-responsive", "true");
  box.appendChild(ins);

  host.appendChild(box);

  var loader = document.createElement("script");
  loader.async = true;
  loader.crossOrigin = "anonymous";
  loader.src =
    "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
    encodeURIComponent(cfg.client);
  /* 読み込めたときだけ push する。広告ブロッカーや CSP で落ちても
     ページ側のエラーにはしない。 */
  loader.onload = function () {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  };
  document.head.appendChild(loader);
})();
