// HPBブログの記事ページ（テキスト化したもの）から、Instagram用の下書きを作る。
// 本文の切り出し・使う写真の選択・キャプションの書き直しを、Claudeの1回の呼び出しでまとめて行う。
import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "./env";
import type { ArticlePage } from "./hpb";

export interface Draft {
  postable: boolean;
  skipReason: string;
  title: string;
  caption: string;
  images: string[];
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["postable", "skip_reason", "title", "caption", "image_indexes"],
  properties: {
    postable: {
      type: "boolean",
      description: "Instagramに載せてよい記事なら true。休業・臨時のお知らせだけ、本文がほぼ無い等なら false",
    },
    skip_reason: { type: "string", description: "postable が false の理由。true なら空文字" },
    title: { type: "string", description: "ブログ記事のタイトル" },
    caption: { type: "string", description: "Instagramのキャプション全文（ハッシュタグを含む）" },
    image_indexes: {
      type: "array",
      items: { type: "integer" },
      description: "投稿に使う写真の番号（[画像n] の n）。記事本文中の写真だけを、本文の順に最大10枚",
    },
  },
} as const;

function systemPrompt(env: Env): string {
  return `あなたは美容室「${env.SALON_NAME || "（サロン名未設定）"}」のInstagram運用担当です。
ホットペッパービューティーに載せたスタッフのブログ記事を、同じ内容のInstagram投稿に書き直します。

入力はブログ記事ページ全体をテキストにしたものです。ページにはサイト共通のメニュー、クーポン、他の記事へのリンク、フッターなども含まれています。その中から記事本文だけを読み取ってください。写真があった位置には [画像n] という印が入っています。

キャプションの書き方:
- 1行目は、フィードで「続きを読む」の前に見える部分です。記事の一番の見どころを、20〜30字で具体的に書く
- 本文は、ブログの内容を変えずにInstagramで読みやすく整える。2〜4行ごとに空行を入れる。全体で400〜900字程度
- ブログに書かれていない事実（価格・効果・実績・期間・人数など）は足さない。数字はブログにあるものだけ使う
- 「絶対」「必ず」「誰でも」など効果を言い切る表現や、医薬品的な効能（「髪が生える」「治る」など）は書かない。ブログにあっても和らげる
- 絵文字は控えめに（全体で3〜6個）
- HPB特有の言い回し（「ネット予約」「クーポン番号」「このブログを見たと…」など）は、Instagramに合わせて書き換えるか削る
- 最後に予約導線を1行入れる: ${env.BOOKING_TEXT}
- その後に空行を1つ挟んでハッシュタグを8〜15個。記事の内容に合うものと、地域・メニューのもの${env.FIXED_HASHTAGS ? `。次のタグは必ず含める: ${env.FIXED_HASHTAGS}` : ""}
- 書いたスタッフの名前が分かれば、本文の最後に「担当: ○○」と入れる

写真は、記事本文の中にあるものだけを選んでください。ロゴ・バナー・クーポン画像・スタッフ一覧の顔写真・他記事のサムネイルは選ばないでください。`;
}

export async function makeDraft(env: Env, page: ArticlePage): Promise<Draft> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const imageList = page.images.map((u, i) => `[画像${i}] ${u}`).join("\n") || "（なし）";
  const userText = `記事URL: ${page.url}
og:title: ${page.ogTitle ?? "（なし）"}

## 写真の候補
${imageList}

## ページのテキスト
${page.text}`;

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: systemPrompt(env),
    messages: [{ role: "user", content: userText }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`キャプションの生成が断られました: ${response.stop_details?.explanation ?? "理由不明"}`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("キャプションの生成が途中で切れました");
  }
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  const out = JSON.parse(text) as {
    postable: boolean;
    skip_reason: string;
    title: string;
    caption: string;
    image_indexes: number[];
  };

  const images = [...new Set(out.image_indexes)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < page.images.length)
    .slice(0, 10)
    .map((i) => page.images[i]);
  if (images.length === 0 && page.ogImage) images.push(page.ogImage);

  return {
    postable: out.postable && images.length > 0,
    skipReason: out.postable && images.length === 0 ? "投稿に使える写真がありません" : out.skip_reason,
    title: out.title || page.ogTitle || "",
    // Instagramのキャプション上限は2,200字
    caption: out.caption.slice(0, 2200),
    images,
  };
}
