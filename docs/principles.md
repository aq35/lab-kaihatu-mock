# 設計原則（検証状態つき）

各原則には **検証状態** を必ず付ける。実測か Owner 評価が無いものは `未検証` とする。

| 状態 | 意味 |
|------|------|
| `実測` | このリポジトリの計測結果が支持している。receipt へのリンクがある |
| `counter-proof` | 防止策を外すと事故が再現することを確認済み |
| `SELF_TESTED` | AI の自己評価のみ。Owner 実測がない |
| `未検証` | 根拠がまだない。設計上そうしているだけ |

---

## P1. 意味と表現を分離する

固定するもの（AI が変更してはならない）:
card type / required fields / action semantics / form endpoint / reason code / expiry /
authority / evidence level / accessible name / focus order

自由に変えてよいもの:
色 / typography / spacing / density / layout / 視覚階層 / animation / illustration /
background / card shape / responsive composition / theme

**状態: `実測`** — 同じ意味 DOM から 5 テーマを、意味 DOM 差分 0 行で生成できることを確認。
receipt: [`docs/results/ui-1-comparison.md`](results/ui-1-comparison.md) の「テーマ適用」節。

---

## P2. 境界は「気をつける」では守れない。機械が守る

意味を壊す変更は、レビューでは見つからない形で入る。
`display:none` を 1 行足すだけで承認カードから effect と影響範囲が消え、**レイアウトは一切崩れない**。

**状態: `counter-proof`** — CP1 で再現。receipt: [`docs/results/counter-proof.md`](results/counter-proof.md)

したがって必要なのは:
- `contracts/cards.schema.json` — 契約そのもの（12 種の危険な違反を拒否することを検査済み）
- `contracts/dom-contract.json` — DOM 上での検査点
- 実測ベースの可視性検査（computed style と bounding box を見る。CSS を読むのでは足りない）

---

## P3. UI は authority ではない

期限切れ・one-shot・stale page の判定は **server が再検証する**。
UI 側の表示は Owner のためのものであって、実行可否の根拠ではない。

**状態: `counter-proof`** — CP3 / CP4 で再現。
server 側の再検証を外すと、期限切れの承認がそのまま実行され、ALLOW_ONCE が複数回 dispatch される。

---

## P4. token を定義しただけでは、アクセシビリティは保証されない

`--text-quiet` という semantic token を作っても、その値が 3.83:1 なら WCAG 2.2 AA を満たさない。
theme を増やすたびに同じ事故が起きる。

**状態: `実測`** — 初回計測で axe の color-contrast 違反 40 件。原因は token 1 個。
`tests/css/token-contrast.test.mjs` を追加し、全 theme × 15 組の前景/背景ペアを総当たりで検査するようにしたところ、
**別の theme で 19 件の不足**が追加で見つかった。
receipt: [`docs/results/ui-1-comparison.md`](results/ui-1-comparison.md) の「アクセシビリティ」節。

系: **token は「値」ではなく「制約を満たす値」として管理する。** 検査のない token は保証にならない。

---

## P5. 同じ意図の変更にかかる編集箇所の数が、AI の作業しやすさを決める

「補助テキストのコントラストを上げる」という 1 つの意図に対して:

| 方式 | 編集が必要な箇所 |
|------|-----------------|
| C: Semantic CSS | **1**（primitive token 1 個。6 テーマ全部に波及、テストで検証） |
| B: 無規律な素の CSS | **9**（同じ色が 8 箇所 + dark mode で 1 箇所） |
| A: Tailwind | **20**（markup 中の `text-slate-500` × 10、`text-slate-400` × 10） |
| D: Web Components | **1**（token 経由）+ shadow CSS のフォールバック 7 箇所が陳腐化 |

**状態: `実測`** — receipt: [`docs/results/ui-1-comparison.md`](results/ui-1-comparison.md) の「同一修正の波及」節。

---

## P6. viewport ではなく container に適応させる

同じカードが inbox・detail・sidebar・split view に置かれる。
viewport media query は「どこに置かれたか」を知らないので、狭いコンテナで正しく畳めない。

**状態: `実測`** — 条件C は `@container` を 3 箇所持ち、320px コンテナで横スクロール 0。
条件B は viewport media query のみで、敵対的 content 下の 1280px viewport でも 739px の横溢れ。
receipt: [`docs/results/ui-1-comparison.md`](results/ui-1-comparison.md) の「敵対的 content」節。

---

## P7. server-rendered を基準にし、JS は上に載せる

JS が動かない・遅い・落ちた場合でも、Owner は「何を聞かれているか」「何を承認しようとしているか」を読めなければならない。

**状態: `実測`** — 4 方式すべてが JS 無効で required information 5/5 カード分を保持。
Declarative Shadow DOM を使えば Web Components でも成立する（当初の仮説 H6 は**反証された**）。
receipt: [`docs/results/ui-1-comparison.md`](results/ui-1-comparison.md) の「no-JS」節。

---

## P8. 失敗の種類を潰さない

- network failure（届いたか不明）
- server refusal（届いて拒否された。実行されていない）
- timeout（**成功でも effect なしでもない**。結果不明）

この 3 つを 1 つの「エラー」にまとめると、UI は「実行されていない」と嘘をつく。
`scripts/api.js` は 3 つを別の例外型で返し、結果不明のときは再送ボタンを戻さない。

**状態: `SELF_TESTED`** — 実装と単体の経路は確認済みだが、Owner による誤操作率の実測はまだない。

---

## P9. disabled を「承認済み」と読ませない

送信中はボタンを disabled にするが、必ず文言でも状態を出す（`role="status"` / `aria-live="polite"`）。
「押せない」＝「もう承認された」と読まれると、Owner は二重に承認しようとするか、承認済みだと誤認する。

**状態: `未検証`** — Owner による取り違え率の実測が必要。

---

## P10. 「違う色にしただけ」を創造性と数えない

theme が変えてよいのは token の値・装飾・レイアウトレシピ。
意味 DOM を変えなければ作れない表現があるなら、その理由を記録する。

**状態: `実測（部分）`** — 5 テーマを意味 DOM 差分 0 で作れることは確認した。
ただし「明確に異なるか」の人間評価はまだない（`SELF_TESTED`）。
