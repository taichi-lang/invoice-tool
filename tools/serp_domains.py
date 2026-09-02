# -*- coding: utf-8 -*-
"""DuckDuckGo(HTML版)で、狙っている語の上位10件の「ドメインの顔ぶれ」を数える。

なぜ要るか:
  09-02 に12語の順位を測ったが、語は当方の当て推量で選んだもので、
  「上位が大手で埋まっているか」を一度も見ていない。
  順位が圏外なのは当然かもしれず、その語に入る余地があるのかが分からない。

出すもの: 語ごとの上位10ドメインと、大手(会計SaaS・大手メディア・行政)の占有数。
⚠ DuckDuckGo の索引は Bing 由来。Google の順位ではない。
"""
import sys, re, time, html, json, urllib.parse as up, subprocess
from collections import Counter

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"

# 大手 = 資本のある会計SaaS / 大手メディア / 行政。個人が正面から勝てない側。
MAJOR = [
    "freee.co.jp", "moneyforward.com", "biz.moneyforward.com", "yayoi-kk.co.jp",
    "obc.co.jp", "sms-datatech.co.jp", "misoca.jp", "bizocean.jp", "invoy.jp",
    "board.jp.net", "makeleaps.jp", "sansan.com", "billone.jp", "rakumachi.jp",
    "nta.go.jp", "e-gov.go.jp", "chusho.meti.go.jp", "mof.go.jp", "meti.go.jp",
    "smbc.co.jp", "mufg.jp", "jcb.co.jp", "rakuten.co.jp", "amazon.co.jp",
    "wikipedia.org", "note.com", "ja.wikipedia.org", "toyokeizai.net",
    "nikkei.com", "mynavi.jp", "recruit.co.jp", "lancers.jp", "crowdworks.jp",
    "freelance-jp.org", "kaikei-home.com", "zeiri4.com", "bengo4.com",
    "sumoviva.jp", "keiei.freee.co.jp", "biz.ne.jp", "ricoh.co.jp",
]

def fetch(q, offset=0):
    args = ["curl", "-s", "-A", UA, "https://html.duckduckgo.com/html/",
            "--data-urlencode", "q=" + q, "-d", "kl=jp-jp"]
    if offset:
        args += ["-d", "s=%d" % offset, "-d", "dc=%d" % (offset + 1),
                 "-d", "v=l", "-d", "o=json", "-d", "api=d.js"]
    return subprocess.run(args, capture_output=True).stdout.decode("utf-8", "replace")

def parse(doc):
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

def host(u):
    h = up.urlparse(u).netloc.lower()
    return h[4:] if h.startswith("www.") else h

def is_major(h):
    return any(h == m or h.endswith("." + m) for m in MAJOR)

def top10(q):
    doc = fetch(q)
    if "anomaly" in doc or "Unfortunately, bots" in doc:
        return None, "bot判定で測れず"
    rows, seen = [], set()
    for u, t in parse(doc):
        h = host(u)
        if not h or u in seen:
            continue
        seen.add(u)
        rows.append((h, u, t))
        if len(rows) >= 10:
            break
    return rows, None

if __name__ == "__main__":
    queries = json.load(open(sys.argv[1], encoding="utf-8"))
    for q in queries:
        rows, err = top10(q)
        if err:
            print("== %s\n   %s" % (q, err)); sys.stdout.flush(); continue
        n_major = sum(1 for h, _, _ in rows if is_major(h))
        print("== %s  (上位%d件 / 大手 %d件 / それ以外 %d件)"
              % (q, len(rows), n_major, len(rows) - n_major))
        for i, (h, u, t) in enumerate(rows, 1):
            print("   %2d %-6s %-34s %s" % (i, "大手" if is_major(h) else "・", h, t[:38]))
        sys.stdout.flush()
        time.sleep(20.0)
