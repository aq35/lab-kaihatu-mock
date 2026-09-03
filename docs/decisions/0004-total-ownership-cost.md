# 決定 0004 — 総所有コストと所有境界

- 日付: 2026-09-03
- 状態: **確定（この監査範囲で）**。16 変更列(T3)・Owner 評価・実運用 governance ログは未了
- 関連: `docs/research/_hypotheses-ownership.md` / `dependency-inventory.json` /
  `docs/results/ui-ownership-cost.md` / `ui-performance-repeated.md` /
  `docs/decisions/0003-ui-compiler-vs-backend.md`

## 中心結論

> Tailwind の**思想**（制約された語彙・token・局所変更・一貫性・不要 CSS 削減）は採用する。
> Tailwind **パッケージ**（class 語彙・source scanner・build 仕様・release cycle）には結合しない。
> ただし「依存 0」は目的にしない。KAS が汎用保守（CSS parser・minifier・browser 互換）を
> 背負うくらいなら、外部に委ねる。**思想は取り込む、支配権は渡さない、汎用保守は背負わない。**

## 実測が支持したこと

| 仮説 | 判定 | 根拠 |
|---|---|---|
| HO1 G は production で framework も Node も不要 | **支持** | self-hosting: node_modules 無しで 36 field 表示 |
| HO2 Tailwind version drift が出力を変える | **支持（小）** | 4.3.3 vs 4.1.4 で CSS 2.4% 差・hash 相違 |
| HO3 「起動」と「build」は分離できる | **支持** | 全条件 runtime は静的 asset。build のみ framework 要否が分かれる |
| HO4 「Tailwind なし=依存 0」は誤り | **支持** | browser/仕様・Node・test 依存は残る。差は BUILD の外部 framework だけ |
| HO5 自作 core は 1,500 行以内 | **支持** | 355 行（semantic-dom 118 + compiler 197 + backend 40） |
| HO6 外部の保守代行の利益も数える | **記録** | vendor prefix/互換/色変換/utility 網羅を A/F は書かない。E/G は必要分だけ token で持つ |

## 所有境界（決定）

- **KAS が所有**: ViewModel / card type / required fields / action semantics /
  effect・scope・cost・expiry / evidence / PresentationRecipe / reason code / 安全性検査 /
  Recipe・Compiler version / 生成結果の検証規則
- **KAS が所有しない**: CSS parser / minifier / vendor prefix DB / browser 互換 DB /
  color 変換 engine / JS bundler 全体 / 汎用 component・utility framework

Recipe には **CSS framework 固有の語彙を含めない**（`contracts/presentation-recipe.schema.json` は
palette/density 等の意味語彙のみ。`bg-red-500` のような外部 class 名は入らない）。

## 採用する構成（0003 を所有コストの観点で確定）

```
KAS ViewModel
  → versioned PresentationRecipe (contracts/presentation-recipe + recipe-version)
  → small KAS-owned Compiler (355 行, backend interface 経由)
  → semantic HTML + native CSS backend（既定）
  → optional standard minifier (OPTIONAL 依存)
  → static assets (+ provenance.json: recipe/compiler hash)
```

- **production runtime**: 静的 asset のみ。Tailwind も Node も要らない（HO1）
- **build**: 自作 Compiler(355 行) + Node。外部 CSS framework 無し
- **backend は interface で交換可能**（native / tailwind）。Recipe と ViewModel は不変（`backend.mjs`）
- **生成物に provenance**（recipe/compiler hash）。再現性・監査・rollback の証跡

## 各条件の総所有コスト評価（§9 の式に沿って）

| 軸 | A: Tailwind | F: Recipe+TW | E: Recipe+Native | G: Minimal Owned |
|---|---|---|---|---|
| production framework 依存 | build に有 | build に有 | **0** | **0** |
| 外部 version drift の露出 | あり | あり | **なし** | **なし** |
| 自作コード量 | 少 | 中（tw-map） | 中（355行） | 中（355行+interface） |
| 汎用保守の負担（prefix/互換/色） | **外部が代行** | **外部が代行** | 必要分を自作 token | 必要分を自作 token |
| context コスト（既存語彙内） | 4,346 | 94 | 94 | 94 |
| 意味 DOM と外観の分離 | 同居 | 分離 | 分離 | 分離 |
| backend 交換可能性 | ✗ | — | interface あり | **interface あり** |
| rollback（provenance） | class 手戻し | recipe 手戻し | recipe 手戻し | **recipe + hash** |

## 決定

1. **参照実装は G（Minimal Owned Core）を目標形とする**: KAS 固有の意味・Recipe・検証は自前、
   出力は標準 HTML/CSS、production は静的 asset、build/test 用の外部ツールは許容、Compiler は小さく保つ、
   CSS framework そのものは作らない
2. **backend は Native CSS を既定**、Tailwind は交換可能な一候補（interface の裏）。
   production 依存には Tailwind を入れない
3. **禁止事項（§8）を恒久ルール化**: 巨大 utility 一覧・汎用 CSS framework・独自 CSS parser を作らない。
   `tests/tailwind/backend-interface.test.mjs` が core 行数上限と production 依存 0 を検査する
4. 「依存 0」を宣伝しない。残る依存は `dependency-inventory.json` で分類して開示する

## 覆す/更新する条件
- 16 変更列(T3)で自作 Compiler が上限(1,500 行/3 ファイル)を超える、または残骸が累積する
- ~~Native backend の性能が Tailwind backend に明確に劣る~~ → **反対の結果が出た**: E(Native) は
  1,000 カードで F(Tailwind) の約 3 倍速い（9.8s vs 29.9s median）。Native 既定を性能面でも支持
- 外部 governance コスト（release 追従・security）の実運用ログが、自作保守より小さいと判明
- Owner 評価で Recipe 方式の正確性・創造性が direct editing に劣ると判明

## 正直な限界
- **総所有コストの多くは「時間をかけないと出ない」**（version drift の長期、security 追従頻度、
  16 変更後の劣化）。本サイクルは初期値と構造的性質のみ。実運用の縦断データは未取得
- G は E とほぼ同一実装（core を共有）。「G 固有の効果」は主に**規律と検証**であって新コードではない
