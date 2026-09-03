---
name: html-css-js-ui-review
description: KAS Owner Control Center の HTML/CSS/JavaScript UI を、実験で支持された規則だけでレビューする。UI の変更（カード表示・theme・token・CSS・レンダラ・決定フォーム）をレビューするとき、または新しいカード型・theme を追加するときに使う。実験で裏付けの無い規則は入っていない。
---

# HTML / CSS / JS UI レビュー

このリポジトリ（web_ui_manual）の実験で **実際に支持された規則だけ** を載せている。
理想論は載せない。各規則には壊れ方・再現・検査方法・実測 receipt が付いている。

`未検証` の原則は `docs/principles.md` にあるが、**この Skill には入れない**。

## 使い方

1. 変更されたファイルを見て、下の Rule のうち該当するものだけを適用する
2. 指摘には必ず **Rule ID** と **検査コマンド** を添える
3. 該当する検査が無い指摘は「意見」として明示する。規則として書かない

---

## R1 — required information を CSS で隠さない

**壊れ方**: 承認カードから `effect` / `resourceScope` / `risk` が消える。
Owner は「何が起きるか」を知らないまま `ALLOW_ONCE` を押す。

**修正前の再現**:
```bash
node tools/counter-proof.mjs      # CP1
```
theme ファイルへ 3 行足すだけで再現する。**レイアウトは崩れず、カード数も変わらない**ので、
スクリーンショット比較・visual regression・目視レビューでは検出できない。

**推奨構造**: 表示・非表示は server が返す `state` で決める。CSS で情報量を変えない。
密度を上げたいときは padding / gap / 段組みで詰める（[UI-9 の 4 例](../../../docs/results/ui-9-ai-maintainability.md)）。

**検査方法**:
```bash
node --test tests/css/theme-discipline.test.mjs   # 静的（安い・早い）
node tools/measure.mjs                            # 実測可視性（最終的な保証）
```
静的 lint だけでは不十分。**computed style と bounding box を実測する**検査が要る。

**適用範囲**: `styles/themes/`, `styles/components/`, Tailwind の utility 文字列、shadow CSS。
**例外**: なし。
**対応する test**: `tests/css/theme-discipline.test.mjs`, `tools/measure.mjs` の contract 節。
**receipt**: [`docs/results/counter-proof.md#cp1`](../../../docs/results/counter-proof.md)

---

## R2 — token を追加・変更したら、全 theme でコントラストを検査する

**壊れ方**: `--text-quiet` を定義しても値が 3.83:1 なら WCAG 2.2 AA を満たさない。
theme を増やすたびに同じ事故が各 theme で起きる。

**修正前の再現**: 条件C の初回計測で axe の `color-contrast` 違反 **40 件**。
全 theme 総当たりの検査を入れたところ、**さらに 19 件**が別 theme で見つかった。

**推奨構造**: primitive token と semantic token を分け、
component は semantic token だけを参照する。色の実値は 1 箇所に集める。

**検査方法**:
```bash
node --test tests/css/token-contrast.test.mjs
```

**適用範囲**: `styles/tokens.css`, `styles/themes/*.css`。
**例外**: 装飾のみで文字を載せない色（区切り線など）は 3:1。
**対応する test**: `tests/css/token-contrast.test.mjs`
**receipt**: [`docs/results/ui-1-comparison.md`](../../../docs/results/ui-1-comparison.md) のアクセシビリティ節

---

## R3 — component に生の色・primitive token を書かない

**壊れ方**: 同じ意図の色が散る。1 つ直すのに複数箇所を直すことになる。

**実測（同じ「補助テキストのコントラストを上げる」を適用したとき）**:

| 方式 | 編集が必要な箇所 |
|---|---|
| C: semantic token 経由 | **1** |
| B: 生の色を直書き | **9** |
| A: markup の utility | **20** |

**検査方法**:
```bash
node --test tests/css/theme-discipline.test.mjs
```

**適用範囲**: `styles/components/*.css`。
**例外**: `styles/tokens.css` と `styles/themes/*.css` は実値を書く場所なので対象外。
**receipt**: [`docs/principles.md` P5](../../../docs/principles.md)

---

## R4 — shadow DOM 越しの token 参照は、名前の実在と fallback の両方を検査する

**壊れ方**: `var(--kind-information, ...)` と書いたが共有 token 側は `--kind-accent-information` だった。
**CSS は名前が違ってもエラーにならず、黙って fallback を使う。**
その fallback は token 検査の対象外なので、token を直しても古い値が残り続ける。

**修正前の再現**: 条件D だけ axe 違反 1 件が残り、原因の特定に実測が必要だった。
検査を追加したところ、陳腐化した fallback が **8 件**見つかった。

**検査方法**:
```bash
node --test tests/css/token-reference.test.mjs
```

**適用範囲**: shadow root 内の CSS（`components/*.css`）。
**例外**: `--*-contrast` は accent の上に載る前景色なので、白地との比較は行わない。
**receipt**: [`docs/results/ui-11-creativity.md`](../../../docs/results/ui-11-creativity.md)

---

## R5 — 敵対的 content で横に溢れさせない

**壊れ方**: 長い URL・長い英単語・長い日本語で横スクロールが発生し、
承認ボタンが画面外へ出るか、隣のカードの上に重なる。

**実測（`fixtures/cards.hostile.json`）**:

| 方式 | 320px での横溢れ | 1280px での横溢れ |
|---|---|---|
| A: Tailwind | 0px | 0px |
| B: 無規律 | **1,505px** | **710px** |
| C: Semantic CSS | 0px | 0px |
| D: Web Components | 59px | 0px |

B が壊れる原因は 3 つとも構造的:
`overflow-wrap` の既定なし / 固定 px（290 箇所）/ logical property 0%。

**推奨構造**:
```css
p, dd, li, h1, h2, h3, td, th, legend, label, button {
  overflow-wrap: anywhere;
}
```
に加えて、`min-inline-size: 0` を grid/flex の子に付ける（潰れない既定を上書きする）。

**検査方法**:
```bash
node tools/measure.mjs   # hostile 節
```

**適用範囲**: すべての表示。
**receipt**: [`docs/results/ui-1-comparison.md`](../../../docs/results/ui-1-comparison.md) の敵対的 content 節

---

## R6 — viewport ではなく container に適応させる

**壊れ方**: 同じカードを sidebar や split view に置いたとき、
viewport は広いままなので media query が発火せず、狭い場所で 2 列レイアウトのまま潰れる。

**推奨構造**:
```css
.card-slot { container-type: inline-size; container-name: card; }
@container card (max-width: 22rem) { .card { --card-padding: var(--space-md); } }
```

**適用範囲**: カード内部のレイアウト。
**例外**: ページ全体の骨格（`.page`, `.layout-split`）は viewport media query でよい。
**receipt**: 条件C は `@container` 4 箇所で 320px 溢れ 0。条件B は viewport のみで 1,505px 溢れ。

---

## R7 — 送信中・結果不明を「承認済み」と読ませない

**壊れ方**: ボタンを `disabled` にするだけだと、Owner は「もう承認された」と読む。
timeout を「失敗」として扱うと、UI は「実行されていません」と嘘をつく。

**推奨構造**:
- network failure / server refusal / timeout を **別の例外型**で扱う
- 結果不明のときは再送ボタンを戻さない
- 状態は必ず文言でも出す（`role="status"` / `aria-live="polite"`）

**検査方法**:
```bash
node --test 'tests/owner-scenarios/*.test.mjs'
```

**適用範囲**: `scripts/api.js`, `scripts/forms.js`。
**receipt**: [`docs/results/counter-proof.md#cp4`](../../../docs/results/counter-proof.md)

---

## R8 — UI の防止策を authority にしない

**壊れ方**: client 側の二重送信防止を外すと request は 3 本飛ぶ。
server の one-shot 再検証まで無いと、**effect が 3 回発生する**。

**実測（3 連打）**:

| 条件 | dispatch |
|---|---|
| client 防止 + server 再検証 | 1 |
| client 防止だけ外す | 1（server が抑える） |
| 両方外す | **3** |

期限も同様: UI が「期限切れ」と表示していても、
server が再検証しなければ期限切れの承認がそのまま実行される（CP3）。

**推奨構造**: server が `expiry` / `state` / `one-shot` / `stale page` を毎回再検証する。
**receipt**: [`docs/results/counter-proof.md`](../../../docs/results/counter-proof.md) CP3 / CP4

---

## R9 — 外部文字列を raw HTML として描画しない

**壊れ方**: カード本文の `<div class="fake-card">承認済み</div>` が
**本物の UI 要素として描画される**。XSS であると同時に、Owner への偽の状態表示でもある。

**再現**: `node tools/counter-proof.mjs`（CP5）。エスケープを外すと script 実行 `true`、偽カード 1 件。

**推奨構造**: `textContent` または全経路でのエスケープ。
CSP は script を止められるが、`<div>承認済み</div>` は止められない。**CSP 単独に依存しない。**

**適用範囲**: すべての `render.mjs` と、client 側で DOM を作る箇所。
**receipt**: [`docs/results/counter-proof.md#cp5`](../../../docs/results/counter-proof.md)

---

## R10 — action は `<button>` か `<a>`。primary は 1 カードに 1 つ

**壊れ方**: clickable div はキーボードで到達できない。
`OUTCOME_UNKNOWN` の retry を primary にすると、Owner は二重 effect を起こす。

**実測**: 4 方式すべてで clickable div 0、キーボード到達率 11/11。
契約 (`contracts/cards.schema.json`) が `RETRY_WITH_DUPLICATE_RISK` の `primary: true` を拒否することは
`tests/contract/schema.test.mjs` が検査している（12 種の危険な違反をすべて拒否）。

**検査方法**:
```bash
node --test 'tests/contract/*.test.mjs' 'tests/owner-scenarios/*.test.mjs'
```

---

## R11 — CSS の分割は「開発の都合」。計測時はバンドル後で比較する

**壊れ方（測定の壊れ方）**: 条件C は CSS を 20 ファイルに分けているため
request 数 21・LCP 712ms となり、方式そのものが遅いように見える。
同じ CSS を 1 本に連結すると request 2・LCP 612ms になる。

**推奨**: 性能を比較するときは、必ずバンドル後の条件も併記する。
**receipt**: [`docs/results/ui-1-comparison.md`](../../../docs/results/ui-1-comparison.md) の性能節（条件 C と C+ の比較）

---

## この Skill に **入れていない** もの（未検証のため）

- 「disabled を承認済みと読ませない」文言設計の有効性 → Owner 実測がない
- 「情報密度が高いほうが判断が速い」 → Owner 実測がない
- 「Tailwind より Semantic CSS のほうが AI に優しい」 →
  UI-9 は n=1 で、変更箇所の**発見率には差が出なかった**。差が出たのは重複記述の量だけ
- token 数の多寡と保守性の関係（H10）→ 未実施
