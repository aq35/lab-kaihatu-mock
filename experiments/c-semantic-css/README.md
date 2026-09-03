# 条件C — Semantic CSS

素の CSS を、Cascade Layers・CSS Custom Properties・Container Queries で構造化した実装。

## ファイル構成

```
render.mjs                 意味DOM を生成する（外観の指定は書かない）
shell.html                 ページの外枠
styles/
  layers.css               @layer の順序をここ 1 箇所で固定する
  reset.css                @layer reset
  tokens.css               @layer tokens — primitive token と semantic token
  base.css                 @layer base — 要素既定、focus、visually-hidden
  layout.css               @layer layout — ページ骨格、container 定義
  components/*.css         @layer components — 役割ごとのスタイル
  states.css               @layer states — EXPIRED / REVOKED / STALE
  themes/*.css             @layer themes — token の値だけを差し替える
scripts/
  api.js                   server との通信。失敗の種類を区別する
  forms.js                 決定フォームの progressive enhancement
  cards.js                 絞り込み
  navigation.js            theme / filter の切替
```

## どこを変えるか

| やりたいこと | 変える場所 |
|---|---|
| 色・余白・字面・角丸を変える | `styles/tokens.css` の **semantic token** |
| 新しい見た目を丸ごと作る | `styles/themes/<name>.css` を追加し、shell.html に `<link>` と `<option>` を足す |
| ある役割の見た目を変える | `styles/components/<役割>.css` |
| 状態（期限切れ等）の見た目 | `styles/states.css` |
| カードが狭い場所でどう畳まれるか | `styles/components/card.css` の `@container card (...)` |
| 新しいカード型を足す | `contracts/cards.schema.json` → `render.mjs` の `bodies` → `styles/components/` に 1 ファイル |

## 規律（テストが検査している）

- component から `--p-*`（primitive token）を直接参照しない。semantic token を経由する
- component に生の色（`#...` / `rgb()` / `oklch()`）を書かない
- theme は `@layer themes` の中だけに書く
- theme で `[data-field]` を隠さない、`:focus-visible` を消さない、`!important` を使わない
- 物理プロパティより logical property（`margin-inline` 等）を優先する
- viewport ではなく container に適応させる（`@container`）

検査: `node --test tests/css/`

## この条件の既知のコスト

- CSS ファイルが分かれているため、バンドルしないと HTTP request が増える（実測 20 件）
- token を「定義しただけ」ではコントラストは保証されない。`tests/css/token-contrast.test.mjs` が必要
