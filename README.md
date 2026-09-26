# 柳沢恵瑠 / 美容室専門AIコンサルティング — Webサイト

静的HTML／CSS／JavaScriptだけで作った1ページサイトです。ビルド不要、バックエンドなし。
GitHubにpushして、Cloudflare Pagesから公開します。

```
index.html          ページ本体（文章はここを直接編集）
assets/style.css    デザイン
assets/main.js      メニュー開閉・スクロール表示・FAQの開閉
assets/img/         写真（いまはプレースホルダ。写真リスト.md を参照）
_headers            Cloudflare Pages のキャッシュ設定
```

---

## 1. GitHubに上げる

```bash
cd "/Users/yanagisawa/Desktop/ファイル/ツール/salon-ai-site"
git add -A
git commit -m "サイトを更新"
git push
```

## 2. Cloudflare Pagesで公開する（初回のみ）

1. Cloudflareダッシュボード → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. このリポジトリを選ぶ
3. ビルド設定は次のとおり（ビルドしないのでほぼ空です）

   | 項目 | 値 |
   |---|---|
   | Framework preset | None |
   | Build command | （空のまま） |
   | Build output directory | `/` |

4. **Save and Deploy** → `xxxx.pages.dev` で公開される
5. 独自ドメインは **Custom domains** から追加（DNSもCloudflareに置くと設定が早い）

以降は `git push` するたびに自動で反映されます。
プレビュー用のURLもブランチごとに発行されるので、本番に出す前の確認に使えます。

## ローカルで確認する

```bash
cd "/Users/yanagisawa/Desktop/ファイル/ツール/salon-ai-site" && python3 -m http.server 8080
```

ブラウザで `http://localhost:8080` を開きます。

---

## 公開前に差し替えるところ

HTML内に `TODO` と `〔記入待ち〕` で印をつけてあります。検索して順に埋めてください。

- [ ] **予約URL** — CTAの「相談を予約する」（Googleフォーム、TimeRexなど）
- [ ] **LINEのURL** — 「LINEで相談する」
- [ ] **メールアドレス** — CTA下部の `mailto:`
- [ ] **プロフィール** — 経歴、屋号、所在、対応エリア
- [ ] **料金と契約期間** — FAQの2問。決まっていなければ、その2問ごと削除してかまいません
- [ ] **支援事例** — 許可が取れたものから。数値は実測値のみ
- [ ] **写真** — `assets/img/` の7枚（写真リスト.md に内容と構図）
- [ ] **公開ドメイン** — `<head>` の `og:url` と `canonical`

事実（実績・口コミ・数値）はこちらでは作っていません。すべて実際のものを入れてください。

## 写真を差し替えるとき

1. 撮った写真を `写真リスト.md` のファイル名に合わせて `assets/img/` に置く（例：`hero.jpg`）
2. `index.html` の `src="assets/img/hero.svg"` を `hero.jpg` に書き換える
3. あわせて `alt=""` の説明文も実際の写真の内容に直す

横幅は 1600px 程度まで縮小し、JPEG品質は80前後で十分です。
（WebPにするとさらに軽くなります。対応していないブラウザはほぼありません）

## 触るときの注意

- 色は `assets/style.css` の先頭 `:root` にまとめてあります。アクセント（`--accent`）は下線・番号・小さな印だけに使う前提の配色です。面に広く使うとバランスが崩れます。
- 見出しの明朝は Google Fonts の Shippori Mincho、本文は端末標準のゴシックです（本文はダウンロードなしなので表示が速い）。
- 動きは「ヒーローの立ち上がり」と「スクロールで少し上がる」の2つだけに絞っています。増やす場合はどちらかを削ると全体が締まります。
- OSで「視差効果を減らす」が有効な場合は、すべての動きが止まり最初から表示されます（`prefers-reduced-motion`）。
