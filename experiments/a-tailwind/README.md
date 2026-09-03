# 条件A — Tailwind CSS（比較専用）

**この条件の依存は最終成果物へ持ち込まない。** root の `package.json` は Tailwind に依存しておらず、
`tests/css/theme-discipline.test.mjs` がそれを検査している。

## ファイル構成

```
render.mjs                 意味DOM と utility class を生成する（外観の指定はここにある）
shell.html                 ページの外枠（utility class を含む）
src/input.css              @import "tailwindcss" と @source
dist/tailwind.css          ビルド成果物（コミット済み。ビルドしなくても実行できる）
package.json               この条件専用の devDependency
scripts/                   条件C と同一
```

ビルド: `cd experiments/a-tailwind && npm install && npm run build`

## どこを変えるか

| やりたいこと | 変える場所 |
|---|---|
| 色・余白・字面・角丸を変える | `render.mjs` と `shell.html` の utility 文字列 |
| 新しい見た目を丸ごと作る | `render.mjs` の utility 文字列を差し替える、または `src/input.css` の `@theme` |
| ある役割の見た目を変える | `render.mjs` の該当テンプレート（定数 `LABEL_CLS` 等にまとめてある箇所もある） |
| 状態（期限切れ等）の見た目 | `render.mjs` の `renderCard` 内の条件分岐 |
| カードが狭い場所でどう畳まれるか | `sm:` 等の breakpoint variant（viewport 基準） |
| 新しいカード型を足す | `contracts/cards.schema.json` → `render.mjs` の `bodies` と `ACCENT` |

## 規律

utility を markup に書く。CSS ファイルは基本的に触らない。
dark mode は `dark:` variant で同じ場所に書く。

## この条件の既知のコスト

- 外観の指定が markup にあるため、見た目の変更が意味DOM と同じファイル・同じ行に入る
- 同じ意図（例: 補助テキストの色）が markup 全体へ散る
