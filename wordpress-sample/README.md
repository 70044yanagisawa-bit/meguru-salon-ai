# SAMPLE SITE — WordPress(Lightning + 子テーマ)トップページ試作

「個人事業主の活動紹介とブログ」を仮設定にした試作です。本番公開・サーバー契約・ドメイン取得は未実施。

## 構成
- WordPress + 無料テーマ Lightning 15.43(親テーマは未編集) + 子テーマ `lightning-child-sample`
- DB は SQLite(プラグイン *SQLite Database Integration*)。ローカル専用。有料のテーマ・プラグインは使用していません。
- リポジトリに入っているもの(他は含まず):
  - `child-theme/lightning-child-sample/` … 子テーマ(`style.css` / `functions.php` / `assets/front.css`)
  - `seed/front-page.html` … トップページのブロック構造(初回投入用。投入後の本文は管理画面で管理)
  - `seed/setup.php` … 記事・カテゴリー・画像・メニュー・表示設定の投入(何度実行しても重複しない)
  - `seed/images/`, `tools/make_placeholders.py` … 自作の仮画像
  - `setup.sh` … 環境を一から作る手順の自動化 / `docs/素材の出典.md`

## 起動
```bash
bash setup.sh                       # 初回のみ(~/wp-local に作成)
php -S 0.0.0.0:8080 -t ~/wp-local/site
```
- サイト: http://localhost:8080/  管理画面: http://localhost:8080/wp-admin/(ユーザー `admin` / パスワード `admin-local-only`。ローカル専用の仮のもの)

## 管理画面でやること(トップページの変更)
| したいこと | 操作 |
|---|---|
| 文章・ボタン・キャッチコピー、画像の変更 | 固定ページ → 「ホーム」を編集。文字をクリックして直接書き換え、画像ブロックは「置き換え」でメディアライブラリから選択 → 更新 |
| ブログ記事の追加 | 投稿 → 新規追加。タイトル・本文・アイキャッチ画像・カテゴリーを設定して公開 → 「新着記事」に自動表示 |
| おすすめに載せる | 記事のカテゴリーに「おすすめ」を付ける(最大3件、新しい順) |
| メニュー | 外観 → メニュー(「メインメニュー(試作)」「フッターメニュー(試作)」) |
| ロゴ | 外観 → カスタマイズ → サイト基本情報 |
| 色・ヘッダー等 | 外観 → カスタマイズ(Lightning 設定) |
| 表示設定 | 設定 → 表示設定:ホームページ=「ホーム」、投稿ページ=「ブログ」 |

テスト記事は「【テスト記事】」で始まります。投稿一覧から削除してください。

## バックアップ / 復元
ローカルの全データ(DB・画像・設定)は `~/wp-local/site/wp-content/database/` と `uploads/` にあります。
```bash
# バックアップ
tar czf ~/wp-local/backup-$(date +%Y%m%d-%H%M).tar.gz -C ~/wp-local/site wp-content/database wp-content/uploads wp-content/themes/lightning-child-sample wp-config.php
# 復元(サーバー停止後)
tar xzf ~/wp-local/backup-日時.tar.gz -C ~/wp-local/site
```
子テーマと仮素材はこのリポジトリ(git)にあるので、`git checkout <コミット> -- wordpress-sample` で戻せます。

## 元に戻す
- 見た目だけ戻す: 外観 → テーマで親テーマ「Lightning」を有効化(子テーマの変更は無効になる)
- トップページ本文を初期状態に戻す: `SAMPLE_RESET_HOME=1 wp eval-file seed/setup.php`(「ホーム」の本文を上書きするので注意)
- 全部やり直す: `~/wp-local/site` を削除して `setup.sh` を再実行(リポジトリの他のファイルには影響なし)

## 注意
- 本番サーバー(MySQL)へ移すときは SQLite プラグインと `wp-content/db.php` を使わず、別途 WordPress を作って子テーマ・固定ページ・投稿をエクスポート/インポートしてください(未実施)。
- 管理者パスワードはローカル検証用です。公開環境では必ず変更してください。

## クライアント(髙木 晴さん)の文章・写真の取り込み
クライアント本人のサイト https://haltakagi.com/ の文章と写真を、本人の使用許可のもと、仮素材と置き換えて取り込んだ。
- **写真はリポジトリに入れない。** `python3 tools/prepare_client_images.py` で、サイトから取得して `seed/client-images/`(.gitignore 済み)に保存し、カード用にトリミングする。
- 取り込み: `wp eval-file seed/import-client.php`(先に `seed/setup.php` を実行しておく)。
  - 記事: サイトにブログ記事がないため、サイトの各セクション(想い・人生の領域・プログラムの流れ・専門コーチング・メッセージ)を **記事として登録**し、新着記事・おすすめに表示している。実際のブログが始まったら、管理画面で削除してよい。
  - トップページ「ホーム」の本文は `seed/front-page-client.html` の内容で**上書き**される。
  - 仮の【テスト記事】6件と、仮画像(`test-*`。おすすめ背景の `test-recommend-bg.jpg` を除く)は削除される。
- 未取り込み: 公式LINE・Instagramへのリンク、LINEのQRコード、バランスホイール、プライバシーポリシー、恋愛／フィットネスの各ページ。
- 注意: 経歴などの内容は、クライアントのサイトの記載をそのまま転載したもの。公開前に、本人に最終確認すること。
