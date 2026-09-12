# sunao をはじめる（起動手順）

sunao は「Vue 風 SFC(`.sunao`) を決定論的にコンパイルする、依存の薄いフロントエンド・ツールチェーン」。
まず動かす → 新規アプリ → LSP を VSCode に繋ぐ、の順。

```
前提: cd frontendlab && npm install   （Node 18+）
```

## 1. まず動かす

```bash
# 新しいアプリの雛形を作る（App.sunao / main.js / index.html / README.md）
npm run new -- apps/todo

# 開発サーバ（保存で自動リビルド＋ブラウザ自動リロード・inline sourcemap）
node dev.mjs --entry apps/todo/main.js
#   → http://localhost:8000/ を開く

# 本番ビルド（決定論チェック＋予算ゲート＋レシート）
node build.mjs --entry apps/todo/main.js --out dist/todo
```

既存のデモを見るなら:
```bash
node dev.mjs --entry fixtures/app-ui/board-main.js     # FLIP ボード
node dev.mjs --entry fixtures/app-ui/calendar-main.js  # カレンダー(routing)
```

## 2. 品質ツール（全部同じ思想: 決定論・fail-closed・教える）

```bash
npm run check       # 全 .sunao を compile + 全入口を build（2回sha一致=決定論・bytes予算・prop契約・() 警告）
npm run fmt         # .sunao の整形チェック（--write で修正）: node format.mjs --write <file>
npm run diagnose -- fixtures/seo/Landing.sunao --pretty   # 診断を JSON で（error は exit 1）
npm test            # 全テスト（unit + browser + LSP プロトコル）
npm run bench       # sunao vs Vue3 の実測（要 vue devDep）
```

## 3. SEO ページ（SSG prerender → hydrate）

```bash
npm run prerender -- --entry fixtures/seo/Landing.sunao --out dist/seo/index.html --client fixtures/seo/landing-main.js
#   → dist/seo/index.html は「中身入り HTML」（クローラ可読）＋ page.js（hydrate で対話復帰）
```

## 4. LSP をエディタに繋ぐ（VSCode）

LSP サーバは依存ゼロの `tools/lsp.mjs`（stdio JSON-RPC）。単体起動は:
```bash
npm run lsp     # = node tools/lsp.mjs （エディタが stdio で繋ぐサーバ。手で叩く用ではない）
```

VSCode で使う（ソースから）:
```bash
cd editor/vscode && npm install     # vscode-languageclient
#   → VSCode で editor/vscode を開き F5（Extension Development Host）→ .sunao を開く
```
効くもの: 構文ハイライト / 診断 / 補完（`{{ }}` 内で signal を `name()` 補完＝() 呼び忘れ防止）/ ホバー / 定義ジャンプ / アウトライン。
詳細は [`editor/vscode/README.md`](editor/vscode/README.md)。

## 覚えることは 3 つだけ

1. **状態は signal**: `const n = signal(0)` → 読むのは `n()`・書くのは `n.set(x)` / `n.update(fn)`。テンプレでも `{{ n() }}`。
2. **宣言必須(fail-closed)**: テンプレが使う名前は `setup` の `return` / `props` / `expose` にある事。無ければ build で止まる（提案つき）。
3. **困ったら reference**: [`docs/reference.md`](docs/reference.md) に文法・runtime・footgun・仮想化・SSR が 1 枚。

## リポジトリの歩き方

| 場所 | 中身 |
|---|---|
| `plugins/sunao/` | 本体: `compile.mjs`(コンパイラ) / `runtime.mjs`(極小 runtime) / `esbuild-plugin.mjs` / `theme.mjs` / `format.mjs` |
| ルートの `*.mjs` | ツール: `build` / `dev` / `prerender` / `check` / `create`(new) / `format`(fmt) |
| `tools/` | `lsp.mjs`(LSP) / `diagnose.mjs` / `gen-recipe-vocab.mjs` |
| `editor/` | `sunao.tmLanguage.json`(ハイライト) / `language-configuration.json` / `vscode/`(拡張) |
| `fixtures/` | デモ: `app-ui/`(対話) / `seo/`(SSG) / `static-ui/`(静的) |
| `bench/` | sunao vs Vue3 の実測（`README.md` に受領書） |
| `tests/` | `sunao.test.mjs`(unit) / `sunao.browser.test.mjs`(実機) / `lsp.test.mjs`(LSP) |
| `docs/` | `reference.md`(API 1 枚) / `sunao.md`(変遷) / `borrowings.md` ほか |
