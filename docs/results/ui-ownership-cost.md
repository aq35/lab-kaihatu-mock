# 総所有コスト — 外部依存 vs 自作保守

```
Hypotheses frozen: docs/research/_hypotheses-ownership.md（HO-main, HO1-HO6, 上限 budget）
関連: docs/research/dependency-inventory.json / tools/verify-self-hosting.mjs / tools/version-drift.mjs
```

「依存 0」は目的ではない。**Owner が長期間維持する総負担が最小**の構成を探す。

## 1. 所有境界（何を KAS が持ち、何を持たないか）

| KAS が所有 | KAS が所有しない（Web 標準/外部に委ねる） |
|---|---|
| ViewModel / card type / required fields | CSS parser |
| action semantics / effect・scope・cost・expiry | minifier |
| evidence 表現 / PresentationRecipe / reason code | vendor prefix DB / browser 互換 DB |
| 安全性検査 / Recipe・Compiler version | color conversion engine |
| 生成結果の検証規則 | JS bundler 全体 / 汎用 component・utility framework |

## 2. 自作 Compiler core のサイズ（上限 budget との対比）

| 項目 | 実測 | 上限 | 判定 |
|---|---|---|---|
| KAS 固有 Compiler core（semantic-dom 118 + compiler 197 + backend 40） | **355 行** | 1,500 行 | **✓ 余裕** |
| 1 recipe axis 追加（T10 の E 実測） | schema+compiler+tests+docs の 3-4 ファイル | 3 ファイル以内 | △（docs 込みで境界） |
| production runtime dependency | **0** | 0 | **✓** |
| production CSS framework dependency | **0** | 0 | **✓** |

→ HO5 支持: 自作 Compiler は 355 行で、「巨大 Compiler を背負う」失敗には至っていない。
指示 §8 の禁止（巨大 utility 一覧・汎用 framework の自作）にも該当しない。

## 3. 依存の分類（§6。「Tailwind なし＝依存 0」は誤り）

`docs/research/dependency-inventory.json` に全分類。要点:

| 条件 | RUNTIME_REQUIRED | BUILD_REQUIRED に外部 CSS framework | VENDORED_ARTIFACT |
|---|---|---|---|
| A: Direct Tailwind | browser + 静的 asset | **あり（tailwindcss）** | tailwind.css |
| F: Recipe+Tailwind | browser + 静的 asset | **あり（tailwindcss）** | tailwind.css |
| E: Recipe+Native | browser + 静的 asset | なし（自作 355 行 + Node） | native.css |
| G: Minimal Owned | browser + 静的 asset (+任意 enhancement JS) | なし | native.css + provenance.json |

**共通して残る依存**（どの条件も逃れられない。WEB_STANDARD/TEST_ONLY）:
browser・HTML/CSS 仕様（WEB_STANDARD）/ Playwright・Chromium・axe・ajv（TEST_ONLY）/ Node（BUILD）。
→ HO4 支持: 外部依存は 0 にならない。違いは **BUILD_REQUIRED に外部 CSS framework を含むか**だけ。

## 4. 外部が代行してくれる保守の利益（§3 後段。A/F の利点も数値化する）

外部パッケージであること自体は欠陥ではない。Tailwind(A/F) が KAS の代わりに背負うもの:
- vendor prefix / browser 互換 / color 変換 / utility の網羅 / spacing・color scale の一貫性
- security advisory・bug fix の追従（KAS が書かなくてよい）

E/G はこれらを「使わない」ことで **書く量を減らした**が、必要になった分（overflow-wrap の cross-cutting、
色スケールの一貫性）は自作 token で持つ。**思想（token/制約/一貫性）は E/G も採用している**（`styles/tokens.css`／compiler の PALETTE）。
違いは「外部パッケージの class 語彙・scanner・release cycle に結合しない」点だけ。

## 5. Version drift（HO2）

`tools/version-drift.mjs` の結果を参照（下記表は実測後に差し込み）。
Tailwind の version を変えると同じ入力でも生成 CSS が変わりうる（A/F に影響）。E/G は外部 version を持たず drift しない。

| Tailwind version | 生成 CSS bytes | hash | build 時間 | 上位12 class sort |
|---|---|---|---|---|
| 4.3.3 | 10,600 | 1ad7e8f5… | 210ms | 同一 |
| 4.1.4 | 10,351 | 0230e372… | 270ms | 同一 |

**判定 HO2: 支持（ただし小さい）。** 同じ入力（KAS が生成した完全 class 文字列は version 非依存）でも、
Tailwind の version が変わると生成 CSS の **bytes と hash が変わる**（249 bytes / 2.4% 差）。
上位12 class の sort 順は今回一致した。E/G は外部 version を持たないため drift しない（構造的に）。
含意: F/A では「Tailwind を更新しただけで生成物が変わる」ため、生成物 hash による再現性保証には
version 固定が要る。これが「外部 release cycle への結合」の実測。

## 6. Build/runtime 分離（HO1/HO3）

`tools/verify-self-hosting.mjs` の結果を参照（下記表は実測後に差し込み）。
「生成済み CSS で起動」と「新 UI を build」を分けて測る。production は静的 asset だけで動くべき。

| 条件 | runtime に node_modules 必要 | 必須 field (JS有) | 必須 field (JS無) | build 依存なしで配信可 |
|---|---|---|---|---|
| A / C / E / F / G | **不要** | 36 | 36 | **✓** |

**判定 HO1/HO3: 支持。** 生成物を node_modules も npm も無いクリーンな場所へ置いて配信しても、
全条件が必須情報 36 個を JS 有無どちらでも表示した。**production runtime はどの条件も静的 asset だけで動く。**

重要な区別（指示 §8: 混同禁止）:
- **runtime（既存画面の表示）**: A/F も静的 asset で動く（tailwind.css は VENDORED_ARTIFACT）
- **build（新しい UI の生成）**: A/F は tailwindcss パッケージが要る。E/G は自作 Compiler(355 行)+Node のみ
- したがって差は「runtime」ではなく「新 UI を build する時に外部 CSS framework が要るか」。E/G は要らない

## 7. まだ答えていない（正直に）

- **16 変更列（§5, T3）** は未実施。harness は `docs/research/change-sequence-plan.md` に定義。
  「16 変更後の状態」を主要結果にするため、別 AI セッション 16×4 条件が要る（次サイクル）
- 外部 governance の定量（release 追従頻度・CI 時間・transitive 数）は A/F の実運用ログが要る
- Owner Communication の正確性の同等性は Owner 評価待ち（SELF_TESTED）
