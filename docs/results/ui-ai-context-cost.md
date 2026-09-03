# T7 — utility class 列が AI の context を消費する

```
Hypothesis frozen: docs/research/_hypotheses-tailwind.md の T7
Tokenizer: gpt-tokenizer（GPT の tokenizer。Claude の正確な token 数ではなく、方式間比較の代理指標）
再現: node tools/tailwind/context-cost.mjs → docs/results/raw/context-cost.json
```

「Tailwind は冗長」という感想ではなく、実際の tokenizer で測る。

## 1 カード（ACTION_APPROVAL）を生成する source の token 数

| 条件 | AI が編集する単位 | source token | CSS token | 補足 |
|---|---|---|---|---|
| A: Tailwind | render.mjs の ACTION_APPROVAL テンプレート | **301** | — | utility 文字列を含む markup |
| C: Semantic CSS | render.mjs のテンプレート + card/risk CSS | 200 | 1,026 | 意味は markup、外観は CSS |
| E: Compiler | recipe.default.json（AI 生成物の**全て**） | **94** | 0 | class も CSS も生成しない |

## 「色を少し変える」1 変更で AI が最低限読む source の token 数

| 条件 | token | 読む対象 |
|---|---|---|
| A: Tailwind | **4,346** | render.mjs 全体（utility がどこにあるか探すため） |
| C: Semantic CSS | 1,136 | tokens.css（semantic token 1 箇所） |
| E: Compiler | **94** | recipe.default.json だけ |

## 判定 — T7 は **支持**、分類 `KAS_MISMATCH`

条件A の source token は E の約 3 倍（1 カード）〜 46 倍（1 変更で読む範囲）。
外観指定が markup に散っているため、AI は「どこを変えるか」を探すのに markup 全体を読む。

これは Tailwind の欠陥ではない。**人間は class 列を読み飛ばせるが、AI は全部トークン化して読む。**
人間向けの最適化（要素の隣に外観を置く）が、AI にとっては context コストになる。

## 限界

- gpt-tokenizer は GPT 用。Claude の token 数は異なる。**比率の傾向**だけを見る
- 「最低限読む範囲」は下限の見積り。実際の AI はもっと広く読むことも、grep で絞ることもある
- E の 94 token は recipe 全体。ただし E で新しい表現軸が必要になった場合は compiler.mjs も読むことになり、
  その場合のコストは別途（T10 の E 結果で確認する）
