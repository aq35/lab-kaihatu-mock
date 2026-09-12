# AGENTS.md — sunao で作業する AI/エージェント向けガイド

このディレクトリ（`frontendlab/`）は **sunao**（Vue 風 SFC `.sunao` を決定論的にコンパイルする、依存の薄いフロントエンド・ツールチェーン）。北極星は **「AI が書いても壊れない：宣言的・fail-closed・決定論・小さい」**。

## 覚えることは 3 つだけ

1. **状態は signal** — `const n = signal(0)`。**読むのは `n()`**・書くのは `n.set(x)` / `n.update(fn)`。テンプレでも `{{ n() }}`。
2. **宣言必須（fail-closed）** — テンプレが使う名前は `setup` の `return {}` / `props` / `expose` にある事。無ければ **build で止まる**（「もしかして」提案つき）。
3. **困ったら doctor / manifest / reference** — 下記コマンドで機械可読に確認できる。

## 自己修正ループ（これを回す）

```bash
node cli/doctor.mjs --pretty          # 全 .sunao の診断＋クロス契約を JSON で（error か契約違反で exit 1）
#   各 diagnostic は {severity, code, message, line, column, fix?}。fix があればそれに置換すれば直る。
node cli/manifest.mjs --pretty        # 各部品の契約 JSON（props{type,required,enum}/slots/uses/signals）
#   → <Child :prop=/> を **ソースを読まずに** 正しく組める
```

書いたら **`npm run verify`**（= `check` 決定論/予算/契約 ＋ `fmt` ＋ `test`）を必ず通す。1 つでも赤なら直す。

## context の載せ方（sunao を正しく書かせる型）

sunao は**学習データが無い**（世間の AI は sunao を知らない）。ので **in-context の正例と API で埋める**のが前提。
この順で **必要な分だけ**載せると精度が出る（低 context 設計を活かす）:

1. **常に**: この `AGENTS.md`（3 つの規則＋落とし穴）＋ [`docs/reference.md`](docs/reference.md)（全 API 1 枚）。
2. **書くパターンに応じて 1〜2 例だけ**: [`examples/README.md`](examples/README.md) の「パターン → 見る例」表から選び、その `.sunao` を丸ごと載せる（例: DnD なら `examples/app-ui/Sortable.sunao`、非同期なら `OwnerCardDemo.sunao`）。全部は載せない。
3. **子部品を組むなら**: `node cli/manifest.mjs <child>.sunao --pretty` の JSON（props/enum/slots）だけ（ソース本体は不要）。
4. **書いた後**: `node cli/doctor.mjs --pretty` → 各 diagnostic の `fix` で直す → `npm run verify` が緑になるまで。

> 要は「reference（何が書けるか）＋ 近い正例 1〜2（どう書くか）＋ doctor（どこが違うか）」の 3 点セット。
> これで学習データ非依存でも初手から動くコードに寄る。

## よく使うコマンド

| 目的 | コマンド |
|---|---|
| 新規アプリ雛形 | `npm run new -- apps/foo`（テンプレ指定: `--template video`。既定 `basic`）|
| 開発（保存で自動リロード） | `node cli/dev.mjs --entry apps/foo/main.js` |
| 検診（AI 向け JSON） | `npm run doctor` / `npm run manifest` |
| 整形 | `npm run fmt`（`node cli/format.mjs --write <file>` で修正） |
| 一括ゲート | `npm run verify` |
| 本番ビルド | `node cli/build.mjs --entry … --out …` |
| SEO(SSG→hydrate) | `node cli/prerender.mjs --entry … --out … --client …` |
| LSP（エディタが stdio 接続） | `npm run lsp` |

## 落とし穴（footgun）— 機械が止める/警告する

- **`{{ count }}`（`()` 忘れ）** → 警告 `SUNAO_CALL_FORGOTTEN`、fix は `count()`。signal は「呼んで読む」。
- **未宣言参照 / 未知ディレクティブ** → build で停止（fix 候補あり）。
- **子に無い prop / 必須欠落 / enum 外** → `check`/`doctor` で停止。
- **keyed リストで項目のフィールドを後から変える** → その項目のフィールドを **per-item signal** にする（`{ id, label: signal(...) }`）。keyed はノードを再利用するため、plain フィールドの変更は反映されない。
- **DOM を触る初期化**（focus/測定/`windowedVar.attach`）は setup でなく **`onMount(() => …)`** で（setup は DOM 挿入前）。
- **巨大リスト**は `windowed`（固定高）/ `windowedVar`（可変高）で仮想化する（数万行を素で描かない）。

## 文法（これで全部）

`{{ expr }}` / `:attr` / `@event` / `v-if` / `v-for="x in list"`・`"(x,i) in list"` / `:key` / `flip` / `v-model` / `class`+`:class` / `<Child :p=/>`（import 必須・大文字）/ `<slot>` / `<style [lang="scss"]>`。
**それ以外の `v-*` は fail-closed**（`v-else`/`v-show`/`v-html` は無い）。全 API は [`docs/reference.md`](docs/reference.md) に 1 枚。

## 実装の地図

- **`sunao/`** = framework 本体（第三者依存ゼロ）: `compile` / `runtime` / `expr`（自前式パーサ）/ `esbuild-plugin` / `theme` / `format` / `recipe-vocab`。
- **`cli/`** = コマンド一式: `build` / `dev` / `check` / `create` / `prerender` / `format` / `diagnose` / `doctor` / `manifest` / `lsp` / `budget-gate` / `gen-recipe-vocab`。
- **`examples/`** = 動くデモ兼 few-shot 正例: `app-ui/`（対話・DnD・カレンダー・ルーティング・スロット・FLIP）/ `seo/`（SSG→hydrate）/ `static-ui/`（静的）。
- **`templates/`** = `npm run new` の雛形: `basic`（カウンタ）/ `form`（検証）/ `table`（並替・絞込）/ `dashboard`（KPI＋時計）/ `video`（YouTube 風ストリーミング＝ルーティング＋`<video>`＋HLS/MP4）。`__APP_NAME__`/`__APP_DIR__` を置換して展開。
- **`docs/`** = sunao ドキュメント（`reference.md` が AI 向け 1 枚）。**`tests/`** = unit+browser+lsp（`tests/fixtures/` はテスト専用入力）。**`bench/`** = Vue 比較。**`editor/`** = VSCode 拡張。
- **`research/`** = frontendlab の生みの親（トランスパイラ/バンドラ計測実験）。sunao 本体とは無関係なので普段は触らない。
