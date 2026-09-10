/* 広告の設定値を、環境変数から静的ファイルへ書き出す。
 *
 * このサイトはビルドを持たない静的サイトなので、環境変数をそのままでは読めない。
 * デプロイのたびにこのスクリプトが2つのファイルを作り直すことで、
 * オーナー様の作業を「Vercel に値を2つ貼る」だけにしている
 * (姉妹サイト seal-generator と同じ手順にそろえてある)。
 *
 *   public/ads-config.js  … 発行者IDと広告ユニットID。未設定なら null
 *   public/ads.txt        … AdSense の所有者確認用。未設定なら作らない(=404)
 *
 * ⚠ このスクリプトは失敗しない。値が無ければ「未設定」を書き出して 0 で終わる。
 *   ビルドが落ちると本番サイト全体が更新できなくなるためである。
 *
 * 設計: AIBusiness `businesses/starter-tools/広告_設計.md`
 */
import { writeFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const client = (process.env.ADSENSE_CLIENT ?? "").trim();
const slot = (process.env.ADSENSE_ARTICLE_SLOT ?? "").trim();

/* 形の検査。書きかけの値で <script> を出すと、審査時に「壊れた広告コード」として
   見られる。形が合っているときだけ有効にする。
   ⚠ 片方だけ設定された状態を「有効」と見なさない。 */
const clientOk = /^ca-pub-\d{10,}$/.test(client);
const slotOk = /^\d{6,}$/.test(slot);
const enabled = clientOk && slotOk;

const header = `/* 自動生成 — tools/build-ads.mjs が書き出す。手で編集しない。 */\n`;

writeFileSync(
  join(publicDir, "ads-config.js"),
  enabled
    ? `${header}window.__ADSENSE__ = ${JSON.stringify({ client, slot })};\n`
    : `${header}window.__ADSENSE__ = null;\n`,
  "utf8",
);

/* ads.txt は発行者IDだけで決まるので、広告ユニットIDが無くても出す。
   中身が空の 200 を返すと「ads.txt はあるが自分の枠が載っていない」と
   読まれ、かえって不利になるため、未設定のときはファイルごと消す(=404)。
   末尾の f08c47fec0942fa0 は Google が全発行者に共通で定めている
   認証局IDで、秘密の値ではない。 */
const adsTxt = join(publicDir, "ads.txt");
if (clientOk) {
  writeFileSync(
    adsTxt,
    `google.com, ${client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`,
    "utf8",
  );
} else if (existsSync(adsTxt)) {
  rmSync(adsTxt);
}

console.log(
  `build-ads: 発行者ID=${clientOk ? "設定あり" : "未設定"} / ` +
    `広告ユニットID=${slotOk ? "設定あり" : "未設定"} → ` +
    `広告=${enabled ? "有効" : "無効(1バイトも描画しない)"} / ` +
    `ads.txt=${clientOk ? "出力" : "出力しない(404)"}`,
);
