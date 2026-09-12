# templates — `npm run new` の雛形

`node cli/create.mjs <dir> [--template <name>]`（= `npm run new -- <dir> [--template <name>]`）が
ここのテンプレを `<dir>` に展開する。ファイル中の `__APP_NAME__` / `__APP_DIR__` を置換する。

| template | 中身 | 示すもの |
|---|---|---|
| `basic`（既定） | App / main / index / README | signal カウンタ・scoped SCSS。最小の出発点 |
| `form` | ＋検証 | `v-model` 双方向・**派生値としての検証**（computed）・`@submit` |
| `table` | 並び替え/絞り込み | keyed `v-for`・`computed`（filter→sort）・`v-model` フィルタ |
| `dashboard` | KPI＋時計 | `now`（実時計）・`computed` メトリクス・グリッド |
| `video` | ＋ `Player.sunao` / `stream.js` / `videos.js` | **YouTube 風ストリーミング**: ルーティング（一覧 ⇄ 視聴）・`<video>` のカスタムコントロール（signal 連動）・**HLS(adaptive) / progressive MP4 両対応**（`stream.js` は依存ゼロ、hls.js はアプリ側の任意 CDN 依存） |

```bash
npm run new -- apps/todo                     # basic（既定）
npm run new -- apps/signup --template form
npm run new -- apps/users  --template table
npm run new -- apps/kpi    --template dashboard
npm run new -- apps/tube   --template video
```

- 展開先に同名ファイルがあれば**上書きせず中止**（fail-closed）。`..` での脱出も拒否。
- 各テンプレは `tests/sunao.test.mjs` の scaffold テストで **展開→ビルド**が通ることを常時検証している。
- テンプレを追加する時: `templates/<name>/` にファイルを置き、テキストに `__APP_NAME__`/`__APP_DIR__` を使う。それだけで `--template <name>` が効く。
