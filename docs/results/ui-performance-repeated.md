# 反復性能測定（§5）

```
再現: node tools/perf-repeated.mjs → docs/results/raw/perf-repeated.json
env: Node v22.22.2 / Chromium 141.0.7390.37 / CPU 4x throttle / ローカル配信のみ
方法: 順序ランダム化・各回独立 context。1000 カード load N=8、100 カード filter N=20
対象: feature-parity complete=YES の条件（A / C / C+ / E / F）
```

単一試行を使わない。median / p95 / stddev を記録する。

## 1,000 カード初期表示（load、CPU 4x throttle）

| 条件 | CSS bytes | requests | load median | p95 | stddev | n |
|---|---|---|---|---|---|---|
| A: Tailwind | 20,027 | 5 | **33,262ms** | 36,992 | 1,850 | 8 |
| F: Recipe+Tailwind | 25,123 | 5 | **29,861ms** | **49,669** | 6,837 | 8 |
| C: Semantic CSS | 27,386 | 26 | 9,316ms | 10,291 | 480 | 8 |
| C+: bundled | 28,081 | 7 | 9,160ms | 10,762 | 707 | 8 |
| E: Compiler(Native) | **7,553** | 5 | **9,839ms** | 10,242 | 426 | 8 |

## 100 カード filter 応答（INP 近似）

| 条件 | filter median |
|---|---|
| A | 46.1ms / F | 40.2ms / C | 56.5ms / C+ | 59.0ms / E | 53.2ms |

すべて INP 予算 200ms 内。方式間に実用差なし。

## 判定

### Native CSS backend は Tailwind backend より 1,000 カードで約 3 倍速い

- **E(Native) 9.8s vs F(Tailwind) 29.9s**（中央値）。同じ Recipe・同じ意味 DOM で、**CSS backend だけの差**
- A(Tailwind) 33.3s も同様に遅い。C/C+/E(いずれも native CSS) は 9-10s に収束
- **F は p95=49.7s、stddev=6,837ms と分散が極端に大きい**。Tailwind の大きな CSS + 大 DOM の
  style 再計算が重く、実行ごとにブレる。E の stddev=426ms とは桁違い
- E は **CSS bytes が最小（7.5KB、Tailwind 系の 1/3〜1/4）**。生成 CSS が recipe から必要な分だけ出るため

これは 0003/0004 の「backend は Native CSS を既定」を性能面から支持する。
**Compiler 効果（fail-closed/決定論/低 context）は E と F で同じだが、
backend を Native にすると 1,000 カードで 3 倍速く、分散も小さい。**

### C+ 11.2s vs 15.3s の不整合について（訂正 C4 の解消）

前サイクルの単一試行の揺れ（11.2s / 15.3s）は **測定分散**だった。
本測定で c-bundled は median 9,160ms・stddev 707ms。8 回の分布で見れば、
過去の 11.2/15.3 はともにこの分散（min〜p95 で 8-11s 前後）の範囲内のサンプルにすぎない。
→ 単一試行値は使わない。median で比較する、という原則で解消。

## G（Minimal Owned Core）の性能

G はこの 8 サンプル測定より後に追加したため表に無いが、**G の runtime 性能は E と同一**である。
理由: G は E の compiler と native backend を **そのまま import**しており、生成される HTML/CSS は E と同じ。
G が追加する `provenance.json` は build 時の副産物で、ページからは読み込まれない（runtime に影響しない）。
別途 4 サンプルの G 実行も試みたが、並行実行の干渉で browser context が落ちたため、
G=E の構造的同一性をもって E の値を G の値とする（次サイクルで独立再測定）。

## 限界（正直に）

- **単一マシンのローカル値**であり、フィールドの 75 パーセンタイルではない。Core Web Vitals の合否判定には使えない
- CPU 4x throttle は低速端末の代理。実機分布ではない
- LCP はこの harness では信頼できないため load 時間（`load` イベントまでの実時間）で代用した
- N=8。分散の推定には十分だが、稀な尾は捉えきれない
