# __APP_NAME__

sunao アプリ（`canvas` テンプレ）。**宣言的な殻＋命令的な描画の島**の型。

```
開発（保存で自動リロード）: node cli/dev.mjs --entry __APP_DIR__/main.js
ビルド:                     node cli/build.mjs --entry __APP_DIR__/main.js --out dist/__APP_NAME__
チェック（決定論・予算）:   node cli/check.mjs
```

## 型（canvas / WebGL / WASM の載せ方）

- **コントロールは `signal`** — スライダー/トグルは `v-model`・`@click` で宣言的に。sunao の得意分野。
- **描画は `onMount` で attach** — `setup` は DOM 挿入前なので canvas は掴めない。`onMount(() => …)` で `getElementById` → `getContext`。
- **毎フレームは `raf(dt => …)`** — `import { raf } from 'sunao'`。`onCleanup` で自動停止（scope 破棄で確実に片付く）・`isServer()` 相当で server では張らない（prerender が hang しない＝決定論）。
- **ループ内は `signal.peek()`** — 値だけ読む（購読しない）。ループ → UI へ書き戻すのは `sig.set(...)`（例では fps を ~2回/秒だけ更新）。
- **WASM 化** — 毎フレーム計算を WASM に出すなら `./wasm.mjs` の `loadWasm(url)` で instance を得て、`instance.exports.*` と `memory.buffer` を `raf` から呼ぶ。sunao core は触らない（描画/計算は app-land、sunao は殻＋ライフサイクル）。

## 注意

- `raf` の停止は自動（`onMount` の scope 破棄＝unmount で cancel）。手動で止めたいときは戻り値の `stop()`。
- 大量の DOM は `windowed`/`windowedVar`。canvas は DOM ではないので仮想化は不要。
- 詳細は `docs/reference.md`（runtime プリミティブ一覧に `raf` あり）。
