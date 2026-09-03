# 訂正 receipt（過去の測定値は削除せず、ここで訂正する）

前サイクルの結論を一段狭める。過去の数値は各ファイルに残し、解釈だけを訂正する。

## C1 — 「E が Tailwind を克服した」とは言えない（言っていないが、含意を訂正）

実証されたのは次だけである:
> 閉じた PresentationRecipe と決定論的 Compiler は、AI に HTML・class・CSS を直接編集させる方式より、
> 入力を小さくし、未知値を拒否し、同じ入力から同じ成果物を生成しやすい。

**まだ実証されていない**（各所の断定をこの範囲に訂正）:
- Tailwind backend 自体が KAS に不適格 → **未確定**（条件F で分離するまで）
- E が Tailwind を総合的に克服 → **未確定**
- required field の非表示が構造的に不可能 → **誤り。訂正 C3 参照**
- E が Tailwind 以上の創造性 → **未確定（SELF_TESTED）**
- E が同機能条件で最速 → **未確定。E は filter 未実装で機能非同等（訂正 C4）**
- E の AI 作業コストが常に 94 token → **誤り。語彙追加時は schema+compiler+tests+docs を含む（訂正 C5）**

## C2 — T5 はまだ「Tailwind 固有の構造欠陥」と確定できない

現 T5 が示したのは「runtime 連結 class は静的走査で検出されない」の一例のみ。
Recipe Compiler が **ビルド前に完全な class 文字列を生成**すれば、公式の静的検出制約を回避できる可能性がある。
→ 条件F（Recipe→Tailwind Compiler）で完全文字列を生成し、それでも Tailwind 固有の残余が出るかを見るまで、
T5 の `STRUCTURAL_LIMIT` 認定は **暫定**に格下げする。
（`docs/results/ui-tailwind-adversarial.md` の T5 節、`docs/decisions/0002-tailwind-verdict.md` の表を参照）

## C3 — 「required field を消す経路が構造的に存在しない」は強すぎる

訂正:
> 誤: required field を CSS で消す経路が構造的に存在しない
> 正: **未信頼の PresentationRecipe から** required field を消す表現は、現在の schema では到達不能。
>     ただし Compiler・template・CSS・contract test を変更できる **trusted code は required field を消せる。**

脅威モデルを分離する（`contracts/recipe-version.schema.json` と 0003 で扱う）:
untrusted Recipe 入力 / trusted Compiler / Compiler を変更する開発者 / Compiler を変更する AI・Foundry / 生成物 Verifier。
counter-proof CT-C3（Compiler CSS に display:none を入れると required field が消える）で実証する。

## C4 — E の性能値は暫定。機能非同等のため比較不能

- E は filter UI 未実装。`feature-parity` を満たさないため、**総合性能比較から暫定除外**する
- E 14.4s / c-bundled 過去 11.2s・今回 15.3s の不整合は **単一試行の分散**。
  20 回反復（`docs/results/ui-performance-repeated.md`）で median/p95 を出すまで
  「E は C+ と同等」「E は最速」と報告しない
- 過去の単一試行値は `docs/results/raw/measurements.json` に残すが、**暫定値**とする

## C5 — AI context コストの比較は不公平だった

- A=4,346 / E=94 token は「A の renderer 全体 vs E の recipe だけ」を比べていた
- E で語彙を追加した T10 では **compiler.mjs 7 箇所 + schema + tests + docs** を変更した。これが 94 に入っていない
- 訂正: context コストは **変更の種類ごと**に測る（`docs/results/ui-context-cost-fair.md`）:
  (1) 既存語彙内の変更 (2) 既存語彙の組合せ変更 (3) 新しい表現軸の追加
- Tailwind 側にも semantic component/variant mapping を入れた**最善条件**を置いて比較する

## C6 — 「3/3 一致」と「38,880 通り」の両義性

- E の 3/3 recipe 一致は「再現性」であると同時に「**選択肢不足**」でもある（同じ 1 点に収束）
- 38,880 は enum の組合せ数であって、**知覚可能なデザイン多様性ではない**。
  同じ見た目になる組合せ・到達不能・a11y 違反・契約上無意味・互いに打ち消す軸・色だけ違いを除いた
  **有効 Recipe 空間**を数え直す（`docs/results/ui-recipe-effective-space.md`）
