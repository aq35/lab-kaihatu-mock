#!/usr/bin/env python3
"""OFL フォントを「読める丸ゴシック」として subset＋自前ホスト用に加工する（依存: fonttools）。
既定は Comfortaa（SIL OFL 1.1, © Johan Aakerlund）。ラテン＋数字＋記号だけに削り、
可変軸を weight500 で固定し、OFL の Reserved Font Name 順守のためリネームして WOFF2 出力。

  python3 fonts/subset-ofl.py            # cand.ttf があればそれを、無ければ DL を試みる

※ 生成物 sunao-rounded.woff2 はコミット済み（オフラインで動く）。この script は再生成用。
"""
import os, sys, urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.subset import Subsetter, Options

SRC = 'cand.ttf'
URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/comfortaa/Comfortaa%5Bwght%5D.ttf'
OUT = os.path.join(os.path.dirname(__file__), 'sunao-rounded.woff2')
TEXT = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?-:'\"&()"

if not os.path.exists(SRC):
    print('downloading Comfortaa (OFL)...'); urllib.request.urlretrieve(URL, SRC)

f = TTFont(SRC)
if 'fvar' in f:
    instantiateVariableFont(f, {'wght': 500}, inplace=True)
opt = Options(); opt.name_IDs = ['*']; opt.recalc_bounds = True; opt.notdef_outline = True
ss = Subsetter(options=opt); ss.populate(unicodes=sorted({ord(c) for c in TEXT})); ss.subset(f)
# OFL: 派生物は Reserved Font Name（Comfortaa）を使わない → リネーム
nm = f['name']
for nid, val in {1: 'sunao Rounded', 16: 'sunao Rounded', 4: 'sunao Rounded Regular', 6: 'sunaoRounded-Regular'}.items():
    nm.setName(val, nid, 3, 1, 0x409)
f.flavor = 'woff2'; f.save(OUT)
print('WOFF2', os.path.getsize(OUT), 'B  ->', OUT)
