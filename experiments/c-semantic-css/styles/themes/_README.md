# themes/

theme が変更してよいのは **token の値と、装飾・レイアウトレシピだけ**。

禁止（css test `tests/css/theme-discipline.test.mjs` が検査する）:
- `display: none` / `visibility: hidden` / `opacity: 0` / `font-size: 0` などで `[data-field]` を隠す
- `:focus-visible` の outline を消す
- `!important`
- `[data-card-type]`, `[data-field]`, `[data-action-semantic]` の値に依存しない新しい意味づけ

theme は `<html data-theme="...">` で切り替える。
