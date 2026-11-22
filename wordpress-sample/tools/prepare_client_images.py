#!/usr/bin/env python3
"""クライアント(髙木 晴さん)本人のサイトから、使用許可を得た写真を取得し、カード用にトリミングする。
写真はリポジトリには入れない(seed/client-images/ は .gitignore 済み)。
実行: python3 tools/prepare_client_images.py
"""
import os, ssl, urllib.request
from PIL import Image

BASE = "https://haltakagi.com/images/"
OUT = os.path.join(os.path.dirname(__file__), "..", "seed", "client-images")
os.makedirs(OUT, exist_ok=True)

def fetch(name):
    dst = os.path.join(OUT, name)
    if not os.path.exists(dst):
        ctx = ssl.create_default_context()
        ca = os.environ.get("SSL_CERT_FILE")
        if ca:
            ctx = ssl.create_default_context(cafile=ca)
        req = urllib.request.Request(BASE + name, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60, context=ctx) as r, open(dst, "wb") as f:
            f.write(r.read())
    return dst

def crop_landscape(src, dst, focus_y, ratio=1.5, width=1200):
    """縦長の写真を 3:2 の横長に切り出す。focus_y は、写真の上から見た「見せたい中心」の位置(0〜1)。"""
    im = Image.open(src).convert("RGB")
    w, h = im.size
    ch = int(w / ratio)
    top = int(h * focus_y - ch / 2)
    top = max(0, min(h - ch, top))
    out = im.crop((0, top, w, top + ch)).resize((width, int(width / ratio)), Image.LANCZOS)
    out.save(os.path.join(OUT, dst), quality=84, optimize=True)

for n in ["hero.jpg", "about.jpg", "profile.jpg", "gallery-hyrox.jpg", "gallery-icebath.jpg", "gallery-meditation.jpg"]:
    fetch(n)

# カード用の横長トリミング(顔・体が入る位置に合わせる)
crop_landscape(os.path.join(OUT, "gallery-hyrox.jpg"),      "card-hyrox.jpg",      0.30)
crop_landscape(os.path.join(OUT, "gallery-icebath.jpg"),    "card-icebath.jpg",    0.38)
crop_landscape(os.path.join(OUT, "gallery-meditation.jpg"), "card-meditation.jpg", 0.62)
crop_landscape(os.path.join(OUT, "hero.jpg"),               "card-message.jpg",    0.50)
print("done:", sorted(os.listdir(OUT)))
