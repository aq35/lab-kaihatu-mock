#!/usr/bin/env python3
"""sunao Round — 曲線（ベジェ）で描く丸ゴシック風フォントをコード生成（依存: fonttools）。
参考: 幾何学サンセリフ（円と直線で構成）。字形は自前生成＝既存フォントの輪郭は使わない。

構成: 各文字を「太いストローク図形」の重なりで作る（nonzero winding で union）。
  - capsule: 角丸の直線ストローク（矩形＋両端の円）
  - ring:    O/0 用の輪（外円 CW ＋ 内円 CCW の穴）
  - arc:     C/S/D 等の曲線ストローク（円弧に沿った太い帯）
すべて塗り図形なので輪郭計算（stroke→outline のオフセット）不要で、曲線が出る。"""
import sys, base64, os, math
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPEM = 1000
T = 120                     # ストローク太さ
r = T / 2
TAU = math.pi * 2

def circle_pts(cx, cy, rad, cw=True):
    # 4 個の二次ベジェで円（cw=True: 時計回り＝塗り / False: 反時計＝穴）
    k = rad / math.cos(math.pi / 4)          # 45° 中点が円上に乗る制御半径
    ang = [90, 0, -90, -180] if cw else [90, 180, 270, 360]
    on = [(cx + rad * math.cos(math.radians(a)), cy + rad * math.sin(math.radians(a))) for a in ang]
    mid = []
    for i in range(4):
        a0 = math.radians(ang[i]); a1 = math.radians(ang[(i + 1) % 4])
        am = math.atan2((math.sin(a0) + math.sin(a1)), (math.cos(a0) + math.cos(a1)))
        mid.append((cx + k * math.cos(am), cy + k * math.sin(am)))
    return on, mid

def disk(pen, cx, cy, rad, cw=True):
    on, mid = circle_pts(cx, cy, rad, cw)
    pen.moveTo(on[0])
    for i in range(4):
        pen.qCurveTo(mid[i], on[(i + 1) % 4])
    pen.closePath()

def poly(pen, pts):
    pen.moveTo(pts[0])
    for p in pts[1:]:
        pen.lineTo(p)
    pen.closePath()

def capsule(pen, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1
    px, py = -dy / L * r, dx / L * r
    poly(pen, [(x1 + px, y1 + py), (x2 + px, y2 + py), (x2 - px, y2 - py), (x1 - px, y1 - py)])
    disk(pen, x1, y1, r); disk(pen, x2, y2, r)

def ring(pen, cx, cy, rad):
    disk(pen, cx, cy, rad + r, True)         # 外（塗り）
    disk(pen, cx, cy, rad - r, False)        # 内（穴）

def arc(pen, cx, cy, rad, a0, a1):
    # a0->a1（度）の円弧に沿う太さ T の帯。単一輪郭・時計回り塗り。
    a0 = math.radians(a0); a1 = math.radians(a1)
    span = a1 - a0
    n = max(1, int(abs(span) / (math.pi / 3)) + 1)
    ro, ri = rad + r, rad - r
    def q(rr, ai, af):                        # ai->af の外/内アークを (off,on) で
        am = (ai + af) / 2
        rc = rr / math.cos(abs(af - ai) / 2)
        return (cx + rc * math.cos(am), cy + rc * math.sin(am)), (cx + rr * math.cos(af), cy + rr * math.sin(af))
    pen.moveTo((cx + ro * math.cos(a0), cy + ro * math.sin(a0)))
    for i in range(n):                        # 外アーク a0->a1
        ai = a0 + span * i / n; af = a0 + span * (i + 1) / n
        off, on = q(ro, ai, af); pen.qCurveTo(off, on)
    pen.lineTo((cx + ri * math.cos(a1), cy + ri * math.sin(a1)))
    for i in range(n):                        # 内アーク a1->a0
        ai = a1 - span * i / n; af = a1 - span * (i + 1) / n
        off, on = q(ri, ai, af); pen.qCurveTo(off, on)
    pen.closePath()

# レイアウト定数（cap height 700, baseline 0）
BOT, TOP, MID = 0, 700, 350
LX, RX, CX = 110, 490, 300
R2 = 190          # 丸文字の半径

# 各文字 = 描画関数（pen を受け取る）。advance は (関数, 幅)
def V(x, y0, y1): return ('cap', x, y0, x, y1)
def H(x0, x1, y): return ('cap', x0, y, x1, y)
def D(x0, y0, x1, y1): return ('cap', x0, y0, x1, y1)
def RING(cx, cy, rad): return ('ring', cx, cy, rad)
def ARC(cx, cy, rad, a0, a1): return ('arc', cx, cy, rad, a0, a1)

def run(pen, ops):
    for op in ops:
        if op[0] == 'cap': capsule(pen, op[1], op[2], op[3], op[4])
        elif op[0] == 'ring': ring(pen, op[1], op[2], op[3])
        elif op[0] == 'arc': arc(pen, op[1], op[2], op[3], op[4], op[5])

L, Rr, C = LX, RX, CX
RF = 285          # 全高の丸文字の半径（cap height に合わせる）
LET = {
 'A': [D(L, BOT, C, TOP), D(Rr, BOT, C, TOP), H(L + 70, Rr - 70, 250)],
 'B': [V(L, BOT, TOP), ARC(L, 525, 175, 90, -90), ARC(L, 175, 175, 90, -90)],
 'C': [ARC(C, MID, RF, 58, 302)],
 'D': [V(L, BOT, TOP), ARC(L, MID, 350, 90, -90)],
 'E': [V(L, BOT, TOP), H(L, Rr, TOP), H(L, Rr - 40, MID), H(L, Rr, BOT)],
 'F': [V(L, BOT, TOP), H(L, Rr, TOP), H(L, Rr - 40, MID)],
 'G': [ARC(C, MID, RF, 58, 315), H(C + 30, C + RF, MID), V(C + RF, BOT + 40, MID)],
 'H': [V(L, BOT, TOP), V(Rr, BOT, TOP), H(L, Rr, MID)],
 'I': [V(C, BOT, TOP)],
 'J': [V(Rr, 200, TOP), ARC(C, 200, 190, 180, 350)],
 'K': [V(L, BOT, TOP), D(L, MID, Rr, TOP), D(L, MID, Rr, BOT)],
 'L': [V(L, BOT, TOP), H(L, Rr, BOT)],
 'M': [V(L, BOT, TOP), V(Rr, BOT, TOP), D(L, TOP, C, 250), D(Rr, TOP, C, 250)],
 'N': [V(L, BOT, TOP), V(Rr, BOT, TOP), D(L, TOP, Rr, BOT)],
 'O': [RING(C, MID, RF)],
 'P': [V(L, BOT, TOP), ARC(L, 525, 175, 90, -90)],
 'Q': [RING(C, MID, RF), D(C + 40, MID - 40, Rr + 50, BOT - 30)],
 'R': [V(L, BOT, TOP), ARC(L, 525, 175, 90, -90), D(L + 60, MID, Rr, BOT)],
 'S': [ARC(C, 480, 160, -38, 208), ARC(C, 220, 160, 142, 388)],
 'T': [V(C, BOT, TOP), H(L, Rr, TOP)],
 'U': [V(L, 190, TOP), V(Rr, 190, TOP), ARC(C, 190, 190, 180, 360)],
 'V': [D(L, TOP, C, BOT), D(Rr, TOP, C, BOT)],
 'W': [D(L, TOP, L + 90, BOT), D(L + 90, BOT, C, 300), D(Rr - 90, BOT, C, 300), D(Rr, TOP, Rr - 90, BOT)],
 'X': [D(L, BOT, Rr, TOP), D(L, TOP, Rr, BOT)],
 'Y': [D(L, TOP, C, MID), D(Rr, TOP, C, MID), V(C, BOT, MID)],
 'Z': [H(L, Rr, TOP), H(L, Rr, BOT), D(L, BOT, Rr, TOP)],
 '0': [RING(C, MID, 250)],
 '1': [V(C, BOT, TOP), D(C - 110, TOP - 90, C, TOP)],
 '2': [ARC(C, 470, 170, 165, -60), D(C + 130, 340, L, BOT), H(L, Rr, BOT)],
 '3': [ARC(C, 495, 165, 150, -125), ARC(C, 205, 165, 125, -150)],
 '4': [D(Rr - 60, TOP, L, 230), H(L, Rr, 230), V(Rr - 60, BOT, TOP)],
 '5': [H(L, Rr, TOP), V(L, 380, TOP), ARC(C, 205, 190, 118, -150)],
 '6': [ARC(C, MID, RF, 62, 300), RING(C, 180, 150)],
 '7': [H(L, Rr, TOP), D(Rr, TOP, C - 30, BOT)],
 '8': [RING(C, 505, 150), RING(C, 185, 175)],
 '9': [RING(C, 520, 150), ARC(C, MID, RF, -118, 118)],
 ' ': [],
 '.': [('cap', C, BOT + 30, C, BOT + 30)],
 '!': [V(C, 220, TOP), ('cap', C, BOT + 30, C, BOT + 30)],
 '?': [ARC(C, 500, 175, 170, -60), V(C, 250, 360), ('cap', C, BOT + 30, C, BOT + 30)],
 '-': [H(L, Rr, MID)],
}

order = ['.notdef']
glyphs = {}
cmap = {}
p = TTGlyphPen(None); poly(p, [(80, 0), (520, 0), (520, 700), (80, 700)]); poly(p, [(150, 70), (150, 630), (450, 630), (450, 70)]); glyphs['.notdef'] = p.glyph()
def nm(ch):
    return {'.': 'period', '!': 'exclam', '?': 'question', '-': 'hyphen', ' ': 'space'}.get(ch, ch if ch.isalnum() else 'u%04X' % ord(ch))
for ch, ops in LET.items():
    p = TTGlyphPen(None); run(p, ops); name = nm(ch)
    order.append(name); glyphs[name] = p.glyph(); cmap[ord(ch)] = name

fb = FontBuilder(UPEM, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap(cmap)
fb.setupGlyf(glyphs)
adv = {n: (640, 60) for n in order}; adv['space'] = (360, 0); adv['I'] = (300, 90); adv['period'] = (300, 90); adv['exclam'] = (300, 90)
fb.setupHorizontalMetrics(adv)
fb.setupHorizontalHeader(ascent=760, descent=-120)
fb.setupNameTable({"familyName": "sunao Round", "styleName": "Regular"})
fb.setupOS2(sTypoAscender=760, sTypoDescender=-120, usWinAscent=820, usWinDescent=120)
fb.setupPost()
out = sys.argv[1] if len(sys.argv) > 1 else 'sunao-round'
fb.font.save(out + '.ttf')
from fontTools.ttLib import TTFont
f = TTFont(out + '.ttf'); f.flavor = 'woff2'; f.save(out + '.woff2')
with open(out + '.woff2', 'rb') as fh:
    open(out + '.b64', 'w').write(base64.b64encode(fh.read()).decode())
print('WOFF2', os.path.getsize(out + '.woff2'), 'B  /', len(LET), 'glyphs')
