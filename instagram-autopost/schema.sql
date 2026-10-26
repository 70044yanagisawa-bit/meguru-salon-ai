-- ホットペッパービューティーのブログ1記事 = 1行。
-- status の流れ:
--   baseline   … 初回実行時にすでにあった記事（投稿しない）
--   pending    … 下書きを作成し、LINEで承認待ち
--   publishing … Instagramに投稿中
--   published  … 投稿済み
--   skipped    … 見送り（手動、またはAIが投稿に向かないと判断）
--   failed     … 失敗（error に理由）
CREATE TABLE IF NOT EXISTS posts (
  id          TEXT PRIMARY KEY,           -- HPBの記事ID（bidA...）
  url         TEXT NOT NULL,
  title       TEXT,
  caption     TEXT,
  images      TEXT NOT NULL DEFAULT '[]', -- 投稿に使う画像URLのJSON配列
  status      TEXT NOT NULL,
  token       TEXT NOT NULL,              -- 編集ページのURLに入れる合言葉
  error       TEXT,
  ig_media_id TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS posts_status ON posts (status);

-- 更新したInstagramトークンなど、小さな設定値の置き場。
CREATE TABLE IF NOT EXISTS kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
