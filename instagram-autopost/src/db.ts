import type { Env } from "./env";

export type Status = "baseline" | "pending" | "publishing" | "published" | "skipped" | "failed";

export interface Post {
  id: string;
  url: string;
  title: string | null;
  caption: string | null;
  images: string[];
  status: Status;
  token: string;
  error: string | null;
  ig_media_id: string | null;
}

type Row = Omit<Post, "images"> & { images: string };

const toPost = (r: Row): Post => ({ ...r, images: JSON.parse(r.images) });

export function newToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getPost(env: Env, id: string): Promise<Post | null> {
  const r = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first<Row>();
  return r ? toPost(r) : null;
}

export async function knownIds(env: Env, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { results } = await env.DB.prepare(
    `SELECT id FROM posts WHERE id IN (${ids.map(() => "?").join(",")})`,
  )
    .bind(...ids)
    .all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}

export async function countPosts(env: Env): Promise<number> {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM posts").first<number>("n")) ?? 0;
}

export async function insertPost(
  env: Env,
  p: Pick<Post, "id" | "url" | "status"> & Partial<Pick<Post, "title" | "caption" | "images" | "error">>,
): Promise<Post> {
  const token = newToken();
  await env.DB.prepare(
    "INSERT INTO posts (id, url, title, caption, images, status, token, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(p.id, p.url, p.title ?? null, p.caption ?? null, JSON.stringify(p.images ?? []), p.status, token, p.error ?? null)
    .run();
  return (await getPost(env, p.id))!;
}

export async function updatePost(
  env: Env,
  id: string,
  fields: Partial<Pick<Post, "caption" | "status" | "error" | "ig_media_id">>,
): Promise<void> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) return;
  await env.DB.prepare(
    `UPDATE posts SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(...keys.map((k) => fields[k] ?? null), id)
    .run();
}

/** status が from のときだけ to に変える。二重タップで2回投稿されるのを防ぐ。 */
export async function transition(env: Env, id: string, from: Status[], to: Status): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE posts SET status = ?, updated_at = datetime('now') WHERE id = ? AND status IN (${from.map(() => "?").join(",")})`,
  )
    .bind(to, id, ...from)
    .run();
  return res.meta.changes === 1;
}

export async function getKv(env: Env, key: string): Promise<string | null> {
  return env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(key).first<string>("value");
}

export async function setKv(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
  )
    .bind(key, value)
    .run();
}
