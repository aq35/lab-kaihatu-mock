# __APP_NAME__

sunao アプリ（`basic` テンプレ）。

```
開発（保存で自動リロード）: node cli/dev.mjs --entry __APP_DIR__/main.js
ビルド:                     node cli/build.mjs --entry __APP_DIR__/main.js --out dist/__APP_NAME__
チェック（決定論・予算）:   node cli/check.mjs
```

- 状態は `signal`（`count()` で読む・`count.set()/update()` で書く）。
- スタイルは `<style lang="scss">`（この部品だけに効く scoped）。
- 巨大リストは `windowed` / `windowedVar`、通信は `resource`。詳細は `docs/reference.md`。
