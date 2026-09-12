#!/usr/bin/env python3
import os, base64, urllib.request, traceback
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.subset import Subsetter, Options

RAW = 'https://raw.githubusercontent.com/google/fonts/main/'
LAT = "Sunao Hello World 2026 AaBbGg &?!"
JP = "すなお 丸ゴシック 日本語 明朝 2026"
FONTS = [
    # (表示名, 分類, repo path, サンプル)
    ("Inter", "サンセリフ(実務標準)", "ofl/inter/Inter%5Bopsz,wght%5D.ttf", LAT),
    ("Poppins", "幾何サンセリフ", "ofl/poppins/Poppins-Medium.ttf", LAT),
    ("Nunito", "丸いサンセリフ", "ofl/nunito/Nunito%5Bwght%5D.ttf", LAT),
    ("Playfair Display", "上品なセリフ(見出し)", "ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf", LAT),
    ("Pacifico", "スクリプト(手書き)", "ofl/pacifico/Pacifico-Regular.ttf", LAT),
    ("JetBrains Mono", "等幅(コード)", "ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf", LAT),
    ("Zen Maru Gothic", "和文・丸ゴシック", "ofl/zenmarugothic/ZenMaruGothic-Regular.ttf", JP),
    ("M PLUS Rounded 1c", "和文・丸ゴシック", "ofl/mplusrounded1c/MPLUSRounded1c-Regular.ttf", JP),
    ("Shippori Mincho", "和文・明朝", "ofl/shipporimincho/ShipporiMincho-Regular.ttf", JP),
    ("Dela Gothic One", "和文・極太見出し", "ofl/delagothicone/DelaGothicOne-Regular.ttf", JP),
]

cards = []
for name, kind, path, sample in FONTS:
    try:
        fn = 'src_' + name.replace(' ', '') + '.ttf'
        if not os.path.exists(fn):
            urllib.request.urlretrieve(RAW + path, fn)
        f = TTFont(fn)
        if 'fvar' in f:
            try: instantiateVariableFont(f, {'wght': 600 if 'Playfair' in name else 500}, inplace=True)
            except Exception: pass
        opt = Options(); opt.name_IDs = ['*']; opt.notdef_outline = True
        ss = Subsetter(options=opt); ss.populate(unicodes=sorted({ord(c) for c in sample})); ss.subset(f)
        wf = 'sub_' + name.replace(' ', '') + '.woff2'
        f.flavor = 'woff2'; f.save(wf)
        b64 = base64.b64encode(open(wf, 'rb').read()).decode()
        fam = 'F' + str(len(cards))
        cards.append((fam, name, kind, sample, b64, os.path.getsize(wf)))
        print('OK  %-20s %6dB' % (name, os.path.getsize(wf)))
    except Exception as e:
        print('SKIP', name, '-', str(e)[:60])

face = "\n".join("@font-face{font-family:'%s';src:url(data:font/woff2;base64,%s) format('woff2');}" % (c[0], c[4]) for c in cards)
rows = "\n".join(
    "<div class=card><div class=label><b>%s</b><span>%s・%dB</span></div><div class=sample style=\"font-family:'%s'\">%s</div></div>" % (c[1], c[2], c[5], c[0], c[3])
    for c in cards)
html = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<style>%s
body{margin:0;background:#faf8f5;color:#2a2622;font-family:system-ui,sans-serif}.wrap{max-width:900px;margin:1.5rem auto;padding:0 1.2rem}
h1{font-size:1.05rem;color:#8a7}.card{border-top:1px solid #eee;padding:1rem 0;display:flex;gap:1rem;align-items:center}
.label{width:170px;flex:none}.label b{display:block;font-size:.95rem}.label span{font-size:.72rem;color:#998}
.sample{font-size:34px;line-height:1.25}</style>
<div class=wrap><h1>OFL の名作フォント（subset・自前ホスト可）— どれも sunao アプリに同梱できる</h1>%s</div>""" % (face, rows)
open('specimen.html', 'w').write(html)
print('wrote specimen.html with', len(cards), 'fonts')
