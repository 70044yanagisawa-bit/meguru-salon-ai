// LINE公式アカウント（Messaging API）で、オーナーに下書きを送り、ボタンで承認を受け取る。
import type { Env } from "./env";
import type { Post } from "./db";

const API = "https://api.line.me/v2/bot/message";

type Message = Record<string, unknown>;

async function send(env: Env, path: "push" | "reply", body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LINE送信に失敗しました (${res.status}): ${await res.text()}`);
}

export async function push(env: Env, messages: Message[]): Promise<void> {
  if (!env.LINE_OWNER_USER_ID) {
    console.warn("LINE_OWNER_USER_ID が未設定のため、LINE通知を送れません", messages);
    return;
  }
  await send(env, "push", { to: env.LINE_OWNER_USER_ID, messages });
}

export async function reply(env: Env, replyToken: string, messages: Message[]): Promise<void> {
  await send(env, "reply", { replyToken, messages });
}

export const text = (t: string): Message => ({ type: "text", text: t.slice(0, 5000) });

export function editUrl(env: Env, post: Post): string {
  return `${env.PUBLIC_BASE_URL}/drafts/${post.id}?t=${post.token}`;
}

/** 下書きのキャプションと、［投稿する］［見送る］［編集する］ボタン。 */
export function draftMessages(env: Env, post: Post): Message[] {
  const t = post.title ?? "";
  return [
    text(`📝 新しいブログからInstagramの下書きを作りました（写真${post.images.length}枚）\n${post.url}\n\n${post.caption ?? ""}`),
    {
      type: "template",
      altText: `下書き: ${t}`.slice(0, 400),
      template: {
        type: "buttons",
        title: "この内容で投稿しますか？",
        text: (t || "（タイトルなし）").slice(0, 60),
        actions: [
          { type: "postback", label: "投稿する", data: `publish:${post.id}`, displayText: "投稿する" },
          { type: "uri", label: "写真を見る・文章を直す", uri: editUrl(env, post) },
          { type: "postback", label: "見送る", data: `skip:${post.id}`, displayText: "見送る" },
        ],
      },
    },
  ];
}

/** Webhookが本当にLINEから来たかを、チャネルシークレットの署名で確かめる。 */
export async function verifySignature(env: Env, body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.LINE_CHANNEL_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  let sig: Uint8Array;
  try {
    sig = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(body));
}
