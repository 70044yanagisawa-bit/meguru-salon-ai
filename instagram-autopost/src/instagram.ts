// Instagram API（Instagramログイン方式）で投稿する。
// この方式ならFacebookページとの連携は不要で、プロアカウント（ビジネス／クリエイター）だけで使える。
// 手順: メディアコンテナを作る → 処理完了を待つ → 公開する。
import type { Env } from "./env";
import { getKv, setKv } from "./db";

const BASE = "https://graph.instagram.com";

async function token(env: Env): Promise<string> {
  return (await getKv(env, "ig_access_token")) ?? env.IG_ACCESS_TOKEN;
}

async function call(env: Env, method: "GET" | "POST", path: string, params: Record<string, string>) {
  const url = new URL(`${BASE}/${env.IG_API_VERSION}/${path}`);
  const body = new URLSearchParams({ ...params, access_token: await token(env) });
  const res =
    method === "GET"
      ? await fetch(`${url}?${body}`)
      : await fetch(url, { method: "POST", body });
  const json = (await res.json()) as any;
  if (!res.ok || json.error) {
    throw new Error(`Instagram API エラー (${path}): ${json.error?.error_user_msg ?? json.error?.message ?? res.status}`);
  }
  return json;
}

async function waitUntilReady(env: Env, containerId: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const { status_code } = await call(env, "GET", containerId, { fields: "status_code" });
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new Error(`Instagramが画像を処理できませんでした (${status_code})。画像の縦横比（4:5〜1.91:1）か形式（JPEG）を確認してください`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Instagram側の画像処理が時間内に終わりませんでした");
}

/** 1枚なら通常投稿、2枚以上ならカルーセルで投稿し、投稿IDを返す。 */
export async function publish(env: Env, imageUrls: string[], caption: string): Promise<string> {
  const user = env.IG_USER_ID;
  let containerId: string;

  if (imageUrls.length === 1) {
    containerId = (await call(env, "POST", `${user}/media`, { image_url: imageUrls[0], caption })).id;
  } else {
    const children: string[] = [];
    for (const image_url of imageUrls) {
      const { id } = await call(env, "POST", `${user}/media`, { image_url, is_carousel_item: "true" });
      children.push(id);
    }
    for (const id of children) await waitUntilReady(env, id);
    containerId = (
      await call(env, "POST", `${user}/media`, { media_type: "CAROUSEL", children: children.join(","), caption })
    ).id;
  }

  await waitUntilReady(env, containerId);
  const { id } = await call(env, "POST", `${user}/media_publish`, { creation_id: containerId });
  return id;
}

/**
 * 長期トークンは60日で切れるので、1週間ごとに延長してD1に保存する。
 * （発行から24時間以上たったトークンでないと延長できない）
 */
export async function refreshTokenIfDue(env: Env): Promise<void> {
  const last = await getKv(env, "ig_token_refreshed_at");
  if (last && Date.now() - Date.parse(last) < 7 * 24 * 3600 * 1000) return;
  const url = `${BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(await token(env))}`;
  const res = await fetch(url);
  const json = (await res.json()) as any;
  if (!res.ok || !json.access_token) {
    throw new Error(`Instagramトークンの延長に失敗しました: ${json.error?.message ?? res.status}`);
  }
  await setKv(env, "ig_access_token", json.access_token);
  await setKv(env, "ig_token_refreshed_at", new Date().toISOString());
}
