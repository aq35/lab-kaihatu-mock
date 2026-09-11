# sunao — 個人用途の「Vue 風プラグイン」＋ビルドツール（P3）

方針 [`plugin-policy.md`](plugin-policy.md) の P3「Recipe → 決定論出力」を、
**Vue の形（SFC コンパイラ ＋ 極小リアクティブ runtime）**で実装。EXP-1〜4 の結論に沿って
**変換器・bundler は native(esbuild) に任せ**、自作するのは「入力の型・fail-closed・決定論・低 context」だけ。
**v0.2** で [いいところ取り洗い出し](framework-cherrypick.md) のロードマップを実装。
**v0.3** で [レバレッジ地図](leverage-map.md) の最優先（型付き契約・診断・量産ガードレール・合成）を実装した。

```
再現: cd frontendlab && npm run build && npm run check && npm test
実装: plugins/sunao/{runtime,compile,esbuild-plugin}.mjs / build.mjs / check.mjs
デモ: fixtures/app-ui/（対話・合成・カレンダー・並び替えDnD・ルーティング・スロット）, fixtures/static-ui/（静的）
受領書: results/raw/build-app-ui.json
```

## v0.3 で実装した「見返りの大きい所」（レバレッジ地図）

| 所 | 実装 | fail-closed / 実測 |
|---|---|---|
| **① 型付き契約（props）** | `export default { props: { name:'string', count:{type:'number',required:true} } }`。runtime 境界で **未知 prop・型不一致・必須欠落を throw**（精密メッセージ） | 3 種の違反すべてテストで停止確認 |
| **② 診断（エラーが直し方を言う）** | 全 CompileError が **機械可読 diagnostic**（`code` / `loc{line,column}` / コードフレーム(^) / `suggestions[]`）を持つ。未宣言参照は Levenshtein で「もしかして: count？」 | 構造化フィールドをテストで検証（AI が parse して自己修正できる） |
| **③ 量産ガードレール（factory）** | `npm run check`: 全 `*.sunao` を compile-check ＋ 全 `main.js` を build して **決定論(2回sha)・予算** を一括検査。1 つ落ちれば exit 1 | 4 部品 compile / 3 入口 build すべて green |
| **④ コンポーネント合成** | 大文字タグ＝子。`<Greeting name="Alice" :count="n()"/>`。**import 必須（fail-closed）**、props は accessor で渡し reactive。宣言必須は props∪`return{}`∪expose で判定 | 親が 2 つの子を型付き props で描画（e2e テスト green） |

## v0.4 で実装した「並び替え・DnD・ルーティング」

| 課題 | 実装 | 実測・テスト |
|---|---|---|
| **keyed `v-for`**（並び替え・DnD の本体） | `:key` で **キー差分**（再利用・移動・削除）。`createRoot` で各アイテムを独立スコープに置き、再利用時は effect も保持 | **実機: 行をドラッグ移動しても `<li>` は同一ノード・チェックボックス状態も保持**（作り直しでない） |
| **ドラッグ&ドロップ** | 任意 DOM イベント（`@dragstart`/`@dragover`/`@drop`）＋ `$event.preventDefault()`。drop で配列を並び替え | `Sortable.sunao` 実機で DnD 並び替え green |
| **フロントエンドルーティング** | `useRoute()`（hash ベース signal）/ `navigate()` / `matchRoute('/day/:date', path)`。未使用なら tree-shake | `matchRoute` 単体＋**実機カレンダーで URL hash 同期・ブラウザ戻る** green |

> ルーターは **hash ベース**（公開ホストでリロードしても 404 にならない）。使わないアプリには load されない。

## v0.5 で実装した「残りの問題点」

| 問題点 | 実装 | テスト |
|---|---|---|
| **スロット** | 子 `<slot>`（デフォルト内容可）＋ 親 `<Card>…</Card>` の子を `$slot` で渡す（親スコープで評価） | 親の子要素が子の `<slot>` に差し込まれる e2e green |
| **ルートガード / ネスト** | `setRouteGuard((to,from)=>false|'/redirect'|true)` で遷移中止・リダイレクト。`matchRoute` 末尾 `*` で前方一致（ネスト） | ガードの中止/リダイレクト・`*` 前方一致 green |
| **keyed の unmount 破棄** | `createRoot(fn, owner)` ＋ 安定スコープ。v-if 解除や `mount().dispose()` で keyed アイテムの effect も一括破棄 | `createRoot` dispose 後は effect 再実行しない green |
| **ビルド時の契約検査**（コンパイル時 prop の実現可能な部分） | `analyze()` で全 `.sunao` の props 宣言と `<Child/>` 使用を集め、**子に無い prop・必須欠落を `npm run check` で停止**（型そのものは runtime 境界のまま） | analyze 抽出＋不一致検出 green、factory に常設 |

> **正直な非対応**: 式の *値の型* のコンパイル時推論（TS 相当の型システムが要る）と、**遅延ルート**（= `import()`＋esbuild splitting で可能だが専用 API は無し）。

## v0.6 で実装した「通信・時間・CSS・Recipe 統合」

| 領域 | 実装 | テスト |
|---|---|---|
| **通信（Go 並み）** | `resource(fetcher)`（reactive な loading/error/data・refetch）＋`context()`/`go()`（AbortController = Go の context キャンセル）。前の取得は refetch/scope 破棄で abort | resource loading→data→error、Inbox 実機で非同期 5 枚取得 |
| **時間（Go 並み）** | `now(tick)` 実時計 signal・`interval`/`timeout`（scope 破棄で自動停止）・`debounce`/`throttle` | interval 発火/stop・debounce 畳み込み・実機の時計 |
| **CSS をいい感じに** | `sunao/theme`: 閉じた Recipe 語彙 → 実 CSS トークン(oklch, repo compiler と同値)。`recipeStyle(recipe)` で `:style` に流すだけ。`themeCSS` の良い既定 | recipeStyle がトークン生成・実機で palette 切替→配色変化 |
| **Recipe→props コード生成** | `node tools/gen-recipe-vocab.mjs` が schema から `recipe-vocab.mjs`(RECIPE_PROPS/RECIPE_KINDS) を生成。`import from 'sunao/recipe'`。**手コピー無し＝drift 不能** | vocab==schema、kinds=5 |
| **5 カード型** | `OwnerCard` が `kind` enum(OWNER_QUESTION…INFORMATION)で 5 型を描画（役割ごとの強調色） | Inbox 実機で 5 枚＋承認 |

> **Owner Inbox 公開**: https://claude.ai/code/artifact/fc4a364a-caf9-4081-915d-220cdbcd8293
> （5 型カードを非同期取得・Recipe.palette 切替で配色が決定論的に変化・実時計）。これが direction B の
> 「Recipe=見た目 / sunao=振る舞い」の合成そのもの。

## v0.2 の柱（維持）

① 細粒度更新（thunk→箇所ごと effect・render 1 回・所有権つき破棄） ② 既定 static（非対話は runtime 0, **8x 小**）
③ computed ④ 宣言必須 fail-closed ⑤ v-model 糖衣 / scoped styles（最小）。

## 実例: カレンダーを作って公開した（`fixtures/app-ui/Calendar.sunao`）

**公開URL**: https://claude.ai/code/artifact/20e0f784-a1fd-4e38-b5c9-002675c9e15e （self-contained HTML に runtime 込みで inline）

月カレンダー（月移動・**今日**・**日クリックで `#/day/:date` の詳細画面へ（ブラウザ戻る対応）**・
**予定の追加/表示**・イベントドット・週末色分け・**keyed セル**・**localStorage 保存**）を sunao で実装。
**実機ブラウザで全操作＋ルーティングが動く**（テスト green）。バンドル **6,553 B / 2,872 B gzip**
（runtime＋ルーター込み）・決定論・予算内。再生成: esbuild + `sunao()` で `calendar-main.js` を bundle し HTML に inline。

**正直な到達点**: これは実用的な「月ビュー＋予定」カレンダー（date-planner 相当）。Google Calendar 級の
週/日ビュー・ドラッグ・繰り返し予定・同期は範囲外（sunao の限界でなく機能量の問題）。

作る過程で **見つけて直した gap**:
- **パーサのバグ**: 属性値中の `>`（arrow `=>` や `a > b`）で開きタグが誤終端 → 引用符内を無視して `>` を探す修正。
- **識別子抽出のバグ**: `$event` が `event` として拾われ、文字列リテラル内（`'Enter'`）も誤検出 → 文字列除去＋
  lookbehind で修正。
- **イベント引数の糖衣**: `@click="pick(c)"` を `($event) => { pick(c); }` に自動 desugar（Vue 互換、`$event` 可）。
- **class マージ**: 静的 `class` と `:class` を結合（Vue 同様）。
→ これらにより **`@click="pick(c)"` / `class="cell" :class="cellClass(c)"` と自然に書ける**ようになった。

## これは何か（2 つ）

### 1. Vue 風プラグイン = コンパイラ ＋ 極小 runtime
- **runtime**（`runtime.mjs`）: `signal` / `effect` / `computed` / `h` / `renderToString` / `mount` / `mountStatic`。
  Vue の reactivity + render の芯。隠れた unref をしない（値が要る所は自分で `count()` を呼ぶ）。
- **compiler**（`compile.mjs`）: SFC(`.sunao`) の `<template>` を **build 時に** render へコンパイル。
  対応: `{{ }}` / `:bind` / `@event`(引数糖衣・`$event`) / `v-if` / `v-for` / `v-model` / class マージ / `<style>`(scoped)。**それ以外の `v-*` は CompileError。**

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

## テスト（`npm test`、33 件すべて green）

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

- **prop 値の型のコンパイル時推論は非対応**（名前・必須はビルド時 `check` で検査、値の型は runtime 境界）。TS 相当の型システムが要る。
- **遅延ルート**は専用 API なし（`import()`＋esbuild splitting で実現可能）。
- **名前付きスロット**は未対応（デフォルトスロットのみ）。ルーターは hash ベース。
- **`count()` / `prop()` 呼び忘れ**が静かに関数を返す（Solid と同じ footgun）。値位置の関数参照を compiler で警告する案。
- **scoped styles は最小**（descendant 限定）。複雑セレクタの正確な scoping は未対応。
- テンプレ式は正規表現ベースの識別子抽出。将来は本式パーサで検証し fail-closed を厚くする。
