# Tailwind の構造的制約（KAS 文脈）

`STRUCTURAL_LIMIT` と分類したものだけをここに集める。
`STRUCTURAL_LIMIT` = Tailwind の利用方法を改善しても残る、方式そのものの制約。
counter-proof（回避策）も併記し、回避しても残る部分だけを「残余」とする。

---

## SL1 — 静的テキスト走査は動的生成表現を捕まえられない（T5）

Tailwind はソースを**コードとして解析せず、テキストとして走査**する
（[公式: Detecting classes in source files](https://tailwindcss.com/docs/detecting-classes-in-source-files)）。
class 名は完全な文字列として存在しないと検出されない。

- 再現: `bg-${color}-600` は build 後 CSS に含まれない（`docs/results/raw/dynamic-class.json`）
- counter-proof: safelist（`@source inline`）で救える。**回避可能**
- 残余: 新しい表現を作るたびに safelist へ登録が要る。
  KAS のように「未知の PresentationRecipe を後から安全に受け入れる」ことができず、
  **未知表現に対し fail open**（スタイルが当たらないまま描画）になる
- KAS が必要とするのは fail closed（未知は本番に出さない）。条件E は `RecipeError` で fail closed

> 回避しても「閉じた語彙を安全リストに列挙し続ける」構図は残る。
> これは E の enum と同じ「閉じた語彙」だが、Tailwind では safelist という別レイヤーに散る。

---

## SL2 — utility は意味を運ばない設計である（T1）

`text-red-700 p-4` は外観であって「危険/未検証/期限切れ」ではない。

- 再現: 条件A は 5 カード型すべてが同一の外観 class を持つ。class 列からの型復元 0/5
- counter-proof: 意味を `data-*`（契約属性）に置けば復元できる（全方式 5/5）。**回避可能**
- 残余: なし。**これは制約ではなく設計の役割分担**。意味は契約、外観は utility
- 分類は最終的に `DISPROVED`（KAS の問題にならない）。ここには参考として残す

---

## SL3 — 外観指定が AI の context を線形に消費する（T7）

utility は要素の隣に置かれるため、AI は外観を変えるのに markup 全体を読む。

- 再現: 「色を少し変える」1 変更で AI が最低限読む source = A 4,346 / C 1,136 / E 94 token
- counter-proof: component 抽出で読む範囲を狭められる（CT1、計測は T3 で）。**部分的に回避可能**
- 残余: 人間は class 列を読み飛ばせるが、AI は全部トークン化する。
  人間向けの最適化（外観を要素の隣に置く）が AI には固定コストになる
- 分類: `KAS_MISMATCH`

---

## SL4 — 同詳細度 utility の競合はソース順で解決されない（T8）

- 再現: `text-sm text-2xl` の computed style は 14px（先に書いた方が勝つ場合がある）。build は green
- counter-proof: `tailwind-merge` で後勝ちに解決できる。**回避可能（要ツール）**
- 残余: 素の Tailwind では、AI が末尾に足した修正が黙って無効化される。build green を信用できない
- 分類: `IMPLEMENTATION_MISUSE`（ただし既定挙動）

---

## まとめ: 「根本的欠陥」と呼べるもの

指示 §1 の定義では「根本的欠陥」は `STRUCTURAL_LIMIT` を counter-proof 付きで確認できた場合のみ。

| ID | 分類 | counter-proof 後の残余 | 「根本的欠陥」か |
|----|------|----------------------|----------------|
| SL1 | STRUCTURAL_LIMIT | 未知表現に fail open、安全リスト増殖 | **条件付きで yes**（KAS の動的生成・安全性要求に対して） |
| SL2 | DISPROVED | なし | no |
| SL3 | KAS_MISMATCH | AI context の固定コスト | no（欠陥ではなく不適合） |
| SL4 | IMPLEMENTATION_MISUSE | ツールで回避可 | no |

**結論**: Tailwind に「一般 Web UI 開発の欠陥」は見つからなかった。
見つかったのは 1 件の構造的制約 SL1（静的走査 vs 動的生成）で、これは
「AI が未知の表現を安全に生成する」という **KAS 固有の要求に対する不適合**である。
Tailwind が悪いのではなく、Tailwind が最適化した対象（人間・静的・局所）と、
KAS が要求する対象（AI・動的・安全）がずれている。
