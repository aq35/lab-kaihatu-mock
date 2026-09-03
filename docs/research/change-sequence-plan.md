# 3 年保守を模した 16 変更列（T3。harness 定義。未実施）

指示 §5 の変更列。各変更を **別 AI セッション（会話履歴なし）** で順に適用し、
**16 変更後の状態**を主要結果にする（最初の開発速度ではなく）。

## 変更列
1. 新カード型追加 / 2. effect 表現変更 / 3. scope 表示変更 / 4. 新テーマ追加 /
5. dark・high-contrast 追加 / 6. token 廃止 / 7. Recipe 語彙 rename / 8. 古い Recipe 読込 /
9. browser fallback 削除 / 10. 依存 package 更新 / 11. security fix / 12. 大量カード性能改善 /
13. a11y 基準追加 / 14. Owner 局所調整 / 15. 不要テーマ削除 / 16. rollback

## 各変更で測る
変更時間 / 読んだファイル / 入力・出力 token 代理値 / 変更行 / regression / contract violation /
追加 dependency / 削除できなかった残骸 / rollback 時間 / 次セッションの理解時間。

## 条件
A / C / E / F / G の 5 条件 × 16 変更 = 80 セッション。各条件で**同じ順序**を適用。
劣化曲線（各時点の regression 累積・残骸累積・context token 推移）を保存する。

## 未実施の理由と代替
80 独立セッションは本サイクルのスコープ外。前サイクルで実施した UI-9（純視覚変更）と
T10（意味単位変更）が変更 2・14 の代理データを与える。次サイクルで全列を実施する。
harness: `tools/build-variants.mjs` の隔離コピー方式（scratchpad/t*-* と同じ）を 16 段に拡張する。
