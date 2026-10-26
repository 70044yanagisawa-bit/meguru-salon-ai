// 下書きの確認・編集ページ（LINEのボタンから開く）。
import type { Env } from "./env";
import type { Post } from "./db";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function proxiedImage(env: Env, url: string): string {
  return `${env.PUBLIC_BASE_URL}/img?u=${encodeURIComponent(url)}`;
}

const STATUS_LABEL: Record<Post["status"], string> = {
  baseline: "既存の記事（対象外）",
  pending: "承認待ち",
  publishing: "投稿中…",
  published: "投稿済み",
  skipped: "見送り",
  failed: "失敗",
};

export function draftPage(env: Env, post: Post, notice = ""): Response {
  const editable = post.status === "pending" || post.status === "failed" || post.status === "skipped";
  const imgs = post.images
    .map((u) => `<img src="${esc(proxiedImage(env, u))}" alt="" loading="lazy">`)
    .join("");
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Instagram下書き</title>
<style>
:root{--bg:#faf8f5;--fg:#2b2a28;--muted:#77736d;--line:#e3ded6;--accent:#3d5a4c;--danger:#9a3b3b}
@media (prefers-color-scheme:dark){:root{--bg:#1c1b1a;--fg:#ecebe8;--muted:#a19d97;--line:#3a3835;--accent:#8fb8a3;--danger:#d98c8c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 system-ui,"Hiragino Sans",sans-serif}
main{max-width:640px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:1.15rem;margin:0 0 4px}.meta{color:var(--muted);font-size:.85rem;margin:0 0 16px;word-break:break-all}
.notice{border:1px solid var(--accent);padding:10px 12px;border-radius:8px;margin-bottom:16px}
.err{border-color:var(--danger);color:var(--danger)}
.imgs{display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;margin-bottom:16px}
.imgs img{height:220px;border-radius:6px;flex:none}
textarea{width:100%;min-height:22em;font:inherit;padding:12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit}
.count{color:var(--muted);font-size:.85rem;text-align:right}
.btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
button{font:inherit;padding:10px 16px;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--bg)}
button.danger{color:var(--danger)}
</style></head><body><main>
<h1>${esc(post.title ?? "（タイトルなし）")}</h1>
<p class="meta">状態: ${STATUS_LABEL[post.status]} ／ <a href="${esc(post.url)}">元のブログ</a></p>
${notice ? `<div class="notice">${esc(notice)}</div>` : ""}
${post.error ? `<div class="notice err">${esc(post.error)}</div>` : ""}
<div class="imgs">${imgs}</div>
<form method="post">
<input type="hidden" name="t" value="${esc(post.token)}">
<textarea name="caption" ${editable ? "" : "readonly"} oninput="c.textContent=this.value.length+' / 2200字'">${esc(post.caption ?? "")}</textarea>
<div class="count" id="c">${(post.caption ?? "").length} / 2200字</div>
${
  editable
    ? `<div class="btns">
<button class="primary" name="action" value="publish">保存して投稿する</button>
<button name="action" value="save">保存だけする</button>
<button class="danger" name="action" value="skip">見送る</button>
</div>`
    : ""
}
</form>
</main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
