# sunao vs Vue3 — head-to-head 実測（受領書）

同じアプリ（keyed 行リスト＋各操作）を **sunao** と **Vue 3.5.42** で作り、本番・minify で計測。
Vue はテンプレを `@vue/compiler-dom` で**事前コンパイル**（patch flag 等の compile 時最適化つき）＋
runtime-only 本番ビルド＝公平な条件。計測は **commit までの ms**（JS + DOM 変更、paint 前。両者とも paint 除外）。中央値・warmup 後。

```
再現: cd frontendlab && npm install && npm run bench
実装: bench/{sunao,vue}/ ・ build-bench.mjs（両方をバンドル）・ run-bench.mjs（Playwright 計測）
```

## 結果（この環境・Chromium 141・Node 22）

| 操作 | sunao ms | vue ms | 速い方 | なぜ |
|---|--:|--:|---|---|
| create 1,000 | 20.3 | 5.4 | **vue 3.8x** | 生成は Vue が最適化。sunao は行ごとに signal を割当てる |
| create 10,000 | 114.7 | 45.4 | **vue 2.5x** | 同上＋sunao の keyed 挿入が素朴 |
| **updateEvery10（10k中1k行の文字更新）** | **0.3** | 37.8 | **sunao 126x** | sunao は該当テキストノードだけ直接更新。Vue はリスト全体を再描画・差分 |
| **selectRandom（10k で選択ハイライト）** | **6.6** | 32.1 | **sunao 4.9x** | sunao は class effect だけ。Vue は VDOM 全差分 |
| swap（10k の2行入替） | 44.0 | 29.2 | vue 1.5x | Vue は LIS で最小移動。sunao の reconcile は全ノード再挿入（素朴） |
| removeFirst（10k から1行削除） | 36.5 | 27.8 | vue 1.3x | 同上（配列再構築＋再挿入） |
| append 1,000（1k→2k） | 6.6 | 6.9 | ≈ 互角 | |
| **bundle gzip** | **2,480 B** | 29,077 B | **sunao 11.7x 小** | VDOM を積まない・使う分だけ |

## 読み方（正直に）

- **局所更新（テキスト・class・属性）は sunao が圧勝**（最大 126x）。細粒度＝該当ノードだけ触るため。**ダッシュボード・エディタ・リアルタイム表示**のような「大きな DOM の一部が頻繁に変わる」用途は sunao が強い。
- **リストの全構築・並び替え・削除は Vue が速い**（1.3〜3.8x）。理由は 2 つで、どちらも **sunao 側の実装がまだ素朴**:
  1. keyed reconcile が**毎回全ノードを insertBefore**（Vue は LIS で最小移動）。
  2. 行ごとに signal を割当てる（更新の速さと引き換え）。
  → ここは最適化の伸びしろ（未対応部分を減らせば差は縮む）。
- **bundle は sunao が 1 桁小さい**（構造的な勝ち）。

## 結論

「Vue より速い？」の正しい答えは **「操作による」**:
- 局所更新の多い UI・小さい/軽い配信 → **sunao 有利**。
- 巨大リストの全構築/並び替えが主 → **Vue 有利**（今は）。

これは Solid 系（細粒度）と Vue（VDOM＋最適化）の一般的な傾向とも一致する。数字はこの環境の 1 回分で、
絶対値はマシン差がある。**桁（order of magnitude）で読むこと。**
