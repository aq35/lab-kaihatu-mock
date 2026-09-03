# 決定 0003 — UI Compiler 効果と CSS backend の分離

- 日付: 2026-09-03
- 状態: **確定（この監査範囲で）**。性能の最終確定と Owner 評価は未了
- 関連: `docs/research/_hypotheses-compiler-vs-backend.md` /
  `docs/results/ui-compiler-factorial.md` / `ui-feature-parity.md` /
  `ui-context-cost-fair.md` / `ui-recipe-effective-space.md` / `ui-performance-repeated.md` /
  `docs/results/CORRECTIONS.md`

## 中心結論

前サイクルで「E vs Tailwind」に見えた優位の**主因は、型付き PresentationRecipe と
決定論的 Compiler という中間層**であって、Tailwind の欠陥ではない。
条件F（同じ Recipe を Tailwind backend でコンパイル）が、E と同じ fail-closed・決定論・低 context を
達成したことで、これを分離実証した（`ui-compiler-factorial.md`）。

> KAS の奥義は「Tailwind を使わない」ではなく、
> **CSS フレームワークの上位に、AI が意味を保って表現意図を宣言する言語（Recipe）と、
> それを決定論的に実装する Compiler を置く**こと。CSS backend はその下の実装詳細。

## §11 の 6 問に個別に答える

### 1. Tailwind 固有の問題は何か（backend 由来。F だけに出た）
- runtime 連結 class が静的走査で消える（T5）。完全文字列生成で回避可だが、未知表現に fail open
- 同詳細度 utility の競合がソース順で解決されず、computed style が意図と逆（T8）。`!important`/merge tool が要る
- cross-cutting 規則（`*{overflow-wrap:anywhere;min-inline-size:0}`）を全ノードに stamp する必要
- `overflow-wrap:anywhere` 等が標準語彙に無く arbitrary value が要る
- これらは `IMPLEMENTATION_MISUSE`〜条件付き `STRUCTURAL_LIMIT`。Native CSS backend では発生しない

### 2. direct editing 固有の問題は何か（A と C に共通。E/F では消えた）
- 外観指定が意味 DOM 生成ファイルに同居し、視覚変更が protected な行に接触しうる（T4）
- 同じ視覚要求が byte 一致の成果物にならない（T2。非正規形）
- 外観変更の context コストが高い（A 4,346 token）
- ただし C の direct editing は `:has()`・属性セレクタにより、**新しい意図を 1 規則で表現できる**強みも持つ

### 3. Compiler 固有の利点は何か（E と F に共通。backend 非依存）
- fail-closed（未知の値を compile で拒否。RecipeError）
- 決定論（同 recipe → 同 bytes。3/3 セッション一致）
- 低 context（既存語彙内の変更は 94 token）
- protected DOM の分離（意味 DOM 生成ファイルに触れずに表現を変える）
- required field を **untrusted Recipe からは** 消せない（trusted Compiler は消せる。訂正 C3）

### 4. Native CSS backend 固有の利点は何か（E が F に勝る点）
- cross-cutting 規則を cascade で 1 回書ける（overflow-wrap, min-inline-size）
- 同詳細度競合の罠（T8）が無い。`!important` 不要
- arbitrary value が要らない（任意の CSS 値を直接書ける）
- 完全 class 文字列の列挙（safelist 相当）が要らない
- CSS bytes が小さい（E 7.2KB vs F 24.6KB。反復測定で性能差を確認）

### 5. 閉じた Recipe によって失った創造性は何か
- **per-card の微調整ができない**（承認カードだけ、が palette 全体変更になる。T2）
- 同じ曖昧要求に 1 点収束する（T2 の 3/3 一致は「選択肢不足」の裏返し）
- 有効空間は 38,880 ではなく distinct CSS 12,960。うち `readingMode` は完全に inert な軸
- 「わずかに」の微調整ができない（enum の粒度が粗い）
- ただしこれらは「意味を壊さない範囲で多数の明確に異なる表現」を諦めた対価ではない。
  Owner blind comparison が無いため、失った創造性の量は **未確定（SELF_TESTED）**

### 6. KAS production へ採用できる最小構成は何か（暫定）
```
Meaning Contract (contracts/cards.schema.json)         ← 意味は契約が守る。必須
  → Owner Communication ViewModel (5 カード型)          ← 必須
  → PresentationRecipe (contracts/presentation-recipe)  ← 型付き・閉じた語彙。推奨
  → Deterministic Compiler                              ← Native CSS backend を推奨（残余が少ない）
  → Proof Engine (tests/ + counter-proof)               ← 契約破壊/非決定/fail open/可視性を機械検証。必須
  → Recipe/Compiler versioning (contracts/recipe-version)← 語彙進化のガバナンス。Owner のみ ENABLED
  → Owner Evaluation (dist/catalog/)                    ← 未実施。採用の最終ゲート
```
最小: **Meaning Contract + Proof Engine は無条件で必須**。
Recipe + Compiler は「AI に UI を動的生成させる経路」で強く推奨。
backend は Native CSS を既定とし、Tailwind は比較・移行用に留める。

## 決定

1. **Recipe + 決定論的 Compiler + Proof Engine** を KAS UI の中核抽象とする（H-main 支持）
2. Compiler の **backend は Native CSS を既定**とする（F の残余が E に無いため）。
   ただし「Native が Tailwind に総合性能で勝る」の最終確定は反復測定の結果を待つ
3. Tailwind は「排除対象」ではなく「Compiler backend の一候補」。production 依存には入れない
4. 語彙進化は `recipe-version.schema.json` のガバナンス（Owner のみ ENABLED、AI は PROPOSED まで）に従う
5. `readingMode`（inert 軸）を実装するか語彙から外す。inert な軸を残さない

## この決定を覆す/更新する条件
- ~~反復測定で Native backend(E) が Tailwind backend(F) に性能で劣ると判明~~ → 逆に E が約 3 倍速いと判明（`ui-performance-repeated.md`）
- Owner blind comparison で Recipe 方式の創造性が direct editing に大きく劣ると判明
- T3（12 回連続変更）で Compiler 方式が direct editing より劣化すると判明
- 新軸追加の頻度が高く、C の `:has()` の軽さが Compiler の型安全より重要と判明
