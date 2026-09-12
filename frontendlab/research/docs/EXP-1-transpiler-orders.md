# EXP-1 — transpiler の桁比較（Babel / SWC / esbuild / Oxc）

```
Hypothesis frozen: frontendlab/docs/_hypotheses-transpiler-orders.md（commit 333bc95, 測定前）
再現: cd frontendlab && npm install && node measure.mjs --exp transpiler-orders --runs 60
受領書: frontendlab/results/raw/transpiler-orders.json（バージョン・環境つき）
```

固定入力 `fixtures/app.tsx`（2,883 B, TS+JSX）を、4 transpiler で**同じ土俵**
（TS 型除去 + JSX automatic runtime、target=esnext、downlevel なし、非圧縮）に変換して測った。

## 結果（この環境・この入力）

環境: Node v22.22.2 / Intel Xeon @2.80GHz ×4。**絶対 ms は環境依存。主張は「桁」だけ。**

| transpiler | 実装 | raw B | gzip B | ms(中央値) | ×最速 | 決定論 |
|---|---|--:|--:|--:|--:|:--:|
| oxc | Rust | **2,252** | 988 | **0.113** | 1.0x | ✓ |
| swc | Rust | 3,594 | 1,390 | 0.360 | 3.2x | ✓ |
| esbuild | Go | 2,385 | **967** | 1.733 | 15.3x | ✓ |
| babel | JavaScript | 3,082 | 1,370 | 6.875 | 60.8x | ✓ |

**桁の幅: 速度 61x / raw サイズ 1.60x / gzip サイズ 1.44x。**

## 仮説の判定（正直に）

- **H1（速度は桁で割れる）… 主部は支持、細部は反証。**
  JS 実装（babel）は native より **1〜2 桁**遅い（oxc 比 61x、swc 比 19x）。ここは明確。
  ただし「native 3 者は同桁（定数倍）」は**外れた**: esbuild は oxc の 15.3x で、
  swc(3.2x) とも 1 桁近く離れた。→ 下の caveat を参照（esbuild の単発 transform は IPC 律速）。
- **H2（出力サイズは桁で割れない）… 支持。** raw 1.60x・gzip 1.44x で、全員 2x 以内。
  型除去 + JSX 展開という**仕事が同じ**なので、サイズは桁で暴れない。
  最小 oxc(2,252) / 最大 swc(3,594) の差は helper・interop・整形の定数差。
- **H3（決定論）… 支持。** 4 者すべて 2 回変換で同一 sha256。既製 transpiler はこの入力で決定論的。
- **H4（gzip が差を縮める）… 弱く支持。** raw 1.60x → gzip 1.44x。冗長な helper/空白は圧縮で
  一部吸収される。劇的ではない。

## 重要な caveat — esbuild の 15x は「エンジン」ではなく「API」

esbuild の `transformSync` は Node から **Go 子プロセスへ stdio 同期通信**する。1 ファイルを単発で
変換する用途では、この IPC が支配的（min も 1.26ms で床が高い）。esbuild は本来
**多数ファイルを 1 サービス呼び出しで束ねる**（bundle）設計で、そこでは 1 ファイルあたりの
オーバーヘッドは消える。よって「esbuild は oxc の 15x 遅い compiler」ではなく、
「**単発 transform API の呼び出しコストが 15x**」と読むのが正しい。
→ EXP で束ね変換（多ファイル / bundle）を測ると像が変わるはず（後続候補）。

swc/oxc は N-API でプロセス内・同期呼び出しのため、この床が無い。babel は純 JS で床は無いが
エンジン自体が遅い。**「同じ native でも API 形態で桁が動く」**が EXP-1 の一番効いた発見。

## north-star（AIが好きそうなコンパイラ）への接続

測れる軸に落として観測した第一点:

| AI 向けの性質 | EXP-1 での観測 |
|---|---|
| **決定論**（同入力→同出力 hash） | 4 者すべて ✓（この入力・非圧縮・単発では） |
| **出力の予測可能性・軽さ**（桁で暴れない） | ✓ raw 1.6x / gzip 1.44x に収まる |
| 呼び出しコストの予測可能性 | △ API 形態依存（esbuild の IPC 床）。AI が道具を選ぶなら**呼び出し形態まで含めて**見る必要 |
| fail-closed / 低 context / 型付き入力 | EXP-1 の範囲外（後続） |

つまり「AI が好きそう」の候補性質のうち、**決定論と出力の軽さは既製 native transpiler に既にある**。
足りないのは fail-closed・型付き宣言入力・低 context の側で、そこが上位層（この repo の Recipe/Compiler 条件 E/F）の担当領域、という地図が立った。

## 未検証・限界

- **n=1 入力・1 環境・単一プロセス。** 入力サイズ依存（大ファイル/多ファイル）、warm bundle、
  CPU 差、並列は未検証。絶対 ms は再現環境でのみ意味を持つ。
- 「同じ土俵」に揃えたのは**型除去 + JSX + esnext**まで。minify・downlevel(ES5)・
  bundle・tree-shake は含まない（tool ごとに helper/polyfill 方針が分岐し、別 EXP が要る）。
- esbuild は単発 transform で不利な測り方。**束ね変換 EXP を別に立てないと esbuild の実力は測れない。**

## 後続候補

1. **束ね変換 / bundle の桁**（esbuild の IPC 床が消える土俵で再測）。
2. **依存 1 つの本当のコスト**（梯子「依存を足さない > 共有 > 分割 > 遅延」の実測）。
3. minify 込みの出力サイズ（native minifier: esbuild / swc / oxc-minify）。
