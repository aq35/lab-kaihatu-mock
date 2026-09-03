# 2×2 — Compiler 効果と CSS backend を分離する（中心実験）

```
Hypothesis frozen: docs/research/_hypotheses-compiler-vs-backend.md（H-main, HF1-HF8）
再現: node tools/build-variants.mjs / node --test tests/tailwind/factorial.test.mjs
     node tools/feature-parity.mjs / tools/tailwind/context-cost-fair.mjs / tools/perf-repeated.mjs
```

## 設計

| 条件 | AI が操作する入力 | CSS backend |
|---|---|---|
| A | HTML 内 utility class | Tailwind |
| C | semantic HTML/CSS | Native CSS |
| E | PresentationRecipe | Native CSS Compiler |
| **F** | **PresentationRecipe** | **Tailwind Compiler（完全な静的 class を build 前生成）** |

E と F の共有を機械検査で保証（`tests/tailwind/factorial.test.mjs`）:
- 意味 DOM は class を除いて **1 バイト一致**（8,131 bytes）
- contract 属性の集合が一致
- 同じ `RecipeError`（fail-closed）経路
- 同じ決定論（同 recipe → 同 HTML bytes）
- F の class は完全な静的文字列（runtime 連結の痕跡なし）

**異なるのは CSS backend だけ。** これで「入力の抽象化(行)」と「CSS backend(列)」を分離できる。

## 軸ごとの結果

### fail-closed（未知値の拒否）— 入力の抽象化で決まる

| | A | C | E | F |
|---|---|---|---|---|
| 未知の表現を拒否するか | ✗（任意 utility を書ける） | ✗（任意 CSS を書ける） | **✓ RecipeError** | **✓ RecipeError** |

E と F がともに ✓。**Recipe 抽象化の効果であって backend は無関係**（HF1 支持）。

### 決定論（同入力→同 bytes）— 入力の抽象化で決まる

| | A | C | E | F |
|---|---|---|---|---|
| 同じ要求で byte 一致 | ✗（T2: 0/3） | 未測 | **✓ 3/3** | **✓（HTML 決定論）** |

E/F ともに決定論。backend 非依存（HF1 支持）。

### context コスト — 入力の抽象化で決まる（訂正済み）

| 変更の種類 | A | C | E | F |
|---|---|---|---|---|
| 既存語彙内 | 4,346 | 1,136 | **94** | **94** |
| 新しい表現軸 | 4,346 | **700** | 1,129 | 1,129 |

E と F は全種類で同じ token 数。**低 context は Compiler 効果、backend 非依存**（HF1 支持）。
ただし新軸では C が最軽（`:has()`）。

### Tailwind 固有の残余 — CSS backend で決まる（F だけに出る）

F を E と同機能にする過程で、E には無い作業が F だけに発生（HF2 支持）:

| 残余 | F | E |
|---|---|---|
| 期限切れ hidden が inline-flex に負ける → `!hidden` 必要（T8） | あり | なし |
| `overflow-wrap:anywhere` に arbitrary value 必要 | あり | なし（native 1 規則） |
| `min-w-0` を構造の各階層に stamp | あり | なし（cascade 1 規則） |
| 静的走査のため完全 class 文字列の列挙が必要（T5） | あり | なし |

→ **これらだけが Tailwind backend 固有**（HF2）。E/F 共通でなく F だけに出た。

## H-main の判定 — **強く支持**

> KAS の主要な改善は Tailwind 排除ではなく、AI と意味 DOM の間に
> 型付き PresentationRecipe と決定論的 Compiler を置くことで生まれる。

- fail-closed・決定論・低 context は **E と F で同一**＝ **Compiler 効果**（backend 非依存）。HF1 支持
- 静的検出・utility 競合・cross-cutting・arbitrary は **F だけ**＝ Tailwind backend 固有。HF2 支持
- A と C の direct editing 固有問題（意味 DOM 同居・非正規形・高 context）は E/F では消えた。HF4 支持

したがって前サイクルの「E vs A」で見えた優位の**主因は Compiler であって Tailwind の欠陥ではない**。
これは「Tailwind に勝った」ではなく、**CSS フレームワークの上位に AI 向け UI 生成言語を置いた**という発見。

## 残る差（Native CSS backend が Tailwind backend に勝る点）

F は E と同じ Compiler 利益を得たが、backend 由来の残余（!important・arbitrary・stamp・完全文字列列挙）を負う。
→ **Compiler を使うなら、backend は Native CSS の方が残余が少なく、かつ速い。**
反復測定（`ui-performance-repeated.md`）で E(Native) は 1,000 カード load 中央値 9.8s、
F(Tailwind) は 29.9s（p95 49.7s）。同じ Recipe・同じ意味 DOM で **backend だけの差が約 3 倍**。

## まだ答えていない問い（正直に）

- Native CSS backend が Tailwind backend より**総合性能で**優るか → 反復測定の結果次第
- 閉じた Recipe で失った創造性 → Owner blind comparison 未実施（`SELF_TESTED`）
- 12 回連続変更(T3)での劣化曲線 → 未実施
- KAS production への最小構成 → 0003 で暫定提示、Owner 評価で確定
