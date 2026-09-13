#!/usr/bin/env python3
"""
紙面をA4のPDFに実際に出して、ページ数と各ページの本文の位置を測る道具。

なぜ要るか:
  ブラウザのDOMからは「ページのどこで割れたか」を読めない。
  2026-09-14、そのせいで「2ページ目が紙の上端から余白なしで始まっている」という欠陥に
  10日以上気づけなかった。画面の寸法だけを測っているかぎり、この欠陥は見えない。

使い方:
  1) public/ を作業用の場所に複製し、下の probe.js を足してから静的サーバーで出す
  2) python tools/paper_probe.py <PDFのパス>

⚠ この道具は本番に出るファイルではない。public/ には1バイトも足さないこと。

probe.js(複製した index.html の app.js の直後に読み込ませる):

    document.addEventListener('DOMContentLoaded', function () {
      var q = new URLSearchParams(location.search);
      var n = Math.max(1, Number(q.get('rows')) || 13);
      var items = [];
      for (var i = 1; i <= n; i++) {
        items.push({ name: '保守作業 ' + i + '月分', qty: 1, unit: '式', price: 50000, rate: 10, wh: false });
      }
      window.writeState({ docType: q.get('doc') || '請求書', items: items });
      window.update();
    });

  app.js の writeState / update をそのまま呼ぶので、紙面の組み立ては本番と同じ経路を通る。

PDFの出し方(Chrome ヘッドレス。印刷ダイアログは開かない):

    chrome --headless=new --disable-gpu --virtual-time-budget=5000 \
           --no-pdf-header-footer --print-to-pdf=out.pdf "http://127.0.0.1:8765/?rows=14"
"""
import sys

MM = 25.4 / 72.0


def main(path):
    import pymupdf  # 測るときだけ要る。本番にも tests にも依存を足さない。

    doc = pymupdf.open(path)
    print("ページ数:", doc.page_count)
    for i, page in enumerate(doc):
        r = page.rect
        print(f"-- {i + 1}ページ目: {r.width * MM:.1f} x {r.height * MM:.1f} mm")
        spans = [
            s
            for b in page.get_text("dict")["blocks"]
            for l in b.get("lines", [])
            for s in l["spans"]
            if s["text"].strip()
        ]
        if not spans:
            print("   本文: 無し ← 1文字も載っていない(白紙のページ)")
            continue
        top = min(s["bbox"][1] for s in spans) * MM
        bottom = max(s["bbox"][3] for s in spans) * MM
        left = min(s["bbox"][0] for s in spans) * MM
        print(f"   本文の始まり {top:.1f}mm / 終わり {bottom:.1f}mm / 左 {left:.1f}mm / 文字のかたまり {len(spans)}")
        if top < 10:
            print("   ⚠ 本文が紙の上端から 10mm 未満で始まっている。多くのプリンタは印字できない")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
