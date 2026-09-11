# sunao — 個人用途の「Vue 風プラグイン」＋ビルドツール（P3）

方針 [`plugin-policy.md`](plugin-policy.md) の P3「Recipe → 決定論出力」を、
**Vue の形（SFC コンパイラ ＋ 極小リアクティブ runtime）**で実装。EXP-1〜4 の結論に沿って
**変換器・bundler は native(esbuild) に任せ**、自作するのは「入力の型・fail-closed・決定論・低 context」だけ。
**v0.2** で [いいところ取り洗い出し](framework-cherrypick.md) のロードマップを一通り実装した。

```
再現: cd frontendlab && npm run build && npm test
実装: plugins/sunao/{runtime,compile,esbuild-plugin}.mjs / build.mjs
デモ: fixtures/app-ui/（対話）, fixtures/static-ui/（静的）
受領書: results/raw/build-app-ui.json
```

## これは何か（2 つ）

### 1. Vue 風プラグイン = コンパイラ ＋ 極小 runtime
- **runtime**（`runtime.mjs`）: `signal` / `effect` / `computed` / `h` / `renderToString` / `mount` / `mountStatic`。
  Vue の reactivity + render の芯。隠れた unref をしない（値が要る所は自分で `count()` を呼ぶ）。
- **compiler**（`compile.mjs`）: SFC(`.sunao`) の `<template>` を **build 時に** render へコンパイル。
  対応: `{{ }}` / `:bind` / `@event` / `v-if` / `v-for` / `v-model` / `<style>`(scoped)。**それ以外の `v-*` は CompileError。**

### 2. ビルドツール = プラグインを native bundler に載せる薄い束ね
- `esbuild-plugin.mjs`: `import 'sunao'` を runtime に解決し、`*.sunao` を onLoad でコンパイル（vite-plugin-vue と同発想）。
- `build.mjs`: esbuild で bundle+minify → **決定論チェック**（2 回ビルドの sha256 一致）→ **予算ゲート**（超過で exit 1）→ **レシート**。

## v0.2 で実装した「いいところ取り」（ロードマップ全部）

| # | idea（出自） | sunao での実装 | 実測・テスト |
|---|---|---|---|
| ① | **細粒度更新**（Solid × Vue patch flags） | 動的な式を **thunk** で出力 → runtime が箇所ごとに effect。render は 1 回だけ。所有権つき effect で消えたサブツリーを破棄 | ブラウザ実機: 更新しても `<output>` は**同一ノード**のまま、値は text の in-place 更新（characterData） |
| ② | **既定 static**（Astro islands） | 動的もイベントも無いコンポーネントは **定数 HTML 文字列**へ。runtime を import しない | **静的アプリ 352B vs 対話アプリ 2,802B = 8.0x raw / 5.0x gzip 小**（reactivity が tree-shake で落ちる） |
| ③ | **computed**（Svelte $derived / Vue） | `computed()` を runtime に追加 | 依存変化で派生値が更新されるテスト green |
| ④ | **宣言必須・fail-closed**（型付き入力の第一歩） | `<script>` に `expose:[...]` があれば、テンプレの未宣言参照（typo 等）を **CompileError** | 未宣言参照で throw、宣言済みは通るテスト green |
| ⑤ | **v-model 糖衣 / scoped styles** | `v-model` → `:value + @input` に**純粋 desugar**（魔法を runtime に持ち込まない）。`<style>` は scope 属性＋`[scope]` 限定 CSS（最小） | desugar 形・scope 限定をテストで確認 |

## 実測（この環境）

| 対象 | raw | gzip | 決定論 |
|---|--:|--:|:--:|
| 対話アプリ（Counter + 細粒度 runtime） | 2,802 B | 1,318 B | ✓ |
| 静的アプリ（Hello + `mountStatic`） | **352 B** | **264 B** | ✓ |

- v0.1（~1.9KB）より対話 runtime は増えた（細粒度 + 所有権/破棄のコード分）。代わりに更新が最小 DOM に限定。
- **②の効果が一番はっきり**: 対話しない画面は runtime を引かず **8x 小**。EXP-3 の「使った分だけ」を構造で保証。

## テスト（`npm test`、12 件すべて green）

reactivity / computed / 決定論（compile・render）/ fail-closed（未知ディレクティブ・空補間・タグ不整合・未宣言参照）/
render 正当性（v-if・v-for・補間・イベント）/ 既定 static（import 無し）/ v-model desugar / scoped styles /
**ブラウザ実機**（クリック→DOM 更新・**要素は再生成されない＝細粒度**）。

## 「AIが好きそうなコンパイラ」の性質

| 性質 | v0.2 の状態 |
|---|---|
| 決定論（同入力→同 hash） | ✓ コンパイル・レンダ・ビルドすべて |
| 出力の予測可能性・軽さ | ✓ 予算ゲートで監視。静的は 8x 小 |
| **fail-closed（未知→エラー）** | ✓ 未知ディレクティブ＋**未宣言参照**（expose） |
| **低マジック / 低 context** | ✓ 式 verbatim・自動 unref 無し・明示 signal・エラーは許可集合を明示 |
| **型付き・宣言的入力** | △→○ 第一歩（expose の宣言必須）。本格的な型検査は次段 |

## 方針との整合（正直に）

`plugin-policy.md` の「自作 runtime は作らない（公開競合しない）」に、sunao は runtime を持つ点で触れる。区別:
- **公開競合でなく個人利用・実験**。依存はここだけ（root に出さない）。
- runtime は出力に残る唯一の依存 → **極小に保ち budget で監視**。**対話しない画面は 0 runtime**（②）。
- 変換エンジンは native 委譲。自作は契約層（fail-closed・決定論・低 context・宣言）だけ。

## 限界・次（正直に）

- **v-for に key が無い**: リスト変更時はその区間を作り直す（要素単位の keyed diff は未実装）。`:key` 必須化が次段。
- **`count()` 呼び忘れ**が静かに関数を返す（Solid と同じ footgun）。値位置の関数参照を compiler で警告する案。
- **expose は名前レベルの宣言**。型そのものの検査（number/string…）は未実装＝「型付き」はまだ第一歩。
- **scoped styles は最小**（descendant 限定）。複雑なセレクタの正確な scoping は未対応。
- テンプレ式は正規表現ベースの識別子抽出。将来は本式パーサで検証し fail-closed を厚くする。
