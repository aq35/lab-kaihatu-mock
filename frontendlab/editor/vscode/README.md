# sunao VSCode 拡張

`.sunao` の **構文ハイライト**（TextMate grammar）＋ **LSP**（診断・補完・ホバー・定義ジャンプ・アウトライン）。
LSP サーバは依存ゼロの `frontendlab/tools/lsp.mjs`。この拡張はそれに stdio で繋ぐ薄いクライアント。

## 開発ロード（ソースから試す・一番簡単）

```
cd frontendlab/editor/vscode
npm install            # vscode-languageclient を入れる（拡張側の唯一の依存）
```

1. VSCode で `frontendlab/editor/vscode` フォルダを開く。
2. F5（Run Extension）→ Extension Development Host が起動。
3. そこで任意の `.sunao` を開くと、ハイライト＋診断＋補完（`{{ }}` 内で signal を `name()` 補完）＋ホバー＋定義ジャンプが効く。

> grammar / language-configuration は親フォルダ（`frontendlab/editor/`）の 1 ファイルを共有参照している（`../` パス）。
> ソースから開く用途では問題ない。`.vsix` にパッケージする場合は 2 ファイルをこのフォルダに複製すること。

## 提供機能（サーバ = tools/lsp.mjs）

- **診断**: 保存/編集ごとに error(fail-closed)・warning(() 呼び忘れ) を表示。
- **補完**: 式位置=signal/prop/return（signal/prop は `name()` を挿入して () 呼び忘れ防止）・タグ位置=component/HTML・属性位置=ディレクティブ。
- **ホバー**: signal（呼んで読む）/ prop / component / local を説明。
- **定義ジャンプ / アウトライン(documentSymbol)**: signal/prop/component/return の宣言へ。

サーバ単体の検証は `frontendlab/tests/lsp.test.mjs`（プロトコルを直接叩く・エディタ不要）。
