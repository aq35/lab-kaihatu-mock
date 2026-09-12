# fonts — コードから生成する自作フォント（fonttools）

「フォントも開発できる」の実証。字形を **Python コードでベクトル描画**して `.ttf` / `.woff2` を出力する。

```
pip install fonttools brotli
python3 fonts/build-icons.py fonts/sunao-icons   # → .ttf / .woff2 / .b64 を生成
```

## sunao Icons（生成物）

- 7 字形（heart / star / play / diamond / bookmark / plus / check）を **PUA U+E000..U+E006** に割当。
- **WOFF2 は 584 バイト**（＝アイコン用途なら画像や絵文字より軽く、OS 差に依存しない）。
- 使い方は `demo.html`（@font-face に **base64 data URI** で埋め込み＝完全オフライン・外部依存ゼロ）。

```css
@font-face { font-family: 'sunao Icons'; src: url(data:font/woff2;base64,....) format('woff2'); }
.ico { font-family: 'sunao Icons'; }
```
```html
<span class="ico">&#xE000;</span> <!-- heart -->
```

## できること / できないこと（正直）

- **できる**: アイコンフォント・幾何学的/パラメトリックな字形をコードで生成、既存フォントの subset/変換。
- **できない（人の仕事）**: 美しいオリジナル本文書体の手描き設計。特に**日本語は約 7,000+ 字形**でスタジオ規模。

字形を足すには `build-icons.py` に描画関数を 1 つ追加して PUA コードポイントを割り当てるだけ。


## sunao Pixel（本物の文字・生成物）

「文字（アルファベット）も作れるか」への回答＝作れる。`build-letters.py` が **5x7 ドット**で
A-Z / 0-9 / 記号（計 43 字形）を描き、**ASCII コードポイントに割当**てる（＝普通のテキストがこの書体で表示される）。

```
python3 fonts/build-letters.py fonts/sunao-pixel   # → .ttf / .woff2
```

- **WOFF2 968 バイト**で英数字＋記号が一式。`pixel-demo.html` で "SUNAO" 等が実描画。
- 字形を足す/直すのは `GLYPHS` の 5x7 パターン（"1"=塗り）を編集するだけ＝**フォントがデータで読める**。

> 正直: これは「読める・使える」レベル。プロの本文書体の美しさや、日本語（約 7,000+ 字形）は別次元。
> だが「フォント＝コードとデータで開発できる」ことの実証としては十分。


## sunao Round（曲線＝ベジェ・生成物）

「曲線のある文字も作れるか」への回答＝作れる。`build-round.py` が **丸ゴシック風**の A-Z / 0-9 / 記号（計 41 字形）を
**ベジェ曲線**でコード生成する。参考にしたのは「幾何学サンセリフ（円と直線で構成）」の考え方で、**字形は自前**
（既存フォントの輪郭はコピーしていない＝著作権クリア）。

```
python3 fonts/build-round.py fonts/sunao-round   # → .ttf / .woff2
```

- 実装トリック: 各文字を「太い塗り図形」の重なりで作る（nonzero winding で自然に union）。
  - `capsule`（角丸の直線ストローク）/ `ring`（O・0 の輪＝外円＋内円の穴）/ `arc`（C・S 等の**曲線ストローク**＝円弧に沿う太い帯）。
  - stroke→outline のオフセット計算が要らないので、**曲線が確実に出る**。
- **WOFF2 約 1.9KB**。`round-demo.html` で "SUNAO" 等が実描画。

> 正直: 表示用（見出し・ロゴ）としては十分な丸ゴシック。プロの本文書体のような
> 光学補正・カーニング・ヒンティングや、日本語（約 7,000+ 字形）は別次元。一部の字は v1 の粗さが残る。


## sunao Rounded（読める丸ゴシック・OFL subset＝推奨）

自前ジオメトリ版（sunao Round）は「読みにくい」ので、**読みやすさ優先**の選択肢。
プロ設計の **Comfortaa（SIL OFL 1.1, © Johan Aakerlund）** を、必要な文字だけに **subset ＋ 自前ホスト**した。

```
python3 fonts/subset-ofl.py    # Comfortaa を DL→subset→リネーム→sunao-rounded.woff2 を再生成
```

- ラテン大小＋数字＋記号を weight500 で固定し **WOFF2 6.5KB**。`rounded-demo.html`（base64・オフライン）で実描画。
- **ライセンス順守**: `fonts/OFL-Comfortaa.txt` を同梱。OFL の Reserved Font Name 順守のため
  派生物は `sunao Rounded` にリネーム済み。原典クレジット: **Comfortaa by Johan Aakerlund (SIL OFL 1.1)**。
- 日本語グリフは Comfortaa に無いので、和文は CSS の次のフォールバックに落ちる（Latin だけ丸ゴシック）。
  和文も丸くしたいなら **Zen Maru Gothic / Kosugi Maru（いずれも OFL）** を同様に subset する。

### 3 つの生成フォントの使い分け（正直）
- **sunao Icons / Pixel / Round** = 「コードで一から作れる」実証（アイコン・ドット文字・曲線文字）。軽いが表示用。
- **sunao Rounded** = 「読みやすさが要るならプロの OFL を subset」＝実務の正解。**自作 ≠ 常に最適**、を正直に。


## fonts/stock/ — OFL 名作フォントのストック（自前ホスト用・34書体）

`python3 fonts/stock.py` で作る **subset 済み WOFF2 ライブラリ**。欧文20＋和文14＝計34書体、合計 ~950KB。
各ライセンス(OFL.txt)は `fonts/stock/licenses/`、一覧は `fonts/stock/INDEX.md`。

- そのまま自前ホストで使える: `@font-face{src:url('./stock/comfortaa.woff2') format('woff2')}`。
- 欧文=ASCII 全部 / 和文=かな＋記号＋全角英数（**常用漢字は非同梱**でサイズ抑制）。漢字が要る字は charset に足して再 subset。
- これらは元フォントの **subset**。原典・作者は INDEX.md、ライセンス全文は licenses/ を参照（OFL 順守）。
