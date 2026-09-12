# __APP_NAME__ — Wiki / ドキュメント記事（sunao `wiki` テンプレ）

atwiki / Wikipedia のような「目次つき記事ページ」。ページ切替・見出しの折りたたみ・
スクロール連動の目次ハイライトつき。

```
開発: node cli/dev.mjs --entry __APP_DIR__/main.js
ビルド: node cli/build.mjs --entry __APP_DIR__/main.js --out dist/__APP_NAME__
```

## 何を示すか（sunao のパターン）

- **記事切替**: `useRoute()` / `navigate()` で `#/page/:id`。
- **目次（TOC）＋スクロール連動**: `onMount` で `IntersectionObserver` を張り、見えている見出しを `active` signal に。記事が変わったら `effect` が貼り直す（`onCleanup` で破棄）。
- **折りたたみ**: 各セクションの開閉を signal（`{ [id]: true }`）で。
- **アンカー移動**: 目次クリックで `scrollIntoView`。
- **安全**: 本文はプレーンテキスト（sunao は `v-html` を持たない＝XSS 不能）。装飾したいなら本文を要素で構造化する。
- レスポンシブ: スマホは目次が記事の上、48rem 以上でサイドバー＋本文の 2 カラム（sticky 目次）。

## 本番化のヒント

- 記事を `resource(fetcher)` で API / Markdown から取得（Markdown はビルド時に構造化 JSON へ）。
- 全文検索は記事配列を `computed` で filter。
- 見出しは自動採番して `:id` を生成すると目次と本文がずれない。
