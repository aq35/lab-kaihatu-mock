# sunao エディタ支援

`.sunao` の編集を助ける「検証可能なスライス」。フル LSP（補完・ホバー・定義ジャンプ）は
エディタが無いこの環境では検証できないので**作らず**、代わりに **今すぐ使える／機械で検証できる**部分だけを提供する。

## 1. 構文ハイライト（TextMate grammar）

`sunao.tmLanguage.json` … `<template>`（`{{ }}`・`:bind`・`@event`・`v-*`・`flip`）/ `<script>`(JS) / `<style>`(CSS) を色分け。
`language-configuration.json` … 括弧・コメント・自動閉じ。

**VSCode で使う**（最小拡張）: 適当な拡張フォルダの `package.json` に:

```json
{
  "contributes": {
    "languages": [{ "id": "sunao", "extensions": [".sunao"], "configuration": "./language-configuration.json" }],
    "grammars": [{ "language": "sunao", "scopeName": "source.sunao", "path": "./sunao.tmLanguage.json" }]
  }
}
```

2 ファイルを置くだけで色が付く（`source.js` / `source.css` の埋め込みは VSCode 同梱の文法に委譲）。

## 2. 診断（機械可読・LSP が消費する形）

コンパイラの構造化診断を **throw せず JSON** で出す。エディタ/LSP/CI がそのまま使える。

```bash
node tools/diagnose.mjs fixtures/seo/Landing.sunao --pretty
# → [{ filename, diagnostics: [{ severity:'error'|'warning', code, message, line, column, suggestions?, ident? }] }]
# error（fail-closed）が 1 件でもあれば exit 1
```

プログラムからは:

```js
import { diagnose } from '../plugins/sunao/compile.mjs';
const { diagnostics } = diagnose(source, { filename: 'X.sunao' });
```

`diagnose()` は **error（未宣言参照・未知ディレクティブ等）と warning（`()` 呼び忘れ等）** を
`line`/`column`（1 始まり）付きで返す。これが LSP の `textDocument/publishDiagnostics` の中身になる。

## 3. LSP サーバ（依存ゼロ・実装済み）

`tools/lsp.mjs` … **stdio JSON-RPC の Language Server を手書き**（依存ゼロ＝「巨大な依存に頼らない」思想の体現）。頭脳は compiler の `diagnose()`/`symbols()`。

提供する機能:
- **publishDiagnostics** … 編集ごとに診断（error=fail-closed / warning=()呼び忘れ）を range/severity つきで送る。
- **completion** … 文脈で候補を出す:
  - 式位置（`{{ }}` / `:x="…"` / `@x="…"`）→ signal・prop・setup return・グローバル。**signal/prop は `name()` を挿入して () 呼び忘れを未然に防ぐ**。
  - タグ位置（`<…`）→ import 済み component ＋ HTML 要素。
  - 属性位置 → `v-if`/`v-for`/`v-model`/`flip`/`:`/`@`。
- **hover** … 識別子が signal（呼んで読む）/ prop（accessor）/ component / local のどれかを説明。

起動: `npm run lsp`（または `node tools/lsp.mjs`）。エディタからは stdio で接続する。

**エディタへの繋ぎ方（VSCode 例）**: `vscode-languageclient` で `node tools/lsp.mjs` を stdio 起動し、`.sunao` を languageId に紐付けるだけ（クライアント側は薄い定型）。

**検証**: `tests/lsp.test.mjs` が **プロトコルを直接叩いて**（エディタ不要）initialize/診断/補完/hover を検証。中身はエディタ無しで担保している。

## 4. まだ無いもの（正直に）

- **定義ジャンプ / リネーム / シグネチャヘルプ**（LSP の残り機能）。土台（`symbols()`）はあるので追加は容易。
- VSCode 拡張の**パッケージ配布**（今は grammar 2 ファイル＋LSP サーバを手で繋ぐ）。
