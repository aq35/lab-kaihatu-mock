# research — frontendlab の生みの親（トランスパイラ/バンドラ計測実験）

sunao が生まれる前の**予備調査**。React/Vue/Svelte のプラグインではなく、その**下の層**
（transpiler・bundler・依存コスト・tree-shaking・出力バイト）を「桁で」測る。
ここは sunao 本体とは独立していて、普段の開発では触らない（隔離してある）。

理由（Owner の指摘）:

- **長寿命で測定可能。** 「TS→JS の変換」「依存 1 つの本当のコスト」「bundle バイト」は
  道具が変わっても残る問いで、桁で測れる。
- **サプライチェーンの心配が減る。** 計測対象の transpiler（Babel/SWC/esbuild/Oxc・lodash）は
  devDependency として**ここだけ**に置く。

## 作法

1. **仮説を結果より先に凍結する。** `docs/_hypotheses-*.md` を追加したコミット SHA が凍結の証拠。
2. **再現できる形で測る。** `node research/measure.mjs --exp <name>` 一発。入力は固定 fixture。
3. **before/after を実測。** 数値は測定環境（Node/CPU）とセットで残す。
4. **絶対値でなく桁で語る。** 10x なのか 1.1x なのか。

## 依存のはしご（この lab の指針）

> **依存を足さない > 共有する > 分割する（code-split） > 遅延読込する**

新しい依存を足す前に、上位の手が尽きているかを問う。

## 実験

| ID | 問い | 状態 |
|---|---|---|
| EXP-1 | transpiler（Babel/SWC/esbuild/Oxc）の速度・出力サイズは「桁で」どう違うか | [結果](docs/EXP-1-transpiler-orders.md) |
| EXP-2 | 束ね変換（bundle）の桁。esbuild の IPC 床は bundle で消えるか | [結果](docs/EXP-2-3-4-results.md#exp-2-bundle-orders束ね変換の桁) |
| EXP-3 | 依存 1 つの本当のコスト（梯子の実測） | [結果](docs/EXP-2-3-4-results.md#exp-3-dependency-cost依存-1-つの本当のコスト梯子の実測) |
| EXP-4 | minify 込みサイズの桁 | [結果](docs/EXP-2-3-4-results.md#exp-4-minify-ordersminify-込みサイズの桁) |

**→ [P1 依存予算ゲート](docs/P1-budget-gate.md)**（`npm run gate`。EXP-3 の 753x 事故を fail-closed で止める）

**4 実験の芯（実測）**: 速度は道具で 1〜2 桁動く（EXP-1 61x, EXP-2 IPC 形態 16x）が、
**出力サイズは道具ではほぼ動かない**（EXP-1 raw 1.6x / EXP-4 minify 1.05x）。
**サイズを 2〜3 桁動かすのは「依存を足すか」だけ**（EXP-3 全体 lodash = 自作の 753x）。決定論は全道具・全段で ✓。
→ 軽さのレバーは transpiler 選択でなく**依存の判断**。これが sunao（依存の判断を fail-closed で効かせる
小さな build ステップ）に繋がった。

## 動かす

```bash
cd frontendlab
npm install
npm run exp1           # = node research/measure.mjs --exp transpiler-orders
npm run all            # exp1..4 を一括
```

- `research/fixtures/app.tsx` … 固定入力（TS+JSX の 1 コンポーネント相当）
- `research/measure.mjs` … build-and-weigh ハーネス（raw/gzip バイト・変換時間の中央値・出力 hash）
- `research/docs/` … 凍結仮説と結果の読み物
- `results/raw/` … 受領書 JSON（バージョン・環境つき。frontendlab 直下）
