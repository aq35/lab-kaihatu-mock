# 決定 0001 — 参照実装は条件C（Semantic CSS）とする

- 日付: 2026-09-03
- 状態: **暫定採用**（Owner 評価が入るまで確定しない）
- 関連: [`docs/results/ui-1-comparison.md`](../results/ui-1-comparison.md), [`docs/results/ui-9-ai-maintainability.md`](../results/ui-9-ai-maintainability.md)

## 決定

KAS Owner Control Center の参照実装は、
**素の HTML / CSS / JavaScript を Cascade Layers + CSS Custom Properties + Container Queries で
構造化した条件C** とする。production dependency は持たない。

## 採用しなかった理由ではなく、採用した理由

「Tailwind を使わないほうが良い」という結論は **出ていない**。実測では:

- 変更成功率: **4 方式とも 100%**（差なし）
- 正しい拡張箇所の発見: **4 方式とも追加 prompt 0**（差なし）
- アクセシビリティ最終状態: **4 方式とも axe 0**（差なし）
- 敵対的 content: **A と C が同点で最良**（B のみ大きく崩れる）

条件A（Tailwind）は多くの指標で条件C と同等以上だった。
それでも C を採る理由は次の 4 点に絞られる。

### 1. 同じ意図の変更が 1 箇所で済む

「補助テキストのコントラストを上げる」という 1 つの意図の編集箇所:
**C = 1 / D = 1 / B = 9 / A = 20**。

### 2. 外観の変更が、意味 DOM を生成するファイルに触れずに済む

[UI-9](../results/ui-9-ai-maintainability.md) で、純粋に視覚的な課題を与えたとき:

| | 意味DOM生成ファイルの変更行数 | うち contract 属性を含む行 |
|---|---|---|
| A | 56 | **4** |
| B | 0 | 0 |
| C | 1（`<link>` 1 行） | 0 |
| D | 0 | 0 |

**A では視覚作業と契約が同じ行に同居する。**
今回は描画結果が変わらなかったが、`data-field` を含む行を編集する機会が
視覚変更のたびに発生する構造そのものが、KAS の用途では許容しにくい。

### 3. theme が表現できる範囲が広い

条件D は同じ token / theme ファイルを共有しているが、
外側のセレクタが shadow を貫通しないため、
5 案のうち **editorial と conversational が「色と余白だけの案」に劣化する**。

### 4. production dependency を持たない

`tests/css/theme-discipline.test.mjs` が root の `package.json` を検査している。
条件A の Tailwind 依存は `experiments/a-tailwind/package.json` に隔離されている。

## 条件D を採らない理由

- **1,000 カードを 60 秒以内に読み込めない**（shadow root ごとに stylesheet が要り、リクエスト 804 本）
- `adoptedStyleSheets` に切り替えれば解消しうるが、
  **Declarative Shadow DOM による no-JS 動作と両立しない**
- theme 切替 234ms は INP 予算 200ms 超過
- token 名のズレが CSS のエラーにならず、黙って fallback へ落ちる

ただし D は **no-JS で required information を保持できた**（H6 を反証した）。
「Web Components は JS 必須」という前提は誤りであることが分かったので、記録しておく。

## この決定を覆す条件

次のいずれかが観測されたら再検討する。

1. Owner の blind comparison で、条件C の案が理解しやすさで劣ると出た
2. UI-9 を n≥3 / 課題 12 種で回したとき、条件C の変更成功率が条件A を下回った
3. バンドル後でも 1,000 カードの初期表示が実用に耐えないと判明した
4. component 数が増えたとき、`styles/components/` の 1 ファイル 1 役割が破綻した

## 付随して確定したこと

- **契約は方式に依存しない。** `contracts/` と `tests/` は 4 方式すべてに同一に適用され、
  CSS で必須情報を隠す事故（CP1）はどの方式でも起きる
- **CSS の分割は開発の都合。** 性能比較は必ずバンドル後の条件も併記する
- **theme を持つ設計では、axe に加えて token 総当たりのコントラスト検査が必要**
