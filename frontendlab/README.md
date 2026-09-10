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
| EXP-1 | transpiler（Babel/SWC/esbuild/Oxc）の速度・出力サイズは「桁で」どう違うか | 進行中 |

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
