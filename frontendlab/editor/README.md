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

## 3. フル LSP（未実装・正直に）

補完（props / signal / ディレクティブ）・ホバー・定義ジャンプは **LSP サーバ＋エディタ**が要り、
この環境では動作検証できないため作っていない。土台はある:

- **診断**: `diagnose()`（上）をそのまま `publishDiagnostics` に流せる。
- **補完候補**: `analyze()`（props 抽出）＋`scanSignals()`（signal 束縛）で候補は機械的に出せる。
- あとは `vscode-languageserver` で薄くラップするだけ（＝将来の宿題。ここでは verifiable な土台までを提供）。
