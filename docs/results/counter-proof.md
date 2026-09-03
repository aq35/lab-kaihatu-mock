# counter-proof — 防止策を外すと事故が再現するか

再現: `node tools/counter-proof.mjs` → `docs/results/raw/counter-proof.json`

「この規則は要らないのでは」と言われたときに、外した状態を実際に見せられるようにしておく。

---

## CP1 — theme CSS の 3 行で、承認カードから effect / 影響範囲 / リスクが消える

| | |
|---|---|
| 防止策 | contract test（`[data-field]` の**実測**可視性検査）+ theme lint |
| あり | 隠された required field **0 件** |
| 外した場合 | 隠された required field **3 件**（`card_a1.effect` / `card_a1.resourceScope` / `card_a1.risk`） |
| 判定 | **再現** |

入れた変更はこれだけ:

```css
/* 承認カードが縦に長いので、詳細は畳んでおく */
@layer themes {
  .action-approval [data-field="effect"],
  .action-approval [data-field="resourceScope"],
  .action-approval [data-field="risk"] { display: none; }
}
```

外部からの攻撃ではない。**「デザインを整えて」と頼まれた AI や人が書きそうな 3 行**である。
そして:

- レイアウトは崩れない（横溢れ `false`）
- カード数は 5 件のまま変わらない
- 見出しもボタンもそのまま残る

つまり**スクリーンショット比較・visual regression・目視レビューでは検出できない**。
検出できたのは:

- 実測可視性の contract test（computed style と bounding box を見る）: **検出した**
- theme lint（静的に禁止パターンを探す）: **検出した**（ただし後述の欠陥修正後）

### この counter-proof が検査側の欠陥を 2 つ暴いた

CP1 は最初「再現せず」と出た。事故が起きないのではなく、**再現方法と検査の両方が間違っていた**。

1. **脅威モデルの誤り**: 最初は inline `<style>` を注入していたが、
   CSP `style-src 'self'` がこれを止めていた。
   現実的な事故の形は「リポジトリ内の CSS ファイルを編集する」であり、CSP は関係ない。
2. **lint の取り逃し**: theme lint の正規表現が `[data-field]`（値なし）にしか一致せず、
   実際に書かれる `[data-field="effect"]` を見逃していた。
   値つき属性セレクタに対応し、役割クラス（`.effect-summary` など）経由で隠す場合の検査も追加した。

> **教訓**: counter-proof が「再現しない」と言ったとき、
> それは「安全である」ではなく「まだ正しく再現できていない」かもしれない。

---

## CP3 — server が再検証しなければ、期限切れの承認が実行される

| | |
|---|---|
| 防止策 | server 側での expiry / state 再検証（client の時計を信用しない） |
| あり | HTTP 409 `not-live` / dispatch **0 回** |
| 外した場合 | HTTP 200 / dispatch **1 回** |
| 判定 | **再現** |

UI は期限切れカードに「期限切れ」バッジを出し、操作ボタンを消している。
それでも、期限切れカードの endpoint へ直接 POST すれば通ってしまう。

**期限の表示は UI の役割、期限の拒否は server の役割。** 混同すると UI が authority になる。

---

## CP4 — 二重送信防止を外すと ALLOW_ONCE が複数回 dispatch される

| | dispatch 回数 | request 数 |
|---|---|---|
| client の防止 + server の one-shot 再検証（既定） | **1** | 1 |
| client の防止だけ外す | **1** | 3 |
| client と server の両方を外す | **3** | 3 |
| 判定 | **再現** | |

3 連打した場合の結果。ここで重要なのは真ん中の行:

> client の防止を外すと **request は 3 本飛ぶ**が、server の one-shot 再検証が
> effect を 1 回に抑えている。

つまり client 側の二重送信防止は **体験の問題**であって、authority ではない。
UI 側だけで守っていると、UI をバイパスされた瞬間に 3 回実行される。

---

## CP5 — エスケープを外すと、カード本文が偽の UI として描画される

| | |
|---|---|
| 防止策 | render 側の `esc()` による HTML エスケープ（`textContent` 相当） |
| あり | script 実行 `false` / 偽カード注入 **0 件** |
| 外した場合 | script 実行 `true` / 偽カード注入 **1 件** |
| 判定 | **再現** |

fixture に入れてある敵対的文字列:

```
<div class="fake-card">承認済み</div>
<script>window.__pwned = true</script>
<img src="x" onerror="...">
```

エスケープを外すと、**カードの本文テキストが「承認済み」という UI 要素として描画される**。
これは XSS であると同時に、Owner に対する偽の状態表示でもある。
KAS のように「何が承認され、何が未確認か」を正確に伝えることが目的の UI では、後者のほうが重い。

CSP はスクリプト実行を止められる場合があるが、`<div class="fake-card">承認済み</div>` は
CSP では止まらない。**CSP 単独に依存しない。**

---

## 未実施

| ID | 内容 | 状態 |
|----|------|------|
| CP2 | card type ごとの action allowlist を外すと `OUTCOME_UNKNOWN` に retry が primary で出る | 契約 (JSON Schema) が拒否することは `tests/contract/schema.test.mjs` で確認済み。DOM 側での counter-proof は未実施 |
| CP6 | stale response ガードを外すと古いレスポンスが新しい画面を上書きする | 未実施 |
