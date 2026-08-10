"""IndexNow へ本番のURLを通知する。

なぜ要るか:
  本サイトは被リンクが実質0本で、クローラを呼べる経路が
  Search Console のサイトマップ送信しか無い。そのサイトマップは
  Google 側で「取得できませんでした」のまま止まっている(2026-08-03〜)。
  IndexNow は「更新したURLを検索エンジンに能動的に通知する」公開プロトコルで、
  アカウント登録もオーナー操作も費用も要らない。所有確認は
  https://<ドメイン>/<キー>.txt を置くだけで済む。
  B4が自分の手で増やせる、数少ない発見経路のひとつ。

  ※ 姉妹事業B5が 2026-08-04 から同じ方式で運用しており、直近も受理されている。
    実装はそれに合わせてある(手順を事業ごとに変えない)。

使い方:
  git push で本番へキーファイルを出す  # 先にキーファイルを本番に置く
  python indexnow_submit.py            # そのあとで送信する

  キーファイルが本番に無い状態で送ると 403 が返る。順序を守ること。
"""
import json
import re
import sys
import urllib.request

SITE_URL = "https://invoice-tool-kohl.vercel.app"
INDEXNOW_KEY = "a7f3c9e21b8d4f60a5e7c3b19d2f8460"

HOST = SITE_URL.split("//", 1)[1]
ENDPOINT = "https://api.indexnow.org/indexnow"


def load_urls():
    """本番の sitemap.xml から送信対象URLを読む(手元のファイルではなく本番を見る)。"""
    with urllib.request.urlopen(SITE_URL + "/sitemap.xml", timeout=30) as r:
        xml = r.read().decode("utf-8")
    return re.findall(r"<loc>(.*?)</loc>", xml)


def check_key_file():
    """本番にキーファイルが出ているかを先に確かめる。"""
    url = f"{SITE_URL}/{INDEXNOW_KEY}.txt"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            body = r.read().decode("utf-8").strip()
    except Exception as e:  # noqa: BLE001
        print(f"NG キーファイルを取得できません: {url} ({e})")
        return False
    if body != INDEXNOW_KEY:
        print(f"NG キーファイルの中身が一致しません: {url}")
        return False
    print(f"OK キーファイルを本番で確認: {url}")
    return True


def submit(urls):
    payload = {
        "host": HOST,
        "key": INDEXNOW_KEY,
        "keyLocation": f"{SITE_URL}/{INDEXNOW_KEY}.txt",
        "urlList": urls,
    }
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read().decode("utf-8", "replace")


def main():
    if not check_key_file():
        return 1
    if len(sys.argv) > 1:
        # 変えたページだけを送る。引数はパス(/guide/...)でも絶対URLでもよい。
        urls = [a if a.startswith("http") else SITE_URL + a for a in sys.argv[1:]]
        known = set(load_urls())
        unknown = [u for u in urls if u not in known]
        if unknown:
            print(f"NG sitemap に無いURLは送らない: {unknown}")
            return 1
    else:
        urls = load_urls()
    print(f"送信対象: {len(urls)} URL")
    status, body = submit(urls)
    print(f"HTTP {status} {body!r}")
    # 200 = 受理 / 202 = 受理(キー確認は保留)
    return 0 if status in (200, 202) else 1


if __name__ == "__main__":
    sys.exit(main())
