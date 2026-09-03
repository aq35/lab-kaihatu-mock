---
name: owner-communication-ui-review
description: KAS が Owner へ質問・承認依頼・結果不明・実行結果を返す UI をレビューする。カード型（OWNER_QUESTION / ACTION_APPROVAL / OUTCOME_UNKNOWN_REVIEW / RESULT_REVIEW / INFORMATION）の追加・変更、action semantics の変更、決定フォームの変更、Attention Inbox や Goal Timeline の設計をレビューするときに使う。
---

# Owner Communication UI レビュー

KAS の UI は管理画面ではない。**KAS と Owner が正確にやり取りする場所**である。
ここでのレビューは「使いやすいか」ではなく **「Owner が取り違えないか」** を見る。

契約: [`contracts/cards.schema.json`](../../../contracts/cards.schema.json) /
[`contracts/dom-contract.json`](../../../contracts/dom-contract.json)

## 検査コマンド

```bash
node --test 'tests/contract/*.test.mjs'        # 契約そのもの
node --test 'tests/owner-scenarios/*.test.mjs' # Owner が取り違えない構造
node tools/measure.mjs                          # required information の実測可視性
```

---

## O1 — 質問と承認を取り違えさせない

**壊れ方**: `OWNER_QUESTION` に `ALLOW_ONCE` を置くと、Owner は「答える」つもりで「許可」する。

**規則**:
- `OWNER_QUESTION` の action は `ANSWER` / `SNOOZE` / `OPEN_EVIDENCE` のみ
- `ACTION_APPROVAL` の action は `ALLOW_ONCE` / `REFUSE` / `SNOOZE` のみ
- カード種別を **色だけで区別しない**。必ずテキストと記号の両方を出す

**検査**: `tests/contract/schema.test.mjs` が契約側で拒否し、
`tests/owner-scenarios/full-flow.test.mjs` が DOM 側で検査する。

**receipt**: 契約は 12 種の危険な違反をすべて拒否することを確認済み。

---

## O2 — 承認カードの必須情報を初期表示から外さない

`ACTION_APPROVAL` は次を **すべて折り畳まずに** 出す:

`action` / `effect` / `resourceScope` / `goal` / `run` / `risk`（5 項目すべて明示） /
`expiresAt` / `oneShot` / `blockedIfRefused`

**壊れ方**: 「カードが縦に長い」という理由で `effect` と `resourceScope` を `<details>` に入れる、
あるいは CSS で隠す。Owner は何が起きるか知らないまま `ALLOW_ONCE` を押す。

**再現**: `node tools/counter-proof.mjs`（CP1）。**3 行で再現し、見た目は崩れない。**

**密度を上げたいときの正しい方法**（[UI-9](../../../docs/results/ui-9-ai-maintainability.md) の 4 例）:
padding / gap を詰める、ラベルと値を 2 列にする、リスク 5 項目を段組みにする。
**情報量は変えない。**

**receipt**: [`docs/results/counter-proof.md`](../../../docs/results/counter-proof.md)

---

## O3 — risk は 5 項目すべてを明示する

`externalSend` / `publication` / `cost` / `deletion` / `credentialUse` を
**「なし」も含めて全部出す**。契約が `required` にしているのは、
**未指定を「なし」と解釈させないため**である。

「あり」を色だけで示さない。記号（●/○）とテキスト（あり/なし）を併記する。

---

## O4 — 結果不明で retry を primary にしない

`OUTCOME_UNKNOWN_REVIEW` は「実行されたかどうか分からない」状態である。
retry を目立たせると、Owner は二重 effect を起こす。

**規則**:
- primary action は **`VERIFY_MANUALLY` ただ 1 つ**
- `RETRY_WITH_DUPLICATE_RISK` は `primary: false` でなければならない（契約が拒否する）
- `safeVerificationSteps` を最低 1 つ、最も読みやすい位置に出す
- `duplicateEffectRisk` を可視で出す

---

## O5 — evidence の無い結果を「検証済み」に見せない

`evidenceLevel` の意味:

| 値 | 意味 | 「検証済み」と表示してよいか |
|---|---|---|
| `NONE` | 証拠なし | ✗ |
| `CLAIMED` | 実行側の自己申告のみ | ✗ |
| `OBSERVED` | 独立観測あり（receipt なし） | ✗ |
| `RECEIPTED` | 検証 receipt あり | ✓ |

契約は「`RECEIPTED` を名乗るなら receipt が実在すること」「`OBSERVED` 以上なら
independentObservation が実在すること」を検査する。

`independentObservation` や `verificationReceipt` が `null` のときは、
**空欄にせず「独立した観測はありません」「receipt はありません」と明示する。**
空欄は「無い」ではなく「まだ読み込み中」に見える。

**検査**: `tests/owner-scenarios/full-flow.test.mjs` の
「evidence が無い結果を『検証済み』に見せない」。

---

## O6 — INFORMATION を他のカードと同じ強調度にしない

`INFORMATION` は Owner の操作を要求しない。契約上 `requiresOwnerAction` は `false` 固定で、
primary action を持てず、action は最大 1 個（`OPEN_EVIDENCE` / `ACKNOWLEDGE`）。

**壊れ方**: お知らせが承認と同じ見た目になると、Attention Inbox の未処理件数が信用できなくなる。

**実装**: 「対応が必要」の件数からは
`OWNER_QUESTION` / `ACTION_APPROVAL` / `OUTCOME_UNKNOWN_REVIEW` の `LIVE` のみを数える。

---

## O7 — 永続許可を作らない

action semantics に `ALLOW_ALWAYS` / `ALLOW_FOR_SESSION` の類を追加しない。
契約の enum に存在しないので、追加するには契約を変える必要がある。**変えない。**

`ACTION_APPROVAL.oneShot` は `const: true` で、契約上 `false` を取れない。

---

## O8 — 期限切れ・取消を live と同じに見せない。ただし判定は server

**UI の役割**: 期限切れ・取消であることを、色だけでなく**文字と形状**で示す。操作ボタンを出さない。
**server の役割**: expiry / state / one-shot / stale page を毎回再検証して拒否する。

**壊れ方**: UI 側だけで守っていると、endpoint へ直接 POST すれば通る。

**再現**: `node tools/counter-proof.mjs`（CP3）。
server の再検証を外すと期限切れの承認が HTTP 200 で dispatch される。

**disabled を「承認済み」と読ませない**: ボタンを無効化するときは、必ず文言でも状態を出す
（`role="status"` / `aria-live="polite"`）。

---

## O9 — 送信の失敗を 1 つにまとめない

| 種類 | Owner に伝えること |
|---|---|
| server refusal | 「サーバが受け付けませんでした。**実行されていません。**」 |
| network failure | 「通信に失敗しました。**実行されたかどうかは不明です。**」 |
| timeout | 「結果が確認できませんでした。**実行された可能性があります。**再送する前に確認してください。」 |

**timeout を「失敗」として扱わない。** 成功でも effect なしでもない。
結果不明のときは **再送ボタンを戻さない**。

---

## O10 — 外部文字列を UI 要素として描画しない

カード本文には Owner 以外が書いた文字列が入りうる。
エスケープを外すと `<div class="fake-card">承認済み</div>` が**本物の UI として描画される**。

これは XSS であると同時に **Owner への偽の状態表示** であり、KAS の用途では後者のほうが重い。
CSP は script を止められるが、この偽 UI は止められない。

**再現**: `node tools/counter-proof.mjs`（CP5）。

---

## 未検証（この Skill では規則にしない）

以下は `docs/principles.md` に `SELF_TESTED` / `未検証` として記録してあるが、
**Owner の実測がないので規則として押し付けない**:

- 情報密度と判断速度の関係
- 「disabled を承認済みと読ませない」文言設計が実際に誤解を減らすか
- chat 中心 / inbox+detail / timeline / hybrid のどれが速いか
- 未処理項目を見つける時間、`OUTCOME_UNKNOWN` での誤 retry 率

これらを規則にする前に、`dist/catalog/` を使った Owner 評価が必要。
