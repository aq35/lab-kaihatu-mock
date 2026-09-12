# fonts/stock — OFL 名作フォントの subset ストック（自前ホスト用）

すべて **SIL OFL 1.1**（商用可・改変可・自前ホスト可）。各ライセンスは `licenses/<slug>-OFL.txt`。
これらは元フォントの **subset**（ラテン=ASCII全部 / 和文=かな＋記号＋全角英数、**常用漢字は非同梱**）。

## 使い方
```css
@font-face{ font-family:'MyHead'; src:url('./stock/comfortaa.woff2') format('woff2'); font-display:swap; }
```

## 一覧

| slug(ファイル) | 名前 | 分類 | 種別 | サイズ |
|---|---|---|---|---|
| `delagothicone.woff2` | Dela Gothic One | 和・極太見出し | jp | 26.7 KB |
| `dotgothic16.woff2` | DotGothic16 | 和・ドット | jp | 18.3 KB |
| `hachimarupop.woff2` | Hachi Maru Pop | 和・丸ポップ | jp | 38.6 KB |
| `kaiseidecol.woff2` | Kaisei Decol | 和・やわ明朝 | jp | 68.3 KB |
| `kleeone.woff2` | Klee One | 和・教科書体 | jp | 73.9 KB |
| `mplusrounded1c.woff2` | M PLUS Rounded 1c | 和・丸ゴシック | jp | 38.8 KB |
| `rampartone.woff2` | Rampart One | 和・立体見出し | jp | 85.2 KB |
| `reggaeone.woff2` | Reggae One | 和・極太 | jp | 31.8 KB |
| `shipporimincho.woff2` | Shippori Mincho | 和・明朝 | jp | 52.8 KB |
| `yomogi.woff2` | Yomogi | 和・手書き | jp | 57.5 KB |
| `yujisyuku.woff2` | Yuji Syuku | 和・筆楷書 | jp | 107.3 KB |
| `zenkakugothicnew.woff2` | Zen Kaku Gothic New | 和・角ゴシック | jp | 32.4 KB |
| `zenmarugothic.woff2` | Zen Maru Gothic | 和・丸ゴシック | jp | 34.9 KB |
| `abrilfatface.woff2` | Abril Fatface | 高コントラスト装飾 | latin | 7.9 KB |
| `bebasneue.woff2` | Bebas Neue | 極細長・大文字 | latin | 8.3 KB |
| `bitter.woff2` | Bitter | スラブセリフ | latin | 9.6 KB |
| `caveat.woff2` | Caveat | 手書き | latin | 40.4 KB |
| `comfortaa.woff2` | Comfortaa | 丸ジオメトリック | latin | 8.0 KB |
| `dancingscript.woff2` | Dancing Script | 筆記体 | latin | 16.2 KB |
| `ebgaramond.woff2` | EB Garamond | 古典セリフ | latin | 15.4 KB |
| `greatvibes.woff2` | Great Vibes | 優雅な筆記体 | latin | 29.3 KB |
| `jetbrainsmono.woff2` | JetBrains Mono | 等幅 | latin | 15.8 KB |
| `josefinsans.woff2` | Josefin Sans | 華奢な幾何 | latin | 7.0 KB |
| `lobster.woff2` | Lobster | スクリプト太 | latin | 21.8 KB |
| `lora.woff2` | Lora | 可読セリフ | latin | 11.8 KB |
| `montserrat.woff2` | Montserrat | 幾何サンセリフ | latin | 10.3 KB |
| `nunito.woff2` | Nunito | 丸サンセリフ | latin | 8.7 KB |
| `oswald.woff2` | Oswald | コンデンス見出し | latin | 7.2 KB |
| `pacifico.woff2` | Pacifico | スクリプト | latin | 21.5 KB |
| `playfairdisplay.woff2` | Playfair Display | 上品セリフ見出し | latin | 13.0 KB |
| `poppins.woff2` | Poppins | 幾何サンセリフ | latin | 4.6 KB |
| `raleway.woff2` | Raleway | 細身サンセリフ | latin | 13.5 KB |
| `spacegrotesk.woff2` | Space Grotesk | 近未来サンセリフ | latin | 7.4 KB |
| `spacemono.woff2` | Space Mono | レトロ等幅 | latin | 10.1 KB |

合計 34 書体 / 954 KB。

再生成: `python3 fonts/stock.py`（google/fonts から DL→subset）。元 TTF は保存しない。
和文で漢字が要るときは、使う字を charset に足して subset するか、元フォント全体を使う。
