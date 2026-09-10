# frontendlab — フレームワーク非依存のフロントエンド・ツールチェーン実験

React/Vue/Svelte のプラグインではなく、その**下の層**（transpiler・bundler・依存コスト・
tree-shaking・出力バイト）を対象にする。理由は Owner の指摘どおり:

- **長寿命で測定可能。** framework 固有の runtime プラグインは framework の寿命に縛られるが、
  「TS→JS の変換」「依存 1 つの本当のコスト」「bundle バイト」は道具が変わっても残る問いで、桁で測れる。
- **サプライチェーンの心配が減る。** ここは self-contained（`frontendlab/package.json` で閉じ、
  root に依存を残さない）。計測対象の transpiler も devDependency として**ここだけ**に置く。

## north-star

**最終的に「AIが好きそうなコンパイラ」に近づける。** 速い道具を選ぶのが目的ではない。
AI にとって扱いやすい compiler の性質を、測れる軸に落として一つずつ観測する:

- 決定論（同入力 → 同出力）
- 出力の予測可能性・軽さ（桁で暴れない）
- fail-closed（未知入力はエラーで止まる）
- 低 context（少ない前提で正しく使える）
- 型付き・宣言的な入力（Recipe 的）

> この repo は既に上位層で「AI 向け UI 生成言語（Recipe → 決定論的 HTML/CSS、条件 E/F）」を
> 実験している（root の README 参照）。frontendlab はその**汎用ツールチェーン版の予備調査**。

## 作法（root と同じ）

1. **仮説を結果より先に凍結する。** `docs/_hypotheses-*.md` を追加したコミット SHA が凍結の証拠。
2. **再現できる形で測る。** `node measure.mjs --exp <name>` 一発。入力は固定 fixture。
3. **before/after を実測。** 自己評価で確定しない。数値は測定環境（Node/CPU）とセットで残す。
4. **絶対値でなく桁で語る。** 10x なのか 1.1x なのか。ms の小数は環境依存として扱う。
5. 受領書（receipt）を `results/raw/*.json` に、読み物を `docs/` に置く。

## 依存のはしご（Owner 提示・この lab の指針）

> **依存を足さない > 共有する > 分割する（code-split） > 遅延読込する**

新しい依存を足す前に、上位の手が尽きているかを問う。EXP-1 以降はこの梯子を測定で裏づける。

## 実験

| ID | 問い | 状態 |
|---|---|---|
| EXP-1 | transpiler（Babel/SWC/esbuild/Oxc）の速度・出力サイズは「桁で」どう違うか | [結果](docs/EXP-1-transpiler-orders.md) |
| EXP-2 | 束ね変換（bundle）の桁。esbuild の IPC 床は bundle で消えるか | [結果](docs/EXP-2-3-4-results.md#exp-2-bundle-orders束ね変換の桁) |
| EXP-3 | 依存 1 つの本当のコスト（梯子の実測） | [結果](docs/EXP-2-3-4-results.md#exp-3-dependency-cost依存-1-つの本当のコスト梯子の実測) |
| EXP-4 | minify 込みサイズの桁 | [結果](docs/EXP-2-3-4-results.md#exp-4-minify-ordersminify-込みサイズの桁) |

**→ [方針: 個人用途に閉じたプラグイン](docs/plugin-policy.md)**（実測から導いた、React/Vue/Vite を置き換えない道）

**4 実験の芯（実測）**: 速度は道具で 1〜2 桁動く（EXP-1 61x, EXP-2 IPC 形態 16x）が、
**出力サイズは道具ではほぼ動かない**（EXP-1 raw 1.6x / EXP-4 minify 1.05x）。
**サイズを 2〜3 桁動かすのは「依存を足すか」だけ**（EXP-3 全体 lodash = 自作の 753x）。決定論は全道具・全段で ✓。
→ 軽さのレバーは transpiler 選択でなく**依存の判断**。個人で書く価値があるのは「速い変換器」でなく
**依存の判断を fail-closed で効かせる小さな build ステップ**（方針 doc 参照）。

## 動かす

```bash
cd frontendlab
npm install            # 計測対象の transpiler（pin 済み）をここだけに入れる
npm run exp1           # = node measure.mjs --exp transpiler-orders
```

- `fixtures/` … 固定入力（TS+JSX の 1 コンポーネント相当）
- `measure.mjs` … build-and-weigh ハーネス（raw/gzip バイト・変換時間の中央値・出力 hash）
- `results/raw/` … 受領書 JSON（バージョン・環境つき）
- `docs/` … 凍結仮説と結果の読み物
