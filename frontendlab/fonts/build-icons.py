#!/usr/bin/env python3
"""sunao Icons — コードから字形を描いて .ttf/.woff2 を生成する（依存: fonttools）。
PUA(U+E000..) に heart/star/play/diamond/bookmark/plus/check を割り当てる。"""
import math, sys, base64
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPEM = 1000

def pen_from(contours, quads=None):
    """contours: [[(x,y)...]] 直線ポリゴン。quads: [(oncurve_start,[(off,(on))...])] 省略可。"""
    p = TTGlyphPen(None)
    for pts in contours:
        p.moveTo(pts[0])
        for pt in pts[1:]:
            p.lineTo(pt)
        p.closePath()
    for start, segs in (quads or []):
        p.moveTo(start)
        for off, on in segs:
            p.qCurveTo(off, on)
        p.closePath()
    return p.glyph()

def heart():
    # 定番のハート曲線 x=16sin^3 t, y=13cos t -5cos2t -2cos3t -cos4t をポリゴン化（単一輪郭＝塗り確実）
    raw = []
    for k in range(64):
        t = 2 * math.pi * k / 64
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        raw.append((x, y))
    xs = [p[0] for p in raw]; ys = [p[1] for p in raw]
    w = max(xs) - min(xs); h = max(ys) - min(ys); s = 800 / max(w, h)
    cx = (max(xs) + min(xs)) / 2; cy = (max(ys) + min(ys)) / 2
    return pen_from([[(500 + (x - cx) * s, 500 + (y - cy) * s) for x, y in raw]])

def star(n=5, ro=400, ri=165):
    pts = []
    for i in range(n * 2):
        r = ro if i % 2 == 0 else ri
        a = math.pi / 2 + i * math.pi / n  # 上から
        pts.append((500 + r * math.cos(a), 520 + r * math.sin(a)))
    return pen_from([pts])

def play():
    return pen_from([[(300, 150), (300, 850), (820, 500)]])

def diamond():
    return pen_from([[(500, 890), (860, 500), (500, 110), (140, 500)]])

def bookmark():
    # 旗型（下辺が V 字にえぐれたブックマーク）。単一輪郭。
    return pen_from([[(250, 900), (750, 900), (750, 120), (500, 320), (250, 120)]])

def plus():
    a, b = 380, 620  # 内側, 外側
    lo, hi = 160, 840
    return pen_from([[(a, lo), (b, lo), (b, a), (hi, a), (hi, b), (b, b), (b, hi), (a, hi), (a, b), (lo, b), (lo, a), (a, a)]])

def check():
    # チェック（太線をポリゴンで）
    return pen_from([[(160, 520), (260, 420), (430, 590), (740, 250), (840, 350), (430, 800)]])

def notdef():
    return pen_from([[(120, 0), (880, 0), (880, 900), (120, 900)], [(200, 80), (200, 820), (800, 820), (800, 80)]])

ICONS = [
    ('heart', 0xE000, heart()),
    ('star', 0xE001, star()),
    ('play', 0xE002, play()),
    ('diamond', 0xE003, diamond()),
    ('bookmark', 0xE004, bookmark()),
    ('plus', 0xE005, plus()),
    ('check', 0xE006, check()),
]

order = ['.notdef'] + [n for n, _, _ in ICONS]
glyphs = {'.notdef': notdef()}
cmap = {}
for name, cp, g in ICONS:
    glyphs[name] = g
    cmap[cp] = name

fb = FontBuilder(UPEM, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap(cmap)
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics({n: (1000, 100) for n in order})
fb.setupHorizontalHeader(ascent=900, descent=-100)
fb.setupNameTable({"familyName": "sunao Icons", "styleName": "Regular"})
fb.setupOS2(sTypoAscender=900, sTypoDescender=-100, usWinAscent=1000, usWinDescent=100)
fb.setupPost()

out = sys.argv[1] if len(sys.argv) > 1 else 'sunao-icons'
fb.font.save(out + '.ttf')
from fontTools.ttLib import TTFont
f = TTFont(out + '.ttf'); f.flavor = 'woff2'; f.save(out + '.woff2')
with open(out + '.woff2', 'rb') as fh:
    b64 = base64.b64encode(fh.read()).decode()
with open(out + '.b64', 'w') as fh:
    fh.write(b64)
import os
print('TTF ', os.path.getsize(out + '.ttf'), 'B')
print('WOFF2', os.path.getsize(out + '.woff2'), 'B  (base64', len(b64), 'chars)')
print('glyphs:', ', '.join(n for n, _, _ in ICONS))
