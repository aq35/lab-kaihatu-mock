# Verified Generative UI — 生成→観測淘汰→選択→進化

```
Frozen hypothesis SHA: docs/research/_hypotheses-vgui.md (3993df9)
対象 surface: KAS card（ACTION_APPROVAL 等。判定基準が Owner UI でのみ意味を持つため）
実装: experiments/vgui/{generator,compiler,verify}.mjs / tools/vgui-pipeline.mjs
結果: docs/results/raw/{vgui-gen1,vgui-pipeline}.json / gallery: dist/vgui/gallery.html
```

## 何をしたか（「書く」でなく「探索して検証する」）

固定 enum の Recipe ではなく、**意図 + 制約 + 連続パラメータ**の生成文法から 12 の視覚仮説を生成し、
既存の card 意味 DOM に展開し、**実ブラウザで観測して不適格案を淘汰**し、生存案を Owner へ提示する。

```
意味契約(固定) → 生成文法 → 12 案(連続パラメータ) → Native CSS 展開
  → 実ブラウザ観測 → 安全/可読性/性能で淘汰 → 生存 4 案 → Owner 選択 → 次世代
```

## 実測結果

### 世代1: 12 生成 → **8 淘汰 → 4 生存**（V1 支持）
淘汰はすべて**観測**による（自己申告でなく）:

| 淘汰理由 | 件数 | 内容 |
|---|---|---|
| min_contrast | 5 | `contrastEmphasis` が低い案 → axe color-contrast 違反（本文/補助テキストが薄すぎ） |
| target_px | 3 | `density` が高い案 → ボタンが 24px 未満（WCAG 2.2 target size 違反） |

→ **V4 支持**: 観測器は「読めない案」「押しにくい案」を実際に捕まえた。

### 生存案の性質
- **V2 支持**: 生存 4 案（と全 12 案）は **意味 DOM が byte 一致**、contract 属性も一致。
  変わったのは CSS（視覚仮説）だけ。意味・安全境界は不変。
- **V3 は要修正（param 多様 ≠ 見た目多様）**: 生存案の param 距離は平均 **0.72**（density 0.12–0.73 の広がり）だが、
  これは**パラメータ空間の距離**であって Owner が見る**画素の差ではない**。
  実 Owner が「案 A と案 B の違いが分からない、同じでは？」と指摘し、実測（`tools/vgui-perceptual-diff.mjs`、
  固定枠 820×1400 の pixel 差）で確認した:
  **生存 4 案は全ペアが画素の 9〜10% しか違わない**（meanDiff 0.04–0.05／1.0）。明確に離れたペアが無い。
  原因: 意味 DOM（同一の 5 カードの本文テキスト）が画素の大半を占め、grammar が動かすのは spacing・色・角丸など
  スカラーだけなので、差が ~10% に留まる。**param 距離 0.72 を「多様」と書いたのは過大評価だった**。
  → 正しくは「**この text 主体の意味 DOM では、スカラー grammar の生存案は知覚的にほぼ同一**」。
  Owner blind 比較は、候補が知覚的に区別できて初めて成立する。ここが VGUI の前提の弱点（後述の次実験）。
- 生存案はすべて contrast・target・reduced-motion・hostile・protected-meaning を満たす（観測で保証）。

### 世代2: 選択 → 進化（V6 支持）
- 選択は **SIMULATED_SELECTION**（intent 中心に最近傍の生存案 = cand-01, density 0.12/contrast 0.85）。
  **実 Owner 評価の代理であり、REQUIRED だが未実施**。
- 勝者の周り（spread 0.14）に第 2 世代 12 案を生成 → **10 案生存**（淘汰 2）。
  生存率 33%(gen1) → **83%(gen2)**。良い領域へ寄せる進化ループが動く。

### V5 決定論 / V7 governance
- 同 seed から同じ 12 案・同じ生存集合（`tests/tailwind/vgui.test.mjs`）。
- 成長文法は生存領域から **PROPOSED 規則のみ** 抽出:
  `VG-R1: contrastEmphasis >= 0.64`（低いと淘汰された）、`VG-R2: density <= 0.73`（高いと淘汰された）。
  **self-eval で ENABLED にしない。** 昇格には「複数 Goal/fixture で再現 + Owner 選択 + counter-proof」を要求。

## この方式が Recipe / Tailwind と本質的に違う点

| | 閉じた Recipe / Tailwind | Verified Generative UI |
|---|---|---|
| AI の仕事 | 1 案を選ぶ/書く | 空間を**探索**する（12 案） |
| 良し悪しの決定 | build 成功 / self-eval | **実ブラウザ観測**が淘汰 |
| 多様性 | enum の天井（前実験で 8軸中7軸一致） | 連続空間（param 距離 0.72）だが**見た目は全ペア 9–10% 差＝知覚的にほぼ同一**（要修正、下記） |
| 成果物 | class / CSS | 意味・制約・**観測結果**・生存領域 |
| design system | 人が決めた部品集 | 観測から**育つ**規則（PROPOSED、Owner で昇格） |

前サイクルまでの「意味コンパイラ効果」はここでも土台として効いている
（意味 DOM 固定・fail-closed・決定論）。VGUI はその上に **観測駆動の探索と淘汰**を足した。

## 未検証（正直に）
- **Owner 実測が最大の未検証**。judge 対象（判断精度・判断時間・危険操作の誤認・重要情報の見落とし・
  好みの選択・次世代改善）はすべて Owner が要る。現状は「観測で安全な生存案を作れた」までで、
  「Owner が速く正しく判断できたか」は `SELF_TESTED`（`dist/vgui/gallery.html` が評価の入口）。
- 進化は 2 世代・SIMULATED 選択のみ。多世代・実選択での収束/改善は未計測。
- 「未知の表現を作れたか」は連続空間の探索で param は新規だが、**知覚的に新規か**は Owner 評価待ち。
- 1 seed・1 intent・1 fixture。複数 Goal での再現（V7 昇格の前提）は未実施。
- LCP は簡易（bytes/DOM）代理。実 LCP 分布は未測。

## 実 Owner 較正で判明した前提の弱点（この実験の一番の収穫）

Owner が計測器を試し「案 A と案 B が同じに見える」と指摘 → 実測で**生存 4 案が全ペア 9–10% しか
画素が違わない**ことを確認（`tools/vgui-perceptual-diff.mjs`）。ここから:

1. **param 多様性は見た目多様性を保証しない。** grammar が動かすのは spacing・色・角丸などスカラーで、
   画素の大半を占める意味 DOM（本文テキスト）は不変。よって差は ~10% に留まり、Owner には「同じ」に見える。
2. **Owner blind 比較は、候補が知覚的に区別できて初めて成立する。** いまの grammar では候補が近すぎて、
   比較しても「どっちも同じ」しか出ない（＝計測以前の問題）。
3. **前サイクル ui-11 では、同じ意味 DOM から明確に異なる 5 案が作れていた**（明朝の editorial／等幅の
   command center／角丸の conversational／timeline 軸）。違いを生んだのは**書体・レイアウト様式・種別の示し方
   といった構造/カテゴリ軸**であって、スカラーではない。今の VGUI grammar にはその軸が無い。

### 次実験の候補（root cause を直す）
- **grammar に構造/カテゴリ軸を足す**: typeface family・layout mode・種別インジケータの様式・背景処理など、
  ui-11 で効いた「大きく動く軸」を連続スカラーと併存させる。
- **Owner 提示前に「知覚的多様性」ゲートを足す**: 生存案のうち、既採用案との画素差が閾値未満の案を
  近重複として淘汰し、Owner には**明確に違う少数**だけを見せる（判断を浪費させない）。
  いまの grammar だとこのゲートで 4 案が実質 1 案に潰れる＝grammar が狭すぎる証拠になる。
