# 機能同等性（性能比較の前提）

```
再現: node tools/feature-parity.mjs → docs/results/raw/feature-parity.json
契約: contracts/feature-parity.json
```

性能を比較する前に、全条件が同じ機能を持つことを機械検査した。1 項目でも欠ける条件は総合性能比較から除外する。

| 条件 | 5型 | filter | no-JS | submit | 二重防止 | evidence | 結果不明 | keyboard | hostile | 1000件 | 完全 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A: Tailwind | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **YES** |
| C: Semantic CSS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **YES** |
| C+: bundled | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **YES** |
| E: Compiler(Native) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **YES** |
| F: Compiler(Tailwind) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **YES** |
| B: 無規律 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** | ✓ | NO |
| D: Web Components | ✓ | ✓ | ✗※ | ✓ | ✗※ | ✓ | ✗※ | ✗※ | ✗ | ✓ | NO |

※ D の ✗ の多くは、検査が Shadow DOM を貫通していないための **過小測定**。
D の実機能は shadow root の中にあり、feature-parity 検査を shadow 対応にするまで D の性能は暫定除外する。

## 2×2 の 4 条件（A / C / E / F）はすべて complete=YES

したがって A/C/E/F の性能・context コスト比較は公平である（B と D は除外）。

## 前サイクルの訂正

- 前サイクルの E は filter 未実装で機能非同等だった。本サイクルで E と F に filter を実装し、
  さらに **CSP `script-src 'self'` が inline module script をブロックしていた**バグ（§15 違反）を
  発見・修正（全 variant を外部 boot.js 化）。これで filter/counter が実際に動くようになった
- よって前サイクルの単一試行性能値は暫定。本サイクルの反復測定（`ui-performance-repeated.md`）で置換する
