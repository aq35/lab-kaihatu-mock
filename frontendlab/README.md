# frontendlab — sunao（AI が書いても壊れないフロントエンド・ツールチェーン）

このディレクトリの主役は **sunao**: Vue 風の SFC（`.sunao`）を**決定論的にコンパイル**する、
**第三者依存ゼロ**の小さなフロントエンド・ツールチェーン。北極星は
**「AIが好きそうなコンパイラ」= 宣言的・fail-closed・決定論・小さい・低 context・エラーが直し方を教える**。

> 由来: frontendlab は元々「トランスパイラ/バンドラの**計測実験**」として生まれ、その結論
> （軽さのレバーは変換器でなく**依存の判断**）から sunao が育った。実験そのものは
> [`research/`](research/README.md) に隔離してある。

## クイックスタート

```bash
cd frontendlab
npm install
npm run new -- apps/todo                    # 雛形（既定 basic テンプレ）
npm run new -- apps/tube --template video   # YouTube 風ストリーミングの雛形
npm run dev -- --entry apps/todo/main.js    # 保存→自動リロード
npm run verify                              # check（決定論/予算/契約）＋ fmt ＋ test を 1 ゲートで
```

- **AI/エージェントで作業するなら**: まず [`AGENTS.md`](AGENTS.md)（覚えることは 3 つ・自己修正ループ）。
- **API を 1 枚で**: [`docs/reference.md`](docs/reference.md)（文法・runtime・footgun・決定論/予算）。
- **設計の変遷と思想**: [`docs/sunao.md`](docs/sunao.md)。

## 覚えることは 3 つだけ

1. **状態は signal** — `const n = signal(0)`。読むのは `n()`、書くのは `n.set(x)` / `n.update(fn)`。
2. **宣言必須（fail-closed）** — テンプレが使う名前は `return {}` / `props` / `expose` に。無ければ build で止まる（「もしかして」提案つき）。
3. **困ったら `npm run doctor` / `npm run manifest`** — 機械可読 JSON で診断・部品契約を確認。

## ディレクトリ

| 場所 | 中身 |
|---|---|
| [`sunao/`](sunao/) | 本体（依存ゼロ）: compile / runtime / expr（自前式パーサ）/ esbuild-plugin / theme / format / recipe-vocab |
| [`cli/`](cli/) | コマンド: build / dev / check / create / prerender / format / diagnose / doctor / manifest / lsp / budget-gate / gen-recipe-vocab |
| [`examples/`](examples/) | 動くデモ兼 few-shot: app-ui（対話・DnD・カレンダー・ルーティング・FLIP）/ seo（SSG→hydrate）/ static-ui |
| [`templates/`](templates/) | `npm run new` の雛形: `basic` / `form` / `table` / `dashboard` / `gallery`（Pixiv 的ギャラリー）/ `wiki`（Wiki記事・目次）/ `video`（YouTube 風ストリーミング） |
| [`docs/`](docs/) | reference.md（AI 向け 1 枚）/ sunao.md（変遷）/ design-history.md（事前設計ノート集） |
| `tests/` | unit + 実機(Playwright) + LSP。`tests/fixtures/` はテスト専用入力 |
| `bench/` | sunao vs Vue3 の実測（受領書つき） |
| `editor/` | 構文ハイライト + VSCode 拡張 |
| [`research/`](research/README.md) | 生みの親の計測実験（トランスパイラ/バンドラ）。sunao 本体とは無関係 |

## north-star

**「AIが好きそうなコンパイラ」** に近づける。速い道具を選ぶのが目的ではなく、
AI にとって扱いやすい compiler の性質を、測れる軸に落として一つずつ満たす:

- 決定論（同入力 → 同出力）／出力の予測可能性・軽さ（桁で暴れない）
- fail-closed（未知入力はエラーで止まる）／低 context（少ない前提で正しく使える）
- 型付き・宣言的な入力（Recipe 的）／エラーが直し方を教える（機械可読診断）

## 設計 doc（sunao の背骨）

**→ [設計変遷（design history）](docs/design-history.md)** — 事前設計ノートを 1 枚に集約:
**[方針: 個人用途に閉じたプラグイン](docs/design-history.md#方針-個人用途に閉じたプラグイン--reactvuevite-の代替ではなく上下に置く)** ・ **[いいところ取り洗い出し](docs/design-history.md#フレームワークのいいところ洗い出しとsunao-への採否)** ・ **[ダメなところ洗い出し](docs/design-history.md#フレームワークのダメなところ洗い出しとsunao-の-guardrail)** ・ **[レバレッジ地図](docs/design-history.md#どこを作りまくると見返りが大きいかレバレッジ地図)** ・ **[向かうべき道](docs/design-history.md#向かうべき道sunao--frontendlab-の-direction)** ・ **[Recipe ブリッジ](docs/design-history.md#recipe-ブリッジ--sunao-と-repo-の条件-ef-をつなぐ)** ・ **[他言語・FW からの借用](docs/design-history.md#他言語フレームワークからの借用実装済み)**
