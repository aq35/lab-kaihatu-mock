# Tailwind 構造監査の仮説（結果より先に凍結）

このファイルが追加されたコミット SHA が凍結の証拠。
`git log --diff-filter=A -- docs/research/_hypotheses-tailwind.md`

分類: STRUCTURAL_LIMIT / KAS_MISMATCH / IMPLEMENTATION_MISUSE / DISPROVED
「根本的欠陥」は STRUCTURAL_LIMIT を counter-proof 付きで確認できた場合だけ使う。

---

## T1 — 表現が意味を持たない
> `data-*` の意味属性を除いた「class 列だけ」を与えたとき、条件A(Tailwind) は KAS の意味
> （危険/未検証/結果不明/Owner判断待ち/期限切れ/effect/scope）を機械的に復元できない。
> 条件C は class 名が役割を表すため復元でき、条件E は class を持たない。
- 反証条件: Tailwind の class 列だけから card type と危険度が一意に決まる
- 測定: `tools/tailwind/semantic-recovery.mjs`

## T2 — 同じ描画結果に多数の表現が存在する（非正規表現問題）
> 同一の視覚要求を独立 AI へ複数回渡すと、条件A は class 集合・順序・生成 HTML hash が一致しない。
> 条件E は同じ Recipe から同じ bytes を生成する。
- 反証条件: Tailwind のセッション間 class 集合一致率が E と同等（≒1.0）
- 測定: class 集合 Jaccard、HTML hash 一致率、diff 量

## T3 — 局所最適が全体規律を保証しない
> 1 カードずつ独立セッションに修正させると、12 回後に画面全体の一貫性が条件A では崩れる。
- 反証条件: A が 12 回後も C/E と同等の一貫性を保つ
- 測定: density 分散・primary action 個数の逸脱

## T4 — 外観変更と意味 DOM が同じ編集面にある
> 純粋な視覚変更のとき、条件A だけが protected DOM に接触し、契約破壊が C/E より高頻度で起きる。
- 反証条件: A の protected DOM 接触が C/E と同等（≒0）
- 測定: `tools/tailwind/edit-surface.mjs`（視覚変更パッチが contract 属性に触れた回数）

## T5 — 静的クラス検出と動的 AI 生成の不一致
> 実行時・Recipe 由来・DB 由来・plugin 由来で動的生成した class は Tailwind の source 走査に現れず、
> build 後の CSS に含まれず production で消える。safelist / source 登録で回避できるが設定が増える。
- 反証条件: 動的生成 class が設定変更なしで production CSS に残る
- 測定: `tools/tailwind/dynamic-class.mjs`

## T6 — arbitrary value が設計規律を迂回する
> 曖昧な要求を独立 AI へ複数回渡すと、条件A では arbitrary value・新規色・似て非なる spacing が増える。
> 条件E は Recipe の閉じた enum しか受け付けない。
- 反証条件: A の arbitrary value 発生が 0、または既存 token で表現可能だった割合が 100%
- 測定: arbitrary value 数、新規色数、contrast 違反数

## T7 — utility class 列が AI の context を消費する
> 同じ意味・同じ描画結果で、条件A の source は LLM tokenizer で測った入力 token 数が C/E より多い。
> 特に「外観指定 token / 意味 token」比が A で高い。
- 反証条件: A の token 数が C/E 以下
- 測定: `tools/tailwind/context-cost.mjs`（gpt-tokenizer。Claude の代理指標）

## T8 — utility 競合の最終結果が意図から離れている
> 同 property を変える複数 utility / variant 競合 / 末尾追記があると、
> ソース順と computed style が食い違い、build green でも意図と異なる。
- 反証条件: 競合 markup の computed style が常にソース最後の意図と一致
- 測定: `tests/tailwind/conflict.test.mjs`（ソース順・生成 CSS 順・computed style を分離記録）

## T9 — 創造性が既存 utility 語彙へ収束する
> 同じ契約から多数の案を作らせると、条件A は似た dashboard へ収束する。E も収束しうるので両方測る。
- 反証条件: A の案の多様性が E と同等以上
- 測定: レイアウト構造の種類・DOM 類似度（Owner 評価は SELF_TESTED）

## T10 — 意図単位の変更が存在しない
> 「すべての未検証情報を一段弱く」等の意味単位の変更を、条件A は要素ごとの utility 編集に分解する必要があり、
> 編集箇所と漏れが多い。条件E は Recipe の 1 フィールド変更で済む。
- 反証条件: A の意図単位変更の編集箇所が E と同等
- 測定: 各意図を A/C/E で適用したときの編集箇所・漏れ・回帰

---

## counter-proof（Tailwind に不利な条件を作らないため）

| ID | 外す/加える | 確認 |
|----|-----------|------|
| CT1 | Tailwind を component 化 | T3/T7 の差が消えるか |
| CT2 | Tailwind に theme variables | 色の一貫性問題が消えるか |
| CT3 | arbitrary value を禁止 | T6 が消えるか（創造性は落ちるか） |
| CT4 | safelist を使う | T5 が消えるか（設定量はどれだけ増えるか） |
| CT5 | Semantic CSS(C) でも意味 DOM を直接編集 | 同じ契約破壊が出るか（方式でなく編集面の問題か） |
| CT6 | Compiler(E) の Recipe を自由形式に | Tailwind と同じ発散が起きるか |
| CT7 | Compiler の検証を外す | required field を隠せるか |
| CT8 | Compiler の決定論生成を外す | 同入力から異なる bytes が出るか |
