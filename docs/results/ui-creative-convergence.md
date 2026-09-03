# T2 / T9 — 表現の発散と収束

```
Hypotheses frozen: docs/research/_hypotheses-tailwind.md の T2, T9
Model/session: 同一モデル・独立セッション・並行実行（順序効果なし）・前会話なし
Fixture: cards.happy.json
再現: 各セッションの成果は scratchpad の t2-a-1..3 / t2-e-1..3。tools/tailwind/analyze-divergence.mjs
```

## 実験

同じ曖昧な視覚要求「承認カードをもう少し緊急に、少しだけ目立つように」を、
条件A（Tailwind）と条件E（Compiler）へ、それぞれ **独立した 3 セッション** に渡した。
各セッションは前の会話も他セッションの成果も知らない。

## 結果（T2 — 非正規表現問題）

### 条件E: 3 セッションすべてが同一の recipe に収束

| セッション | 変更した recipe | 結果 |
|---|---|---|
| E-1 | `palette: calm → high-contrast`（他は不変） | 同一 |
| E-2 | `palette: calm → high-contrast`（他は不変） | 同一 |
| E-3 | `palette: calm → high-contrast`（他は不変） | 同一 |

**3/3 が 1 バイト違わず同じ recipe** を生成した。理由は 3 セッションとも同じ推論に至ったこと:
「承認カードの緊急度に効く軸（effectEmphasis / cardShape / actionLayout / uncertaintyPresentation）は
既定で既に最強。残る大域レバーは palette だけ。ダークになる command-center は『少しだけ』に反するので
high-contrast」。閉じた語彙が推論を 1 点へ収束させた。
同じ recipe → 決定論的 compiler → **同じ CSS bytes**。

### 条件A: 3 セッションが別々の utility を発明

| セッション | 追加した主な utility | 新しく使った色 |
|---|---|---|
| A-1 | `bg-red-50 shadow-md ring-1 ring-red-200 dark:bg-red-950/30 dark:ring-red-900/50` | red-50/200/900/950 |
| A-2 | `border-s-8 bg-red-50 shadow-md ring-1 ring-red-200 border-l-red-600 dark:...` | red-50/200/900/950 |
| A-3 | `border-s-8 bg-red-50 shadow-md ring-1 ring-red-200 font-semibold text-red-700!` | red-50/200/900 |

### 数値（`docs/results/raw/divergence.json`）

| 指標 | A: Tailwind | E: Compiler |
|---|---|---|
| 生成 HTML が byte 一致したセッション | **0**（distinct 3/3） | **全部**（distinct 1/3） |
| 生成 CSS bytes の distinct | —（各自 build） | **1/3**（同一 hash） |
| class 集合の平均 Jaccard | **0.974** | —（class を持たない） |

### 判定 — T2 は **支持。ただし正確に言うと「発散」ではなく「非決定」**

観察された事実を誇張しない:

- **A の 3 セッションは方向性で強く一致した**（class 集合 Jaccard 0.974）。
  全員が「赤い地 + リング + 影」に到達した。「Tailwind だと皆バラバラ」ではない
- しかし **A はどの 2 セッションも byte 一致しなかった**（border-s-8 か 4 か、`!important` を使うか、
  dark 対応の細部）。レビュー・監査・回帰比較の対象が 3 つの別物になる
- **E は 3/3 が byte 一致**。レビュー対象は 1 つ

つまり Tailwind の問題は「発散して手に負えない」ではなく、
**「同じ意図・ほぼ同じ選択でも、成果物が正規形にならない」**こと。
diff・レビュー・回帰比較は byte で行うので、非正規性がそのままコストになる。

### A-3 が T8 を実地で踏んだ

A-3 セッションは自力で次を報告した:
> 承認期限を赤くするのに `!important` を使った。utility の sort order で `text-red-700` が
> 既存の slate 色に**黙って負ける**ため、plain な `text-red-700` では効かない。

これは T8（競合が computed style で意図と食い違う）が、
作られた実験ではなく**独立セッションの実作業でも起きる**ことの証拠。
AI は競合に気づき、`!important` で押し切った（規律としては後退）。

## 結果（T9 — 創造性の収束は良し悪しの両面）

同じ収束が、創造性の文脈では**弱み**になりうる。

- 条件E の presentation 空間は enum の直積で **38,880 通り**（見た目に大きく効く 4 軸だけでも 180 通り）。
  いずれも意味 DOM 差分 0・決定論。5 つの palette/shape/typography 組合せが
  それぞれ異なる CSS hash を出すことは確認した（`cssHash` 5 種すべて distinct）
- しかし **同じ曖昧な要求に対しては、E は 1 点へ収束する**（T2 の 3/3 一致）。
  これは「指示された範囲で最も妥当な 1 案」を安定して出すのに向くが、
  「多様な 20 案を出す」には、要求側が軸を変えて指示する必要がある
- 条件A は同じ要求でも発散する。これは「多様な案が出る」とも「制御できない」とも読める

### 判定 — T9 は **保留（SELF_TESTED）**

「A が似た dashboard に収束するか」「E の 38,880 通りが人間に明確に異なると感じられるか」は、
**pixel 距離ではなく Owner の blind comparison でしか確定できない**。
自動的な CSS hash の distinct 数（E で 5/5）は「異なる」ことは言えても「明確に異なると感じる」は言えない。
`dist/catalog/` の 5 案で Owner 評価を取るまで、T9 は未確定とする。

## 重要な含意

> Tailwind が最適化しているのは「人間が要素ごとに外観を指定する速度」。
> その速度は、複数 AI セッションが同じ結果へ収束することまでは保証しない。
> E が最適化しているのは「AI が意味を保ったまま表現意図を宣言し、同じ入力から同じ成果物を出すこと」。
> **同じ recipe から同じ bytes** は、レビュー・監査・回帰比較のコストを下げる。

ただし E の収束は「創造の幅」とトレードオフになりうる点を、T9 で保留として明記した。
