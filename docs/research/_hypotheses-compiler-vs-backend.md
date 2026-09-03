# 抽象化 vs CSS backend の分離（結果より先に凍結）

このファイルが追加されたコミット SHA が凍結の証拠。

## 中心仮説（H-main）

> KAS における主要な改善は Tailwind 排除からではなく、
> AI と意味 DOM の間に、型付き PresentationRecipe と決定論的 Compiler を置くことで生まれる。
> Native CSS が Tailwind backend より優れる可能性はあるが、
> それは Compiler 効果を除いた同条件比較でのみ判定できる。

## 2×2 比較

| 条件 | AI が操作する入力 | CSS backend |
|---|---|---|
| A | HTML 内 utility class | Tailwind |
| C | semantic HTML/CSS | Native CSS |
| E | PresentationRecipe | Native CSS Compiler |
| **F** | **PresentationRecipe** | **Tailwind Compiler（完全な静的 class を build 前生成）** |

E と F は ViewModel / Recipe schema / 既定 Recipe / 意味 DOM / JS 機能 / fixture /
validation / required field / action semantics / 画面機能 を**完全に共有**する。
異なってよいのは CSS backend だけ。

## 凍結する下位仮説

- **HF1**: F は E と同じ fail-closed・決定論・低 context を達成する
  → 優位の主因は UI Compiler であり Tailwind の欠陥ではない（H-main 支持）
- **HF2**: F だけに静的検出・bundle・競合・語彙同期の残余が出る
  → その残余だけを Tailwind 固有（`STRUCTURAL_LIMIT`）と認定できる
- **HF3**: E と F に同じ問題が出る → Compiler または Recipe 設計の問題
- **HF4**: A と C に同じ問題が出る → direct editing の問題
- **HF5**: F が完全な静的 class 文字列を生成すると T5（静的検出）は消える（C2 の検証）
- **HF6**: feature-parity 検査を外すと、機能未完成で軽量な条件が「最速」に見える
- **HF7**: E の enum を 1 つに減らすと決定論が上がり創造性が消える。自由文字列にすると発散と安全性低下
- **HF8**: Tailwind を semantic variant mapping 化すると T7/T4 の差が縮む

## 反証条件（H-main を否定する結果）

- F が E と大きく異なり、E の優位が F では再現しない（＝優位は Native CSS 由来だった）
- F に Tailwind 固有の残余が全く出ない（＝Tailwind backend は完全に代替可能で、選択は自由）

いずれも「失敗」ではなく発見として記録する。
特に F ≈ E なら、結論は「Tailwind に勝った」ではなく
**「CSS フレームワークより上位に、AI 向け UI 生成言語を置いた」**になる。
