#!/usr/bin/env python3
"""自作プレースホルダー画像の生成(Pillow)。外部素材・写真は一切使わない。
出力: seed/images/*.jpg|png  /  実行: python3 tools/make_placeholders.py
"""
import os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
OUT = os.path.join(os.path.dirname(__file__), "..", "seed", "images")
os.makedirs(OUT, exist_ok=True)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
NAVY = (14, 31, 63)

def font(sz):
    return ImageFont.truetype(FONT, sz)

def gradient(w, h, c1, c2, diag=True):
    im = Image.new("RGB", (w, h), c1)
    px = im.load()
    for y in range(h):
        for x in range(w):
            t = ((x / w) + (y / h)) / 2 if diag else y / h
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return im

def shapes(im, seed, alpha_col=(255, 255, 255)):
    rnd = random.Random(seed)
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    w, h = im.size
    for _ in range(6):
        r = rnd.randint(h // 6, h // 2)
        x, y = rnd.randint(0, w), rnd.randint(0, h)
        d.ellipse([x - r, y - r, x + r, y + r], fill=alpha_col + (rnd.randint(14, 34),))
    for _ in range(3):
        x, y = rnd.randint(0, w), rnd.randint(0, h)
        d.rectangle([x, y, x + rnd.randint(w // 8, w // 3), y + rnd.randint(h // 12, h // 5)],
                    fill=alpha_col + (rnd.randint(10, 26),))
    ov = ov.filter(ImageFilter.GaussianBlur(2))
    return Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")

def label(im, text, sz):
    d = ImageDraw.Draw(im)
    w, h = im.size
    f = font(sz)
    b = d.textbbox((0, 0), text, font=f)
    d.text(((w - (b[2] - b[0])) / 2, (h - (b[3] - b[1])) / 2 - b[1]), text, font=f, fill=(255, 255, 255))
    return im

def save(im, name, q=82):
    im.save(os.path.join(OUT, name), quality=q, optimize=True) if name.endswith("jpg") else im.save(os.path.join(OUT, name), optimize=True)

# メインビジュアル 1920x900
save(shapes(gradient(1920, 900, (10, 24, 52), (52, 86, 140)), 1), "test-hero.jpg")
# おすすめ背景 1920x900(暗め。文字は白)
save(shapes(gradient(1920, 900, (8, 18, 40), (30, 52, 96), False), 7), "test-recommend-bg.jpg")
# 記事サムネイル 1200x800 x6
pal = [((20, 45, 90), (110, 150, 200)), ((30, 70, 80), (130, 190, 190)), ((60, 50, 100), (160, 150, 210)),
       ((25, 60, 60), (150, 200, 160)), ((80, 60, 40), (210, 180, 140)), ((40, 60, 110), (140, 170, 220))]
for i, (a, b) in enumerate(pal, 1):
    save(label(shapes(gradient(1200, 800, a, b), 10 + i), f"TEST IMAGE {i:02d}", 72), f"test-thumb-{i:02d}.jpg")
# プロフィール人物(シルエット) 800x800
im = gradient(800, 800, (225, 230, 240), (180, 192, 212))
d = ImageDraw.Draw(im)
d.ellipse([280, 170, 520, 410], fill=NAVY)
d.ellipse([140, 470, 660, 1100], fill=NAVY)
save(im, "test-profile.jpg")
# 仮ロゴ 600x150 (透過PNG)
lg = Image.new("RGBA", (600, 150), (0, 0, 0, 0))
d = ImageDraw.Draw(lg)
d.rounded_rectangle([6, 25, 106, 125], radius=18, fill=NAVY + (255,))
d.text((56, 75), "S", font=font(64), fill=(255, 255, 255, 255), anchor="mm")
d.text((130, 75), "SAMPLE SITE", font=font(52), fill=NAVY + (255,), anchor="lm")
save(lg, "test-logo.png")
print("done", sorted(os.listdir(OUT)))
