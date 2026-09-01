# -*- coding: utf-8 -*-
"""DuckDuckGo(HTML版)で自サイトの掲載順位を数える測定スクリプト。
- 使う endpoint: https://html.duckduckgo.com/html/  (POST, kl=jp-jp)
- 順位は「広告を除いたオーガニック結果の通し番号」
- 正の対照(必ず1位で拾えるはず)と負の対照(0件のはず)を必ず一緒に測る
⚠ DuckDuckGo の索引は Bing 由来である。Google の順位ではない。
"""
import sys, re, time, html, urllib.parse as up, subprocess, json

DOMAIN = "invoice-tool-kohl.vercel.app"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"

def fetch(q, offset):
    args = ["curl", "-s", "-A", UA, "https://html.duckduckgo.com/html/",
            "--data-urlencode", "q=" + q, "-d", "kl=jp-jp"]
    if offset:
        args += ["-d", "s=%d" % offset, "-d", "dc=%d" % (offset + 1), "-d", "v=l", "-d", "o=json", "-d", "api=d.js"]
    out = subprocess.run(args, capture_output=True).stdout.decode("utf-8", "replace")
    return out

def parse(doc):
    """(url, title) のリスト。広告(y.js)は除く。"""
    rows = []
    for u, t in re.findall(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', doc, re.S):
        if u.startswith("//"):
            u = "https:" + u
        if "uddg=" in u:
            u = up.unquote(u.split("uddg=")[1].split("&")[0])
        if "duckduckgo.com/y.js" in u:      # 広告
            continue
        rows.append((u, re.sub("<[^>]+>", "", html.unescape(t)).strip()))
    return rows

def rank(q, pages=3):
    seen, hits = [], []
    for p in range(pages):
        doc = fetch(q, p * 30)
        if "anomaly" in doc or "Unfortunately, bots" in doc:
            return None, None, "bot判定で測れず"
        rows = parse(doc)
        if not rows:
            break
        for u, t in rows:
            if u in [x[0] for x in seen]:
                continue
            seen.append((u, t))
            if DOMAIN in u:
                hits.append((len(seen), u, t))
        time.sleep(2.0)
    return hits, len(seen), None

if __name__ == "__main__":
    queries = json.load(open(sys.argv[1], encoding="utf-8"))
    for label, q in queries:
        hits, total, err = rank(q)
        if err:
            print("%-28s | %-34s | %s" % (label, q, err)); continue
        pos = ", ".join("%d位 %s" % (n, u.replace("https://" + DOMAIN, "") or "/") for n, u, _ in hits) or "圏外"
        print("%-28s | %-34s | 母数%3d | %s" % (label, q, total, pos))
        sys.stdout.flush()
