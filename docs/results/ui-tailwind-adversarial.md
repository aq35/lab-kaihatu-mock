# Tailwind 敵対的監査 — T1 / T5 / T8

```
Hypotheses frozen: docs/research/_hypotheses-tailwind.md
再現: node tools/tailwind/semantic-recovery.mjs / dynamic-class.mjs / conflict.mjs
Tailwind: 4.3.3（現行安定版）。component 抽出・theme・dark mode・minify 済みの条件A
```

Tailwind 側を弱く作っていないことの確認は本ファイル末尾の「Tailwind を弱くしていないか」を参照。

---

## T1 — 表現が意味を持たない

各 variant の描画結果から、card type を復元できるかを測った。

| 条件 | class 列だけで復元 | 契約属性 `data-card-type` で復元 |
|---|---|---|
| A: Tailwind | **0/5** | 5/5 |
| B: 無規律 | 0/5（色名 `blue-box` 等。色だけで区別＝規律違反） | 5/5 |
| C: Semantic CSS | 5/5（役割クラス `action-approval`） | 5/5 |
| D: Web Components | 0/5（`card` のみ） | 5/5 |
| E: Compiler | 5/5（役割 modifier `kcard--action-approval`） | 5/5 |

条件A では **5 つのカード型すべてが同じ外観 class を持つ**（`grid rounded-xl border border-s-4 ...`）。
utility は型情報を 1 ビットも運ばない。これは Tailwind の設計どおり（utility は外観であって意味ではない）。

### 分類: `DISPROVED`（KAS の問題としては）

「class に意味が無い」は事実だが、KAS は意味を class ではなく **契約属性 `data-card-type`** に置く。
契約経由なら全方式 5/5 復元できる。したがって **意味の保持は CSS 方式ではなく契約が担う**、
というのが正しい結論。T1 が本当に示すのは「意味を class に載せてはいけない」であって、
「Tailwind は使えない」ではない。

---

## T5 — 静的クラス検出と動的 AI 生成の不一致

Tailwind はソースを**コードとして解析せず、テキストとして走査**し、
class 名は完全な文字列として存在しないと検出されない（[公式](https://tailwindcss.com/docs/detecting-classes-in-source-files)）。
動的に組んだ class が build 後 CSS に残るかを、実際にビルドして確かめた。

| ケース | build 後 CSS に含まれた |
|---|---|
| 完全な文字列で書く（正常系） | ✅ |
| runtime で連結 `bg-${color}-600` | **❌ 含まれない** |
| JSON Recipe の値に完全文字列がある | ✅（text に文字列が現れるため） |
| Python/Go 出力（完全文字列がコメント等にある） | ✅ |

- safelist（`@source inline(...)`）で救える: ✅（ただし表現を増やすたびに登録が要る）
- 条件E に enum 外の値を渡すと: **`RecipeError` で拒否**（黙って消えるのではなく compile で止まる）

### 分類: `STRUCTURAL_LIMIT`

runtime 連結 class は build から**黙って**消える。開発時に効いて production で消えることも起きうる。
KAS のように Python/Go・plugin・DB 由来の role から動的に表現を組む前提とは構造的に合わない。

**核心的な差**: 未知の表現に対し、Tailwind は **fail open**（該当 CSS が無いまま描画。スタイルが当たらない）。
条件E は **fail closed**（compile で例外。未知の値は本番に出ない）。
安全性が重要な KAS では fail closed が正しい。

counter-proof: safelist は問題を消すが、「閉じた語彙を build 設定に列挙し続ける」ことになり、
結局 E の enum と同じ「閉じた語彙」に近づく。違いは、E では語彙が contract として一元管理され、
Tailwind では safelist という別レイヤーに散る点。

---

## T8 — utility 競合の最終結果が意図から離れている

同じ property を変える 2 つの utility を並べ、ソース順・生成 CSS 順・computed style を分けて記録した。

| ケース | ソース（最後に書いた意図） | computed style | 意図どおり？ |
|---|---|---|---|
| `p-2 p-8` | p-8 = 2rem | 32px | ✅ |
| `bg-red-500 bg-blue-500` | 青のはず | **赤 (oklch hue 25)** | ❌ |
| `text-sm text-2xl` | 24px のはず | **14px** | ❌ |

Tailwind の utility は同じ詳細度なので、勝つのは**生成 CSS 上の順序**であって**ソース上の順序**ではない。
AI が「最後に足した修正」が、生成 CSS ではより前に置かれていると無効化される。**build は green のまま。**

### 分類: `IMPLEMENTATION_MISUSE`（ただし素の Tailwind の既定挙動）

`tailwind-merge` 等の class merge tool を使えば重複を後勝ちに解決できる。
したがって「回避可能」だが、**merge tool 無しの素の Tailwind では既定でこの罠がある**。
AI が競合に気づくには computed style を実測する必要があり、build green を信用できない。

条件E にはこの問題が構造的に無い（recipe の 1 フィールドは 1 つの値しか持てない。競合が表現できない）。

---

## Tailwind を弱くしていないか（counter-proof の前提）

- 条件A は Tailwind 4.3.3、theme・dark mode（`dark:` 55 箇所）・component 的な class 定数
  （`BTN` / `BTN_PRIMARY` / `LABEL_CLS` 等）・minify 済み
- T5 は公式推奨の `@source` を使用。safelist も公式機能で救えることを併記した
- T8 は merge tool で緩和できることを併記した
- これらは「Tailwind に不利な条件を作らない」ための counter-proof（CT1-CT4）の一部

---

## T6 — arbitrary value が設計規律を迂回する

曖昧な要求「もう少し緊急に、少しだけ目立つように」を独立 3 セッションへ渡した（T2 と同じ実行）。

| 条件 | arbitrary value | 新規に使った色 |
|---|---|---|
| A-1 | none | red-50, red-200, red-900, red-950 |
| A-2 | none | red-50, red-200, red-900, red-950 |
| A-3 | none（代わりに `!important` 1） | red-50, red-200, red-900 |
| E-1/2/3 | **使用不可**（`RecipeError`） | 0（palette 切替のみ） |

### 判定: `KAS_MISMATCH`（弱）

- 3 セッションとも arbitrary value（`p-[13px]` 等）は使わなかった。**T6 の強い主張は今回は出なかった**
- ただし全 A セッションが **既存パレットに無い red のシェード**（red-50/200/900/950）を導入した。
  Tailwind の red スケールは広いので「新規色」ではあるが「無秩序な新色」ではない
- 条件E は enum 外の値を構造的に拒否するため、色は palette 5 種から選ぶしかない
- 分類は弱い `KAS_MISMATCH`。arbitrary の暴走は再現しなかったが、
  「閉じた語彙を保つ」には Tailwind では外部の lint が要る（E は構造で保証）

counter-proof CT3（arbitrary 禁止 lint）を入れれば A でも閉じた語彙を保てる。
