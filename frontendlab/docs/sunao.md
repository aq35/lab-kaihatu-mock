# sunao — 個人用途の「Vue 風プラグイン」＋ビルドツール（P3 の試作）

方針 [`plugin-policy.md`](plugin-policy.md) の P3「Recipe → 決定論出力」を、
**Vue の形（SFC コンパイラ ＋ 極小リアクティブ runtime）**で試作したもの。EXP-1〜4 の結論に沿って
**変換器・bundler は native(esbuild) に任せ**、自作するのは「入力の型・fail-closed・決定論・低 context」だけ。

```
再現: cd frontendlab && npm run build && npm test
実装: plugins/sunao/{runtime,compile,esbuild-plugin}.mjs / build.mjs
デモ: fixtures/app-ui/{Counter.ui,main.js}
受領書: results/raw/build-app-ui.json
```

## これは何か（2 つ）

### 1. Vue 風プラグイン = コンパイラ ＋ 極小 runtime
- **runtime**（`runtime.mjs`）: `signal` / `effect` / `h` / `renderToString` / `mount` だけ。
  Vue の reactivity + render の芯。隠れた unref をしない（テンプレで値が要る所は自分で `count()` を呼ぶ）。
- **compiler**（`compile.mjs`）: SFC(`.ui`) の `<template>` を **build 時に** render 関数へコンパイル。
  対応文法: `{{ }}` 補間 / `:bind` / `@event` / `v-if` / `v-for`。**それ以外の `v-*` は CompileError で止める。**

### 2. ビルドツール = プラグインを native bundler に載せる薄い束ね
- `esbuild-plugin.mjs`: `import 'sunao'` を runtime に解決し、`*.ui` を onLoad でコンパイル
  （vite-plugin-vue と同じ発想）。
- `build.mjs`: esbuild で bundle+minify → **決定論チェック**（2 回ビルドの sha256 一致）→
  **予算ゲート**（超過で exit 1）→ **レシート**（bytes/gzip/sha/バージョン/環境）を書く。

## 実測（この環境）

`npm run build` の受領書 `results/raw/build-app-ui.json`:

| 対象 | raw | gzip | 決定論 |
|---|--:|--:|:--:|
| アプリ全体（runtime + compiler 生成の Counter + main） | **1,885 B** | **1,018 B** | ✓ |
| runtime 単体（bundle+minify） | 2,023 B | 1,008 B | ✓ |

- **アプリ全体が runtime 単体より小さい** = tree-shaking が未使用の runtime export（`renderToString` 等）を落とした。
  「使った分だけ」が bytes で見える（EXP-3 の梯子と同じ観測）。
- **リアクティブなアプリ一式で ~1KB gzip。** 予算 4,096 B / gzip 2,048 B に対し十分内側。

## テスト（`npm test`、7 件すべて green）

- **reactivity**: `effect` が signal 変化で再実行、同値は通知しない。
- **決定論**: 同じ `.ui` → 同じコンパイル出力（sha 一致）／同じ状態 → 同じ HTML。
- **fail-closed**: `v-model` `v-show`・空補間 `{{ }}`・タグ不整合は CompileError で停止。
- **render 正当性**: `v-if` / `v-for` / 補間 / イベントが期待通り。
- **ブラウザ（Chromium 実機）**: `.inc`×3 → 表示 `3`、`.dec` → `2`、`v-for` ログ 4 件、`v-if` 表示。
  **コンパイル→バンドル→実機で本当にリアクティブに動く**ことを確認済み。

## 「AIが好きそうなコンパイラ」の性質をどれだけ満たすか

| 性質 | sunao での状態 |
|---|---|
| 決定論（同入力→同 hash） | ✓ コンパイル・レンダ・ビルドすべてで確認 |
| 出力の予測可能性・軽さ | ✓ ~1KB gzip、tree-shake で使った分だけ、予算で監視 |
| **fail-closed（未知→エラー）** | ✓ 未知ディレクティブ・壊れたテンプレで停止 |
| **低マジック / 低 context** | ✓ 式は verbatim、自動 unref 無し、エラーは許可集合を明示 |
| 型付き入力（Recipe 的） | △ 未（`.ui` は型検査していない。次段） |

## 方針との整合（正直に）

`plugin-policy.md` は「自作 runtime は作らない（公開フレームワークとして React/Vue と競わない）」とした。
sunao は **runtime を持つ**のでこの線に触れる。区別はこう:

- **公開して競うためではない**。個人利用・実験に閉じ、依存はここだけ（root に出さない）。
- runtime は**出力に残る唯一の依存**なので、**極小に保ち budget で監視**する（~1KB gzip）。
- 変換エンジンは自作していない（native に委譲）。自作は契約層（fail-closed・決定論・低 context）だけ。

→ 「Vue の代替を配る」ではなく「**AI 向けの性質を持つ最小の UI コンパイラを、自分の道具として持つ**」。

## 限界・次

- テンプレ parser は小さな部分集合。属性値中の文字列に識別子が混じる等の端は未対応（文法を意図的に狭くして回避）。
- `mount` は状態変化で**サブツリー全体を作り直す**素朴版（fine-grained diff は未実装）。小規模個人用途には十分。
- 型付き `.ui`（props/state のスキーマ検査＝Recipe 化）が次段。これで P3 の「型付き入力」も ✓ になる。
