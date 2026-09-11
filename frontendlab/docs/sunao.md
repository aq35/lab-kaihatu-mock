# sunao — 個人用途の「Vue 風プラグイン」＋ビルドツール（P3）

方針 [`plugin-policy.md`](plugin-policy.md) の P3「Recipe → 決定論出力」を、
**Vue の形（SFC コンパイラ ＋ 極小リアクティブ runtime）**で実装。EXP-1〜4 の結論に沿って
**変換器・bundler は native(esbuild) に任せ**、自作するのは「入力の型・fail-closed・決定論・低 context」だけ。
**v0.2** で [いいところ取り洗い出し](framework-cherrypick.md) のロードマップを実装。
**v0.3** で [レバレッジ地図](leverage-map.md) の最優先（型付き契約・診断・量産ガードレール・合成）を実装した。

```
再現: cd frontendlab && npm run build && npm run check && npm test
実装: plugins/sunao/{runtime,compile,esbuild-plugin}.mjs / build.mjs / check.mjs
デモ: fixtures/app-ui/（対話・合成）, fixtures/static-ui/（静的）
受領書: results/raw/build-app-ui.json
```

## v0.3 で実装した「見返りの大きい所」（レバレッジ地図）

| 所 | 実装 | fail-closed / 実測 |
|---|---|---|
| **① 型付き契約（props）** | `export default { props: { name:'string', count:{type:'number',required:true} } }`。runtime 境界で **未知 prop・型不一致・必須欠落を throw**（精密メッセージ） | 3 種の違反すべてテストで停止確認 |
| **② 診断（エラーが直し方を言う）** | 全 CompileError が **機械可読 diagnostic**（`code` / `loc{line,column}` / コードフレーム(^) / `suggestions[]`）を持つ。未宣言参照は Levenshtein で「もしかして: count？」 | 構造化フィールドをテストで検証（AI が parse して自己修正できる） |
| **③ 量産ガードレール（factory）** | `npm run check`: 全 `*.sunao` を compile-check ＋ 全 `main.js` を build して **決定論(2回sha)・予算** を一括検査。1 つ落ちれば exit 1 | 4 部品 compile / 3 入口 build すべて green |
| **④ コンポーネント合成** | 大文字タグ＝子。`<Greeting name="Alice" :count="n()"/>`。**import 必須（fail-closed）**、props は accessor で渡し reactive。宣言必須は props∪`return{}`∪expose で判定 | 親が 2 つの子を型付き props で描画（e2e テスト green） |

## v0.2 の柱（維持）

① 細粒度更新（thunk→箇所ごと effect・render 1 回・所有権つき破棄） ② 既定 static（非対話は runtime 0, **8x 小**）
③ computed ④ 宣言必須 fail-closed ⑤ v-model 糖衣 / scoped styles（最小）。

## 実例: カレンダーが作れる（`fixtures/app-ui/Calendar.sunao`）

月カレンダー（前後の月移動・日付選択）が **現状の sunao で作れる**。signal/computed で日付計算、
`v-for` でセル、`@click` で選択、`v-if` で選択表示。**実機ブラウザで月移動・選択が動く**（テスト green）。
バンドル **3,546 B / 1,598 B gzip**・決定論・予算内。
- 作る過程で **パーサのバグを 1 つ発見・修正**: 属性値中の `>`（arrow `=>` や `a > b`）で開きタグが誤終端していた
  → 引用符内を無視して `>` を探すように修正。
- 残る ergonomic gap: `@click="pick(c)"`（引数つき）は未サポートで、**`@click="() => pick(c)"`** と書く必要がある
  （イベント引数の糖衣が未実装）。静的 class と `:class` の**マージも未対応**（`:class` が上書き）。

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

## テスト（`npm test`、20 件すべて green）

reactivity / computed / 決定論（compile・render）/ fail-closed（未知ディレクティブ・空補間・タグ不整合・
未宣言参照・**型付き props 3 種・未 import コンポーネント**）/ render 正当性（v-if・v-for・補間・イベント）/
既定 static（import 無し）/ v-model desugar / scoped styles / **診断の提案**（もしかして）/
**合成 e2e**（親が子を型付き props で描画）/ **factory**（`node check.mjs` exit 0）/
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

- **イベント引数の糖衣が未実装**: `@click="pick(c)"` は不可、`@click="() => pick(c)"` と書く（次段で desugar 予定）。
- **class マージ未対応**: 静的 `class` と `:class` を同時指定すると `:class` が上書き（Vue のような結合はしない）。
- **prop の型検査は runtime 境界**（mount/component 時）。コンパイル時に式の型まで推論はしない（名前・必須はコンパイル時）。
- **スロット（子要素の受け渡し）未対応**。コンポーネントへは props のみ（`@event` も未対応）。
- **v-for に key が無い**: リスト変更時はその区間を作り直す（keyed diff は未実装）。`:key` 必須化が次段。
- **`count()` / `prop()` 呼び忘れ**が静かに関数を返す（Solid と同じ footgun）。値位置の関数参照を compiler で警告する案。
- **scoped styles は最小**（descendant 限定）。複雑セレクタの正確な scoping は未対応。
- テンプレ式は正規表現ベースの識別子抽出。将来は本式パーサで検証し fail-closed を厚くする。
