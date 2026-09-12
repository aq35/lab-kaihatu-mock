# __APP_NAME__ — YouTube 風ストリーミング（sunao `video` テンプレ）

一覧（フィード）→ 視聴ページ（カスタムプレーヤ）を **hash ルーティング**で切り替える、
ストリーミング動画アプリの雛形。**HLS(adaptive) と progressive MP4 の両対応**。

```
開発: node cli/dev.mjs --entry __APP_DIR__/main.js
ビルド: node cli/build.mjs --entry __APP_DIR__/main.js --out dist/__APP_NAME__
```

## 何を示すか（sunao のパターン）

- **ルーティング**: `useRoute()` / `navigate()` で `#/` ⇄ `#/watch/:id`。
- **DOM 連携**: `onMount` で `<video>` を掴み、`effect` で **video が変わるたび stream を貼り直す**（fine-grained）。
- **プレーヤ状態は signal**: 再生/一時停止・現在位置・尺・音量・ミュート・速度・バッファリング。
  メディアイベント（`@timeupdate` `@loadedmetadata` `@waiting` …）→ signal 更新 → UI 反映。
- **カスタムコントロール**: シーク／音量（`<input type="range">`）・速度巡回・全画面。

## ストリーミングの仕組み（`stream.js`・依存ゼロ）

`attachStream(video, src)` が再生方式を選ぶ:

1. **ネイティブ HLS**（Safari/iOS）→ `video.src` 直挿し。
2. それ以外で HLS を再生 & `window.Hls` あり（`index.html` の hls.js CDN）→ **MSE で adaptive 再生**。
3. どちらも無ければ progressive（MP4）を直挿し。

> **hls.js はアプリ側の任意依存**（CDN で読むだけ）。sunao 本体には依存を足さない。
> Chrome/Firefox で HLS を再生したい時だけ `index.html` の `<script>` を残す。

## 正直な注意

- 再生には**実行時のネット接続**が要る（`videos.js` は公開テストストリームを指す）。
- 本番はカタログを `resource(fetcher)` で API から取得する形にする（今は静的配列）。
- 自動再生はブラウザのポリシーでブロックされることがある（コントロールから再生できる）。
