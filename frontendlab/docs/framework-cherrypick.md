# フレームワークの「いいところ」洗い出しと、sunao への採否

React / Vue / Svelte / Solid / Angular / Qwik / Astro / Lit を見て、**良い ideas を洗い出し**、
この lab の基準で **採る / 条件付き / 捨てる** を判定する。基準は 3 つ:

1. **north-star**: 決定論・出力の予測可能性/軽さ・fail-closed・低 context/低マジック・型付き入力。
2. **個人利用・framework 非依存**: 公開競合しない。build 層に置き、runtime は極小。
3. **EXP の実測事実**: 速度は native で十分（EXP-1/2）／サイズは道具でなく依存で決まる（EXP-3）／
   決定論は既製にある（EXP-1/4）／遅延は総量を減らさない（EXP-3）。

---

## 1. まず結論：収束した勝ち筋（2026、ほぼ全社が合意）

「いいところ取り」の核は、実はもう業界が収束させている。バラバラの機能ではなく、次の 4 つ。

| 収束した idea | 誰が牽引 / 追随 | なぜ良い（north-star 視点） | sunao |
|---|---|---|---|
| **① signals（細粒度リアクティビティ）** | Solid が基準 → Vue ref / Svelte 5 runes / Angular v17 / Preact。React だけ Compiler で代替 | 依存を式単位で追い、**変わった DOM だけ**更新。予測可能・小さい・VDOM 不要 | **保有(粗い)** |
| **② compiler-first / compiler-informed runtime** | Svelte(ほぼ無 runtime) / Vue(patch flags・Vapor) / Solid(JSX→DOM) / React Compiler(自動 memo) | build 時に仕事を移す＝**出力が軽く予測可能**、runtime が薄い。まさに north-star | **保有** |
| **③ 制約が最適化を可能にする** | React(Rules of Hooks) / Svelte(runes の明示) / Solid(component は 1 回だけ実行) | 制約 → 静的解析可能 → コンパイラが自動最適化。**fail-closed と同じ思想** | **保有(fail-closed)** |
| **④ 明示的リアクティブ > 暗黙の魔法** | Svelte runes・Solid signals（明示） vs Vue の Proxy 自動追跡（暗黙） | 明示は決定論・低マジック・AI が追いやすい | **保有(count() 明示)** |

> つまり sunao は既に「収束した 4 つ」の骨格を持っている。**足りないのは①の"細粒度"の質**（今は状態変化で
> サブツリー全再構築）と、各社固有の**ergonomic な良さ**。以下でそこを洗い出す。

出典: [Signals Won the Framework War Except in React (jsmanifest)](https://jsmanifest.com/signals-runes-fine-grained-reactivity) /
[State of Solid.js 2026 (listiak.dev)](https://listiak.dev/blog/the-state-of-solid-js-in-2026-signals-performance-and-growing-influence) /
[SolidJS vs Svelte 5 vs React: Reactivity 2026 (PkgPulse)](https://www.pkgpulse.com/guides/solidjs-vs-svelte-5-vs-react-reactivity-2026)

---

## 2. 各社の固有の良さ（洗い出し）

収束分を除いた、各社の「ここが効く」を正直に。

### React
- **コンポーネント = props→UI の純関数**。単方向データフロー。心的モデルが単純。
- **hooks で状態ロジックを合成**（custom hook）。再利用の単位が関数。
- **JSX = 式ファーストのテンプレート**（テンプレ DSL でなく JS そのもの）。
- **React Compiler（v1, 2025）**: build 時に自動 memo 化。手 memo を消す＝**制約×コンパイラ**の好例。
- Suspense / 並行レンダリング / Server Components（JS を減らす）。

### Vue
- **SFC**: template/script/style を 1 ファイルに（sunao の `.sunao` の元）。
- **compiler が dynamic を印付け（patch flags・static hoisting）→ runtime が静的部を飛ばす**。②の具体形。
- **`v-model`（双方向バインドの糖衣）** と豊富なディレクティブ＝**宣言的 ergonomics**。
- computed / watch。**Vapor Mode（2026）**で VDOM を捨て直接 DOM へ（Solid 化）。
- **scoped styles**。

### Svelte
- **compiler-first の極北**: フレームワーク runtime をほぼ出さず、**命令的 DOM 更新へコンパイル**＝最小 bytes。
- **runes（$state/$derived/$effect）**: signals を言語プリミティブとして明示化。**コンパイラが解析しやすい**。
- 定型が最少。transition / store 内蔵。

### Solid
- **細粒度リアクティビティの基準**。VDOM を diff しない。**変わったセルだけ**が対応 DOM を更新。
- **component は 1 回だけ実行**（再レンダー無し）→ 性能が予測可能。制約③の理想形。
- createSignal / createMemo / createEffect。runtime 小・性能トップ。

### Angular
- **DI（依存注入）** と **TS ファースト・AOT**。大規模・チーム向けに構造化。
- v17+ で **signals** 採用（収束に追随）。個人利用には重い。

### Qwik
- **resumability**: hydration しない。状態を直列化して**クライアントで"再開"**。アプリ規模に依らず起動 O(1)。
- **関数単位の自動コード分割**（compiler が細かく lazy 化）。遅いネットで TTI 4x。

### Astro / Lit / その他
- **Astro: islands / 既定ゼロ JS**。HTML を出し、対話部分だけ hydrate。**bytes に直接効く**。
- **Lit: Web Components + reactive properties**、標準準拠で極小。
- HTMX/Alpine: HTML 属性駆動の最小主義。

出典: [React vs Vue vs Svelte vs Solid 2026 (ResumeLens)](https://www.resumelens.org/blog/react/react-vs-vue-vs-svelte-2026) /
[Svelte 5 & SvelteKit 2026 (Naturaily)](https://naturaily.com/blog/why-svelte-is-next-big-thing-javascript-development)

---

## 3. north-star スコアカード（idea 別の採否判断）

各 idea を 5 性質への寄与・実装コスト・個人利用価値で評価し、sunao への採否を出す。

| idea（出自） | 決定論 | 軽さ | fail-closed | 低マジック | 型付き | 実装コスト | 個人価値 | **採否** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 細粒度更新（Solid/Vapor） | ○ | ◎ | – | ○ | – | 中 | 高 | **採る** |
| compiler が static/dynamic を印付け（Vue patch flags/Svelte） | ◎ | ◎ | – | ○ | – | 中 | 高 | **採る** |
| `$derived`/computed（Svelte/Vue/Solid） | ○ | ○ | – | ○ | – | 低 | 高 | **採る** |
| 既定 static・signals 無しは純 HTML（Astro islands） | ◎ | ◎ | – | ○ | – | 低 | 高 | **採る** |
| `v-model` を糖衣として desugar（Vue） | ◎ | – | ○ | △ | – | 低 | 中 | **条件付き** |
| scoped styles ハッシュ（Vue/Svelte） | ◎ | – | – | ○ | – | 中 | 中 | **条件付き** |
| props/state のスキーマ型付け（Angular TS / Recipe） | ◎ | – | ◎ | ○ | ◎ | 中 | 高 | **採る（P3 次段）** |
| 関数単位 auto lazy（Qwik） | ○ | △ | – | △ | – | 高 | 低 | **捨てる※** |
| resumability（Qwik） | △ | ○ | – | ✗ | – | 高 | 低 | **捨てる** |
| VDOM 差分（React） | ○ | ✗ | – | ○ | – | 中 | 低 | **捨てる** |
| Proxy 自動追跡（Vue reactive） | △ | – | – | ✗ | – | 中 | 低 | **捨てる** |
| DI / AOT の重装（Angular） | ○ | ✗ | – | △ | ○ | 高 | 低 | **捨てる** |
| hooks/custom hook（React） | ○ | – | – | △ | – | 低 | 中 | **見送り** |

※ EXP-3 で「遅延は初期を軽くするが総量は減らない（むしろ増えうる）」と実測済み。個人小規模では auto lazy の複雑さに見合わない。

---

## 4. sunao への「いいところ取り」設計（採る理由つき）

### 採る（north-star と強く整合・コスト見合う）
1. **細粒度更新 ＋ static/dynamic 印付け**（Solid × Vue patch flags）
   今の sunao は状態変化でサブツリー全再構築。コンパイラは既に「どの式が dynamic か」を知っている
   （`{{}}`・`:bind`・`v-if/for`）。だから **dynamic な箇所ごとに effect を張り、静的部は一度だけ生成**へ変える。
   → 更新が最小 DOM に限定され、出力も「静的は静的」と分かって軽くなる。**①の質**を埋める本命。
2. **既定 static（Astro islands）**
   signals を一切使わないコンポーネントは **純 HTML 文字列にコンパイルし runtime を import しない**。
   → 対話しないページは bytes ≈ 0 runtime。EXP-3 の「使った分だけ」を構造で保証。measurable。
3. **`computed()`（Svelte $derived / Vue computed）**
   派生値のプリミティブを足す。安く、宣言性が上がる。決定論・低マジックを保てる。
4. **型付き `.sunao`（P3 次段・Recipe 化）**
   props/state をスキーマ宣言 → コンパイル時に検査（未知 prop・型不一致は fail-closed）。
   → north-star 唯一の欠け「型付き入力」が ○ になる。

### 条件付き（糖衣として、決定論を崩さない範囲で）
5. **`v-model` desugar**: `v-model="x"` → `:value="x()" @input="e=>x.set(e.target.value)"` に**純粋展開**。
   魔法を runtime に持ち込まず compiler の糖衣に留めるなら採る。
6. **scoped styles**: `<style>` を要素にハッシュ属性付与で閉じる。bytes/複雑さと相談。

### 捨てる（north-star か個人利用に反する）
- **VDOM 差分（React）**: 細粒度 signals があれば不要。runtime を重くするだけ。
- **Proxy 自動追跡（Vue reactive）**: 暗黙で追いにくい。sunao の明示 `count()` を貫く。
- **resumability / 関数単位 auto lazy（Qwik）**: 複雑さが個人小規模に見合わず、EXP-3 が遅延の限界を示した。
- **DI・AOT の重装（Angular）**: 個人利用に過剰。

### 見送り（良いが今はいらない）
- **hooks（React）**: setup() 内の関数合成で十分カバーできる。custom hook 相当は後で。

---

## 5. ロードマップ → **v0.2 で全部実装済み**（[sunao.md](sunao.md)）

1. ✅ **静的/動的の分離コンパイル**（細粒度更新）。動的な式を thunk 化し箇所ごとに effect。
   実機で「更新しても `<output>` は同一ノード＝再生成なし」を確認。
2. ✅ **既定 static**（signals 無し → runtime 非 import）。**静的アプリ 352B vs 対話 2,802B = 8x 小**を実測。
3. ✅ **`computed()`** を runtime に追加。
4. ✅ **宣言必須・fail-closed**（`expose` の未宣言参照を CompileError）＝型付き入力の第一歩。
5. ✅ **`v-model` 糖衣 / scoped styles**（最小）。

> 実装の詳細・実測・限界は [sunao.md](sunao.md)。次段は v-for の keyed diff と、expose の「名前」から「型」への格上げ。

> 「いいところ取り」の実体は **収束した 4 つ（signals・compiler-first・制約×最適化・明示）を土台に、
> Solid の細粒度・Vue の patch flags・Astro の islands・Svelte の runes 明示・Recipe の型**を選んで足すこと。
> React の VDOM、Vue の Proxy 魔法、Qwik の重い仕組みは、この lab の基準では**足さない**のが「取捨」。
