# templates — `npm run new` の雛形

`node cli/create.mjs <dir> [--template <name>]`（= `npm run new -- <dir> [--template <name>]`）が
ここのテンプレを `<dir>` に展開する。ファイル中の `__APP_NAME__` / `__APP_DIR__` を置換する。

| template | 中身 | 示すもの |
|---|---|---|
| `basic`（既定） | `App.sunao` / `main.js` / `index.html` / `README.md` | signal カウンタ・scoped SCSS。最小の出発点 |
| `video` | ＋ `Player.sunao` / `stream.js` / `videos.js` | **YouTube 風ストリーミング**: hash ルーティング（一覧 ⇄ 視聴）・`<video>` のカスタムコントロール（signal 連動）・**HLS(adaptive) / progressive MP4 両対応**（`stream.js` は依存ゼロ、hls.js はアプリ側の任意 CDN 依存） |

```bash
npm run new -- apps/todo                    # basic
npm run new -- apps/tube --template video   # video
```

- 展開先に同名ファイルがあれば**上書きせず中止**（fail-closed）。`..` での脱出も拒否。
- 各テンプレは `tests/sunao.test.mjs` の scaffold テストで **展開→ビルド**が通ることを常時検証している。
- テンプレを追加する時: `templates/<name>/` にファイルを置き、テキストに `__APP_NAME__`/`__APP_DIR__` を使う。それだけで `--template <name>` が効く。
