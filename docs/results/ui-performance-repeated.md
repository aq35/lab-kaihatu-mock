# 反復性能測定（§5）— 実行中/暫定

```
再現: node tools/perf-repeated.mjs → docs/results/raw/perf-repeated.json
対象: feature-parity complete=YES の条件のみ（A / C / C+ / E / F）
方法: 順序ランダム化・各回独立 context・CPU 4x throttle。1000 カード load N=8、100 カード filter N=20
```

単一試行を使わない。median / p95 / min / max / stddev を記録する。
（本ファイルは反復測定の完了後に数値を差し込む。完了までは前サイクルの単一試行値は暫定扱い。）

## C+ 11.2s vs 今回 15.3s の不整合について（訂正 C4）

前サイクルで c-bundled の 1000 カード load は 11.2s（初回）と 15.3s（後の回）と揺れた。
これは **単一試行の分散**であり、測定環境・commit・機能差・ハーネス差のいずれでもなく、
1 回しか測っていないことが原因。反復測定の stddev で分散を明示し、median で比較する。
反復測定が出るまで「E は C+ と同等」「E は最速」とは報告しない。
