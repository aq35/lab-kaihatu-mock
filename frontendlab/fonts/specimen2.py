import os, base64, urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.subset import Subsetter, Options
RAW='https://raw.githubusercontent.com/google/fonts/main/'
LAT="Sunao Hello World 2026 AaBbGg"
JP="すなお 名作フォント 日本語 2026"
V=lambda s:'%5Bwght%5D';  # helper unused
FONTS=[
 ("Montserrat","幾何サンセリフ","ofl/montserrat/Montserrat%5Bwght%5D.ttf",LAT),
 ("Raleway","細身エレガント sans","ofl/raleway/Raleway%5Bwght%5D.ttf",LAT),
 ("Oswald","コンデンス見出し","ofl/oswald/Oswald%5Bwght%5D.ttf",LAT),
 ("Josefin Sans","華奢な幾何 sans","ofl/josefinsans/JosefinSans%5Bwght%5D.ttf",LAT),
 ("Space Grotesk","近未来 sans","ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf",LAT),
 ("Lora","可読セリフ(本文)","ofl/lora/Lora%5Bwght%5D.ttf",LAT),
 ("EB Garamond","古典セリフ","ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf",LAT),
 ("Bitter","スラブセリフ","ofl/bitter/Bitter%5Bwght%5D.ttf",LAT),
 ("Bebas Neue","極細長・大文字見出し","ofl/bebasneue/BebasNeue-Regular.ttf",LAT),
 ("Abril Fatface","高コントラスト装飾","ofl/abrilfatface/AbrilFatface-Regular.ttf",LAT),
 ("Lobster","陽気なスクリプト","ofl/lobster/Lobster-Regular.ttf",LAT),
 ("Caveat","カジュアル手書き","ofl/caveat/Caveat%5Bwght%5D.ttf",LAT),
 ("Great Vibes","優雅な筆記体","ofl/greatvibes/GreatVibes-Regular.ttf",LAT),
 ("Space Mono","レトロ等幅","ofl/spacemono/SpaceMono-Regular.ttf",LAT),
 ("Kaisei Decol","やわ明朝","ofl/kaiseidecol/KaiseiDecol-Regular.ttf",JP),
 ("Klee One","教科書体風","ofl/kleeone/KleeOne-Regular.ttf",JP),
 ("Yomogi","やさしい手書き","ofl/yomogi/Yomogi-Regular.ttf",JP),
 ("Yuji Syuku","筆・楷書","ofl/yujisyuku/YujiSyuku-Regular.ttf",JP),
 ("Hachi Maru Pop","丸ポップ","ofl/hachimarupop/HachiMaruPop-Regular.ttf",JP),
 ("DotGothic16","ドット","ofl/dotgothic16/DotGothic16-Regular.ttf",JP),
 ("Rampart One","立体見出し","ofl/rampartone/RampartOne-Regular.ttf",JP),
 ("Reggae One","極太レゲエ","ofl/reggaeone/ReggaeOne-Regular.ttf",JP),
]
cards=[]
for name,kind,path,sample in FONTS:
  try:
    fn='s2_'+name.replace(' ','')+'.ttf'
    if not os.path.exists(fn): urllib.request.urlretrieve(RAW+path,fn)
    f=TTFont(fn)
    if 'fvar' in f:
      try: instantiateVariableFont(f,{'wght':500},inplace=True)
      except Exception: pass
    o=Options(); o.name_IDs=['*']; o.notdef_outline=True
    ss=Subsetter(options=o); ss.populate(unicodes=sorted({ord(c) for c in sample})); ss.subset(f)
    wf='w2_'+name.replace(' ','')+'.woff2'; f.flavor='woff2'; f.save(wf)
    b64=base64.b64encode(open(wf,'rb').read()).decode()
    cards.append(('G'+str(len(cards)),name,kind,sample,b64,os.path.getsize(wf))); print('OK ',name,os.path.getsize(wf))
  except Exception as e: print('SKIP',name,'-',str(e)[:50])
face="\n".join("@font-face{font-family:'%s';src:url(data:font/woff2;base64,%s) format('woff2');}"%(c[0],c[4]) for c in cards)
rows="\n".join("<div class=card><div class=label><b>%s</b><span>%s・%dB</span></div><div class=sample style=\"font-family:'%s'\">%s</div></div>"%(c[1],c[2],c[5],c[0],c[3]) for c in cards)
open('specimen2.html','w').write("""<!doctype html><meta charset=utf-8><style>%s
body{margin:0;background:#faf8f5;color:#2a2622;font-family:system-ui,sans-serif}.wrap{max-width:940px;margin:1.2rem auto;padding:0 1.2rem}
h1{font-size:1rem;color:#8a7}.card{border-top:1px solid #eee;padding:.8rem 0;display:flex;gap:1rem;align-items:center}
.label{width:165px;flex:none}.label b{display:block;font-size:.92rem}.label span{font-size:.7rem;color:#998}.sample{font-size:32px;line-height:1.2}</style>
<div class=wrap><h1>OFL 名作フォント・追加編（%d 書体）</h1>%s</div>"""%(face,len(cards),rows))
print('wrote',len(cards),'fonts')
