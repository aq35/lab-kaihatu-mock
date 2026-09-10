# EXP-1: transpiler の桁比較（結果より先に凍結）

このファイルが追加されたコミット SHA が凍結の証拠。**測定はこのコミットの後に行う。**

## 何を測るか

固定入力 `frontendlab/fixtures/app.tsx`（TS + JSX、型注釈除去 / interface / enum /
generics / JSX / optional chaining / nullish / class fields）を、4 つの transpiler で
**同じ土俵**（TS 型除去 + JSX automatic runtime、target=esnext、downlevel なし、非圧縮）に
変換し、次を記録する:

- 出力バイト数（raw / gzip）
- 変換時間の中央値（N 回、warmup 後）
- 出力の sha256（決定論の確認: 同入力 → 同 hash か、再実行で一致するか）
- transpiler のバージョン（pin 済み）と Node バージョン（provenance）

対象と実装言語:

| transpiler | 実装言語 | バージョン(pin) |
|---|---|---|
| @babel/core (+preset-typescript/react) | JavaScript | 8.0.5 / 8.0.1 |
| @swc/core | Rust | 1.16.2 |
| esbuild | Go | 0.28.2 |
| oxc-transform | Rust | 0.149.0 |

## 立場（この repo の作法を継ぐ）

- **結論を先に置かない。** 「Rust が速い」は仮説であって、この入力・この環境での桁を測る。
- **絶対値でなく桁で語る。** ms の小数やバイトの数十差ではなく、10x なのか 1.1x なのかを見る。
- 速度は環境依存（CPU・キャッシュ・単一プロセス）。**相対の桁**だけを主張し、絶対 ms は環境とセットで残す。

## 凍結する仮説（測定前の予想）

- **H1（速度は桁で割れる）**: native 実装（swc/esbuild/oxc）は JS 実装（babel）より
  変換時間で **1 桁以上**速い。native 3 者の間は同桁（定数倍）に収まる。
  - 反証: babel が native と同桁 / native のどれかが babel と同桁。
- **H2（出力サイズは桁で割れない）**: 同じ target・同じ変換内容なら、出力バイトは
  transpiler 間で**桁は変わらず**、定数倍（〜2x 以内）の差にとどまる。
  型除去 + JSX 展開という仕事が同じだから。
  - 反証: どれかが他の 3x 以上、または桁違いの出力を出す。
- **H3（決定論）**: 4 者すべて、同入力を 2 回変換すると **同一 hash**（transpiler は決定論的）。
  - 反証: 実行ごとに hash が変わる transpiler がある（タイムスタンプ・ランダム名など）。
- **H4（gzip が差を縮める）**: gzip 後は raw より transpiler 間の差が**縮む**
  （冗長な helper・空白は圧縮で吸収されるため）。
  - 反証: gzip 後にむしろ差が開く。

## AIが好きそうなコンパイラ、への接続（north-star）

この repo は既に「AI 向け UI 生成言語（Recipe → 決定論的 HTML/CSS）」を条件 E/F で持つ。
EXP-1 はその**下の層**（汎用 transpiler: JS/TS → JS bytes）を同じ物差しで測る予備調査。
狙いは速度勝者を決めることではなく、**「AI にとって扱いやすい compiler の性質」を測定可能な軸に落とす**こと:

- **決定論**（同入力→同出力 hash）… H3 で観測
- **出力の予測可能性/軽さ**（桁で暴れない）… H2/H4 で観測
- **fail-closed / 低 context / 型付き入力** … EXP-1 の範囲外（後続で扱う）

EXP-1 の結果は「どの性質が既製 transpiler に既にあり、どれが無いか」の地図の第一点になる。
