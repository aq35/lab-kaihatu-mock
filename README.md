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
node tools/build-catalog.mjs       # 同一の意味DOM から作った 5 テーマのカタログ
```

## 読む順番

1. [`docs/handoff/INSTRUCTIONS.md`](docs/handoff/INSTRUCTIONS.md) — Owner から渡された指示書（原文）
2. [`docs/experiments.md`](docs/experiments.md) — 仮説（結果より先に凍結）と進行状況
3. [`docs/results/ui-1-comparison.md`](docs/results/ui-1-comparison.md) — 4 方式の比較（本体）
4. [`docs/results/counter-proof.md`](docs/results/counter-proof.md) — 防止策を外すとどうなるか
5. [`docs/results/ui-9-ai-maintainability.md`](docs/results/ui-9-ai-maintainability.md) — 別セッション AI の保守性
6. [`docs/results/ui-11-creativity.md`](docs/results/ui-11-creativity.md) — 同一の意味DOM から 5 表現
7. [`docs/decisions/0001-reference-implementation.md`](docs/decisions/0001-reference-implementation.md) — 何を採り、何を採らなかったか
8. [`.claude/skills/html-css-js-ui-review/SKILL.md`](.claude/skills/html-css-js-ui-review/SKILL.md) — 実験に支持された規則だけのレビュー Skill

## 現時点で分かったこと

すべて実測。根拠は [`docs/results/`](docs/results/) にある。

1. **契約は方式で守れない。テストでしか守れない。**
   theme CSS へ 3 行足すだけで、承認カードから「何が起きるか」「影響範囲」「リスク」が消える。
   レイアウトは崩れず、カード数も変わらないので目視レビューでは気づけない
   （[counter-proof CP1](docs/results/counter-proof.md)）。

2. **UI は authority ではない。**
   client の二重送信防止を外すと request は 3 本飛ぶが、server の one-shot 再検証が effect を 1 回に抑える。
   両方外すと 3 回実行される（[CP4](docs/results/counter-proof.md)）。

3. **token を定義しただけでは WCAG AA を満たさない。**
   token 1 個が原因で axe 違反 40 件。全 theme 総当たりの検査を入れたら、さらに 19 件見つかった
   （[UI-1 §3](docs/results/ui-1-comparison.md)）。

4. **別セッションの AI は 4 方式すべてで正しい拡張箇所に到達した。**
   差が付いたのは発見率ではなく、**到達したあとの重複記述量**
   （[UI-9](docs/results/ui-9-ai-maintainability.md)）。

5. **「Web Components は JS 必須」は誤り。**
   Declarative Shadow DOM なら no-JS でも必須情報が読める。当初の仮説 H6 は反証された。
   ただし 1,000 カードで shadow root ごとに stylesheet が要り、60 秒で読み込めなかった。

6. **Tailwind が劣っていたわけではない。**
   変更成功率・発見率・最終的なアクセシビリティは 4 方式とも同等。
   条件C を採る理由は [`docs/decisions/0001`](docs/decisions/0001-reference-implementation.md) の 4 点に絞られる。

## いちばん重要な考え方

**意味と表現を分離する。**

- 固定するもの（AI が変えてはならない）: card type / required fields / action semantics / form endpoint /
  expiry / authority / evidence level / accessible name / focus order
- 自由に変えてよいもの: 色 / typography / spacing / density / layout / 階層 / animation / 装飾 / theme

この境界は「気をつける」では守れない。`contracts/dom-contract.json` と `tests/` が機械的に守る。
外した場合に何が起きるかは `node tools/counter-proof.mjs` で再現できる。
