# Tailwind が暗黙に置く前提（AI 以前）

Tailwind が悪いという話ではない。Tailwind は「人間が HTML を読み、utility を選び、
局所的に画面を組む」開発のために最適化された。その前提を列挙し、AI・KAS がどこで前提を崩すかを実験する。

各前提の Verdict 分類: `STRUCTURAL_LIMIT` / `KAS_MISMATCH` / `IMPLEMENTATION_MISUSE` / `DISPROVED`

---

## A1. 開発者は class 列を読んで意味を理解する

- Why reasonable: 人間は `text-red-700 border-l-4` を見れば「赤い、左に太い線」と分かり、文脈で「警告か」と推測する
- Why AI changes it: AI は文脈推測より契約を頼る。class 列そのものは型情報を持たない
- Experiment: T1（class 列だけから card type を復元）
- Evidence: 条件A は class 列だけからの復元 **0/5**。全カードが同じ外観 class を持つ。
  ただし **契約属性 `data-card-type` からは 5/5 復元できる**（`docs/results/raw/semantic-recovery.json`）
- Tailwind mitigation: 意味は class ではなく `data-*` に置けばよい（A の実装もそうしている）
- Residual: class 列は意味を運ばないが、KAS は意味を class に載せていないので実害は限定的
- **Verdict: `DISPROVED`（class に意味が無いのは事実だが、契約属性が意味を守るので KAS の問題にならない）**

## A2. build 時に必要な class 集合が分かる

- Why reasonable: 人間が書いた markup を走査すれば、使う class は出そろう
- Why AI changes it: KAS は Python/Go・plugin・DB 由来の role から実行時に class を組む
- Experiment: T5（動的生成 class が build 後 CSS に残るか）
- Evidence: runtime 連結 `bg-${color}-600` は生成 CSS に**含まれない**。
  完全な文字列がソース text に現れれば（JSON 値・コメントでも）含まれる。
  safelist（`@source inline`）で救えるが、表現を増やすたびに登録が要る（`docs/results/raw/dynamic-class.json`）
- Tailwind mitigation: safelist / source 登録 / 完全文字列で書く
- Residual: **「未知の表現を後から安全に受け入れる」ことができない。** 新表現ごとに build 設定へ触れる
- **Verdict: `STRUCTURAL_LIMIT`（公式仕様どおりの挙動。KAS の動的生成と構造的に不一致）**

## A3. HTML と外観を同時に編集してよい

- Why reasonable: utility-first の核心。markup を書きながら見た目を決められる速さが価値
- Why AI changes it: KAS は意味 DOM（contract 属性）を保護対象にする。外観編集がそこに同居する
- Experiment: T4（視覚変更が protected DOM に触れるか）／前回 UI-9
- Evidence: 前回 UI-9 で条件A だけが意味 DOM 生成ファイルを 56 行変更（うち contract 属性を含む行 4）。
  n≥5 の破壊率は本章の T4 節で計測
- Tailwind mitigation: component 抽出で markup を 1 箇所に閉じ込める（CT1）
- Residual: 計測中
- **Verdict: 計測中（T4 の結果で確定）**

## A4. 同じ人・同じチームが規律を共有する

- Why reasonable: spacing scale や色の選び方はチーム内の暗黙知で保たれる
- Why AI changes it: 別セッションの AI は前の会話を持たない。暗黙知が引き継がれない
- Experiment: T2（同じ視覚要求→セッション間の class 集合一致率）／T6（arbitrary value のばらつき）
- Evidence: 計測中（agent 実行）
- Tailwind mitigation: theme variables（CT2）・arbitrary 禁止（CT3）
- **Verdict: 計測中**

## A5. コードレビューで class 列から意図を復元できる

- Why reasonable: 人間は diff の utility を読んで「余白を詰めた」と分かる
- Why AI changes it: レビューも AI がやるなら、class 列は token を食い、競合の最終結果も読み取りにくい
- Experiment: T7（context token）／T8（競合の computed style）
- Evidence:
  - T7: 「色を少し変える」1 変更で AI が最低限読む source は A=**4,346 token** / C=1,136 / E=**94**
    （`docs/results/raw/context-cost.json`、gpt-tokenizer。Claude の代理指標）
  - T8: 同 property を変える 2 utility を並べると、**computed style がソース最後の意図と逆になる**
    ケースが 3 例中 2 例（`text-sm text-2xl`→14px、`bg-red-500 bg-blue-500`→赤）。build は green
- Tailwind mitigation: tailwind-merge 等の class merge tool で重複を解決できる（後勝ちにできる）
- Residual: merge tool 無しの素の Tailwind では、AI の「末尾に足した修正」が黙って無効化される
- **Verdict: T7 は `KAS_MISMATCH`（AI レビュー context を食う）／T8 は `IMPLEMENTATION_MISUSE`（merge tool で緩和可能）**

## A6. 利用可能な表現語彙は事前に列挙できる

- Why reasonable: Tailwind の utility は有限。design system は閉じている
- Why AI changes it: arbitrary value（`p-[13px]`, `bg-[#a3f]`）が「閉じた語彙」を開いてしまう
- Experiment: T6（曖昧な要求で arbitrary value が増えるか）
- Evidence: 計測中（agent 実行）。条件E は enum 外の値を `RecipeError` で**拒否**することは確認済み
- Tailwind mitigation: arbitrary value を lint で禁止（CT3）
- **Verdict: 計測中**

## A7. 見た目の一貫性は人間のレビューで維持できる

- Why reasonable: デザイナ／リードが目視で密度・階層を揃える
- Why AI changes it: 1 カードずつ別 AI が触ると、全体を見る人がいない
- Experiment: T3（1 カードずつ 12 回編集後の一貫性）
- Evidence: 前回 UI-9 で B が同じ打ち消しを 3 箇所に重複。T3 の本格計測は今後
- **Verdict: 未計測（T3 は今回のスコープ外。次サイクル）**

## A8. 変更者は過去の設計判断を覚えている

- Why reasonable: 「なぜこの余白か」を書いた本人が保守する
- Why AI changes it: 別セッションは判断理由を持たない。recipe/token のような**宣言**だけが引き継がれる
- Experiment: T10（意味単位の変更が 1 箇所で表現できるか）
- Evidence: 計測中（agent 実行）
- **Verdict: 計測中**
