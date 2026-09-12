# EXP-2 / EXP-3 / EXP-4 — 結果

```
Hypothesis frozen: frontendlab/docs/_hypotheses-exp2-3-4.md（commit 0477f7f, 測定前）
再現: cd frontendlab && npm install && npm run exp2 && npm run exp3 && npm run exp4
受領書: frontendlab/results/raw/{bundle-orders,dependency-cost,minify-orders}.json
環境: Node v22.22.2 / Intel Xeon @2.80GHz ×4。絶対 ms は環境依存、主張は桁だけ。
```

---

## EXP-2: bundle-orders（束ね変換の桁）

1 ファイルあたり ms（median total ÷ N）:

| N files | esbuild bundle | esbuild transform×N | oxc transform×N | swc transform×N |
|--:|--:|--:|--:|--:|
| 5 | 0.633 | 1.161 | 0.0091 | 0.0372 |
| 25 | 0.178 | 1.160 | 0.0096 | 0.0372 |
| 100 | 0.066 | 1.071 | 0.0091 | 0.0378 |

**判定:**
- **H2-1 支持。** esbuild は「1 回 bundle」の per-file が N とともに下がる（0.63→0.066）。
  N=100 で transform×N の **16.2x 速い**。EXP-1 の 15x IPC 床は**束ねると償却されて消える**。
- **H2-2 支持。** oxc/swc の transform×N は per-file がほぼ一定（IPC 床なし）。
  oxc は esbuild の単発 transform per-file の **118x**、bundle per-file(N=100) の約 7x。
- **H2-3 支持。** esbuild bundle の per-file は固定 IPC ÷ N の**償却曲線**を描いた。

**caveat（正直に）**: esbuild bundle は解決・リンク・tree-shake まで**やる仕事が多い**。
oxc/swc の "transform×N" は素の変換だけ。だから「oxc が bundle の 7x 速い」は同じ仕事の比較ではない。
EXP-2 で確実に言えるのは (a) esbuild 内部で bundle は単発 transform より IPC を償却して速い、
(b) N-API 系（oxc/swc）は単発でも IPC 床が無い、の 2 点。

---

## EXP-3: dependency-cost（依存 1 つの本当のコスト＝梯子の実測）

同じ debounce 機能を 4 通り。esbuild で bundle+minify した bytes:

| 段 | 初期 bytes | 総 bytes | ×自作(初期) |
|---|--:|--:|--:|
| 1 足さない(自作) | **98** | 98 | 1x |
| 2 分割(tree-shake, `lodash-es`) | 2,912 | 2,912 | 30x |
| 3 全体依存(`import _ from 'lodash'`) | 73,828 | 73,828 | **753x** |
| 4 遅延(dynamic import) | 89 | 97,486 | 1x（初期） |

**判定:**
- **H3-1 支持。** 全体依存は自作の **753x**（2〜3 桁）。tree-shake しても自作の 30x。
- **H3-2 支持。** 初期 bytes は梯子順に単調増加（自作 < tree-shake < 全体依存）。桁で分かれる。
- **H3-3 支持 + 追加発見。** 遅延は初期を 89 B（自作並み）に保つが、**総 bytes は減らない**。
  それどころか **97,486 B と全体依存より大きい**: dynamic import は chunk 境界を作るため、
  esbuild が跨いで tree-shake しきれず、遅延 chunk が重くなった。
  → **遅延は「初期表示を軽くする」手であって「コストを消す」手ではない**（後ろへ移動、かつ増えうる）。

**梯子の含意**: 「依存を足さない > 分割 > 遅延」は bytes で裏づけられた。ただし遅延は
初期最適化であり、総量最適化ではない。**まず足さない・分割が効く。**

---

## EXP-4: minify-orders（minify 込みサイズの桁）

単一入力（fixture を esbuild で型除去した 2,385 B の JS）を 3 native minifier に通す:

| minifier | min B | min gzip B | ×最小 | ×最小gz | 決定論 |
|---|--:|--:|--:|--:|:--:|
| swc | **1,417** | 800 | 1.00x | 1.01x | ✓ |
| oxc | 1,421 | 804 | 1.00x | 1.01x | ✓ |
| esbuild | 1,490 | **796** | 1.05x | 1.00x | ✓ |

**判定:**
- **H4-1 支持（強く）。** minifier 間の幅は raw **1.05x**・gzip **1.01x**。実質**横並び**。
  「どの native minifier か」は出力サイズをほぼ動かさない。
- **H4-2 支持。** 型除去後 2,385 B → minify で 1,417 B（1.68x 圧縮）。gzip 後は差がほぼ消える（1.01x）。
- **H4-3 支持。** 3 者すべて決定論的（同入力 → 同 hash）。

---

## 4 実験を貫く一文

- **速度は道具で 1〜2 桁動く**（EXP-1: 61x, EXP-2: IPC 形態で 16x）。
- **出力サイズは道具ではほぼ動かない**（EXP-1 raw 1.6x / EXP-4 minify 1.05x）。
- **サイズを 2〜3 桁動かすのは「依存を足すか」だけ**（EXP-3: 753x）。
- **決定論は全部の道具・全部の段で保たれた。**

→ 「軽さ」を決めるのは transpiler の選択ではなく**依存の判断**。速さは native なら十分で、
あとは**呼び出し形態（単発/束ね）**の問題。この地図が次章の方針の土台になる。
