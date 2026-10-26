// HPBブログ → (Claudeで書き直し) → LINEで承認 → Instagramに投稿
import type { Env } from "./env";
import { listArticles, fetchArticle, isHpbImageHost } from "./hpb";
import { makeDraft } from "./caption";
import { publish, refreshTokenIfDue } from "./instagram";
import { push, reply, text, draftMessages, editUrl, verifySignature } from "./line";
import { draftPage, proxiedImage } from "./pages";
import {
  countPosts,
  getKv,
  getPost,
  insertPost,
  knownIds,
  setKv,
  transition,
  updatePost,
} from "./db";

// 1回の確認で処理する新着記事の上限。まとめて投稿されるのを防ぐ
const MAX_NEW_PER_RUN = 3;

const autoPublish = (env: Env) => env.AUTO_PUBLISH === "true";

/** 同じエラーを2時間おきに何度も通知しないよう、内容が変わったときだけLINEに送る。 */
async function notifyError(env: Env, where: string, err: unknown): Promise<void> {
  const msg = `⚠️ ${where}\n${err instanceof Error ? err.message : String(err)}`;
  console.error(msg);
  if ((await getKv(env, "last_error")) === msg) return;
  await setKv(env, "last_error", msg);
  await push(env, [text(msg)]).catch((e) => console.error("LINE通知にも失敗", e));
}

/** ブログを確認し、新しい記事があれば下書きを作る。 */
export async function checkBlog(env: Env): Promise<string> {
  if (!env.HPB_BLOG_URL) return "HPB_BLOG_URL が未設定です";

  try {
    await refreshTokenIfDue(env);
  } catch (e) {
    await notifyError(env, "Instagramトークンの延長", e);
  }

  let links;
  try {
    links = await listArticles(env.HPB_BLOG_URL);
  } catch (e) {
    await notifyError(env, "ブログ一覧の取得", e);
    return "ブログ一覧の取得に失敗";
  }

  // 初回は、いまある記事をすべて「既存」として記録するだけ（過去記事を一気に投稿しない）
  if ((await countPosts(env)) === 0) {
    for (const l of links) await insertPost(env, { id: l.id, url: l.url, status: "baseline" });
    await push(env, [
      text(`✅ 自動投稿の準備ができました。いまあるブログ${links.length}件は対象外にし、これから書く記事をInstagramの下書きにします。`),
    ]);
    return `初期化: ${links.length}件を既存として記録`;
  }

  const known = await knownIds(env, links.map((l) => l.id));
  const fresh = links.filter((l) => !known.has(l.id)).reverse().slice(0, MAX_NEW_PER_RUN); // 古い順
  for (const link of fresh) {
    try {
      const page = await fetchArticle(link.url);
      const draft = await makeDraft(env, page);
      if (!draft.postable) {
        await insertPost(env, { id: link.id, url: link.url, title: draft.title, status: "skipped", error: draft.skipReason });
        await push(env, [text(`ℹ️ 次のブログはInstagram向きではないと判断し、見送りました。\n${draft.title}\n理由: ${draft.skipReason}\n${link.url}`)]);
        continue;
      }
      const post = await insertPost(env, {
        id: link.id,
        url: link.url,
        title: draft.title,
        caption: draft.caption,
        images: draft.images,
        status: "pending",
      });
      if (autoPublish(env)) await publishPost(env, post.id);
      else await push(env, draftMessages(env, post));
    } catch (e) {
      // DBに記録しないので、次回の確認でもう一度試す
      await notifyError(env, `記事の下書き作成（${link.url}）`, e);
    }
  }
  return `新着${fresh.length}件を処理`;
}

/** 下書きをInstagramに投稿し、結果をLINEに知らせる。 */
export async function publishPost(env: Env, id: string): Promise<void> {
  if (!(await transition(env, id, ["pending", "failed"], "publishing"))) return; // 投稿済み・処理中なら何もしない
  const post = (await getPost(env, id))!;
  try {
    const mediaId = await publish(env, post.images.map((u) => proxiedImage(env, u)), post.caption ?? "");
    await updatePost(env, id, { status: "published", ig_media_id: mediaId, error: null });
    await push(env, [text(`🎉 Instagramに投稿しました\n${post.title ?? ""}`)]);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await updatePost(env, id, { status: "failed", error: message });
    await push(env, [text(`❌ 投稿に失敗しました\n${message}\n\n直して再投稿: ${editUrl(env, post)}`)]);
  }
}

async function handleLineWebhook(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await req.text();
  if (!(await verifySignature(env, body, req.headers.get("x-line-signature")))) {
    return new Response("invalid signature", { status: 401 });
  }
  const { events } = JSON.parse(body) as { events: any[] };
  for (const ev of events) {
    const userId: string | undefined = ev.source?.userId;

    // 初期設定用: オーナーのユーザーIDが未登録なら、話しかけた人にIDを教える
    if (!env.LINE_OWNER_USER_ID) {
      if (ev.replyToken && userId) {
        ctx.waitUntil(reply(env, ev.replyToken, [text(`あなたのLINEユーザーIDは\n${userId}\nです。LINE_OWNER_USER_ID に登録してください。`)]));
      }
      continue;
    }
    if (userId !== env.LINE_OWNER_USER_ID) continue; // オーナー以外の操作は受け付けない

    if (ev.type === "postback") {
      const [action, id] = String(ev.postback?.data ?? "").split(":");
      if (action === "publish") {
        ctx.waitUntil(
          (async () => {
            const post = await getPost(env, id);
            if (!post || !["pending", "failed"].includes(post.status)) {
              await reply(env, ev.replyToken, [text(`この下書きはすでに「${post?.status ?? "不明"}」です。`)]);
              return;
            }
            await reply(env, ev.replyToken, [text("投稿しています…")]);
            await publishPost(env, id);
          })(),
        );
      } else if (action === "skip") {
        ctx.waitUntil(
          (async () => {
            const ok = await transition(env, id, ["pending", "failed"], "skipped");
            await reply(env, ev.replyToken, [text(ok ? "見送りました。" : "この下書きはもう変更できません。")]);
          })(),
        );
      }
    }
  }
  return new Response("ok");
}

async function handleDraft(req: Request, env: Env, ctx: ExecutionContext, id: string): Promise<Response> {
  const post = await getPost(env, id);
  const url = new URL(req.url);
  const form = req.method === "POST" ? await req.formData() : null;
  const token = form ? String(form.get("t") ?? "") : url.searchParams.get("t");
  if (!post || token !== post.token) return new Response("見つかりません", { status: 404 });

  if (!form) return draftPage(env, post);

  const action = String(form.get("action") ?? "");
  const caption = String(form.get("caption") ?? "").slice(0, 2200);
  if (!["pending", "failed", "skipped"].includes(post.status)) {
    return draftPage(env, post, "この下書きはもう変更できません。");
  }
  if (action === "skip") {
    await updatePost(env, id, { caption, status: "skipped" });
    return draftPage(env, (await getPost(env, id))!, "見送りました。");
  }
  // 見送った下書きも、編集ページからなら投稿し直せるようにする
  await updatePost(env, id, { caption, status: post.status === "skipped" ? "pending" : post.status });
  if (action === "publish") {
    ctx.waitUntil(publishPost(env, id));
    return draftPage(env, { ...(await getPost(env, id))!, status: "publishing" }, "投稿を始めました。結果はLINEに届きます。");
  }
  return draftPage(env, (await getPost(env, id))!, "保存しました。");
}

/**
 * HPBの画像を、このWorkerのURL経由で渡す。
 * Instagram側がHPBの画像サーバーから直接取得できない場合に備えたもの。HPBの画像以外は中継しない。
 */
async function handleImage(req: Request): Promise<Response> {
  const u = new URL(req.url).searchParams.get("u");
  let target: URL;
  try {
    target = new URL(u ?? "");
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return new Response("bad request", { status: 400 });
  if (!isHpbImageHost(target.hostname)) return new Response("forbidden", { status: 403 });
  const res = await fetch(target.toString(), { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!res.ok) return new Response("not found", { status: 404 });
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const draft = /^\/drafts\/([\w-]+)$/.exec(url.pathname);

    if (url.pathname === "/line/webhook" && req.method === "POST") return handleLineWebhook(req, env, ctx);
    if (draft && (req.method === "GET" || req.method === "POST")) return handleDraft(req, env, ctx, draft[1]);
    if (url.pathname === "/img" && req.method === "GET") return handleImage(req);
    if (url.pathname === "/run" && req.method === "POST") {
      // 手動で今すぐ確認する（動作確認用）
      if (!env.ADMIN_KEY || req.headers.get("Authorization") !== `Bearer ${env.ADMIN_KEY}`) {
        return new Response("unauthorized", { status: 401 });
      }
      return new Response(await checkBlog(env));
    }
    if (url.pathname === "/") return new Response("ok");
    return new Response("not found", { status: 404 });
  },

  async scheduled(_ctrl: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(checkBlog(env).then((r) => console.log(r)));
  },
} satisfies ExportedHandler<Env>;
