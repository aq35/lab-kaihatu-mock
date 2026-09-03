# UI-2 Cinematic surface — 初回生成の実測（4 条件）

```
Frozen hypothesis SHA: docs/research/_hypotheses-ui2-cinematic.md (00f09ea)
Conditions: A(Direct Tailwind) / B(Direct Native CSS) / C(Recipe→Native) / D(Recipe→Tailwind)
Surface: Cinematic Product（架空製品 Aurora。商標・文章・画像 非複製）
Independent runs: A×3, B×3（別セッション・会話履歴なし・Sonnet）, recipe×3, C/D は共有 compiler
Mutation steps: なし（今サイクルは初回生成のみ）
生成物: docs/results/raw/ui2-artifacts/ 、計測: docs/results/raw/surface-cinematic.json
```

## 1. 主要計測（robust な指標）

| 条件 | CSS bytes | arbitrary値 | keyframes escape | axe | no-JS(見出し+CTA) | mobile溢れ | fidelity |
|---|---|---|---|---|---|---|---|
| C: Recipe→Native | **3,505** | 0 | 不要 | 0 | ✓ | 0 | 4/4 |
| D: Recipe→Tailwind | 28,823 | 37 | 不要※ | 0 | ✓ | 0 | 4/4 |
| A1: Direct Tailwind | 31,460 | 30 | **必要** | 0 | ✓ | 0 | 4/4 |
| A2: Direct Tailwind | 24,608 | 60 | **必要** | 0 | ✓ | 0 | 4/4 |
| A3: Direct Tailwind | 34,811 | 61 | **必要** | 0 | ✓ | 0 | 4/4 |
| B1: Direct Native | 15,549 | 0 | 不要 | 1 | ✓ | 0 | 4/4 |
| B2: Direct Native | 15,855 | 1 | 不要 | 1 | ✓ | 0 | (計測欠陥) |
| B3: Direct Native | 15,329 | 0 | 不要 | 0 | ✓ | 0 | (計測欠陥) |

※ D の motion は compiler が custom CSS layer に scroll-driven animation を出す（tw-backend の設計で escape を 1 箇所に閉じ込め）。

## 2. 仮説の判定

### U2 — Cinematic で Tailwind の arbitrary+escape が高い → **支持**
- 直接 Tailwind(A) の 3 セッションはすべて **arbitrary value 30/60/61 個**を使い、
  **全員が生の @keyframes へ escape**した（motion は utility class で書けない）。
- 自己報告でも「ESCAPES: none」と書いた A2/A3 が実際には `<style>`/`@theme` に keyframes を置いていた。
  → Tailwind の design vocabulary は cinematic 演出では実質バイパスされる。`KAS_MISMATCH`〜`STRUCTURAL_LIMIT`。
- 対して Native(B/C) は arbitrary 概念が無く、任意値を直接書く。

### U3 / RC-4 — C と D は同じ意味 DOM・同じ a11y → **支持**
- C と D は同じ Recipe・同じ semantic-dom から生成し、**class を除いた意味 DOM が byte 一致**、
  contract 属性も一致（`tests/tailwind/factorial.test.mjs` 同様の検査）。
- 差は CSS backend のみ: **C 3.5KB vs D 28.8KB（8.2×）**、D は arbitrary value 37。fidelity は両者 4/4、axe は両者 0。
- → backend の違いは「意味」ではなく「CSS bytes と語彙」に出る。Recipe 境界が backend 差を吸収する。

### U4 — fidelity は backend でなく実装者次第 → **概ね支持（ただし計測欠陥あり）**
- geometry ベースの fidelity は heterogeneous な agent markup で誤判定した（b2=2/4, b3=3/4 は probe 欠陥。
  両 agent は有効なページを生成している）。robust 指標（no-JS・mobile 溢れ 0・axe）では A/B/C/D に大差なし。
- headline サイズ・hero 高さは全条件で cinematic 基準（40px+/80vh+）に到達。表現力は方式で頭打ちにならなかった。

### U6 — no-JS でも hero 見出し+CTA が読める → **支持（全 8 生成物）**

### U1 — recipe 選択の収束 → **支持（ただし 3/3 完全一致ではない）**
- 独立 3 セッションの recipe は **8 軸中 7 軸が全員一致**（typeScale のみ grand/editorial/editorial）。
- direct(A/B) は同じ brief でも成果物が byte 一致しない（CSS 15-35KB とばらつき、arbitrary 0-61）。

### U5 / RC-1 — 閉じた語彙の天井 → **支持**
- recipe 3 セッションすべてが「`sectionTheme` の per-section 非対称パターン（dark,dark,light,dark,light,dark）を
  閉じた enum で表現できない」と報告。1 セッションは hero overlay / CTA 微調整の gap も指摘。
- → Cinematic のような精密な演出では、閉じた Recipe は **表現の天井**にぶつかる。語彙拡張が要る（RC-2 リスク）。

### U7 — fail-closed → **支持**（C/D は共有 compiler の RecipeError で未知値を拒否。既存テストで担保）

## 3. 4 要因の分離（この実験の核心）

| 効果 | どこに出たか |
|---|---|
| **Recipe 境界の効果** | C/D 共通: 意味 DOM 一致・fail-closed・低 context・recipe 収束。backend 非依存 |
| **CSS backend の効果** | C(native) 3.5KB vs D(tailwind) 28.8KB。arbitrary 0 vs 37。**backend だけの差** |
| **direct editing の効果** | A/B: 成果物が byte 一致しない。A は raw keyframes へ escape。意味と外観が同居 |
| **Tailwind パッケージ固有** | arbitrary value 依存・keyframes escape・8× CSS bytes（前サイクルの build 依存・version drift と一致） |

## 4. Surface 別の含意（暫定）
- **Cinematic では Native CSS backend が有利**: CSS が桁違いに小さく（C 3.5KB）、arbitrary/escape 不要、
  motion を素直に書ける。Tailwind(A/D)は arbitrary value と keyframes escape に頼る。
- ただし **direct Native(B) も cinematic を十分な品質で書けた**（15KB、axe ほぼ 0、no-JS 対応）。
  Recipe 境界(C)の価値は「表現力」ではなく「決定性・低 context・意味保護・CSS 最小化」にある。
- Recipe の**天井**（per-section theme 等）は Cinematic で現実の制約。語彙拡張の運用（recipe-version の governance）が要る。

## 5. 測定欠陥（§18 正直に記録）
- **fidelity の geometry probe** は markup 構造に敏感で、`<section>` を使わない agent 生成物（b2/b3）で誤判定した。
  robust 指標（bytes / arbitrary / axe / no-JS / overflow）で補った。次サイクルは DOM geometry + computed style の
  条件非依存な採点に差し替える。
- fidelity は「target 契約との幾何一致」までで、**知覚的品質は Owner 評価が未実施**（SELF_TESTED）。
- 初回生成のみ。**長期変更(12変更)後の劣化は未計測**（U2/RC-2 の本命は次サイクル）。
