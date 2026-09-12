# __APP_NAME__ — イラストギャラリー（sunao `gallery` テンプレ）

Pixiv 的な「作品フィード＋タグ絞り込み＋人気/新着切替＋詳細ページ＋ブックマーク」を
1 アプリにした雛形。実在サービスとは無関係の汎用 UI。

```
開発: node cli/dev.mjs --entry __APP_DIR__/main.js
ビルド: node cli/build.mjs --entry __APP_DIR__/main.js --out dist/__APP_NAME__
```

## 何を示すか（sunao のパターン）

- **フィード＋詳細のルーティング**: `useRoute()` / `navigate()` で `#/` ⇄ `#/art/:id`。
- **フィルタ＆ソート**は `computed`（タグ絞り込み → 新着/人気で並べ替え）。元データは不変、派生だけ動く。
- **ブックマーク**は signal（`{ [id]: true }`）。押すと一覧・詳細の ♥ 数が即反映（fine-grained）。
- **タグ**クリックで絞り込み（詳細 → 一覧へ戻って適用）。
- サムネは著作物を避けた**グラデのプレースホルダ**。実画像は `<img :src>` ＋ `resource` で。

## 本番化のヒント

- カタログ `artworks.js` を `resource(fetcher)` に置換して API 取得へ。
- 無限スクロール/大量表示は `windowed` / `windowedVar` で仮想化。
- ブックマークの永続化はサーバ or localStorage を `onMount` で読む。
