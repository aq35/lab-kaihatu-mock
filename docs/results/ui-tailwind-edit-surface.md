# T4 / T10 — 編集面と意味単位の変更

```
Hypotheses frozen: docs/research/_hypotheses-tailwind.md の T4, T10
Model/session: 独立セッション・前会話なし。各条件を隔離コピーで実施
再現: scratchpad の t10-a / t10-c / t10-e。差分は docs/results/raw/t10/
```

## 課題（意味単位の 2 ルールを UI 全体へ）

1. evidenceLevel が RECEIPTED でない情報（＝未検証）を、一段弱く見せる
2. OUTCOME_UNKNOWN の retry ボタン（`RETRY_WITH_DUPLICATE_RISK`）を常に最も目立たなくする

## 結果

| | A: Tailwind | C: Semantic CSS | E: Compiler |
|---|---|---|---|
| 編集ファイル | **render.mjs**（意味DOM生成）+ dist | CSS 2 ファイル | compiler.mjs + schema + recipe |
| 編集箇所 | 4 | **2** | 7（新軸追加のため） |
| 意味DOM生成ファイルに触れたか | **触れた**（render.mjs 9 行） | 触れない | 触れない（semantic-dom.mjs 不変） |
| contract 属性を含む行に触れたか | **0**（触れたが壊さなかった） | 0 | 0 |
| ルール1 の適用 | container に条件式 `unverified` を追加し `opacity-75` | `.card:has([data-evidence-level]:not([...="RECEIPTED"]))` **1 規則** | 新軸 `unverifiedEmphasis` を追加 |
| ルール2 の適用 | `BTN_QUIET` 定数 + 三項式で分岐 | 属性セレクタ **1 規則** | 新軸 `duplicateRiskAction` を追加 |
| 自己申告難易度 | 2 | 2 | 2 |

## T10 の判定 — **条件により最善が変わる。E は単純に最善ではない**

意味単位の変更に対する 3 方式の性質は、はっきり分かれた。

### C（Semantic CSS）が最も少ない編集で済んだ

`:has()` と属性セレクタで、**両ルールとも 1 CSS 規則ずつ**で全カード横断に適用した。
schema も render も触っていない。**アドホックな意味単位の変更に最も強い**。

```css
.card:has([data-evidence-level]:not([data-evidence-level="RECEIPTED"])) { opacity: 0.72; }
.decision[data-action-semantic="RETRY_WITH_DUPLICATE_RISK"] { /* 最も静かな見た目 */ }
```

### E（Compiler）は「語彙に無い意図」には拡張が要る

E の recipe には「未検証を弱く」「retry を最弱に」という軸が無かった。
E セッションは (a)recipe だけで妥協 ではなく **(b)compiler に新軸を追加** を選んだ:
`unverifiedEmphasis` と `duplicateRiskAction` を schema と compiler.mjs に追加した（7 箇所）。

- **一度きりのコストは高い**（schema + compiler 変更）
- しかし追加後は **recipe の 2 フィールドで再利用可能**、かつ規則は compiler の 1 箇所に集約され、
  全カードに決定論的に適用される
- **意味 DOM（semantic-dom.mjs）には触れられない**（凍結）。拡張は表現層に閉じる

これは E の設計思想そのもの: **新しい意図は「語彙の拡張」として一元的に追加し、以後は宣言で使う。**
アドホックには重いが、繰り返す意図には型がつく。

### A（Tailwind）は意味 DOM 生成ファイルを編集した

A はルール1 を「container に条件式を足して opacity-75 を付ける」形で実装したため、
**render.mjs（data-* を生成するファイル）を 9 行変更**した。

## T4 の判定 — **支持（ただし「露出」であって「破壊」ではない）**

- A の意図・視覚変更は、**意味 DOM を生成するファイルの中で行われる**。
  今回の慎重な独立セッションでは contract 属性を含む行には触れず（0 行）、破壊は起きなかった
- C と E は、意味単位の変更を **意味 DOM 生成ファイルの外**（CSS / compiler）で行えた

正確に言うと: A の編集面は意味 DOM と同居しており **契約破壊の機会が構造的に多い**が、
n が小さい慎重な試行では破壊は顕在化しなかった。
前回 UI-9（純粋な視覚変更）でも A は render.mjs を 56 行変更したが描画結果は不変だった。
**「同居 = 露出増」は再現するが、「同居 = 破壊」はまだ実証されていない。** より多い n が要る。

## 含意

- **アドホックな意味単位変更**: C（`:has()` + 属性セレクタ）が最も軽い
- **繰り返す意味単位変更**: E（語彙に型をつけ、以後は宣言）が最も安全で再利用可能
- **A**: 意図変更が意味 DOM 生成ファイルに同居し、露出が増える

「意図単位の変更が存在しない」という T10 の仮説は、A については支持
（要素ごとの utility 編集に分解された。ただし今回は定数 + 三項で局所化できた）。
C は CSS セレクタが意図単位の適用面を与え、E は recipe が意図単位そのものを与える。
