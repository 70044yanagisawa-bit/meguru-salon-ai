// 外部サービス（HPB・Claude・Instagram・LINE）をすべて偽物に差し替えて、
// 「初回記録 → 新着検出 → 下書き → LINE承認 → 投稿」の流れを手元で通す。
// 実行: npm test（instagram-autopost/ で）
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import worker from "../src/index";
import type { Env } from "../src/env";

// ---- D1 の最小限の偽物（node:sqlite） ----
function fakeD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("schema.sql", "utf8"));
  const stmt = (sql: string, args: unknown[] = []): any => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async (col?: string) => {
      const row: any = db.prepare(sql).get(...(args as any[]));
      return row === undefined ? null : col ? row[col] : row;
    },
    all: async () => ({ results: db.prepare(sql).all(...(args as any[])) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as any[])).changes) } }),
  });
  return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
}

// ---- 外部APIの偽物 ----
let articles = ["bidA000000002", "bidA000000001"]; // 新しい順
const calls: { host: string; path: string; body: string }[] = [];

const listHtml = () =>
  `<html><body>${articles
    .map((id) => `<a href="https://beauty.hotpepper.jp/slnH000000001/blog/${id}.html">記事</a>`)
    .join("")}</body></html>`;

const articleHtml = `<html><head><meta charset="utf-8">
<meta property="og:title" content="秋のおすすめカラー｜テストサロンのブログ">
<meta property="og:image" content="https://imgbp.hotp.jp/og.jpg"></head><body>
<img src="https://imgbp.hotp.jp/logo.png"><nav>メニュー クーポン</nav>
<h1>秋のおすすめカラー</h1><p>こんにちは、スタイリストの山田です。<br>今回はベージュ系の秋カラーです。</p>
<img src="https://imgbp.hotp.jp/CSP/IMG_BLOG/photo1.jpg"><p>透明感が出ます。</p>
<img data-src="https://imgbp.hotp.jp/CSP/IMG_BLOG/photo2.jpg" src="data:image/gif;base64,AA">
<script>var x = "<img src='https://imgbp.hotp.jp/x.jpg'>";</script>
</body></html>`;

let containerSeq = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  const body = req.method === "GET" ? "" : await req.text();
  calls.push({ host: url.hostname, path: url.pathname + url.search, body });
  const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });

  if (url.hostname === "beauty.hotpepper.jp") {
    const html = url.pathname.endsWith("/blog/") ? listHtml() : articleHtml;
    return new Response(html, { headers: { "content-type": "text/html; charset=UTF-8" } });
  }
  if (url.hostname === "api.anthropic.com") {
    const sent = JSON.parse(body);
    assert.equal(sent.model, "claude-opus-5-5");
    assert.equal(sent.fallbacks, "default");
    const userText: string = sent.messages[0].content;
    assert.match(userText, /\[画像1\] https:\/\/imgbp\.hotp\.jp\/CSP\/IMG_BLOG\/photo1\.jpg/);
    assert.match(userText, /\[画像2\]/); // data-src も拾えている
    assert.doesNotMatch(userText, /x\.jpg/); // script内は除外
    return json({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      stop_reason: "end_turn",
      stop_details: null,
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [
        {
          type: "text",
          text: JSON.stringify({
            postable: true,
            skip_reason: "",
            title: "秋のおすすめカラー",
            caption: "秋はベージュで透明感を🍂\n\n担当: 山田\n\n#秋カラー",
            image_indexes: [1, 2, 99],
          }),
        },
      ],
    });
  }
  if (url.hostname === "graph.instagram.com") {
    if (url.pathname.startsWith("/refresh_access_token")) return json({ access_token: "refreshed", expires_in: 5184000 });
    if (url.pathname.endsWith("/media")) return json({ id: `c${++containerSeq}` });
    if (url.pathname.endsWith("/media_publish")) return json({ id: "ig_post_1" });
    return json({ status_code: "FINISHED" });
  }
  if (url.hostname === "api.line.me") return json({});
  if (url.hostname === "imgbp.hotp.jp") return new Response("JPEG", { headers: { "content-type": "image/jpeg" } });
  throw new Error(`想定外の通信: ${req.url}`);
}) as typeof fetch;

// ---- 実行 ----
const env: Env = {
  DB: fakeD1(),
  HPB_BLOG_URL: "https://beauty.hotpepper.jp/slnH000000001/blog/",
  PUBLIC_BASE_URL: "https://autopost.example.workers.dev",
  AUTO_PUBLISH: "false",
  IG_USER_ID: "1784",
  IG_API_VERSION: "v24.0",
  SALON_NAME: "テストサロン",
  BOOKING_TEXT: "ご予約はプロフィールのリンクから",
  FIXED_HASHTAGS: "#テスト",
  ANTHROPIC_API_KEY: "test",
  IG_ACCESS_TOKEN: "ig",
  LINE_CHANNEL_ACCESS_TOKEN: "line",
  LINE_CHANNEL_SECRET: "secret",
  LINE_OWNER_USER_ID: "Uowner",
  ADMIN_KEY: "admin",
};
const pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
const flush = async () => {
  while (pending.length) await pending.shift();
};
const run = () =>
  worker.fetch(new Request("https://w/run", { method: "POST", headers: { Authorization: "Bearer admin" } }), env, ctx);

async function signed(body: string): Promise<Request> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))));
  return new Request("https://w/line/webhook", { method: "POST", body, headers: { "x-line-signature": sig } });
}

// 1. 認証なしの /run は拒否
assert.equal((await worker.fetch(new Request("https://w/run", { method: "POST" }), env, ctx)).status, 401);

// 2. 初回: 既存2件は baseline、Claudeは呼ばない
assert.match(await (await run()).text(), /初期化: 2件/);
assert.equal(calls.filter((c) => c.host === "api.anthropic.com").length, 0);

// 3. 新着1件 → 下書き作成・LINEにボタン付きで通知
articles = ["bidA000000003", ...articles];
assert.match(await (await run()).text(), /新着1件/);
const row: any = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind("bidA000000003").first();
assert.equal(row.status, "pending");
assert.deepEqual(JSON.parse(row.images), [
  "https://imgbp.hotp.jp/CSP/IMG_BLOG/photo1.jpg",
  "https://imgbp.hotp.jp/CSP/IMG_BLOG/photo2.jpg",
]); // 範囲外の99は捨てる
const linePush = calls.filter((c) => c.host === "api.line.me").at(-1)!;
assert.match(linePush.body, /publish:bidA000000003/);

// 4. 同じ記事は二度処理しない
await run();
assert.equal(calls.filter((c) => c.host === "api.anthropic.com").length, 1);

// 5. 署名が違うWebhookは拒否
const bad = new Request("https://w/line/webhook", { method: "POST", body: "{}", headers: { "x-line-signature": "AAAA" } });
assert.equal((await worker.fetch(bad, env, ctx)).status, 401);

// 6. オーナー以外の［投稿する］は無視
const ev = (userId: string) =>
  JSON.stringify({ events: [{ type: "postback", replyToken: "r", source: { userId }, postback: { data: "publish:bidA000000003" } }] });
await worker.fetch(await signed(ev("Ustranger")), env, ctx);
await flush();
assert.equal(calls.filter((c) => c.path.endsWith("/media_publish")).length, 0);

// 7. オーナーが［投稿する］→ カルーセルで投稿
await worker.fetch(await signed(ev("Uowner")), env, ctx);
await flush();
const after: any = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind("bidA000000003").first();
assert.equal(after.status, "published");
assert.equal(after.ig_media_id, "ig_post_1");
const media = calls.filter((c) => c.path.endsWith("/1784/media"));
assert.equal(media.length, 3); // 子2枚 + カルーセル1
assert.match(media[0].body, /image_url=https%3A%2F%2Fautopost\.example\.workers\.dev%2Fimg%3Fu%3D/);
assert.match(media[2].body, /media_type=CAROUSEL/);

// 8. 二度押ししても再投稿しない
await worker.fetch(await signed(ev("Uowner")), env, ctx);
await flush();
assert.equal(calls.filter((c) => c.path.endsWith("/media_publish")).length, 1);

// 9. 編集ページ: 合言葉なしは404、ありなら表示
assert.equal((await worker.fetch(new Request("https://w/drafts/bidA000000003"), env, ctx)).status, 404);
const page = await worker.fetch(new Request(`https://w/drafts/bidA000000003?t=${after.token}`), env, ctx);
assert.match(await page.text(), /投稿済み/);

// 10. 画像の中継はHPBの画像だけ
assert.equal((await worker.fetch(new Request("https://w/img?u=https://evil.example/a.jpg"), env, ctx)).status, 403);
assert.equal((await worker.fetch(new Request("https://w/img?u=https://imgbp.hotp.jp/a.jpg"), env, ctx)).status, 200);

console.log("smoke test: all passed");
