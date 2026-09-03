# UI-1 — Tailwind / 無規律CSS / Semantic CSS / Web Components の比較

```
Experiment: 同一の意味契約・同一 fixture・同一計測手法で 4 方式（+ バンドル条件）を比較する
Starting SHA: 2b0739b（仮説凍結）
Ending SHA:   HEAD
Hypothesis frozen before result: docs/experiments.md の H1-H10
Compared conditions:
  A  Tailwind CSS 4.3.3（比較専用。root に依存を残さない）
  B  無規律な素の CSS（対照群）
  C  Semantic CSS（Cascade Layers + tokens + Container Queries）
  C+ 同じ C を 1 本にバンドルしたもの（分割の副作用を切り分けるため）
  D  Native Web Components（Declarative Shadow DOM）
Fixture corpus: fixtures/*.json（happy 5 / edge 8 / hostile 5 / 0 / 1 / 100 / 1,000）
```

**測定環境**: Node v22.22.2 / Chromium 141.0.7390.37 / CPU throttle 4x /
viewport 1280×720（敵対的 content は 320 と 1280）/ ローカル静的サーバのみ /
CSP `default-src 'self'; script-src 'self'; style-src 'self'` 常時付与

再現: `node tools/measure.mjs` → `docs/results/raw/measurements.json`（2026-09-03T12:54:12Z）

---

## 1. CSS の質

| 指標 | A: Tailwind | B: 無規律 | C: Semantic | C+: バンドル | D: WC |
|---|---|---|---|---|---|
| `!important` | 1 | **13** | **0** | **0** | **0** |
| 最大 specificity | 400 | **501** | 400 | 400 | 403 |
| 最大セレクタ深さ | 3 | **5** | 3 | 3 | 5 |
| 規則数 | 209 | 116 | 154 | 154 | 453 |
| 宣言数 | 588 | 760 | 1,002 | 1,002 | 2,887 |
| 重複宣言率 | 33% | **67%** | 58% | 58% | 85%※ |
| 未使用規則率 | 25% | 9% | 23% | 23% | 13% |
| custom property 定義数 | 98 | **0** | 64 | 64 | 65 |
| cascade layer 数 | 5 | **0** | 8 | 8 | 8 |
| container query 数 | 0 | **0** | 4 | 4 | 15 |
| px リテラル数 | 101 | **290** | 118 | 118 | 455 |
| logical property 比率 | 21% | **0%** | 30% | 30% | 30% |

※ D の重複宣言率 85% は **著者が重複して書いた量ではない**。
同一の stylesheet が shadow root ごとに独立してパースされるため、
5 カードで同じ規則が 5 回数えられている。この指標は D に対しては意味を持たない。

### H1（無規律CSSは変更を重ねるほど劣化する）— **支持**

> 条件B は、重複宣言数・最大 specificity・`!important` 数のいずれかが A と C の両方を上回る。

3 つすべてで上回った:

- `!important` **13**（A: 1、C: 0）
- 最大 specificity **501**、深さ **5**（A/C: 400 / 3）
- 重複宣言率 **67%**（A: 33%、C: 58%）

B の `!important` は「赤ボタンが赤くない」と報告されて後から足された打ち消しに集中している:

```css
.bottom-buttons .blue-button.red-button { background: #d03a2f !important; ... }
```

さらに [UI-9](ui-9-ai-maintainability.md) で、B の作業セッションだけが
**同じ打ち消しを通常・mobile・dark の 3 ブロックに重複記述**する必要があった。
B の劣化は「汚い」ではなく **1 つの意図に必要な編集箇所が増え続ける** という形で現れる。

### 公平性の限界（重要）

**C の CSS 量は 6 テーマ分を含んでいる。** 宣言 517 のうち **112（22%）が themes/**。
A と B は実質 1 テーマ（+ dark）しか持っていない。
したがって「C のほうが CSS が多い」は方式の差ではなく **積んでいる機能量の差**である。

同様に A の custom property 98 個は Tailwind が生成したもので、著者が設計した token ではない。

---

## 2. 同一修正の波及（P5 の実測）

「補助テキストのコントラストを 4.5:1 以上に上げる」という **1 つの意図** に必要な編集箇所:

| 方式 | 編集箇所 | 内訳 |
|---|---|---|
| C: Semantic CSS | **1** | primitive token `--p-gray-500` 1 個。6 テーマ全部へ波及し、テストが全ペアを検証 |
| D: Web Components | **1** | 同じ token。ただし shadow CSS のフォールバック 7 箇所が陳腐化した（後述） |
| B: 無規律 | **9** | 同じ色が 8 箇所 + dark mode で 1 箇所 |
| A: Tailwind | **20** | markup 中の `text-slate-500` × 10、`text-slate-400` × 10 |

A は今回そもそもコントラスト違反 0 件だったため修正不要だった（Tailwind の slate パレットは AA を満たす）。
上の 20 は「もし変える必要があったら」の箇所数である。

---

## 3. アクセシビリティ

最終状態では **4 方式すべて axe violations 0 / clickable div 0 / キーボード到達率 11/11 /
target size 24×24px 未満 0 件 / focus ring あり**。

しかしそこへ至る過程が結果である。

### 初回計測（修正前）

| 方式 | axe violations |
|---|---|
| A: Tailwind | **0** |
| B: 無規律 | **40**（color-contrast） |
| C: Semantic CSS | **40**（color-contrast） |
| D: Web Components | **41**（color-contrast） |

原因は token **1 個**（`--text-quiet` = `oklch(60% 0.012 250)` = `#7b8187` = 白地で 3.83:1）。

### H4' — token を定義しただけでは AA は保証されない

`tests/css/token-contrast.test.mjs` を追加し、
**全 theme（6 種）× 前景/背景ペア（15 組）を総当たり**で検査したところ、
axe が指摘した 40 件とは別に **19 件の不足**が他の theme で見つかった:

```
command-center.css: --border-strong (#5b6472) on --surface-card (#1a2028) = 2.74:1 < 3:1
dark.css:           --border-strong (#5f6773) on --surface-card (#1e2228) = 2.78:1 < 3:1
editorial.css:      --text-quiet (#7b8187) on --surface-sunken (#f2ece0) = 3.36:1 < 4.5:1
（ほか 16 件）
```

axe は**その時に描画されている theme しか見ない**。
theme を増やすほど、axe が見ない組み合わせが増える。
**theme を持つ設計では、token 総当たりの静的検査が axe の代わりではなく追加で必要。**

### D 固有の事故 — shadow DOM 越しの名前ズレ

D は C と同じ token ファイルを共有しているのに、修正後も axe 違反が 1 件残った。

原因: shadow CSS が `var(--kind-information, oklch(60% .012 250))` と書いていたが、
共有 token 側の名前は `--kind-accent-information` だった。
**CSS は名前が違ってもエラーにならず、黙って fallback を使う。**
その fallback は token 検査の対象外なので、token を直しても古い値が残り続けた。

`tests/css/token-reference.test.mjs` を追加したところ、
名前ズレ **5 個**と陳腐化した fallback **8 件**が見つかった。

> Shadow DOM のコストは「外の CSS が届かない」ことではなく、
> **「名前が合っているかを誰も検査しない」** ことにある。

---

## 4. 敵対的 content

`fixtures/cards.hostile.json`（長い日本語 / 長い英単語 / 長い URL / 絵文字 / RTL /
結合文字 / HTML 文字列 / script 文字列）。

| 方式 | 320px 横溢れ | 1280px 横溢れ | viewport 外へ出た要素 |
|---|---|---|---|
| A: Tailwind | 0px | 0px | 0 |
| B: 無規律 | **1,505px** | **710px** | 0 |
| C: Semantic CSS | 0px | 0px | 0 |
| D: Web Components | 59px | 0px | 14 |

### H8（敵対的 content で最初に壊れるのは B）— **支持**

B は**デスクトップ幅ですら 710px 溢れる**。原因は 3 つとも構造的:

- `overflow-wrap` の既定を持たない
- 固定 px **290 箇所**（`max-width: 68ch` は効くが、`.mono-list` の長い URL を折り返せない）
- logical property **0%**（`padding-left` などが RTL fixture で反転しない）

D の 59px は shadow 内の `.mono` リストで `min-inline-size: 0` が抜けていた箇所。
`grid`/`flex` の子は既定で `min-size: auto` のため潰れない。

---

## 5. no-JS と progressive enhancement

| 方式 | required information が読めるカード | POST 可能な form |
|---|---|---|
| A | 5/5 | 5 |
| B | 5/5 | 5 |
| C | 5/5 | 5 |
| D | **5/5** | **5** |

### H6（no-JS で壊れるのは D だけ）— **反証**

Declarative Shadow DOM (`<template shadowrootmode="open">`) で server-render すれば、
custom element が upgrade されなくても中身は描画され、shadow 内の `<form method="post">` も submit できる。

**「Web Components は JS 必須」は、client 側で shadow root を作る実装に限った話であり、
方式そのものの性質ではない。** ただし DSD を使う責任は実装側にある
（`kas-card.js` は `this.shadowRoot` が無い場合を `data-shadow-missing` として記録する）。

---

## 6. security

4 方式すべてで `scriptExecuted: false` / `injectedElements: 0`。
`esc()` を外すと再現することは [counter-proof CP5](counter-proof.md) で確認済み。

CSP は計測中に一度、実際に仕事をした:
axe を `<script>` 要素として注入しようとしたところ `style-src`/`script-src 'self'` に阻まれ、
計測側を CDP 経由の評価に変更した（CSP を弱めなかった）。

---

## 7. 性能

**注意**: 以下は単一試行のローカル値であり、**75 パーセンタイルではない**。
Core Web Vitals の予算判定にはそのまま使えない。傾向の比較にのみ使う。
特に LCP は観測窓 900ms の制約で 0 が返る試行があり、**この harness では信頼できない**。

### 5 カード（cards.happy）

| 方式 | HTML bytes | CSS bytes | requests |
|---|---|---|---|
| A: Tailwind | **30,968** | 20,027 | 2 |
| B: 無規律 | 15,234 | **10,444** | 2 |
| C: Semantic CSS | 17,784 | 27,386 | **21** |
| C+: バンドル | 16,619 | 28,081 | 2 |
| D: Web Components | 16,456 | **65,008** | 14 |

- A の HTML が他の 2 倍近いのは、外観の指定が markup にあるため（utility 文字列）
- C の request 21 は **開発中にファイルを分けたままであることの副作用**であり、方式のコストではない。
  バンドルすると 2 に落ちる（C+）
- D の CSS 65KB は、同じ 8KB の stylesheet が shadow root ごとに読まれた合計

### 1,000 カード（CPU 4x throttle）

| 方式 | load | 所要 | requests | filter 応答 | theme 切替 |
|---|---|---|---|---|---|
| A: Tailwind | 完了 | 38.1s | 2 | 134.8ms | — |
| B: 無規律 | 完了 | 36.8s | 2 | 107.6ms | — |
| C: Semantic CSS | 完了 | **11.7s** | 21 | 105.6ms | 102.3ms |
| C+: バンドル | 完了 | **11.2s** | 2 | **94.4ms** | **89.9ms** |
| D: Web Components | **60s でタイムアウト** | — | **804** | 149.5ms | **234.4ms** |

**D は 1,000 カードを 60 秒以内に読み込めなかった。**
shadow root ごとに `<link rel="stylesheet">` が必要なため、リクエストが 804 本発生し、
`networkidle` に到達しない。

これは D の設計上の性質であり、`adoptedStyleSheets` + constructable stylesheet に切り替えれば
解消しうるが、**その場合 Declarative Shadow DOM による no-JS 動作と両立しない**
（DSD の中で共有シートを使う手段が現状ない）。
つまり D では「no-JS で読める」と「1,000 件で速い」がトレードオフになる。

C+ の theme 切替 89.9ms / filter 94.4ms は INP 予算 200ms 以内。
D の theme 切替 234.4ms は **予算超過**。

A と B は theme 切替機構をそもそも実装していない（`—`）。これは方式の優劣ではなく、
**B には token 系が無いため theme を切り替える手段が無い**、
A は Tailwind の `dark:` variant 55 箇所で 2 モードのみ、という実装差である。

---

## 8. 仮説の判定まとめ

| 仮説 | 判定 | 根拠 |
|---|---|---|
| H1 無規律CSSは劣化する | **支持** | B が `!important` 13 / specificity 501 / 重複 67% で A・C の両方を上回った |
| H2 意味DOMを触らず5テーマ | **支持** | [UI-11](ui-11-creativity.md)。意味DOM 指紋 8,131 bytes が 5 案で同一 |
| H3 Tailwind は HTML 変更が多い | **部分的に支持** | A だけが意味DOM生成ファイルを 56 行変更（うち 4 行は contract 属性を含む行）。ただし描画結果は不変 |
| H4 発見率は C > A > D > B | **反証** | 4 方式とも追加 prompt 0 で正しい場所に到達。差は「到達後の重複記述量」に出た |
| H5 Shadow DOM はテーマコストを上げる | **支持（形が違う）** | 変更ファイル数ではなく **theme が表現できる範囲そのものが狭まる**。加えて名前ズレが無言で通る |
| H6 no-JS で壊れるのは D だけ | **反証** | DSD により D も 5/5 読める |
| H7 CSSで必須情報を消せる事故は全方式で起きる | **支持** | [CP1](counter-proof.md) で再現。方式では防げず契約テストでしか防げない |
| H8 敵対的contentで最初に壊れるのは B | **支持** | B のみ 1,505px / 710px の横溢れ |
| H9 Container Queries が narrow container のコストを下げる | **未検証** | 該当タスクを UI-9 で実施していない |
| H10 token 数は保守性に単調寄与しない | **未検証** | 網羅版との比較を実施していない |

---

## 9. 残る不確実性

- **UI-9 は n=1**。A の「契約属性を含む行を編集する」というリスクが
  実際の破壊につながる頻度は測れていない
- 12 の変更課題のうち **1 つしか実施していない**。カード型追加・theme 追加・keyboard 修正は未実施
- **Owner による評価が 1 件も無い**。「取り違えにくさ」「情報密度」「使いやすさ」はすべて `SELF_TESTED`
- 性能値は単一試行のローカル値で、フィールドの 75 パーセンタイルではない
- LCP はこの harness では信頼できない（観測窓の制約で 0 が返る）
- 4 方式は同一人物（同一セッション）が実装した。実装の癖が交絡している

---

## 10. §20「最終選定条件」への現時点の到達状況

| 条件 | 状態 |
|---|---|
| Tailwind 条件以上の変更成功率 | **同等**（4 方式とも成功。差は付かなかった） |
| raw CSS 条件より低い重複・specificity・regression | **満たす**（`!important` 0 / specificity 400 / 深さ 3） |
| 5 つ以上の theme を意味 DOM の大幅変更なしで表現 | **満たす**（意味 DOM 差分 0 行で 5 案） |
| 新しい AI セッションが文書だけで正しい拡張箇所を発見 | **満たす**（追加 prompt 0） |
| required information 保持 | **満たす**（missing 0 / hidden 0） |
| WCAG 2.2 AA | **自動検査は満たす**（axe 0）。keyboard sequence と screen reader 構造の人手確認は未実施 |
| keyboard E2E green | **満たす**（`tests/owner-scenarios/` で Tab 到達 11/11） |
| no-JS で重要情報が読める | **満たす**（5/5） |
| hostile content で崩れない | **満たす**（横溢れ 0px） |
| performance budget 内 | **部分的**（filter 94ms / theme 90ms は INP 予算内。1,000 カードの初期表示 11.2s は予算外） |
| JavaScript・listener・process 残存なし | **未検証**（dispose は実装したが leak 計測は未実施） |
| production dependency に Tailwind なし | **満たす**（`tests/css/theme-discipline.test.mjs` が検査） |

**結論として、条件C（Semantic CSS）は §20 の条件の大半を満たしている。**
ただし「Tailwind 条件以上の変更成功率」は **差が付かなかった**（同等）ことに注意。
C を選ぶ理由は「AI が変更に成功しやすいから」ではなく、

1. 同じ意図の変更が 1 箇所で済む（A: 20 箇所、B: 9 箇所）
2. 意味 DOM を生成するファイルを触らずに外観を変えられる（A だけが触る）
3. theme が表現できる範囲が広い（D は色と余白に縮む）
4. production dependency を持たない

の 4 点である。
