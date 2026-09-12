# sunao vs Vue3 — head-to-head 実測（受領書）

同じアプリ（keyed 行リスト＋各操作）を **sunao** と **Vue 3.5.42** で作り、本番・minify で計測。
Vue はテンプレを `@vue/compiler-dom` で**事前コンパイル**（patch flag 等の compile 時最適化つき）＋
runtime-only 本番ビルド＝公平な条件。計測は **commit までの ms**（JS + DOM 変更、paint 前。両者とも paint 除外）。中央値・warmup 後。

```
再現: cd frontendlab && npm install && npm run bench
実装: bench/{sunao,vue}/ ・ build-bench.mjs（両方をバンドル）・ run-bench.mjs（Playwright 計測）
```

## 結果（この環境・Chromium 141・Node 22）— 最適化 ①〜④ 適用後

| 操作 | sunao ms | vue ms | 速い方 | 初版（最適化前） |
|---|--:|--:|---|--:|
| create 1,000 | 7.9 | 7.6 | ≈ 互角 | vue 3.8x |
| create 10,000 | 96 | 52 | vue 1.8x | vue 2.5x |
| **updateEvery10（10k中1k行の文字更新）** | **3.2** | 22.2 | **sunao 6.9x** | ※初版はバグで無効 |
| **selectRandom（10k で選択ハイライト）** | **4.1** | 41.5 | **sunao 10.1x** | sunao 4.9x |
| swap（10k の2行入替） | 41.3 | 13.3 | vue 3.1x | vue 1.5x |
| **removeFirst（10k から1行削除）** | **2.5** | 23.5 | **sunao 9.4x** | vue 1.3x |
| **append 1,000（1k→2k）** | **4.8** | 9.1 | **sunao 1.9x** | ≈ 互角 |
| **bundle gzip** | **2,579 B** | 29,077 B | **sunao 11.3x 小** | 11.7x |

**仮想化（windowed）**: 10,000 件でも実 DOM **23 行**・create **1.3ms**・5,000 行スクロール **0.6ms**。巨大リストは非問題化。

## 適用した最適化（この差の出どころ）

1. **keyed reconcile を最小移動に**（毎回全ノード再挿入 → 右→左走査で新規・位置ズレだけ移動）
   → removeFirst が vue 1.3x → **sunao 9.4x**、append が互角 → **sunao 1.9x**。
2. **仮想化 `windowed()`** → 巨大リストを実 DOM 数十行に収め、create/swap の勝負自体を消す。
3. **行あたり割当の軽量化**（signal の subs 集合・effect の children/cleanups を遅延生成）
   → create 10k が 115ms → **96ms**、create 1k が **互角**に。
4. **`batch()`（opt-in）** → 複数 set を 1 回の effect に畳む（既定は同期のまま）。

## 途中で見つけた correctness バグ（重要）

初版の `updateEvery10` は **sunao 側が実は DOM を更新していなかった**（`{{ row.label() }}` を「ctx 非参照＝静的」と誤判定し、per-item signal の更新が反映されなかった）。
→ **「呼び出しを含む式は reactive」** に修正（signal は呼んで読むため）。上表はこの修正**後**の正しい値。
初版の "126x" は無効で、正しい局所更新の優位は **約 7〜10x**（それでも decisive）。

## 読み方（正直に）

- **局所更新（テキスト・class・属性・削除）は sunao が 7〜10x 速い**。細粒度＝該当ノードだけ触るため。**ダッシュボード・エディタ・リアルタイム表示**が得意。
- **10k の全構築・swap はまだ Vue が速い**（1.8〜3.1x）。O(N) reconcile 定数と行あたり生成コストが残る。ただし**実アプリでは仮想化でこの規模を作らない**ので実害は小さい。
- **bundle は sunao が 1 桁小さい**（構造的な勝ち）。

## 結論

最適化後の答え: **局所更新・削除・追加・配信サイズで sunao 有利／10k 全構築・並び替えで Vue 有利**。
Solid 系（細粒度）と Vue（VDOM＋最適化）の一般傾向と一致。数字はこの環境の 1 回分・**桁で読むこと**。
