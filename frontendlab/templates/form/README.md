# __APP_NAME__ — 入力フォーム（sunao `form` テンプレ）

`v-model` の双方向バインドと、**派生値としての検証**（computed/関数）を示す最小フォーム。

```
開発: node cli/dev.mjs --entry __APP_DIR__/main.js
ビルド: node cli/build.mjs --entry __APP_DIR__/main.js --out dist/__APP_NAME__
```

- 各入力は `v-model="name"`（signal 双方向）。
- エラーは `errName()` などの**派生値**（signal を読むだけで再計算）。submit 時に `touched` を立てて表示。
- 送信は `@submit="submit($event)"` ＋ `e.preventDefault()`。より厳密にするなら `decode`（Zod 風）でスキーマ検証に置換できる。
