#!/usr/bin/env python3
"""Sensei Hakuun's ink painter (sumi-e), used by the Morning Scroll email.

  python3 tools/paint.py --subject koi --seed 20261118 --out art.png [--title "Two Koi"]

Subjects: koi bamboo moon mountains enso plum crane castle wave lantern maple pine
Needs Pillow (pip install pillow).
"""
import argparse, math, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SUBJECTS = "koi bamboo moon mountains enso plum crane castle wave lantern maple pine".split()
W, H = 1200, 900
PAPER = (243, 234, 214)
RED = (196, 48, 36)


def ink(a):
    return (24, 20, 18, int(255 * max(0, min(1, a))))


def brush(d, pts, w0, w1, a=0.9):
    n = len(pts)
    for i in range(1, n):
        t = i / n
        w = w0 + (w1 - w0) * t
        d.line([pts[i - 1], pts[i]], fill=ink(a * (1 - t * 0.35)), width=max(1, int(w)))
        r = w / 2
        x, y = pts[i]
        d.ellipse([x - r, y - r, x + r, y + r], fill=ink(a * (1 - t * 0.35)))


def blot(d, x, y, rx, ry, a):
    d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=ink(a))


def paint(subject, seed):
    R = random.Random(seed)
    U = R.uniform
    base = Image.new("RGB", (W, H), PAPER)
    fib = ImageDraw.Draw(base, "RGBA")
    for _ in range(700):
        x, y = U(0, W), U(0, H)
        fib.line([(x, y), (x + U(-60, 60), y + U(-60, 60))], fill=(150, 120, 80, int(U(8, 22))), width=1)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer, "RGBA")
    cx, cy = W / 2, H / 2

    if subject == "enso":
        rr = min(W, H) * 0.32
        a0, gap = U(0, 6.28), U(0.25, 0.6)
        pts = [(cx + math.cos(a0 + k / 120 * (6.283 - gap)) * rr * (1 + U(-.012, .012)),
                cy + math.sin(a0 + k / 120 * (6.283 - gap)) * rr * (1 + U(-.012, .012))) for k in range(121)]
        brush(d, pts, U(44, 60), U(8, 18), 0.92)
    elif subject in ("bamboo", "pine", "maple", "plum"):
        for _s in range(3 if subject == "bamboo" else 1):
            x = W * U(0.25, 0.75)
            y = H + 20
            pts = [(x, y)]
            while y > H * 0.08:
                y -= U(70, 140)
                pts.append((x + U(-12, 12), y))
            if subject == "bamboo":
                for i in range(1, len(pts)):
                    brush(d, [pts[i - 1], pts[i]], U(22, 30), U(20, 26), 0.75)
                    d.rectangle([pts[i][0] - 20, pts[i][1] - 4, pts[i][0] + 20, pts[i][1] + 4], fill=ink(0.9))
                for _l in range(10):
                    p = pts[R.randrange(1, len(pts))]
                    s = R.choice([-1, 1])
                    brush(d, [p, (p[0] + s * U(70, 140), p[1] + U(-20, 60))], U(18, 26), 2, 0.8)
            else:
                trunk = [(px + math.sin(i) * 44, py) for i, (px, py) in enumerate(pts)]
                brush(d, trunk, U(28, 40), U(6, 12), 0.85)
                for _b in range(6):
                    p = trunk[R.randrange(1, len(trunk))]
                    s = R.choice([-1, 1])
                    e = (p[0] + s * U(110, 240), p[1] - U(20, 110))
                    brush(d, [p, ((p[0] + e[0]) / 2, p[1] - U(0, 40)), e], U(12, 20), 4, 0.8)
                    for _k in range(8):
                        fx, fy = e[0] + U(-60, 60), e[1] + U(-46, 46)
                        if subject == "pine":
                            blot(d, fx, fy, U(30, 50), U(12, 22), 0.5)
                        elif subject == "maple":
                            col = (int(190 + U(0, 40)), int(40 + U(0, 40)), 30, 210)
                            star = []
                            for q in range(10):
                                a = q / 10 * 6.283 - 1.57
                                r = 20 if q % 2 == 0 else 9
                                star.append((fx + math.cos(a) * r, fy + math.sin(a) * r))
                            d.polygon(star, fill=col)
                        else:
                            col = (int(215 + U(0, 30)), int(120 + U(0, 40)), int(140 + U(0, 30)), 220)
                            for q in range(5):
                                a = q / 5 * 6.283
                                d.ellipse([fx + math.cos(a) * 9 - 7, fy + math.sin(a) * 9 - 7, fx + math.cos(a) * 9 + 7, fy + math.sin(a) * 9 + 7], fill=col)
    elif subject in ("moon", "mountains", "castle"):
        if subject != "castle" or U(0, 1) < 0.6:
            r = U(90, 130) if subject == "moon" else U(44, 64)
            mx, my = W * U(0.6, 0.8), H * U(0.2, 0.32)
            d.ellipse([mx - r, my - r, mx + r, my + r], fill=(225, 90, 60, 215))
        for l in range(3):
            b = H * (0.55 + l * 0.14)
            poly = [(0, H), (0, b)]
            x = 0
            while x < W:
                x += U(60, 170)
                poly.append((x, b - U(0, 200) * (1 - l * 0.25)))
            poly.append((W, H))
            d.polygon(poly, fill=ink(0.18 + l * 0.22))
        if subject == "castle":
            x, y = W * U(0.35, 0.55), H * 0.48
            for t in range(3):
                w = 150 - t * 38
                d.rectangle([x - w / 2, y - t * 64, x + w / 2, y - t * 64 + 38], fill=ink(0.85))
                d.polygon([(x - w / 2 - 30, y - t * 64), (x, y - t * 64 - 46), (x + w / 2 + 30, y - t * 64)], fill=ink(0.85))
        if subject == "moon":
            for _k in range(5):
                x, y = U(0, W), U(H * .15, H * .45)
                d.rectangle([x, y, x + U(120, 340), y + U(6, 12)], fill=PAPER + (150,))
    elif subject == "koi":
        for f in range(R.choice([2, 3])):
            x, y, a, L = W * U(.25, .75), H * U(.3, .7), U(0, 6.28), U(150, 230)
            fish = Image.new("RGBA", (int(L * 2), int(L * 2)), (0, 0, 0, 0))
            fd = ImageDraw.Draw(fish, "RGBA")
            c = L
            fd.ellipse([c - L * .5, c - L * .17, c + L * .5, c + L * .17], fill=ink(.85))
            fd.polygon([(c - L * .45, c), (c - L * .8, c - L * .18), (c - L * .72, c), (c - L * .8, c + L * .18)], fill=ink(.85))
            if f == 0:
                fd.ellipse([c + L * .1 - L * .18, c - L * .1, c + L * .1 + L * .18, c + L * .1], fill=(214, 70, 45, 230))
            fish = fish.rotate(-math.degrees(a), resample=Image.BICUBIC)
            layer.alpha_composite(fish, (int(x - L), int(y - L)))
        for _k in range(5):
            x, y, r = U(0, W), U(0, H), U(30, 90)
            d.ellipse([x - r, y - r, x + r, y + r], outline=ink(.25), width=3)
    elif subject == "crane":
        x, y = W * U(.35, .55), H * U(.38, .5)
        d.ellipse([x - 130, y - 56, x + 130, y + 56], fill=(251, 247, 238, 255), outline=ink(.9), width=5)
        brush(d, [(x + 90, y - 20), (x + 150, y - 130), (x + 175, y - 205)], 16, 10)
        d.ellipse([x + 162, y - 228, x + 192, y - 198], fill=(214, 50, 40, 245))
        brush(d, [(x + 180, y - 210), (x + 236, y - 196)], 6, 4)
        brush(d, [(x - 20, y + 44), (x - 30, y + 240)], 8, 6)
        brush(d, [(x + 20, y + 44), (x + 38, y + 240)], 8, 6)
        brush(d, [(x - 110, y - 14), (x - 190, y + 20), (x - 260, y + 64)], 30, 8, .85)
    elif subject == "wave":
        for k in range(5):
            y = H * (.4 + k * .12)
            pts = [(x, y + math.sin(x / 85 + k) * 30) for x in range(-20, W + 30, 24)]
            brush(d, pts, U(12, 20), U(4, 8), .7)
        c2 = W * U(.3, .6)
        for k in range(8):
            a = -k * .35
            blot(d, c2 + math.cos(a) * 130, H * .38 + math.sin(a) * 86, 22 - k * 2, 13, .75)
    elif subject == "lantern":
        x, y = W * .5, H * .78
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse([x - 300, y - 400, x + 300, y + 100], fill=(255, 190, 90, 90))
        layer.alpha_composite(glow.filter(ImageFilter.GaussianBlur(80)))
        d.rectangle([x - 30, y - 20, x + 30, y + 180], fill=ink(.85))
        d.rectangle([x - 130, y - 30, x + 130, y], fill=ink(.85))
        d.rectangle([x - 82, y - 170, x + 82, y - 30], fill=ink(.85))
        d.polygon([(x - 175, y - 170), (x, y - 300), (x + 175, y - 170)], fill=ink(.85))
        d.rectangle([x - 48, y - 146, x + 48, y - 60], fill=(240, 170, 60, 235))

    layer = layer.filter(ImageFilter.GaussianBlur(0.8))
    base = base.convert("RGBA")
    base.alpha_composite(layer)
    # the seal
    sd = ImageDraw.Draw(base)
    sx, sy = W - 130, H - 140
    sd.rectangle([sx, sy, sx + 88, sy + 88], fill=RED)
    font = None
    for f in ("/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
              "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc", "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"):
        try:
            font = ImageFont.truetype(f, 62)
            break
        except Exception:
            pass
    if font:
        sd.text((sx + 44, sy + 44), "白", fill=PAPER, font=font, anchor="mm")
    else:
        sd.rectangle([sx + 22, sy + 18, sx + 66, sy + 70], outline=PAPER, width=6)
        sd.line([sx + 22, sy + 44, sx + 66, sy + 44], fill=PAPER, width=6)
    return base.convert("RGB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--subject", default="enso", choices=SUBJECTS)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default="art.png")
    ap.add_argument("--size", type=int, default=0, help="output width in px (keeps 4:3); smaller = cheaper to email")
    a = ap.parse_args()
    img = paint(a.subject, a.seed)
    if a.size: img = img.resize((a.size, a.size * 3 // 4), Image.LANCZOS)
    img.save(a.out, optimize=True, quality=82)
    print(a.out, img.size)
