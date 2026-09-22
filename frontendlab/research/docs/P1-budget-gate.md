# P1 — 依存予算ゲート（fail-closed）

方針 [`design-history.md`（プラグイン方針）](../../docs/design-history.md#方針-個人用途に閉じたプラグイン--reactvuevite-の代替ではなく上下に置く) の最初の実装。EXP-3 が示した「サイズを 2〜3 桁動かすのは
依存の判断だけ（全体 lodash = 自作の 753x）」を、**build を止める機械**にした。

```
再現: cd frontendlab && npm run gate      # = node plugins/budget-gate.mjs --budget budget.json
実装: frontendlab/plugins/budget-gate.mjs（ライブラリ + CLI、runtime 依存ゼロ）
予算: frontendlab/budget.json
```

## 何をするか

`budget.json` に載った各 entry を esbuild で bundle+minify し、**初期 bytes（entry chunk）**と
**gzip bytes** を計って予算と比べる。超過（OVER_BUDGET）や解決不能 import 等の失敗（BUILD_ERROR）が
あれば **exit 1 で build を止める**。違反時は **何がバイトを食っているか**（metafile の
`bytesInOutput` を package 単位で集計）を上位から出す。

## デモ（実測）

同梱の 2 entry でゲートを走らせた結果:

| entry | 初期 B | 予算 B | 判定 |
|---|--:|--:|:--:|
| `fixtures/budget/ok.js`（自作 debounce） | 139 | 2,048 | ok |
| `fixtures/budget/bust.js`（`import _ from 'lodash'`） | 73,835 | 2,048 | **OVER (36x)** |

違反出力（そのまま）:

```
✗ 2 件の違反:
  [fixtures/budget/bust.js] initial_bytes 73835 B > 予算 2048 B（36.1x 超過）
     ← lodash: 72769 B
     ← fixtures/budget/bust.js: 53 B
  [fixtures/budget/bust.js] initial_gzip 26826 B > 予算 1024 B（26.2x 超過）
exit=1
```

**lodash が 72,769 B と名指しされる**。AI（や自分）が「1 関数のために全体を引いた」事故を、
prose のレビューでなく bytes で、原因つきで捕まえられる。

## north-star（AIが好きそうなコンパイラ）の性質をどう満たすか

- **fail-closed**: 超過も build 失敗も exit 1 で止める（黙って通さない）。
- **決定論**: 同入力なら同 bytes（2 回走らせて ok=139 / bust=73835 で一致）。差分は桁で説明できる。
- **低 context**: AI は `budget.json` の数値と違反の「← lodash: N B」だけ見れば足す/やめるを判断できる。
- 出力に何も残さない（runtime 依存ゼロ、build 時だけの検査）。

## 使い方

```bash
npm run gate                                  # 予算検査（超過で exit 1）
node plugins/budget-gate.mjs --json           # 機械可読出力（CI 用）
node plugins/budget-gate.mjs --update         # 実測値で budget.json を初期化/再生成
```

CI に `npm run gate` を置けば、依存を増やす PR が予算を破った瞬間に赤くなる。
ライブラリとして `import { weighEntry, runGate } from './plugins/budget-gate.mjs'` でも使える。

## 限界（正直に）

- 予算に**載っていない** entry は測られない。「出荷 entry は必ず載せる」は運用契約
  （entry リストとの突き合わせは未実装。将来 `--entries` で強制できる）。
- 初期 bytes は esbuild bundle+minify 基準。実際の配信は他 bundler・圧縮・分割で変わりうる
  （EXP-4 で minifier 差は 1.05x と小さいと確認済みなので、桁の判断には十分）。
- 閾値は人が決める値。まず `--update` で現状を固定し、そこから下げていく運用を想定。

## 次

- P2 決定論レシート（build ごとに raw/gzip/sha256 + 道具バージョンを受領書へ）。核は `measure.mjs`。
- P3 Recipe → 決定論出力（repo の条件 E/F と接続する設計 doc を凍結してから）。
