# 決定 0002 — Tailwind 構造監査の結論

- 日付: 2026-09-03
- 状態: **確定（この監査の範囲で）**。ただし Owner 評価と n 拡大は未了
- 関連: `docs/research/tailwind-assumptions.md` / `tailwind-structural-limits.md` /
  `docs/results/ui-tailwind-adversarial.md` / `ui-ai-context-cost.md` /
  `ui-creative-convergence.md` / `ui-tailwind-edit-surface.md`

## 問い

> 人間にとって便利な utility-first 表現は、AI が長期間・複数セッションにわたり、
> 安全性が重要な KAS UI を創造・保守する中間表現としても最適なのか。

## 結論（1 行）

**Tailwind に「一般 Web UI の欠陥」は見つからなかった。**
見つかったのは 1 件の構造的制約（静的走査 vs 動的生成）と、いくつかの KAS 固有の不適合で、
これらは「Tailwind が悪い」ではなく「Tailwind が最適化した対象（人間・静的・局所）と
KAS の要求（AI・動的・安全）がずれている」ことを示す。

## 発見の一覧

| Finding | Classification | Reproduced | Mitigation tried | Residual | Evidence level |
|---|---|---|---|---|---|
| T1 utility は型情報を運ばない | `DISPROVED` | 実測（class復元 A 0/5） | 意味を `data-*` に置く | なし（契約が意味を守る、全方式 5/5） | 実測 |
| T5 動的生成 class が build から消える | `STRUCTURAL_LIMIT` | 実測（`bg-${c}` 消失） | safelist / `@source inline` で回避可 | 未知表現に fail open・安全リスト増殖 | 実測 |
| T7 utility が AI context を消費 | `KAS_MISMATCH` | 実測（1変更 A 4346 vs E 94 token） | component 抽出（未計測） | 人間向け最適化が AI に固定コスト | 実測（GPT tokenizer 代理） |
| T8 同詳細度競合が意図と逆 | `IMPLEMENTATION_MISUSE` | 実測（3例中2例逆・実地でも再現） | tailwind-merge で後勝ち | 素の Tailwind では黙って無効化 | 実測 |
| T2 独立セッションが正規形にならない | `KAS_MISMATCH` | 実測（A byte一致 0/3・E 3/3） | — | diff/監査対象が複数化 | 実測 |
| T6 曖昧要求で色が増える | `KAS_MISMATCH`（弱） | 実測（A 各回 新規4色・E 不可） | arbitrary 禁止 lint（CT3） | 閉じた語彙を保つには外部強制が要る | 実測 |
| T4 意図変更が意味DOM生成に同居 | `KAS_MISMATCH` | 露出は再現・破壊は未実証 | component 抽出 | n 小では破壊せず。露出増は残る | 実測（n 小） |
| T10 意図単位の変更 | 条件依存 | 実測（C 2 / A 4 / E 7+再利用） | — | E は新語彙に拡張コスト、C は `:has()` が軽い | 実測（n=1/条件） |
| T3 12回編集後の全体規律 | 未計測 | — | — | — | 未計測 |
| T9 創造の多様性 | `SELF_TESTED` | CSS hash は distinct | — | Owner blind eval 未実施 | 自己評価 |

## 「根本的欠陥」と呼べるか

指示 §1 の定義: `STRUCTURAL_LIMIT` を counter-proof 付きで確認できた場合のみ「根本的欠陥」と呼ぶ。

- 該当は **T5 のみ**。しかも counter-proof（safelist）で回避でき、残るのは
  「未知表現に fail open」「安全リストが閉じた語彙を別レイヤーで持つ」こと
- したがって「Tailwind の根本的欠陥」という言葉は、**KAS の要求（未知の PresentationRecipe を
  安全に受け入れる／AI が動的生成する）に対してのみ** 使える。一般 Web UI では使えない

## Semantic UI Compiler (E) は Tailwind を「克服」したか

指示 §6 の全条件を満たさない限り「克服」とは言わない。現時点の到達:

| §6 の条件 | E の状態 |
|---|---|
| Tailwind 以上の変更成功率 | 同等（Owner scenario 8/8 pass）。優位は未実証 |
| Tailwind 以上の accessibility | 同等（token contrast 検査を継承） |
| Tailwind 以上の hostile 耐性 | 未計測（次サイクルで measure に E を追加） |
| Tailwind 以上の性能 | 未計測 |
| protected DOM 接触が有意に少ない | **満たす**（E は semantic-dom.mjs 不変。A は render.mjs に同居） |
| 契約破壊が有意に少ない | 同等（両方 0。ただし E は構造的に不可能） |
| 同じ意図の編集箇所が少ない | **語彙内なら満たす**（recipe 1 field）。語彙外は拡張要（C の方が軽い場合あり） |
| セッション間出力差が小さい | **満たす**（E byte 一致 3/3、A 0/3） |
| 必要 context token が少ない | **満たす**（1変更 94 vs 4346 token） |
| 20 案で多様性が Tailwind 以上 | 未確定（`SELF_TESTED`。Owner eval 要） |
| Owner 判断正答率が同等以上 | 未計測（Owner eval 要） |
| production dependency に Tailwind なし | **満たす** |

**結論**: E は「克服した」とは**まだ言えない**（性能・hostile・Owner 評価が未了）。
ただし E は次の軸で明確な優位を実証した:
1. **決定論**（同 recipe → 同 bytes、3/3 セッション一致）
2. **context コスト**（1 変更で読む token が桁違いに少ない）
3. **protected DOM の分離**（意味 DOM 生成ファイルに触れずに表現を変える）
4. **fail closed**（未知の値を compile で拒否）

## E の弱点（隠さず記録する）

- **語彙に無い意図はアドホックには重い**。T10 で E は compiler 拡張（7 箇所）を要し、
  C の `:has()`（2 規則）より多かった。E が効くのは「繰り返す意図に型をつける」場合
- **per-card の微調整ができない**。T2 で 3 セッションとも「承認カードだけ」を狙えず palette 全体を変えた
- **創造の幅は要求側の軸出しに依存**。同じ曖昧要求には 1 点収束する（T2）。
  多様性は Owner 評価が要る（T9 未確定）

## 決定

1. **参照実装は引き続き C（Semantic CSS）を基本とする**（決定 0001 は覆らない）。
   アドホックな意味単位変更・創造の幅で C が最も扱いやすい
2. **E（Semantic UI Compiler）を、決定論・監査・安全性が要る面に併用する候補として残す**。
   特に KAS が AI に UI を動的生成させる経路では、E の fail closed と決定論が効く
3. **Tailwind（A）は参照実装に採用しない**。ただし理由は「欠陥」ではなく、
   KAS 固有の 4 点（context コスト・非正規形・意味 DOM 同居・動的生成の fail open）
4. production dependency に Tailwind を残さない（`tests/css/theme-discipline.test.mjs` が検査）

## この決定を覆す条件

- 性能・hostile 計測で E が C/A に大きく劣ると判明
- Owner blind eval で E/C の案が理解しやすさで劣る
- T3（12 回編集後の規律）で C が破綻し A が保つと判明
