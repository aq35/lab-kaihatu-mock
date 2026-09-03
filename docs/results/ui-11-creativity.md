# UI-11 — 創造性: 同一の意味 DOM から何種類の表現を作れるか

```
Experiment: 同じ semantic HTML と card contract から、明確に異なる表現を 5 つ作る
Hypothesis frozen before result: docs/experiments.md（凍結 SHA 2b0739b）の H2
Compared conditions: 条件C（Semantic CSS）と条件D（Web Components）の theme 適用
Human evaluation required: あり（未実施 → SELF_TESTED）
```

再現: `node tools/build-catalog.mjs` → `dist/catalog/index.html`

## 作った 5 案

| 案 | 狙い | 変えたもの |
|---|---|---|
| calm operations console | 静かで余白が広い。判断に集中させる | `styles/themes/calm-console.css` のみ |
| editorial notebook | 紙面。セリフ体・罫線主体・影なし。読み物として読ませる | `styles/themes/editorial.css` のみ |
| high-density command center | 暗く等幅。1 画面に多く入れる | `styles/themes/command-center.css` のみ |
| humane conversational workspace | 会話に近い。角が丸く行間が広い | `styles/themes/conversational.css` のみ |
| visual timeline | 時系列。左に軸を引きカードを節点として並べる | `styles/themes/timeline.css` のみ |

「色違い」ではないことの根拠として、各案で変わっているのは色だけでない:

- **書体**: system-ui / Georgia + 明朝 / 等幅
- **本文サイズ**: 0.875rem 〜 1.125rem
- **カード余白**: `--space-sm`(0.75rem) 〜 `--space-xl`(2rem)
- **角丸**: 0 / 3px / 10px / 12px / 20px
- **影**: なし / 微 / 二段
- **種別の示し方**: 左罫線 / 上罫線 / 塗りつぶしのドット / タイムライン軸上の節点
- **カード間の間隔**: 0（timeline は軸で繋ぐ）〜 `--space-lg`

## H2 の判定 — **支持**

> 条件C は、意味 DOM の差分 0 行で 5 種類以上の異なるテーマを表現できる。

**支持。** 5 案すべてが、まったく同じ HTML から生成されている。

機械的な根拠: `dist/catalog/semantic-dom.txt`（**8,131 bytes**）は
`class` 属性を除いた DOM 文字列であり、5 案すべてがこの同一の文字列から作られている。
`data-card-type` / `data-field` / `data-action-semantic` / 要素構造 / テキストは 1 文字も変わらない。

各案が触っているのは `<html data-theme>` の値と、対応する 1 つの theme ファイルだけ。

### 意味 DOM を変えずに作れなかった表現

記録として残す。今回は以下が theme だけでは作れなかった:

- **カードの並び替え**（重要度順、期限順）— DOM 順序の変更が要る。
  `order` を使えば視覚順だけ変えられるが、DOM 順と視覚順を不必要にずらすのは §9 の HTML 規律に反する。
  正しくは **server 側で並べ替えて出す**
- **1 枚のカードを 2 画面に分割**（サマリと詳細）— ルーティングの問題であり、theme の範囲外
- **リスク項目のアイコン化**（テキストを絵に置き換える）— 「色だけで状態を伝えない」の規律に抵触するため、
  アイコン単独ではなくテキスト併記が必要。テキストは意味 DOM 側にある

## 条件D（Web Components）での theme 適用 — H5 の部分的検証

条件D は条件C と**同じ token / theme ファイルを共有**している。
結果:

| theme が変えるもの | 条件C | 条件D（shadow DOM） |
|---|---|---|
| token の値（色・余白・書体・角丸） | 効く | **効く**（custom property は shadow root へ継承する） |
| `.card { ... }` のようなセレクタ規則 | 効く | **効かない**（外側の CSS は shadow を貫通しない） |
| `.card-feed::before` によるタイムライン軸 | 効く | 効く（軸は light DOM 側にあるため） |
| `.card-kind-glyph` を丸くする（conversational） | 効く | **効かない** |
| `.card` の `border-block-start` を変える（editorial） | 効く | **効かない** |

つまり条件D では、**5 案のうち editorial と conversational が「色と余白だけの案」に劣化する**。
同じ表現を出すには、shadow CSS 側（`components/kas-card.css`）に
`:host` 経由の分岐を component ごとに書き足す必要がある。

### さらに: 名前ズレが無言で通る

条件D の shadow CSS は `var(--kind-information, oklch(60% .012 250))` と書いていたが、
共有 token 側の名前は `--kind-accent-information` だった。
**CSS は名前が違ってもエラーにならず、黙って fallback を使う。**

結果、token 側を WCAG AA に直しても条件D だけ古い値が残り、axe 違反 1 件が残った。
`tests/css/token-reference.test.mjs` を追加して、名前ズレと
陳腐化した fallback 8 件を検出・修正した。

**H5 は支持される方向**だが、「テーマ追加時の変更ファイル数」という当初の測り方より、
「**theme が表現できる範囲そのものが狭まる**」ほうが実際のコストとして大きい。

## 限界

- **Owner による blind comparison が未実施**。したがってこの結果は `SELF_TESTED`
- 「明確に異なる」の判定は自動 pixel 差分では行っていない（そもそも行うべきでない）
- 5 案とも同じ設計者（同一セッション）が作っており、多様性が過大にも過小にも評価されうる
- `dist/catalog/index.html` は blind comparison 用のページとして作ってあるが、
  順序をランダム化していない（決定論的にするため）。実際の評価時は順序を入れ替えること

## 次の実験

1. Owner に `dist/catalog/` を見せ、5 案それぞれで
   「未処理の項目を見つける時間」「質問と承認の取り違え」「effect / scope の理解」を測る
2. 条件D で editorial / conversational を再現するのに必要な shadow CSS の追加量を測る
3. theme を 1 つ削除したときの残骸（未使用 token / 未使用規則）を測る
