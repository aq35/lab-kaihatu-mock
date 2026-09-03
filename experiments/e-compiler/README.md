# 条件E — Semantic UI Compiler

**AI は class 名も CSS も書かない。** AI が生成するのは `recipe.default.json`（PresentationRecipe）だけ。
Compiler が決定論的に plain HTML/CSS へ変換する。

## ファイル構成

```
recipe.default.json    AI が生成してよい唯一のもの（閉じた enum。contracts/presentation-recipe.schema.json）
compiler.mjs           (cards, recipe) -> { html, css }。決定論・閉じた語彙・required field を消せない
semantic-dom.mjs       意味 DOM の生成。AI は触らない
render.mjs             build 用の薄いアダプタ
shell.html             ページ外枠。CSS は生成物 1 本
scripts/               条件C と同一（api.js / forms.js）
```

## どこを変えるか

| やりたいこと | 変える場所 |
|---|---|
| 色・密度・強調・情報表現を変える | `recipe.default.json` の enum を変えるだけ |
| 新しい表現軸を足す | `contracts/presentation-recipe.schema.json` に enum を追加し、`compiler.mjs` に対応を書く |
| カード型を足す | `contracts/cards.schema.json` → `semantic-dom.mjs` の `bodies` |

**recipe に無い値は使えない。** arbitrary value（`#abc123`、`13px`）は入れられない。

## この方式の主張

- 同じ recipe から**同じ bytes**（決定論。`compile().cssHash` が一致）
- required field を CSS で隠す経路が Compiler に無い（密度は padding/font-size でのみ表現）
- AI の入力・出力に class 列が現れない（context を消費しない）

検査: `node --test tests/tailwind/` と `node tools/counter-proof.mjs`（CT6/CT7/CT8）
