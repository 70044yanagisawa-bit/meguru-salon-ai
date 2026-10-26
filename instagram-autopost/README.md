# ホットペッパービューティーのブログ → Instagram 自動投稿

HPBに書いたブログを、Instagram向けに書き直して投稿する仕組みです。
サイト本体とは別の Cloudflare Worker として動きます。

```
① 8〜22時に2時間おき、HPBの公開ブログ一覧を確認
② 新しい記事があれば本文と写真を読み取り、Claudeがインスタ用キャプションを作成
③ LINEに下書きが届く ─［投稿する］［写真を見る・文章を直す］［見送る］
④ ［投稿する］でInstagramに投稿（写真が2枚以上ならカルーセル）。結果もLINEに届く
```

- **初回は過去記事を投稿しません。** 最初の確認で、その時点の記事をすべて「対象外」として記録します。
- 1回の確認で処理する新着は最大3件です。
- 休業のお知らせなど、Instagramに向かない記事はClaudeが判断して見送り、LINEで知らせます。
- 慣れたら `AUTO_PUBLISH` を `"true"` にすると、承認なしで投稿されます（結果だけLINEに届きます）。

```
src/index.ts      全体の流れ・LINEのWebhook・編集ページ・画像の中継
src/hpb.ts        HPBブログの読み取り
src/caption.ts    Claudeでキャプション作成（指示文はここ）
src/instagram.ts  Instagramへの投稿・トークン延長
src/line.ts       LINE通知
src/db.ts         記事の記録（Cloudflare D1）
schema.sql        D1のテーブル
test/smoke.ts     外部サービスを偽物に差し替えた動作テスト（npm test）
```

---

## 準備するもの

| | 必要なもの | 費用 |
|---|---|---|
| Instagram | プロアカウント（ビジネス／クリエイター） ※Facebookページ連携は**不要** | 無料 |
| Meta | 開発者アカウントとアプリ | 無料 |
| LINE | LINE公式アカウント（Messaging API） | 無料プランで足ります（通知は月200通まで） |
| Claude | Anthropic APIキー | 1記事あたり10円前後 |
| Cloudflare | Workers と D1 | 無料枠で足ります |

## 1. Instagram（Meta）の設定

「Instagramログインを使ったInstagram API」を使います。この方式ではFacebookページとの連携は要りません。

1. https://developers.facebook.com/ に、Instagramと同じ人のFacebookアカウントでログインし、開発者登録する
2. **マイアプリ → アプリを作成**
   - ユースケースは「Instagramでメッセージとコンテンツを管理」（Instagram API）を選ぶ
3. アプリのダッシュボードで **Instagram → Instagramログインを使ったAPI設定**
   - 権限 `instagram_business_basic` と `instagram_business_content_publish` を追加
   - 「アクセストークンを生成」でサロンのInstagramアカウントを追加し、ログインして許可する
   - 表示された**アクセストークン**（長期トークン、60日有効）と、アカウントの**ユーザーID**（数字）を控える
4. アプリは「開発モード」のままで大丈夫です。自分のアカウントにだけ投稿するので、アプリ審査はいりません。

トークンの期限（60日）は、このWorkerが1週間ごとに自動で延長します。
ただし、60日以上止めていた場合は、手順3でトークンを作り直してください。

> Metaの画面の名前や配置は、ときどき変わります。見つからないときは「Instagram API with Instagram Login」で検索してください。

## 2. LINE公式アカウントの設定

1. https://entry.line.biz/ でLINE公式アカウントを作る（通知専用なので、名前は「めぐる投稿くん」など何でもかまいません）
2. LINE Official Account Manager → **設定 → Messaging API → 利用する**
3. https://developers.line.biz/console/ で、作ったチャネルを開く
   - **チャネル基本設定** → チャネルシークレットを控える
   - **Messaging API設定** → チャネルアクセストークン（長期）を発行して控える
   - **Webhook URL** に `https://<このWorkerのURL>/line/webhook` を入れ、「Webhookの利用」をオンにする（手順4のデプロイ後）
   - 「応答メッセージ」はオフにする
4. スマホでこの公式アカウントを友だち追加する

## 3. Anthropic APIキー

https://console.anthropic.com/ でAPIキーを作り、少額をチャージしておきます。

## 4. Cloudflareに公開する

Macのターミナルで実行します。

```bash
cd "/Users/yanagisawa/Desktop/ファイル/ツール/salon-ai-site/instagram-autopost"
npm install
npx wrangler login

# データベースを作る → 表示された database_id を wrangler.jsonc に貼る
npx wrangler d1 create meguru-autopost
npm run db:init
```

`wrangler.jsonc` の `vars` を埋めます。

| 項目 | 入れるもの |
|---|---|
| `HPB_BLOG_URL` | お客様が見る公開ページのブログ一覧。例 `https://beauty.hotpepper.jp/slnH000123456/blog/`（SALON BOARDのURLではありません） |
| `PUBLIC_BASE_URL` | このWorkerのURL（初回デプロイで表示されます。末尾の `/` なし） |
| `IG_USER_ID` | 手順1で控えたユーザーID |
| `SALON_NAME` | サロン名 |
| `BOOKING_TEXT` | キャプション最後の予約導線 |
| `FIXED_HASHTAGS` | 毎回入れるタグ。例 `#高円寺美容室 #めぐるサロン` |

秘密の値を登録します（1つずつ聞かれるので貼り付けます）。

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put IG_ACCESS_TOKEN
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put ADMIN_KEY          # 手動実行用の合言葉。長めの適当な文字列
npm run deploy
```

### LINEのユーザーIDを登録する

1. デプロイ後、LINE公式アカウントに何か話しかけると「あなたのLINEユーザーIDは U… です」と返ってくる
2. それを登録して、もう一度デプロイする

```bash
npx wrangler secret put LINE_OWNER_USER_ID
npm run deploy
```

以降、ボタンの操作を受け付けるのはこのIDの人だけです。

## 5. 動作確認

すぐに1回確認を走らせます（ふだんは自動で動くので不要です）。

```bash
curl -X POST -H "Authorization: Bearer <ADMIN_KEY>" https://<このWorkerのURL>/run
```

1. 1回目は「準備ができました。いまあるブログN件は対象外にし…」とLINEに届く
2. HPBでブログを1本書いてから、もう一度実行すると、下書きがLINEに届く
3. ［写真を見る・文章を直す］で内容を確認し、［投稿する］

ログは `npx wrangler tail` で見られます。

---

## 運用

- **自動投稿に切り替える**: `wrangler.jsonc` の `AUTO_PUBLISH` を `"true"` にして `npm run deploy`
- **止める**: `wrangler.jsonc` の `triggers.crons` を `[]` にしてデプロイ（Cloudflareのダッシュボードからも止められます）
- **キャプションの雰囲気を変える**: `src/caption.ts` の指示文を直す
- **失敗したとき**: 理由と編集ページのリンクがLINEに届きます。直して［保存して投稿する］で再投稿できます

### うまくいかないとき

| 症状 | 見るところ |
|---|---|
| 「ブログ一覧から記事が1件も見つかりませんでした」 | `HPB_BLOG_URL` が公開ページのブログ一覧か。HPBの画面構成が変わった場合は `src/hpb.ts` の修正が必要 |
| 「Instagramが画像を処理できませんでした」 | Instagramは縦横比 4:5〜1.91:1 のJPEGしか受け付けません。縦長すぎる写真が入っていないか |
| 「トークンの延長に失敗」 | Instagramのトークンが切れています。手順1の3で作り直し、`IG_ACCESS_TOKEN` を登録し直す |
| LINEのボタンを押しても反応しない | Webhook URL と「Webhookの利用」、`LINE_OWNER_USER_ID` |

## 注意

- HPBにはブログを取り出す公式の方法がないため、公開ページを読み取っています。自店のブログを2時間に1回読むだけにとどめていますが、リクルートの利用規約上は「自動での取得」にあたります。気になる場合は、頻度をさらに下げるか、承認モードのまま使ってください。
- HPBの画面の作りが変わると、読み取れなくなることがあります。その場合はLINEにエラーが届きます。
- キャプションは、ブログに書かれていない事実（価格・効果・数字）を足さないよう指示しています。それでも、承認モードのうちは投稿前に目を通してください。
