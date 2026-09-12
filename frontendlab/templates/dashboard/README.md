# __APP_NAME__ — ダッシュボード（sunao `dashboard` テンプレ）

KPI カードのグリッド＋**実時計**（`now`）＋更新ボタン。合成と派生値の練習台。

```
開発: node cli/dev.mjs --entry __APP_DIR__/main.js
ビルド: node cli/build.mjs --entry __APP_DIR__/main.js --out dist/__APP_NAME__
```

- 時計は `now(1000)`（1 秒 tick の signal。SSR では止まる＝描画が hang しない）。
- KPI は `metrics()` の **computed**。`refresh()` が seed を進めると全カードが再計算。
- 本番は数値を `resource(fetcher)` で API から取得する形にする（今は決定論的な擬似データ）。
