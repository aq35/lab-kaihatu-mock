# 測定の定義

数字は必ず **測定環境とセット** で保存する。定義が曖昧な指標は使わない。

## 測定環境（既定）

| 項目 | 値 |
|------|-----|
| Node | v22.22.2 |
| Chromium | Playwright bundled 141.0.7390.37（`/opt/pw-browsers/chromium-1194`） |
| CPU throttle | 4x（`CPU_THROTTLE` 環境変数で変更可） |
| viewport | 1280×720（敵対的 content は 320 と 1280 の両方） |
| network | ローカル静的サーバのみ。ブラウザの外部接続は起動フラグで遮断 |
| CSP | `default-src 'self'; script-src 'self'; style-src 'self'` を常時付与 |

再現: `node tools/measure.mjs` → `docs/results/raw/measurements.json`

---

## 指標の定義

### バイト数・リクエスト数

ブラウザが実際に受信したレスポンスボディの長さを content-type で分類する。
`cards.happy`（5 カード）を基準にする。
**注意**: 条件C はファイルを分割したまま計測しているため request 数が多い。
バンドルすれば 20 → 3 程度になる。バンドル前後の両方を書く。

### CSS 指標

ブラウザ自身の CSSOM（`document.styleSheets` と shadow root の `styleSheets`）から集計する。
正規表現で CSS を読むのではなく、パース済みの規則を数える。
これにより Tailwind の生成 CSS も Shadow DOM 内の CSS も同じ方法で測れる。

| 指標 | 定義 |
|------|------|
| `ruleCount` | `CSSStyleRule` の数（`@media` / `@container` / `@layer` の中も再帰的に数える） |
| `declarationCount` | 宣言（property: value）の総数 |
| `duplicateDeclarations` | 同一の `property:value` が 2 回以上出た分の超過数。**同じファイルが複数 shadow root で読み込まれた場合も加算される**ので、条件D の値は「著者が重複して書いた量」ではない |
| `maxSpecificity` | `a*10000 + b*100 + c`。`:where()` は 0、`:is()`/`:not()` は内部の最大値 |
| `maxSelectorDepth` | 結合子で区切ったときの構成要素数 |
| `importantCount` | `!important` の数 |
| `unusedRules` | 状態擬似クラスを除去したセレクタが document にも shadow root にも一致しない規則の数 |
| `customPropertyDefs` | 定義された `--*` の種類数 |
| `layers` | 実際に使われた cascade layer 名 |
| `containerQueries` / `mediaQueries` | `@container` / `@media` ブロック数 |
| `logicalProps` / `physicalProps` | logical property と物理プロパティの宣言数 |

### アクセシビリティ

- **axe**: `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa` タグで実行。違反ノード数を数える
- **keyboard 到達性**: `[data-action-semantic]` が付いた要素のうち、`<button>`/`<a>` かつ `tabIndex >= 0` の割合
- **clickableDivs**: action が `<button>`/`<a>` でない数。**0 でなければ即不合格**
- **target size**: 操作可能要素の bounding box が 24×24 CSS px 未満の数（WCAG 2.2 AA）
- **focus visible**: 最初の action に `focus()` した際の computed `outline-width`

自動検査だけで合格にしない。keyboard sequence と accessibility tree の確認は別途行う。

### 契約（required information）

`contracts/dom-contract.json` の `requiredVisibleFields` に対して:

- `missing`: `[data-field]` が DOM に存在しない
- `hidden`: 存在するが **実測で不可視**（bounding box が 0、`display:none`、`visibility:hidden`、`opacity:0`、`font-size:0`）

CSS ソースを読むのではなく computed style と実寸を見る。
これが CP1（CSS で必須情報を隠す事故）を検出できる唯一の方法。

### no-JS

`javaScriptEnabled: false` のコンテキストで読み込み、required field が DOM に存在するかを数える。
`formsSubmittable` は `method="post"` の form 数（shadow root の中も数える）。

### 敵対的 content

`fixtures/cards.hostile.json`（長い日本語 / 長い英単語 / 長い URL / 絵文字 / RTL /
結合文字 / HTML 文字列 / script 文字列）を 320px と 1280px で描画し:

- `pageScrollsHorizontally`: `documentElement.scrollWidth > clientWidth + 1`
- `horizontalOverflowPx`: その差分
- `overflowingElementCount`: viewport の外へ出た要素の数（shadow root も再帰）

### security

- `scriptExecuted`: fixture 中の `<script>window.__pwned = true</script>` が実行されたか
- `injectedElements`: fixture 中の `<div class="fake-card">承認済み</div>` が本物の要素として描画されたか

### 性能

- **LCP / CLS**: `PerformanceObserver` の `largest-contentful-paint` / `layout-shift`（`hadRecentInput` を除外）
- **1,000 カード**: `load` までの実時間、`networkidle` に到達したか、リクエスト数、
  shadow root を含む DOM ノード数
- **filter 応答**: `change` を発火してから 2 フレーム後までの経過時間（INP の近似）
- **theme 切替**: `data-theme` を変えてから 2 フレーム後までの経過時間

参考予算（[Core Web Vitals](https://web.dev/articles/vitals)、75 パーセンタイル）:
LCP ≤ 2.5s / INP ≤ 200ms / CLS ≤ 0.1

**この計測は単一試行のローカル値であり、75 パーセンタイルではない。**
フィールドデータではないので、予算の合否判定にはそのまま使えない。傾向の比較にのみ使う。

### AI 保守性（UI-9）

同一のモデル・同一の初期指示・**前会話を持たない独立セッション**で、
同じ変更課題を各方式に与える。各セッションはリポジトリ内の文書だけを読む。

| 指標 | 取り方 |
|------|--------|
| task success | 変更が意図どおり適用され、`node --test tests/contract tests/css` が通るか |
| 最初に開いたファイル | セッションの自己報告 |
| 変更ファイル数 / diff 行数 | `git diff --numstat` |
| 意味 DOM の変更数 | `data-card-type` / `data-field` / `data-action-semantic` を含む行の差分 |
| 難易度 | セッションの自己申告 1-5（`SELF_TESTED`。客観指標ではない） |

学習効果を避けるため、方式ごとに独立したセッションを **並行**で走らせ、順序効果を作らない。

---

## 使わない指標

- **token 数**: 増やすことは進捗ではない。実際に 2 テーマ以上で値が異なる token だけを数える
- **pixel 差分だけの創造性評価**: 「色違い」を創造性と数えない。Owner の blind comparison が要る
- **CSS の総バイト数だけでの優劣**: 未使用率・重複・変更コストと合わせて見る
