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
| `experiments/e-compiler/` | 条件E: Semantic UI Compiler（AI は PresentationRecipe だけを宣言、Compiler が決定論的に HTML/CSS を生成） |
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

---

## Tailwind の前提を疑う構造監査（2 回目の指示）

「Tailwind を使わない」を結論に置かず、Tailwind の最善構成（条件A）と比較して、
設計思想と KAS の要求のズレを実験で測った。詳細は
[`docs/decisions/0002-tailwind-verdict.md`](docs/decisions/0002-tailwind-verdict.md)。

分かったこと（すべて実測。receipt は `docs/results/ui-tailwind-*.md`）:

- **T5（構造的制約）**: runtime で組んだ class（`bg-${color}-600`）は build 後 CSS から**黙って消える**。
  Tailwind はソースをテキスト走査するため（公式仕様）。safelist で回避できるが、
  未知の表現に **fail open**（スタイルが当たらないまま描画）。KAS の動的生成とはここが構造的に合わない。
- **T7（context コスト）**: 「色を少し変える」1 変更で AI が最低限読む source は
  A=4,346 / C=1,136 / **E=94** token。人間は class 列を読み飛ばせるが、AI は全部トークン化する。
- **T8（競合）**: `text-sm text-2xl` の実際の表示は 14px。同詳細度の utility はソース順で解決されず、
  AI が末尾に足した修正が黙って無効化される。build は green。独立セッションが実地でこれを踏み、`!important` で回避した。
- **T2（非決定）**: 同じ曖昧要求に、条件E の 3 セッションは **byte 一致の recipe** を生成（3/3）。
  条件A は方向性は一致（class 集合 Jaccard 0.97）でも **byte 一致は 0/3**。監査・回帰比較の対象が複数化する。

**結論**: Tailwind に一般的な欠陥は無い。あるのは KAS 固有の不適合。
Tailwind は「人間が要素ごとに外観を指定する速度」を最適化した言語で、
KAS が要る「AI が意味を保ったまま表現意図を宣言し、同じ入力から同じ成果物を出す」こととは
最適化の対象が違う。

## 探しているのは省略記法ではなく、AI 時代の UI 開発モデル

条件E が具体化する候補:

```
Meaning Contract           contracts/cards.schema.json（意味は契約が守る。CSS 方式に依存しない）
  → ViewModel              KAS が Owner に返す 5 カード型
  → PresentationRecipe     contracts/presentation-recipe.schema.json（AI が生成する唯一のもの。閉じた enum）
  → Deterministic Compiler experiments/e-compiler/compiler.mjs（同 recipe → 同 bytes。required field を消せない）
  → Proof Engine           tests/ と tools/counter-proof.mjs（契約破壊・非決定・fail open を機械検証）
  → Owner Evaluation       dist/catalog/（← 未実施。ここが残る最大の未検証）
```

E はまだ「Tailwind を克服した」とは宣言しない（性能・hostile・Owner 評価が未了）。
実証できた優位は 4 点: **決定論 / context コスト / protected DOM の分離 / fail closed**。
弱点も記録した: 語彙に無い意図はアドホックには重く（C の `:has()` の方が軽い）、per-card 微調整ができない。
