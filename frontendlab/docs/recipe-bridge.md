# Recipe ブリッジ — sunao と repo の条件 E/F をつなぐ

[direction.md](direction.md) の **B**。sunao（汎用ツールチェーン層）と、repo 本体の
**PresentationRecipe → 決定論的 HTML/CSS を生成する Semantic UI Compiler（条件 E/F）**を接続する。
両者は *同じ思想の二層*であることを、実コードと機械検査で示す。

```
repo 側: contracts/presentation-recipe.schema.json（閉じた語彙の Recipe）
        experiments/e-compiler/compiler.mjs（compile(cards, recipe) -> {html, css, recipeHash}）
sunao 側: plugins/sunao/（型付き props・enum・決定論・fail-closed）
接続の実証: fixtures/app-ui/OwnerCard.sunao（Recipe を閉じた語彙 props で受ける対話カード）
           tests: OwnerCard の語彙 == repo schema（drift 検査）
```

## 同じ 4 性質を二層で持つ

| north-star 性質 | 条件 E/F（Recipe + Semantic UI Compiler） | sunao |
|---|---|---|
| **閉じた語彙 / fail-closed** | Recipe は enum のみ・`additionalProperties:false`、VOCAB 外は fail-loud | **props の `enum`**（今回追加）＋ 未知 prop・未宣言参照を fail-closed |
| **決定論** | `compile(cards,recipe)` は同入力→同 bytes（`recipeHash`） | コンパイル・レンダ・ビルドすべて決定論（2 回 sha 一致） |
| **低 context** | AI が書いてよいのは Recipe だけ（class も CSS も書かない） | AI が書くのは `.sunao` の宣言だけ（契約＝単一の真実） |
| **型付き・宣言的入力** | Recipe schema（JSON Schema） | 型付き props（type/required/enum）＋ビルド時契約検査 |

→ **sunao は条件 E/F の思想を toolchain 層で持つ実装**。これまでの全機能（診断・factory・合成・keyed・router）が
repo の中心命題「AI が UI を安全に作る」の上で意味を持つ。

## どう合成するか（役割分担）

- **Recipe コンパイラ = 見た目の契約**。閉じた語彙から決定論的に HTML/CSS（palette/density/shape…）を生成。**振る舞いは持たない**。
- **sunao = 振る舞い**。signal/effect で状態、`@event` で操作、router で画面遷移、keyed で並び替え。
- **合わせると Owner Control Center** になる: AI が Recipe を宣言 → 見た目が決定論的に決まり → sunao が承認/却下・詳細遷移などの操作を足す。

## 実証（今回作ったもの）

1. **sunao props に `enum`（閉じた語彙）** を追加。Recipe と同じく **enum 外は fail-closed**。
2. **`OwnerCard.sunao`**: PresentationRecipe の部分（`palette`/`density`/`cardShape` を閉じた語彙 props）＋
   カードのデータ（title/effect/scope/risk）を受け、**承認/却下の操作つきカード**を描画。
   `OwnerCardDemo.sunao` は Recipe.palette を切り替えると見た目が決定論的に変わる様子を見せる。
3. **drift 検査（機械）**: テストが `contracts/presentation-recipe.schema.json` を読み、OwnerCard の
   `palette/density/cardShape` の語彙が **repo schema と 1:1 一致**することを検査。語彙がずれたら CI が赤くなる。
   → prose の「対応しています」ではなく、**ずれない接続**を制度にした。

## 正直な線引き

- sunao は **Semantic UI Compiler の CSS 生成そのものは再実装していない**。Recipe の *閉じた語彙＋fail-closed* の
  思想を props に取り込み、**振る舞い層**を足した、という接続。
- より密な統合（repo の `compile(cards,recipe)` の `{html,css}` を sunao の既定 static 土台にして、
  sunao が対話だけ足す「islands 的 hydration」）は次段。Recipe schema から sunao props を自動生成するのも候補。

## 次 → **v0.6 で 3 つとも着手**

1. ✅ **Recipe → props コード生成**: `tools/gen-recipe-vocab.mjs` が両 schema から `recipe-vocab.mjs`
   （`RECIPE_PROPS`/`RECIPE_KINDS`）を生成。OwnerCard は `import from 'sunao/recipe'`＝**単一の真実・drift 不能**。
2. 🔶 **見た目の統合（CSS トークン）**: `compile()` の DOM 再利用 hydration までは行かず、Recipe compiler と
   **同値の PALETTE(oklch) を `sunao/theme` に持ち**、`recipeStyle(recipe)` で決定論的に配色。見た目は Recipe 由来・対話は sunao。
3. ✅ **5 カード型**: `OwnerCard` が `kind` enum で 5 型（OWNER_QUESTION…INFORMATION）を描画。
   → [Owner Inbox](https://claude.ai/code/artifact/fc4a364a-caf9-4081-915d-220cdbcd8293) で 5 型＋非同期取得＋palette 切替を公開。

> 残る密統合（repo の `compile()` が吐く HTML/CSS を sunao が hydrate して DOM を再利用）は次段。今は
> *語彙と配色を同値に保つ*ところまで（drift 検査つき）。
