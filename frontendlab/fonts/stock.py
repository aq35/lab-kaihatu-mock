#!/usr/bin/env python3
"""fonts/stock/ を作る: OFL 名作フォントを実用 charset で subset＋自前ホスト用 WOFF2 に。
各フォントのライセンス(OFL.txt)も stock/licenses/ に保存し、INDEX.md を生成する。

  python3 fonts/stock.py

- ラテン系: 印字可能 ASCII 全部。
- 和文系:   ASCII ＋ ひらがな/カタカナ/和文記号/全角英数（**常用漢字は含めない**＝サイズ抑制）。
  本文で全漢字が要るなら、その字だけ足し subset するか、元フォント全体（数 MB）を使う。
※ これらは元フォントの **subset**（部分集合）。原典・作者・ライセンスは INDEX.md / licenses/ を参照。
"""
import os, urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.subset import Subsetter, Options

RAW = 'https://raw.githubusercontent.com/google/fonts/main/'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'stock'); LIC = os.path.join(OUT, 'licenses'); CACHE = os.path.join(OUT, '_src')
for d in (OUT, LIC, CACHE): os.makedirs(d, exist_ok=True)

LATIN = [(0x20, 0x7E)]
JP = LATIN + [(0x3000, 0x30FF), (0xFF01, 0xFF9F), (0x2010, 0x2027), (0x25A0, 0x25FF)]

# (slug, 表示名, 分類, 'latin'|'jp', dir, file, weight)
F = [
 ('poppins', 'Poppins', '幾何サンセリフ', 'latin', 'poppins', 'Poppins-Regular.ttf', None),
 ('nunito', 'Nunito', '丸サンセリフ', 'latin', 'nunito', 'Nunito%5Bwght%5D.ttf', 400),
 ('montserrat', 'Montserrat', '幾何サンセリフ', 'latin', 'montserrat', 'Montserrat%5Bwght%5D.ttf', 400),
 ('raleway', 'Raleway', '細身サンセリフ', 'latin', 'raleway', 'Raleway%5Bwght%5D.ttf', 400),
 ('oswald', 'Oswald', 'コンデンス見出し', 'latin', 'oswald', 'Oswald%5Bwght%5D.ttf', 500),
 ('josefinsans', 'Josefin Sans', '華奢な幾何', 'latin', 'josefinsans', 'JosefinSans%5Bwght%5D.ttf', 400),
 ('spacegrotesk', 'Space Grotesk', '近未来サンセリフ', 'latin', 'spacegrotesk', 'SpaceGrotesk%5Bwght%5D.ttf', 400),
 ('comfortaa', 'Comfortaa', '丸ジオメトリック', 'latin', 'comfortaa', 'Comfortaa%5Bwght%5D.ttf', 500),
 ('lora', 'Lora', '可読セリフ', 'latin', 'lora', 'Lora%5Bwght%5D.ttf', 400),
 ('ebgaramond', 'EB Garamond', '古典セリフ', 'latin', 'ebgaramond', 'EBGaramond%5Bwght%5D.ttf', 400),
 ('playfairdisplay', 'Playfair Display', '上品セリフ見出し', 'latin', 'playfairdisplay', 'PlayfairDisplay%5Bwght%5D.ttf', 600),
 ('bitter', 'Bitter', 'スラブセリフ', 'latin', 'bitter', 'Bitter%5Bwght%5D.ttf', 400),
 ('bebasneue', 'Bebas Neue', '極細長・大文字', 'latin', 'bebasneue', 'BebasNeue-Regular.ttf', None),
 ('abrilfatface', 'Abril Fatface', '高コントラスト装飾', 'latin', 'abrilfatface', 'AbrilFatface-Regular.ttf', None),
 ('dancingscript', 'Dancing Script', '筆記体', 'latin', 'dancingscript', 'DancingScript%5Bwght%5D.ttf', 600),
 ('pacifico', 'Pacifico', 'スクリプト', 'latin', 'pacifico', 'Pacifico-Regular.ttf', None),
 ('lobster', 'Lobster', 'スクリプト太', 'latin', 'lobster', 'Lobster-Regular.ttf', None),
 ('caveat', 'Caveat', '手書き', 'latin', 'caveat', 'Caveat%5Bwght%5D.ttf', 500),
 ('greatvibes', 'Great Vibes', '優雅な筆記体', 'latin', 'greatvibes', 'GreatVibes-Regular.ttf', None),
 ('jetbrainsmono', 'JetBrains Mono', '等幅', 'latin', 'jetbrainsmono', 'JetBrainsMono%5Bwght%5D.ttf', 400),
 ('spacemono', 'Space Mono', 'レトロ等幅', 'latin', 'spacemono', 'SpaceMono-Regular.ttf', None),
 ('zenmarugothic', 'Zen Maru Gothic', '和・丸ゴシック', 'jp', 'zenmarugothic', 'ZenMaruGothic-Regular.ttf', None),
 ('mplusrounded1c', 'M PLUS Rounded 1c', '和・丸ゴシック', 'jp', 'mplusrounded1c', 'MPLUSRounded1c-Regular.ttf', None),
 ('zenkakugothicnew', 'Zen Kaku Gothic New', '和・角ゴシック', 'jp', 'zenkakugothicnew', 'ZenKakuGothicNew-Regular.ttf', None),
 ('kosugimaru', 'Kosugi Maru', '和・丸ゴシック', 'jp', 'kosugimaru', 'KosugiMaru-Regular.ttf', None),
 ('shipporimincho', 'Shippori Mincho', '和・明朝', 'jp', 'shipporimincho', 'ShipporiMincho-Regular.ttf', None),
 ('kaiseidecol', 'Kaisei Decol', '和・やわ明朝', 'jp', 'kaiseidecol', 'KaiseiDecol-Regular.ttf', None),
 ('kleeone', 'Klee One', '和・教科書体', 'jp', 'kleeone', 'KleeOne-Regular.ttf', None),
 ('yomogi', 'Yomogi', '和・手書き', 'jp', 'yomogi', 'Yomogi-Regular.ttf', None),
 ('yujisyuku', 'Yuji Syuku', '和・筆楷書', 'jp', 'yujisyuku', 'YujiSyuku-Regular.ttf', None),
 ('hachimarupop', 'Hachi Maru Pop', '和・丸ポップ', 'jp', 'hachimarupop', 'HachiMaruPop-Regular.ttf', None),
 ('dotgothic16', 'DotGothic16', '和・ドット', 'jp', 'dotgothic16', 'DotGothic16-Regular.ttf', None),
 ('rampartone', 'Rampart One', '和・立体見出し', 'jp', 'rampartone', 'RampartOne-Regular.ttf', None),
 ('reggaeone', 'Reggae One', '和・極太', 'jp', 'reggaeone', 'ReggaeOne-Regular.ttf', None),
 ('delagothicone', 'Dela Gothic One', '和・極太見出し', 'jp', 'delagothicone', 'DelaGothicOne-Regular.ttf', None),
]

def codepoints(ranges):
    cps = []
    for a, b in ranges: cps += list(range(a, b + 1))
    return cps

def fetch(url, dest):
    if not os.path.exists(dest): urllib.request.urlretrieve(url, dest)

rows = []
for slug, name, kind, style, d, fname, wght in F:
    try:
        ttf = os.path.join(CACHE, slug + '.ttf')
        fetch(RAW + 'ofl/' + d + '/' + fname, ttf)
        try: fetch(RAW + 'ofl/' + d + '/OFL.txt', os.path.join(LIC, slug + '-OFL.txt'))
        except Exception: pass
        f = TTFont(ttf)
        if 'fvar' in f and wght is not None:
            try: instantiateVariableFont(f, {'wght': wght}, inplace=True)
            except Exception: pass
        o = Options(); o.name_IDs = ['*']; o.notdef_outline = True; o.drop_tables = []
        ss = Subsetter(options=o)
        ss.populate(unicodes=codepoints(LATIN if style == 'latin' else JP))
        ss.subset(f)
        wf = os.path.join(OUT, slug + '.woff2'); f.flavor = 'woff2'; f.save(wf)
        sz = os.path.getsize(wf); rows.append((slug, name, kind, style, sz))
        print('OK  %-20s %6d B' % (name, sz))
    except Exception as e:
        print('SKIP %-20s %s' % (name, str(e)[:60]))

import shutil
shutil.rmtree(CACHE, ignore_errors=True)   # 元 TTF はコミットしない（subset のみストック）

rows.sort(key=lambda r: (r[3], r[1]))
total = sum(r[4] for r in rows)
idx = ["# fonts/stock — OFL 名作フォントの subset ストック（自前ホスト用）", "",
       "すべて **SIL OFL 1.1**（商用可・改変可・自前ホスト可）。各ライセンスは `licenses/<slug>-OFL.txt`。",
       "これらは元フォントの **subset**（ラテン=ASCII全部 / 和文=かな＋記号＋全角英数、**常用漢字は非同梱**）。",
       "", "## 使い方", "```css",
       "@font-face{ font-family:'MyHead'; src:url('./stock/comfortaa.woff2') format('woff2'); font-display:swap; }",
       "```", "", "## 一覧", "", "| slug(ファイル) | 名前 | 分類 | 種別 | サイズ |", "|---|---|---|---|---|"]
for slug, name, kind, style, sz in rows:
    idx.append('| `%s.woff2` | %s | %s | %s | %.1f KB |' % (slug, name, kind, style, sz / 1024))
idx += ["", "合計 %d 書体 / %.0f KB。" % (len(rows), total / 1024),
        "", "再生成: `python3 fonts/stock.py`（google/fonts から DL→subset）。元 TTF は保存しない。",
        "和文で漢字が要るときは、使う字を charset に足して subset するか、元フォント全体を使う。"]
open(os.path.join(OUT, 'INDEX.md'), 'w').write("\n".join(idx) + "\n")
print("\n%d fonts / %.0f KB total -> fonts/stock/" % (len(rows), total / 1024))
