# __APP_NAME__ — データテーブル（sunao `table` テンプレ）

**並び替え＋絞り込み**を computed で導出するテーブル。keyed `v-for` で行を再利用。

```
開発: node cli/dev.mjs --entry __APP_DIR__/main.js
ビルド: node cli/build.mjs --entry __APP_DIR__/main.js --out dist/__APP_NAME__
```

- 絞り込みは `v-model="q"`、並び替えは `key`/`dir` signal（ヘッダクリックで切替）。
- 表示行 `rows()` は **computed**（フィルタ→ソート）。元データは不変、派生だけ動く。
- 数万行を扱うなら行を `windowed`（固定高）/ `windowedVar`（可変高）で仮想化する（`docs/reference.md`）。
