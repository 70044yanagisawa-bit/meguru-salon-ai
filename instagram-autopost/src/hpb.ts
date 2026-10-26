// ホットペッパービューティーの公開ブログを読む。
// HPBにはAPIもRSSもないので、公開ページのHTMLから取り出す。
// 画面のデザイン（class名など）が変わっても壊れにくいよう、
// 一覧は記事URLの形（.../blog/bidA数字.html）だけを頼りにし、
// 本文の切り分けはテキスト化したうえでClaudeに任せる。

const UA = "Mozilla/5.0 (compatible; meguru-autopost/1.0; salon-owner-own-blog)";

export interface ArticleLink {
  id: string; // bidA...
  url: string;
}

export interface ArticlePage {
  url: string;
  ogTitle: string | null;
  ogImage: string | null;
  text: string; // ページ全体をテキスト化したもの。写真の位置に [画像n] が入る
  images: string[]; // ページ内の画像URL候補（出現順。n番目が [画像n]）
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" } });
  if (!res.ok) throw new Error(`HPBの取得に失敗しました (${res.status}) ${url}`);
  const buf = await res.arrayBuffer();
  const charset = /charset=([\w-]+)/i.exec(res.headers.get("content-type") ?? "")?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

/** ブログ一覧ページから記事リンクを新しい順（ページ上の出現順）で返す。 */
export async function listArticles(blogUrl: string): Promise<ArticleLink[]> {
  const html = await fetchHtml(blogUrl);
  const seen = new Set<string>();
  const links: ArticleLink[] = [];
  for (const m of html.matchAll(/href="([^"]*\/blog\/(bidA\d+)\.html)[^"]*"/g)) {
    const id = m[2];
    if (seen.has(id)) continue;
    seen.add(id);
    links.push({ id, url: new URL(m[1], blogUrl).toString() });
  }
  if (links.length === 0) {
    // ページ構成が変わった可能性が高い。黙って0件にせず、通知させる
    throw new Error(`ブログ一覧から記事が1件も見つかりませんでした。URLかHPBの画面構成を確認してください: ${blogUrl}`);
  }
  return links;
}

function meta(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, "i");
  const re2 = new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${property}"`, "i");
  return decodeEntities((re.exec(html) ?? re2.exec(html))?.[1] ?? "") || null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/** <img> を「[画像n]」に置き換えてからテキスト化する。本文のどこに写真があるかをClaudeに伝えるため。 */
export function htmlToText(html: string, images: string[] = [], pageUrl = "https://beauty.hotpepper.jp/"): string {
  const withMarkers = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const abs = imgUrl(tag, pageUrl);
    const i = abs ? images.indexOf(abs) : -1;
    return i >= 0 ? `\n[画像${i}]\n` : "";
  });
  return decodeEntities(
    withMarkers
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function imgUrl(tag: string, pageUrl: string): string | null {
  const src = /\b(?:data-src|data-original|src)="([^"]+)"/i.exec(tag)?.[1];
  if (!src || src.startsWith("data:")) return null;
  try {
    return new URL(decodeEntities(src), pageUrl).toString();
  } catch {
    return null;
  }
}

export function extractImages(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const abs = imgUrl(m[0], pageUrl);
    if (!abs) continue;
    // アイコンやバナーではなく、HPBの画像サーバーにある写真だけを候補にする
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(abs)) continue;
    if (!isHpbImageHost(new URL(abs).hostname)) continue;
    if (!urls.includes(abs)) urls.push(abs);
  }
  return urls;
}

export function isHpbImageHost(hostname: string): boolean {
  return hostname === "hotp.jp" || hostname.endsWith(".hotp.jp") || hostname.endsWith(".hotpepper.jp");
}

export async function fetchArticle(url: string): Promise<ArticlePage> {
  const html = await fetchHtml(url);
  const images = extractImages(html, url);
  return {
    url,
    ogTitle: meta(html, "og:title"),
    ogImage: meta(html, "og:image"),
    text: htmlToText(html, images, url),
    images,
  };
}
