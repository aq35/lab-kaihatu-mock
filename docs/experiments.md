# 実験台帳 / Experiment Ledger

このファイルは **結果を見る前に仮説を固定する** ためにある。
仮説を書いたコミット SHA が「凍結の証拠」である。後から仮説を書き換えない。
書き換える場合は取り消し線で残し、理由と日付を書く。

- 凍結コミット: このファイルが最初に追加されたコミット（`git log --diff-filter=A -- docs/experiments.md`）
- 結果: `docs/results/`
- 測定定義: `docs/measurements.md`

---

## 測定環境（結果とセットで保存する）

| 項目 | 値 |
|------|-----|
| 日付 | 2026-09-03 |
| OS | Linux 6.18.44 (container) |
| Node | v22.22.2 |
| Browser | Chromium (Playwright bundled, /opt/pw-browsers) |
| CPU throttling | 実験ごとに明記（既定 4x） |
| Network | ローカル静的サーバのみ。外部ネットワークへ出ない |
| モデル条件 | AI保守性実験は独立サブセッション。前会話を読まず、リポジトリ内文書のみ参照 |

---

## 用語

- **意味DOM (semantic DOM)**: card type / required fields / form endpoint / accessible name / focus order を担う要素・属性・テキスト。ここを変えると意味が変わる。
- **表現層 (presentation)**: token / theme / layout recipe / 装飾。ここは自由に変えてよい。
- **required information**: `contracts/cards.schema.json` が各 card type に必須と定めたフィールド。

---

## 仮説（結果より先に固定）

### H1 — 無規律CSSは変更を重ねるほど劣化する

> 条件B（無規律な素のCSS）は、UI-9 の変更課題を 3 つ以上適用した時点で、
> 重複宣言数・最大specificity・`!important` 数のいずれかが条件A(Tailwind)と条件C(Semantic CSS)の
> **両方を上回る**。

- 反証条件: B が A と C の両方以下に留まる
- 測定: `tools/css-metrics.mjs`

### H2 — 意味DOMを触らずに複数テーマを作れるのは C だけ

> 条件C は、**意味DOMの差分 0 行** で 5 種類以上の明確に異なるテーマを表現できる。
> 条件A は utility class が HTML にあるため、テーマ変更時に意味DOMを含む HTML の変更が必要になる。

- 反証条件: A が HTML 変更 0 行でテーマを差し替えられる / C が意味DOM変更を要する
- 測定: テーマ追加コミットの `tools/dom-diff.mjs` による意味DOM差分行数

### H3 — Tailwindはファイル数が少なく、HTML差分が多い

> 条件A は「全体テーマ変更」タスクで **変更ファイル数が最小** だが、
> **既存HTML構造の変更数（属性値変更を含む）は条件Cより多い**。

- 反証条件: A の HTML 変更数が C 以下
- 測定: `git diff --numstat` + `tools/dom-diff.mjs`

### H4 — 別セッションAIの変更箇所発見率は C > A > D > B

> 前会話を持たない独立セッションのAIに同一の変更課題を与えたとき、
> 「正しい拡張箇所（設計者が意図したファイル）を最初に開いた率」は C が最も高く、B が最も低い。

- 反証条件: 順位が崩れる。特に B が C 以上
- 測定: `docs/results/ui-9-*.md` に各セッションの touched files を記録

### H5 — Shadow DOM はテーマ適用コストを上げる

> 条件D は Shadow DOM 境界により、外部テーマを適用するには
> **custom property を明示的に受け渡す宣言が component ごとに必要**になり、
> テーマ追加時の変更ファイル数が C より多い。

- 反証条件: D のテーマ追加変更ファイル数が C 以下
- 測定: テーマ追加タスクの `git diff --numstat`

### H6 — no-JS で壊れるのは D だけ

> JavaScript を無効化したとき、A/B/C は required information がすべて読める。
> D は custom element が upgrade されず、required information が読めなくなる。

- 反証条件: D が no-JS で required information を保持する / A・B・C のいずれかが失う
- 測定: `tests/html/no-js.spec.mjs`（JS 無効コンテキストで required field のテキスト存在を検査）

### H7 — 「CSSで必須情報を消せる」事故は全方式で起きる

> `display:none` / `visibility:hidden` / `height:0` / `color:transparent` などで
> required information を不可視にする変更は、**方式に関係なく** 通ってしまう。
> したがって方式選択では防げず、**契約テストでしか防げない**。

- 反証条件: いずれかの方式が構造的にこれを防ぐ
- counter-proof: 防止テストを外し、意図的に required field を CSS で隠した版が「合格してしまう」ことを再現する

### H8 — 敵対的contentで最初に壊れるのは B

> 長い日本語 / 長いURL / 絵文字 / RTL / 1,000件 の fixture において、
> 横スクロール発生・要素はみ出し・重なりは B が最多になる。

- 反証条件: B 以外が最多
- 測定: `tests/hostile/overflow.spec.mjs`（`scrollWidth > clientWidth` と bounding box 交差）

### H9 — Container Queries は「narrow container配置」タスクのコストを下げる

> 「既存カードを狭いコンテナへ配置する」タスクで、
> container query を持つ C は **CSS 変更のみ・意味DOM差分0** で対応できるが、
> viewport media query しか持たない A/B は同じ画面幅で別レイアウトを作れず、
> 追加 class（=意味DOM変更）またはJSを要する。

- 反証条件: A/B が意味DOM変更なしで対応できる
- 測定: narrow container タスクの差分

### H10 — token 数の増加は保守性に単調寄与しない

> semantic token を増やすほど良い、ということはない。
> 2 テーマ以上で実際に値が異なる token だけを残した場合と、
> 網羅的に token を定義した場合で、AIの変更成功率に有意差は出ない。

- 反証条件: 網羅版が明確に高い成功率を示す
- 測定: UI-9 の task success

---

## Counter-proof 計画（防止策を外して事故を再現する）

| ID | 外す防止策 | 再現したい事故 |
|----|-----------|---------------|
| CP1 | contract test（required field 可視性検査） | CSS だけで effect / scope を隠した承認カードが合格する — **再現。しかも検査側の欠陥を 2 つ暴いた** |
| CP2 | card type ごとの action allowlist | `OUTCOME_UNKNOWN_REVIEW` に retry が primary action として出る |
| CP3 | server 側 expiry 再検証 | 期限切れカードが client clock 操作で承認できてしまう — **再現** |
| CP4 | 二重submit防止 | ALLOW_ONCE が 2 回 dispatch される — **再現（3 回）** |
| CP5 | `textContent` 強制 | fixture の `<script>` 文字列が HTML として解釈される — **再現** |
| CP6 | stale response ガード | 古いレスポンスが新しい画面を上書きする |

---

## 進行状況

| PR | 内容 | 状態 | 結果 |
|----|------|------|------|
| UI-0 | contract・fixture・measurement harness | **完了** | `contracts/` `fixtures/` `tools/` `tests/` |
| UI-1 | Tailwind / raw CSS / semantic CSS / web components 比較 | **完了** | [ui-1-comparison.md](results/ui-1-comparison.md) |
| UI-2 | HTML semantics・progressive enhancement | 部分 | no-JS は 4 方式で計測済み。heading 階層と ARIA の人手確認は未 |
| UI-3 | design tokens・cascade layers | **完了** | primitive/semantic 分離・8 layer・token コントラスト検査 |
| UI-4 | responsive・container queries | 部分 | 320/1280 で計測済み。200% zoom と narrow container タスクは未 |
| UI-5 | JavaScript state・network failure | 部分 | 3 種の失敗を分離。stale response (CP6) と leak 計測は未 |
| UI-6 | accessibility | 部分 | axe 0 / keyboard / target size は計測済み。screen reader 構造と forced-colors の人手確認は未 |
| UI-7 | hostile content | **完了** | [ui-1-comparison.md](results/ui-1-comparison.md) §4 |
| UI-8 | Owner Communication scenarios | 部分 | `tests/owner-scenarios/` で構造は検査。3 surface 比較と Owner 実測は未 |
| UI-9 | AI multi-session maintainability | 部分 | [ui-9-ai-maintainability.md](results/ui-9-ai-maintainability.md)（n=1・課題 1/12） |
| UI-10 | performance | 部分 | 1,000 カード・INP 近似は計測済み。LCP は harness が不正確。memory/leak は未 |
| UI-11 | visual creativity | 部分 | [ui-11-creativity.md](results/ui-11-creativity.md)（Owner 評価は未 → SELF_TESTED） |
| UI-12 | review skills・最終ガイド | **完了** | [.claude/skills/html-css-js-ui-review/](../.claude/skills/html-css-js-ui-review/SKILL.md) |

## 仮説の判定（結果を見たあとに追記）

| 仮説 | 判定 |
|------|------|
| H1 無規律CSSは変更を重ねるほど劣化する | **支持** |
| H2 意味DOMを触らず5テーマを作れるのは C | **支持** |
| H3 Tailwind はファイル数が少なく HTML 差分が多い | **部分的に支持**（描画結果は不変だった） |
| H4 発見率は C > A > D > B | **反証**（差が付かなかった） |
| H5 Shadow DOM はテーマ適用コストを上げる | **支持。ただし形が違う**（表現できる範囲が狭まる） |
| H6 no-JS で壊れるのは D だけ | **反証**（Declarative Shadow DOM で保持できた） |
| H7 CSSで必須情報を消せる事故は全方式で起きる | **支持**（CP1 で再現） |
| H8 敵対的contentで最初に壊れるのは B | **支持** |
| H9 Container Queries が narrow container のコストを下げる | 未検証 |
| H10 token 数は保守性に単調寄与しない | 未検証 |

詳細と根拠は [`docs/results/ui-1-comparison.md`](results/ui-1-comparison.md) §8。

---

## 追加サイクル: Tailwind 構造監査（T1-T10）

仮説凍結: `docs/research/_hypotheses-tailwind.md`（凍結 SHA は git log --diff-filter=A で確認）
条件E（Semantic UI Compiler）を追加。A/C/E の 3 モデル比較。

| 仮説 | 判定 | 分類 | receipt |
|------|------|------|---------|
| T1 表現が意味を持たない | 支持だが KAS の問題にならない | DISPROVED | results/ui-tailwind-adversarial.md |
| T2 非正規表現問題 | 支持（発散でなく非決定。A byte一致 0/3, E 3/3） | KAS_MISMATCH | results/ui-creative-convergence.md |
| T3 局所最適と全体規律 | 未計測 | — | 次サイクル |
| T4 外観と意味DOM の同居 | 支持（露出増。破壊は未実証） | KAS_MISMATCH | results/ui-tailwind-edit-surface.md |
| T5 静的走査 vs 動的生成 | 支持 | STRUCTURAL_LIMIT | results/ui-tailwind-adversarial.md |
| T6 arbitrary value の迂回 | 支持（弱。暴走は再現せず） | KAS_MISMATCH | results/ui-creative-convergence.md |
| T7 context 消費 | 支持（1変更 A 4346 / E 94 token） | KAS_MISMATCH | results/ui-ai-context-cost.md |
| T8 競合が意図と逆 | 支持（3例中2例。実地でも再現） | IMPLEMENTATION_MISUSE | results/ui-tailwind-adversarial.md |
| T9 創造の収束 | 保留 | SELF_TESTED | results/ui-creative-convergence.md |
| T10 意図単位の変更 | 条件依存（C 最軽・E は語彙拡張要） | — | results/ui-tailwind-edit-surface.md |

結論: `docs/decisions/0002-tailwind-verdict.md`。
「根本的欠陥」= STRUCTURAL_LIMIT + counter-proof 済みは T5 のみ、かつ KAS の要求に対してのみ成立。
E は決定論・context・protected DOM 分離・fail closed で優位を実証。克服の宣言は Owner 評価まで保留。

### 未了（正直に残す）
- T3（12 回編集後の規律）
- T9 の Owner blind comparison（E の 38,880 通りが「明確に異なる」か）
- E の Owner 判断正答率（理解しやすさ）
- CT1（Tailwind component 化で T7 差が縮むか）の定量

---

## UI-2 Cinematic surface（初回生成のみ・Sonnet）

仮説凍結: `docs/research/_hypotheses-ui2-cinematic.md`（U1-U7）。結果: `docs/results/ui-2-cinematic.md`、決定: `docs/decisions/0005-ui2-cinematic.md`。

4 条件 A(direct tailwind)/B(direct native)/C(recipe→native)/D(recipe→tailwind)。C/D は Recipe・意味DOM 共有。

| 仮説 | 判定 |
|------|------|
| U1 recipe 選択の収束 | 支持（8軸中7軸一致。3/3 完全一致ではない） |
| U2 Tailwind の arbitrary+escape が高い | 支持（direct Tailwind: arbitrary 30-61 + 全員 raw keyframes escape） |
| U3/RC-4 C と D は同じ意味DOM・a11y | 支持（byte 一致、backend 差は CSS 3.5KB vs 28.8KB のみ） |
| U4 fidelity は方式で頭打ちにならない | 概ね支持（geometry probe に測定欠陥あり） |
| U5/RC-1 閉じた語彙の天井 | 支持（3/3 が sectionTheme per-section 不可を報告） |
| U6 no-JS で hero+CTA 可読 | 支持（全8生成物） |
| U7 fail-closed | 支持 |

決定: INSUFFICIENT_EVIDENCE（初回のみ）。Cinematic は Recipe→Native(C) が最有力だが、語彙拡張・長期変更・Owner 評価が未了。

### 未了
- 長期 12 変更列（T3）を Cinematic の A/B/C/D へ（本命）
- fidelity 採点を条件非依存に差し替え
- 他 2 surface（Activity Stream / Campaign）
- Owner blind comparison
