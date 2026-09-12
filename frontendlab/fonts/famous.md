# 既存の名作フォント（OFL）— sunao アプリに subset＋自前ホストできる

すべて **SIL Open Font License 1.1**（商用可・改変可・**バンドル/自前ホスト可**）。`fonts/specimen.html` で実物の見本、
`fonts/specimen.py` で一括ダウンロード＋subset。個別に使うなら `fonts/subset-ofl.py` の URL/名前を差し替えるだけ。

## ラテン（欧文）

| フォント | 性格 | 使いどころ | 作者 |
|---|---|---|---|
| **Inter** | ニュートラルなサンセリフ | UI 本文・実務標準 | Rasmus Andersson |
| **Poppins** | 幾何学サンセリフ（丸い o） | 見出し・ポップ | Indian Type Foundry |
| **Nunito** | 角の丸いサンセリフ | 親しみやすい UI | Vernon Adams |
| **Playfair Display** | 上品な高コントラスト・セリフ | 見出し・エディトリアル | Claus Eggers Sørensen |
| **Pacifico** | 陽気なスクリプト（手書き） | ロゴ・タイトル | Vernon Adams |
| **JetBrains Mono** | 等幅（コード用・可読性高） | コード・数値・端末 | JetBrains |

## 和文（日本語）

| フォント | 性格 | 使いどころ | 作者 |
|---|---|---|---|
| **Zen Maru Gothic** | 端正な丸ゴシック | 見出し・本文（やわらかい） | Zen Fonts (Yoshimichi Ohira) |
| **M PLUS Rounded 1c** | 定番の丸ゴシック | UI 全般 | Coji Morishita |
| **Shippori Mincho** | 伝統的な明朝 | 本文・和の雰囲気 | Fontworks / Ogaki |
| **Dela Gothic One** | 極太インパクト見出し | ポスター・強い見出し | Zen Fonts |
| （他）Kosugi Maru / Klee One / Yomogi / Zen Kaku Gothic | 丸ゴ/手書き/角ゴ | 用途に応じ | 各作者 |

> どれも https://github.com/google/fonts の `ofl/<name>/` にソース（TTF）とライセンス(OFL.txt)がある。

## 使い方（sunao で自前ホスト）

```
python3 fonts/specimen.py     # 名作を DL→subset→見本 specimen.html を再生成
# 1 つ選んだら subset-ofl.py の URL とリネーム名を差し替えて WOFF2 化 → @font-face に base64 埋め込み
```

## 注意（正直に・OFL 順守）

- **ライセンス全文（OFL.txt）を必ず同梱**し、原典作者をクレジットする。
- **Reserved Font Name** を持つフォント（例: Comfortaa）は、改変・subset して配布するなら**その名前を使わずリネーム**する。
- 和文は字数が多く、**本文用に全字入れると重い**（数 MB）。UI/見出しで**使う文字だけ subset** するか、本文は端末フォント（system-ui / Noto）に任せるのが現実的。


## 追加編（`specimen2.html` / `specimen2.py`・22 書体）

さらに系統を広げた名作（すべて OFL）。実物は `fonts/specimen2.html`、一括生成は `python3 fonts/specimen2.py`。

**欧文**: Montserrat(幾何) / Raleway(細身) / Oswald(コンデンス見出し) / Josefin Sans(華奢) / Space Grotesk(近未来) /
Lora(可読セリフ) / EB Garamond(古典セリフ) / Bitter(スラブ) / Bebas Neue(極細長・大文字) / Abril Fatface(高コントラスト装飾) /
Lobster(スクリプト) / Caveat(手書き) / Great Vibes(筆記体) / Space Mono(レトロ等幅)。

**和文**: Kaisei Decol(やわ明朝) / Klee One(教科書体) / Yomogi(やさしい手書き) / Yuji Syuku(筆・楷書) /
Hachi Maru Pop(丸ポップ) / DotGothic16(ドット) / Rampart One(立体見出し) / Reggae One(極太)。

> これで欧文14＋和文8（前回9と合わせ計31書体）を実サンプルで確認済み。google/fonts の `ofl/` にまだ数百ある。
> 用途を言ってくれれば「この 3 択」まで絞る。
