# UI-9 — 別セッション AI の保守性

```
Experiment: 同一の変更課題を、前会話を持たない 4 つの独立セッションへ与える
Starting SHA: 1e7c7c9
Ending SHA:   427734d
Hypothesis frozen before result: docs/experiments.md（凍結 SHA 2b0739b）の H3 / H4
Compared conditions: A Tailwind / B 無規律な素のCSS / C Semantic CSS / D Web Components
Model/session conditions: 同一モデル・同一の初期指示・独立セッション・並行実行（順序効果なし）
Fixture corpus: fixtures/cards.happy.json ほか（変更なし）
```

## 課題

> ACTION_APPROVAL（承認）カードだけ情報密度を上げる。他のカード型の見た目は変えない。
> 余白を詰め、ラベルと値の区切りを強め、effect / 影響範囲 / リスク を素早く拾えるようにする。
> ただし表示されている情報は 1 つも減らさない。

各セッションへの制約は 4 方式で同一:
- 変更してよいのは自分の variant ディレクトリだけ
- `data-card-type` / `data-field` / `data-action-semantic` / `data-card-state` と
  それが付いた要素の構造・テキストは変更禁止
- commit しない

各 variant には**同一構成・同程度の分量の README**（「どこを変えるか」の表を含む）を用意した。
README の質が結果を左右しないようにするため。

## 結果

| | A: Tailwind | B: 無規律CSS | C: Semantic CSS | D: Web Components |
|---|---|---|---|---|
| task success | ✅ | ✅ | ✅ | ✅ |
| 変更ファイル数 | 1（+ ビルド生成物） | 1 | 2（新規1 + link 1行） | 1 |
| 変更行数 | 56 | 38 | 96 | 106 |
| **意味DOM を生成するファイルの変更行数** | **56** | **0** | **1** | **0** |
| うち contract 属性を含む行 | **4** | 0 | 0 | 0 |
| 描画される意味DOM の差分 | なし | なし | なし | なし |
| 最初に開いたファイル | README.md | README.md | README.md | README.md |
| 最初の編集までに読んだファイル数 | 11 | 9 | 22 | 13 |
| 自己申告難易度（1-5） | 2 | **3** | 2 | 2 |
| 追加 prompt | 0 | 0 | 0 | 0 |

### 各セッションの「どこを触ったか」（自己報告）

- **A**: `render.mjs` の markup 内 utility class 文字列。
  「意味 DOM を組み立てている同じテンプレートリテラルの、同じ行」。
  承認カードだけに適用するため、共有ヘルパ（`row` / `goalRows` / `form` / `renderCard`）へ
  `dense` フラグを通す分岐を追加する必要があり、**意味 DOM を組む行に外観の条件式が混ざった**。
- **B**: `style.css` 一枚。承認カードを指す手掛かりが `.red-box` という**色の名前しかない**。
  密度に関わる規則が汎用クラス（`.box` / `.gray-row` / `.small-gray-label` / `.row-text`）に散っているため、
  詳細度を数えながら **通常・mobile・dark の 3 ブロックに同じ打ち消しを重複して記述**した。
- **C**: `styles/components/action-approval.css` を新規追加し、`shell.html` に `<link>` を 1 行。
  README の「ある役割の見た目を変える → `styles/components/<役割>.css`」で場所は即決。
  詰まりかけたのは `card.css` の `@container card (min-width: 34rem)` が `.fact { display: contents }`
  にしている点で、罫線を `.fact` ではなく `.fact-label` / `.fact-value` に載せ直す必要があった。
- **D**: `components/kas-card.css` に `:host([data-card-type="ACTION_APPROVAL"])` スコープの規則を追記。
  「外側の CSS / theme は shadow を貫通しないため、ここ以外に選択肢がない」。

## 仮説の判定

### H3（Tailwind は変更ファイル数が最小だが HTML 変更数が多い）— **部分的に支持、ただし重要な修正が必要**

- 「変更ファイル数が最小」: 支持（A は 1 ファイル）。ただし B・D も 1 ファイルで並んだ
- 「HTML 変更数が多い」: 支持。A だけが**意味 DOM を生成するファイルを 56 行変更**し、
  そのうち 4 行は `data-field` / `data-action-semantic` を含む行そのものだった

**ただし、描画される意味 DOM は 4 方式すべてで変更前と完全一致した**（class 属性を除いた
DOM 文字列をバイト比較）。つまり A も契約を壊してはいない。

したがって正しい言い方は「A は契約を壊した」ではなく:

> **A では、純粋に視覚的な作業が、契約属性を持つ行の編集として現れる。**
> B / C / D では視覚的作業と契約は別ファイルに分かれる。
> 差は「壊れたか」ではなく「壊れうる距離」である。

これは 1 回の試行では差が出にくい種類のリスクなので、
**回数を重ねた試行**（同じ課題を n 回、あるいは 12 課題すべて）でなければ確定できない。
現時点では `残る不確実性` として扱う。

### H4（変更箇所の発見率は C > A > D > B）— **反証**

4 方式すべてが、追加 prompt 0 回で正しい拡張箇所に到達した。
発見率では差がつかなかった。差が出たのは **到達したあとの作業量と重複** である:

- B だけが自己申告難易度 3 で、**同じ打ち消しを 3 箇所に重複記述**した
- B の手掛かりは `.red-box`（色の名前）で、役割から引けなかった

つまり H4 が測ろうとした「発見しやすさ」より、
**「発見したあと、1 箇所で済むか」** のほうが実際の差になる。

## 交絡と限界

- **n = 1**。方式ごとに 1 セッションずつしか走らせていない。難易度の自己申告は `SELF_TESTED`
- 12 課題のうち 1 課題しか実施していない。theme 追加・カード型追加・keyboard 修正は未実施
- 各 variant の README はこちらが書いた。README の書き方が結果に影響している可能性がある
  （4 方式で構成と分量を揃えたが、完全な統制ではない）
- 4 セッションが同じ作業ツリーを共有していた。互いのファイルには触れていないことを
  `git diff` で確認したが、`dist/` の再生成は互いに影響した
- **回帰の有無は別途計測する**（[`ui-1-comparison.md`](ui-1-comparison.md) の「UI-9 後の再計測」節）

## 再現方法

各セッションの diff は `docs/results/raw/ui-9/<variant>.patch` に保存してある。

```bash
git checkout 1e7c7c9
git apply docs/results/raw/ui-9/c-semantic-css.patch
node tools/build-variants.mjs && node tools/serve.mjs
```

## 次の実験

1. 同じ課題を n=3 で繰り返し、A の「契約属性を含む行の編集」が破壊につながる頻度を測る
2. 課題「新しいカード型を追加」（contract 変更を伴う）で 4 方式を比較する
3. 課題「dark theme を追加」で H5（Shadow DOM のテーマ適用コスト）を検証する
