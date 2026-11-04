#!/usr/bin/env node
// 画像生成スクリプト（OpenAI と Google Gemini の両対応・自動切り替え付き）
//
// 使い方:
//   node tools/image-gen/generate.mjs hero                  # プリセットで生成
//   node tools/image-gen/generate.mjs --prompt "..." --aspect 3:2
//   node tools/image-gen/generate.mjs hero --provider gemini # 片方だけ使う
//   node tools/image-gen/generate.mjs --list                 # プリセット一覧
//
// 1つ目のサービスが失敗したら（残高切れ・上限超え・キー未設定・障害など）、
// 自動でもう片方のサービスで作り直す。順番は IMAGE_PROVIDERS で変えられる。
// 外部ライブラリは使っていない（Node.js 22 以上の標準機能だけで動く）。

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRESETS } from "./presets.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(HERE, ".env");
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

// ---------- 引数 ----------
const args = process.argv.slice(2);
const opt = { count: 1 };
const rest = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => {
    const v = args[++i];
    if (v === undefined) fail(`${a} の後に値を指定してください`);
    return v;
  };
  if (a === "--prompt" || a === "-p") opt.prompt = next();
  else if (a === "--aspect") opt.aspect = next();
  else if (a === "--provider") opt.provider = next();
  else if (a === "--out" || a === "-o") opt.out = next();
  else if (a === "--name") opt.name = next();
  else if (a === "--count" || a === "-n") opt.count = Math.max(1, Math.min(4, Number(next()) || 1));
  else if (a === "--list") opt.list = true;
  else if (a === "--help" || a === "-h") opt.help = true;
  else if (a.startsWith("-")) fail(`知らないオプションです: ${a}`);
  else rest.push(a);
}

if (opt.help) {
  console.log(`使い方:
  node tools/image-gen/generate.mjs <プリセット名>
  node tools/image-gen/generate.mjs --prompt "作りたい画像の説明" [--aspect 3:2]

オプション:
  --prompt, -p   自由なプロンプト（プリセットと併用すると、プリセットの指示に追記）
  --aspect       比率 1:1 / 3:4 / 4:3 / 2:3 / 3:2 / 9:16 / 16:9（既定 1:1）
  --provider     openai か gemini（指定するとそのサービスだけ使い、切り替えない）
  --count, -n    枚数（1〜4、既定 1）
  --out, -o      保存先フォルダ（既定 tools/image-gen/output）
  --name         ファイル名の頭（既定はプリセット名か "image"）
  --list         プリセット一覧`);
  process.exit(0);
}

if (opt.list) {
  for (const [name, p] of Object.entries(PRESETS)) console.log(`${name.padEnd(12)} ${p.geminiAspect}`);
  process.exit(0);
}

// ---------- 何を作るか ----------
const presetName = rest[0];
const preset = presetName ? PRESETS[presetName] : undefined;
if (presetName && !preset) fail(`プリセット "${presetName}" はありません。--list で一覧を見られます`);
if (!preset && !opt.prompt) fail("プリセット名か --prompt を指定してください（--help で使い方）");

const prompt = [preset?.prompt, opt.prompt].filter(Boolean).join(" ");
const aspect = opt.aspect ?? preset?.geminiAspect ?? "1:1";
const sizes = {
  openai: preset && !opt.aspect ? preset.openaiSize : openaiSizeFor(aspect),
  gemini: preset && !opt.aspect ? preset.geminiAspect : geminiAspectFor(aspect),
};

// ---------- サービス ----------
const PROVIDERS = {
  openai: {
    label: "OpenAI",
    key: () => process.env.OPENAI_API_KEY,
    keyName: "OPENAI_API_KEY",
    async generate(p, n) {
      const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
      const body = { model, prompt: p, n, size: sizes.openai };
      // quality は gpt-image 系のモデルだけが受け付ける
      if (model.startsWith("gpt-image")) body.quality = process.env.OPENAI_IMAGE_QUALITY || "high";
      else body.response_format = "b64_json";
      const res = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com"}/v1/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key()}` },
        body: JSON.stringify(body),
      });
      const json = await readJson(res);
      const images = (json.data ?? []).map((d) => d.b64_json).filter(Boolean);
      if (!images.length) throw new Error("画像が返ってきませんでした");
      return { model, images: images.map((b64) => ({ b64, ext: "png" })) };
    },
  },
  gemini: {
    label: "Google Gemini (Imagen)",
    key: () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    keyName: "GEMINI_API_KEY",
    async generate(p, n) {
      const model = process.env.GEMINI_IMAGE_MODEL || "imagen-4.0-generate-001";
      const base = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
      const res = await fetch(`${base}/v1beta/models/${model}:predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.key() },
        body: JSON.stringify({
          instances: [{ prompt: p }],
          parameters: { sampleCount: n, aspectRatio: sizes.gemini },
        }),
      });
      const json = await readJson(res);
      const images = (json.predictions ?? [])
        .filter((x) => x.bytesBase64Encoded)
        .map((x) => ({ b64: x.bytesBase64Encoded, ext: x.mimeType === "image/jpeg" ? "jpg" : "png" }));
      if (!images.length) throw new Error("画像が返ってきませんでした（内容が安全フィルタに掛かった可能性があります）");
      return { model, images };
    },
  },
};

const order = opt.provider
  ? [opt.provider]
  : (process.env.IMAGE_PROVIDERS || "openai,gemini").split(",").map((s) => s.trim()).filter(Boolean);
for (const name of order) if (!PROVIDERS[name]) fail(`サービス名 "${name}" は使えません（openai か gemini）`);

// ---------- 実行（失敗したら次のサービスへ） ----------
const outDir = resolve(opt.out ?? join(HERE, "output"));
const baseName = opt.name ?? preset?.file ?? "image";
const errors = [];

for (const name of order) {
  const provider = PROVIDERS[name];
  if (!provider.key()) {
    errors.push(`${provider.label}: ${provider.keyName} が設定されていません`);
    console.warn(`- ${provider.label}: APIキーが無いので飛ばします`);
    continue;
  }
  console.log(`- ${provider.label} で生成中…`);
  try {
    const { model, images } = await provider.generate(prompt, opt.count);
    mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
    const saved = images.map((img, i) => {
      const suffix = images.length > 1 ? `-${i + 1}` : "";
      const file = join(outDir, `${baseName}-${name}-${stamp}${suffix}.${img.ext}`);
      writeFileSync(file, Buffer.from(img.b64, "base64"));
      return file;
    });
    console.log(`完了（${provider.label} / ${model}）`);
    for (const f of saved) console.log(`  ${f}`);
    process.exit(0);
  } catch (e) {
    errors.push(`${provider.label}: ${e.message}`);
    const more = order.indexOf(name) < order.length - 1;
    console.warn(`  失敗しました: ${e.message}${more ? "\n  → 次のサービスで作り直します" : ""}`);
  }
}

fail(`どのサービスでも生成できませんでした。\n  ${errors.join("\n  ")}`);

// ---------- 補助 ----------
async function readJson(res) {
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  if (!res.ok) {
    const msg = json.error?.message || text.slice(0, 300) || res.statusText;
    throw new Error(`${explain(res.status)}（HTTP ${res.status}）: ${msg}`);
  }
  return json;
}

function explain(status) {
  if (status === 401 || status === 403) return "APIキーが無効か、権限がありません";
  if (status === 402) return "残高・クレジットが足りません";
  if (status === 429) return "利用上限に達したか、残高が足りません";
  if (status >= 500) return "サービス側の障害です";
  if (status === 400) return "リクエストが受け付けられませんでした（内容の制限やモデル名の誤りなど）";
  return "エラーになりました";
}

function ratio(a) {
  const [w, h] = String(a).split(":").map(Number);
  if (!w || !h) fail(`比率の書き方が違います: ${a}（例 3:2）`);
  return w / h;
}

function openaiSizeFor(a) {
  const r = ratio(a);
  if (r > 1.15) return "1536x1024";
  if (r < 0.87) return "1024x1536";
  return "1024x1024";
}

function geminiAspectFor(a) {
  const r = ratio(a);
  const choices = { "1:1": 1, "3:4": 0.75, "4:3": 4 / 3, "9:16": 9 / 16, "16:9": 16 / 9 };
  return Object.entries(choices).sort((x, y) => Math.abs(x[1] - r) - Math.abs(y[1] - r))[0][0];
}

function fail(msg) {
  console.error(`エラー: ${msg}`);
  process.exit(1);
}
