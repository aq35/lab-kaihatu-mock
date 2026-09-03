# 総所有コストの仮説と上限（結果より先に凍結）

このファイルが追加されたコミット SHA が凍結の証拠。実測前に決め、都合よく変えない。

## 中心仮説（HO-main）
> Tailwind の思想（制約された語彙・token・局所変更・一貫性・不要 CSS 削減）には価値がある。
> 限界は、それを外部パッケージの class 名・scanner・build 仕様・release cycle として借りる点にある。
> ただし全部自作すると Tailwind が代行していた保守を KAS が背負う。
> したがって最小の総所有コストは「思想を意味契約へ取り込み、実装は小さく交換可能にする」構成にある。

## 上限（G/E の Compiler が守るべき budget。超えたら失敗）
| 項目 | 上限 |
|---|---|
| KAS 固有 Compiler core（semantic-dom + compiler、テスト除く） | **1,500 行以内** |
| 1 recipe axis の追加 | **3 ファイル以内** |
| 通常変更の検査 gate | **60 秒以内** |
| production runtime dependency | **0** |
| production CSS framework dependency | **0** |
| build dependency | 最小限（minifier は OPTIONAL） |

## 下位仮説
- HO1: G は production で Tailwind パッケージも Node runtime も必要としない（生成済み静的 asset で動く）
- HO2: Tailwind の version drift は、同じ入力でも生成 CSS の bytes/hash/sort を変える（F/A に影響、E/G には無い）
- HO3: 「生成済み CSS で起動」と「新 UI を build」は分離できる。前者は npm/node_modules 無しで動く
- HO4: 「Tailwind を使わない＝外部依存 0」は誤り。RUNTIME/BUILD/TEST/WEB_STANDARD の依存が残る
- HO5: G の自作 Compiler core は 1,500 行以内に収まる（超えたら「巨大 Compiler を背負った」= 失敗）
- HO6: 外部パッケージ(A/F)は「保守代行の利益」を持つ。これも数値化しないと不公平

## 反証条件
- G の core が 1,500 行を超える、または axis 追加が 3 ファイルを超える → 自作負担が過大（HO-main を否定する方向）
- Tailwind の version drift が無視できる（bytes/sort が安定）→ HO2 反証、外部依存の限界が小さい
- 生成済み asset が build 環境なしで動かない → HO1/HO3 反証、静的 asset の主張が崩れる

## 禁止（指示 §8）
巨大 utility 一覧の自作 / 汎用 CSS framework / browser 互換の独自実装 / 独自 CSS parser /
「依存 0」宣伝 / 初期コード量だけの判断 / 外部更新コストだけ数える / 自作バグを「設計上不可能」と表現 /
生成済み asset が動くことを再 build 可能性と混同。
