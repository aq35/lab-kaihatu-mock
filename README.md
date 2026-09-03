# web_ui_manual — AIが創造しやすい HTML / CSS / JavaScript UI の実験リポジトリ

KAS の Owner Control Center 向けに、**別セッションの AI が安全かつ臨機応変に UI を創造・改修できる設計**を、
実験で見つけるためのリポジトリ。

> 元の指示書: [`docs/handoff/INSTRUCTIONS.md`](docs/handoff/INSTRUCTIONS.md)（Owner から渡された原文）

## 立場

- **結論を先に置かない。** Tailwind を使わないことが目的ではない。Tailwind は比較条件であり、差は実験で測る
- **自己評価で確定しない。** 測定値または Owner 評価が無いものは未検証として扱う
- **仮説は結果より先に固定する。** [`docs/experiments.md`](docs/experiments.md)（凍結コミット `2b0739b`）

## 何がここにあるか

| 場所 | 内容 |
|------|------|
| `contracts/` | 5 カード型の閉じた意味契約（JSON Schema）と DOM 契約 |
| `fixtures/` | 正常系・境界・敵対的 content・100件・1,000件 のコーパス |
| `experiments/a-tailwind/` | 条件A: Tailwind（比較専用。root に依存を残さない） |
| `experiments/b-raw-css/` | 条件B: 無規律な素の CSS（対照群） |
| `experiments/c-semantic-css/` | 条件C: Semantic CSS（Cascade Layers + tokens + Container Queries） |
| `experiments/d-web-components/` | 条件D: Native Web Components（Declarative Shadow DOM） |
| `tools/` | ビルド・計測・counter-proof・色計算 |
| `tests/` | 契約 / CSS 規律 / token コントラスト |
| `docs/results/` | 実測結果（測定環境とセットで保存） |
| `docs/decisions/` | 実験に支持されて採用した決定 |

## 動かす

```bash
npm install
node tools/build-variants.mjs      # 4 方式 × 7 fixture を dist/ へ書き出す
node tools/serve.mjs               # http://127.0.0.1:8080/ で見る
node --test tests/contract tests/css   # 契約と CSS 規律の検査
node tools/measure.mjs             # 4 方式を同一条件で計測 → docs/results/raw/
node tools/counter-proof.mjs       # 防止策を外して事故を再現する
```

## いちばん重要な考え方

**意味と表現を分離する。**

- 固定するもの（AI が変えてはならない）: card type / required fields / action semantics / form endpoint /
  expiry / authority / evidence level / accessible name / focus order
- 自由に変えてよいもの: 色 / typography / spacing / density / layout / 階層 / animation / 装飾 / theme

この境界は「気をつける」では守れない。`contracts/dom-contract.json` と `tests/` が機械的に守る。
外した場合に何が起きるかは `node tools/counter-proof.mjs` で再現できる。
