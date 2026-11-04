# 画像生成ツール

OpenAI と Google Gemini（Imagen）の両方で画像を作れる、手元で動かすスクリプトです。
**片方が残高切れ・上限超え・障害などで失敗すると、自動でもう片方に切り替えて作り直します。**

サイト（`public/`）には含まれず、公開もされません。APIキーもサイトには載りません。
Claude を使っていないので、Claude の利用上限とは関係なく動きます。

## 準備（初回のみ）

1. Node.js 22 以上を入れる（`node -v` で確認）
2. APIキーを発行する（片方だけでも動きますが、両方あると切り替えが効きます）
   - OpenAI: https://platform.openai.com/api-keys （支払い設定が必要）
   - Gemini: https://aistudio.google.com/apikey （Imagen は有料プランが必要）
3. 設定ファイルを作ってキーを貼る

```bash
cp tools/image-gen/.env.example tools/image-gen/.env
```

## 使い方

サイトの写真枠に合わせたプリセットがあります（内容は `写真リスト.md` に合わせています）。

```bash
node tools/image-gen/generate.mjs --list
```

```bash
node tools/image-gen/generate.mjs hero
```

```bash
node tools/image-gen/generate.mjs service-web --count 3
```

自由に作るときは `--prompt` を使います。英語で書くほうが仕上がりが安定します。

```bash
node tools/image-gen/generate.mjs --prompt "a pair of hair scissors on a wooden counter, soft morning light" --aspect 3:2
```

| オプション | 内容 |
|---|---|
| `--prompt` | 作りたい画像の説明。プリセットと一緒に使うと指示を追記できる |
| `--aspect` | 比率（`1:1` `3:4` `4:3` `2:3` `3:2` `9:16` `16:9`） |
| `--provider openai` / `gemini` | そのサービスだけ使う（切り替えない） |
| `--count` | 枚数（1〜4） |
| `--out` | 保存先フォルダ |

できた画像は `tools/image-gen/output/` に保存されます（Gitには上がりません）。

## サイトに使うとき

1. `output/` の中から気に入ったものを選び、`public/assets/img/` に置く（例：`hero.png`）
2. `public/index.html` の `src="assets/img/hero.svg"` を書き換え、`alt` も内容に合わせて直す

サイト側は枠に合わせて自動で切り抜くので、比率が少し違っても問題ありません。
PNGは重いので、公開前に https://squoosh.app などで WebP か JPEG に変換すると表示が速くなります。

## 注意

- 柳沢さんのプロフィール写真と、店名入りのOGP画像はプリセットに入れていません。本人の写真や実際の文字入れを使ってください。
- 生成画像を「実際の店舗」「実際の支援先」と受け取られる使い方は避けてください（イメージ写真として使う）。
- 料金は1枚あたり数円〜数十円程度です。最新の料金は各サービスの料金ページで確認してください。
