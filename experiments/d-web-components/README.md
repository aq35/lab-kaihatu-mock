# 条件D — Native Web Components

Declarative Shadow DOM（`<template shadowrootmode="open">`）で server-render し、
custom element は振る舞いだけを足す実装。

## ファイル構成

```
render.mjs                 意味DOM を Declarative Shadow DOM 付きで生成する
shell.html                 ページの外枠。token / theme は条件C のファイルを共有する
page.css                   ページレベルの CSS（shadow root の中には届かない）
components/
  kas-card.css             shadow root 内のスタイル
  kas-card.js              upgrade 時の振る舞い（再描画はしない）
  kas-decision-form.js     決定フォームの progressive enhancement
scripts/api.js             条件C と同一
```

## どこを変えるか

| やりたいこと | 変える場所 |
|---|---|
| 色・余白・字面・角丸を変える | 共有している `../c-semantic-css/styles/tokens.css` の semantic token |
| 新しい見た目を丸ごと作る | `../c-semantic-css/styles/themes/<name>.css`。ただし **token の値変更しか shadow に届かない** |
| ある役割の見た目を変える | `components/kas-card.css` |
| 状態（期限切れ等）の見た目 | `components/kas-card.css` の `:host([data-card-state=...])` |
| カードが狭い場所でどう畳まれるか | `components/kas-card.css` の `@container card (...)` |
| 新しいカード型を足す | `contracts/cards.schema.json` → `render.mjs` の `bodies` → `:host([data-card-type=...])` |

## 規律

- `<template shadowrootmode="open">` を必ず server が出す。client で中身を作り直さない
- 外側の class セレクタは shadow を貫通しない。theme は **継承する custom property** としてのみ渡る
- `<form>` は shadow の中に置いてよい（submit は動く）が、light DOM の form とは関連付かない

## この条件の既知のコスト

- shadow root ごとに `<link rel="stylesheet">` が要る（request 数・パース回数が増える）
- theme 側が `.card { ... }` のようなセレクタを書いても効かない。token 経由に限られる
