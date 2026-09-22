# sunao / frontendlab 設計変遷（design history）

この 1 枚は、sunao を実装する前に凍結した**事前設計ノート**を時系列でまとめたもの。フレームワークの取捨（いいところ／ダメなところ）・レバレッジ地図・方針・Recipe ブリッジ・他言語からの借用まで、「なぜこう作るか」の思考の跡を残す。

> **出荷済みの挙動そのもの**（実装された API・仕様・限界）は [`reference.md`](reference.md)（AI 向け 1 枚）と [`sunao.md`](sunao.md)（実装の変遷と詳細）にある。ここは *設計判断の記録* であって、現在の仕様書ではない。

---


## フレームワークの「いいところ」洗い出しと、sunao への採否

React / Vue / Svelte / Solid / Angular / Qwik / Astro / Lit を見て、**良い ideas を洗い出し**、
この lab の基準で **採る / 条件付き / 捨てる** を判定する。基準は 3 つ:

1. **north-star**: 決定論・出力の予測可能性/軽さ・fail-closed・低 context/低マジック・型付き入力。
2. **個人利用・framework 非依存**: 公開競合しない。build 層に置き、runtime は極小。
3. **EXP の実測事実**: 速度は native で十分（EXP-1/2）／サイズは道具でなく依存で決まる（EXP-3）／
   決定論は既製にある（EXP-1/4）／遅延は総量を減らさない（EXP-3）。

---

### 1. まず結論：収束した勝ち筋（2026、ほぼ全社が合意）

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

### 2. 各社の固有の良さ（洗い出し）

収束分を除いた、各社の「ここが効く」を正直に。

#### React
- **コンポーネント = props→UI の純関数**。単方向データフロー。心的モデルが単純。
- **hooks で状態ロジックを合成**（custom hook）。再利用の単位が関数。
- **JSX = 式ファーストのテンプレート**（テンプレ DSL でなく JS そのもの）。
- **React Compiler（v1, 2025）**: build 時に自動 memo 化。手 memo を消す＝**制約×コンパイラ**の好例。
- Suspense / 並行レンダリング / Server Components（JS を減らす）。

#### Vue
- **SFC**: template/script/style を 1 ファイルに（sunao の `.sunao` の元）。
- **compiler が dynamic を印付け（patch flags・static hoisting）→ runtime が静的部を飛ばす**。②の具体形。
- **`v-model`（双方向バインドの糖衣）** と豊富なディレクティブ＝**宣言的 ergonomics**。
- computed / watch。**Vapor Mode（2026）**で VDOM を捨て直接 DOM へ（Solid 化）。
- **scoped styles**。

#### Svelte
- **compiler-first の極北**: フレームワーク runtime をほぼ出さず、**命令的 DOM 更新へコンパイル**＝最小 bytes。
- **runes（$state/$derived/$effect）**: signals を言語プリミティブとして明示化。**コンパイラが解析しやすい**。
- 定型が最少。transition / store 内蔵。

#### Solid
- **細粒度リアクティビティの基準**。VDOM を diff しない。**変わったセルだけ**が対応 DOM を更新。
- **component は 1 回だけ実行**（再レンダー無し）→ 性能が予測可能。制約③の理想形。
- createSignal / createMemo / createEffect。runtime 小・性能トップ。

#### Angular
- **DI（依存注入）** と **TS ファースト・AOT**。大規模・チーム向けに構造化。
- v17+ で **signals** 採用（収束に追随）。個人利用には重い。

#### Qwik
- **resumability**: hydration しない。状態を直列化して**クライアントで"再開"**。アプリ規模に依らず起動 O(1)。
- **関数単位の自動コード分割**（compiler が細かく lazy 化）。遅いネットで TTI 4x。

#### Astro / Lit / その他
- **Astro: islands / 既定ゼロ JS**。HTML を出し、対話部分だけ hydrate。**bytes に直接効く**。
- **Lit: Web Components + reactive properties**、標準準拠で極小。
- HTMX/Alpine: HTML 属性駆動の最小主義。

出典: [React vs Vue vs Svelte vs Solid 2026 (ResumeLens)](https://www.resumelens.org/blog/react/react-vs-vue-vs-svelte-2026) /
[Svelte 5 & SvelteKit 2026 (Naturaily)](https://naturaily.com/blog/why-svelte-is-next-big-thing-javascript-development)

---

### 3. north-star スコアカード（idea 別の採否判断）

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

### 4. sunao への「いいところ取り」設計（採る理由つき）

#### 採る（north-star と強く整合・コスト見合う）
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

#### 条件付き（糖衣として、決定論を崩さない範囲で）
5. **`v-model` desugar**: `v-model="x"` → `:value="x()" @input="e=>x.set(e.target.value)"` に**純粋展開**。
   魔法を runtime に持ち込まず compiler の糖衣に留めるなら採る。
6. **scoped styles**: `<style>` を要素にハッシュ属性付与で閉じる。bytes/複雑さと相談。

#### 捨てる（north-star か個人利用に反する）
- **VDOM 差分（React）**: 細粒度 signals があれば不要。runtime を重くするだけ。
  - **注（誤読防止）**: これは *sunao の文脈判断* であって「VDOM＝アンチパターン」という普遍的断罪ではない。
    VDOM は命令的 DOM 同期地獄を宣言的 UI に変えた優れた解で、SSR・並行レンダリング（React Fiber）・
    大量差分では今も妥当。sunao が捨てるのは、**compiler が使えて bytes/決定論/予測可能性を重視する**この文脈で
    「再 render＋diff を runtime に積み、手 memo で塞ぐ」運用が north-star に反するから。アンチパターンなのは
    VDOM そのものでなく *compiler があるのに VDOM を runtime に積む* こと。
- **Proxy 自動追跡（Vue reactive）**: 暗黙で追いにくい。sunao の明示 `count()` を貫く。
- **resumability / 関数単位 auto lazy（Qwik）**: 複雑さが個人小規模に見合わず、EXP-3 が遅延の限界を示した。
- **DI・AOT の重装（Angular）**: 個人利用に過剰。

#### 見送り（良いが今はいらない）
- **hooks（React）**: setup() 内の関数合成で十分カバーできる。custom hook 相当は後で。

---

### 5. ロードマップ → **v0.2 で全部実装済み**（[sunao.md](sunao.md)）

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


## フレームワークの「ダメなところ」洗い出しと、sunao の guardrail

[いいところ取り](#フレームワークのいいところ洗い出しとsunao-への採否)の裏返し。各社の**失敗・地雷**を洗い出し、
**なぜダメか（north-star 違反 or 個人利用に不利）**を言い、**sunao が踏まないための規則(guardrail)**に変える。
最後に **sunao 自身の今のダメなところ**も正直に書く（この lab の作法）。

基準（ダメの定義）: 決定論を崩す／出力が重い・読めない／runtime で初めて落ちる（not fail-closed）／
魔法で追えない（高マジック・高 context）／個人利用に過剰。

---

### 1. 各社のダメなところ（洗い出し）

#### React
- **useEffect の乱用が最大の罠**。派生状態や同期を effect で書く→依存配列ミス・stale closure・二重発火。
  （React 公式が "You Might Not Need an Effect" を出すほど）。→ **runtime の footgun、決定論を崩す**。
- **手動 memo 化（useMemo/useCallback/memo）が既定**。人間が最適化を背負う。Compiler が後で救ったが、
  それは **"最適化を人にやらせる設計が誤りだった"** 証拠。
- **既定で再レンダー伝播**：memo しないと親更新で子まで再実行→**見えない性能崖**。
- **Rules of Hooks = 隠れた制約**。条件付き呼び出しで runtime 崩壊。lint 頼み。
- **JSX は型/typo をコンパイルで守らない**箇所が多い（prop 名ミスが静かに通る）。→ **not fail-closed**。
- **runtime baseline が重い**（react+react-dom ~40KB+）。→ **軽さに反する**。
- hydration mismatch のデバッグ地獄／エコシステムの選択疲れ。

#### Vue
- **リアクティビティが魔法**：Proxy 追跡ゆえ**分割代入で reactivity が切れる**、`ref` と `reactive` の混乱、
  `.value` 定型、テンプレの自動 unwrap と JS 側の非 unwrap が**不一致**。→ **高マジック・追えない**。
- **Options/Composition の二系統**の歴史＝分断と移行コスト。
- **テンプレ DSL を覚える必要**、テンプレ式は **runtime で落ちる**、`v-if`+`v-for` の優先順位地雷。→ not fail-closed。
- SFC コンパイラが不透明で「なぜ reactive にならない」の温床。

#### Svelte
- **v5 以前が魔法**：`$:` と「代入が更新を起こす」暗黙モデル。`arr.push()` が更新しない等の**直感外の穴**。
  runes で直したが、それは **3→5 の破壊的書き直し＝churn**（フレームワークである代償）。
- コンパイラ任せ＝**runtime 内省が効きにくい**（生成物のデバッグ）。
- コンポーネント跨ぎの reactivity は **store という別概念**が要る。エコシステム小。

#### Solid
- **「component は 1 回だけ実行」が心的トラップ**：**props を分割代入すると reactivity が切れる**（最頻出 footgun）、
  早期 return 不可、条件は `<Show>`・ループは `<For>`（`.map` だと keyed 更新にならない）。→ **暗黙の制約が多い**。
- **全部 signal ＝ 読むとき `()` を呼び忘れる**と関数が返る。→ 静かな bug。
- エコシステム小。

#### Angular
- **重い**：module・decorator・DI・RxJS の学習曲線。小さいアプリに儀式が過剰。
- **Zone.js の変更検知が魔法**（global を patch）。不透明ゆえ signals へ移行中。
- bundle baseline 大・ビルド遅い（歴史的に）。→ **軽さ・低マジックに反する**。

#### Qwik
- **resumability がコードに滲む**：状態を直列化可能に保つ制約、`$()` 境界を至る所に、
  **非直列化な closure を掴めない**。→ **高 context の制約**、個人小規模に過剰。
- 新しく事例・パターンが少ない／lazy 境界のデバッグ。

---

### 2. 横断アンチパターン（本当の教訓）と sunao の guardrail

各社バラバラに見えて、ダメの根は 6 つ。これを**踏まない規則**にする。

| # | アンチパターン | 出どころ | 破る north-star | **sunao guardrail** |
|---|---|---|---|---|
| A | **追えない魔法リアクティビティ** | Vue Proxy / Svelte `$:` / Angular Zone.js | 決定論・低マジック | **明示 signal を貫く**（`count()`）。Proxy 自動追跡・暗黙代入は入れない |
| B | **最適化を人にやらせる** | React 手 memo | 予測可能性 | **コンパイラが最適化**（静的/動的分離＝roadmap①）。手 memo API を作らない |
| C | **テンプレ/props が runtime で落ちる** | React JSX typo / Vue テンプレ式 | fail-closed | **コンパイル時に検査**。未知ディレクティブは既に停止。次は型付き `.sunao` で prop も |
| D | **隠れた制約（runtime/lint 頼み）** | Rules of Hooks / Solid props 分割 | fail-closed・低 context | **制約はコンパイル時に明示エラー**（許可集合を必ず提示）。lint 頼みにしない |
| E | **重い runtime baseline** | React / Angular | 軽さ | **runtime を極小に保ち budget-gate で監視**。既定 static で 0 runtime も狙う |
| F | **フレームワーク churn / lock-in** | Svelte 3→5 / Vue 2→3 / Angular | 個人利用 | **build 層に置き framework 非依存**。runtime は自前の極小・置換可能に保つ |

補足（EXP との整合）:
- E は EXP-1/4 で「サイズは道具でなく実装量と依存で決まる」と一致 → runtime を小さく書くのが唯一効く。
- Qwik の lazy 濫用は EXP-3 の「遅延は総量を減らさない」で既に否定済み。

---

### 3. sunao 自身の「今ダメなところ」（正直に）

他人の失敗だけ挙げて自分を棚上げしない。現状の弱点と、上の guardrail に沿った対処:

| sunao の弱点 | どの罠に近い | 状態（v0.2） |
|---|---|---|
| ~~状態変化でサブツリー全再構築~~ | React の再レンダー伝播（B/E） | **✅ 解消**: 細粒度更新へ。実機で「更新しても要素は同一ノード」を確認 |
| ~~runtime が 0 でない画面がある~~ | E の軽量版 | **✅ 緩和**: 既定 static で対話しない画面は runtime 0（静的アプリ 8x 小を実測） |
| **`v-for` に key が無い**→ リスト更新でその区間を作り直し | Solid が `<For>` で解いた問題 | ⏳ 残: keyed 差分 or `:key` 必須化（fail-closed）が次段 |
| **値は自分で `count()` を呼ぶ必要** | Solid の `()` 呼び忘れ footgun（A の裏返し） | ⏳ 残: 呼び忘れは静かに関数が出る。値位置の関数参照を compiler で警告する案 |
| **expose は名前レベルの宣言**（型そのものは未検査） | React JSX の prop 無検査（C） | 🔶 第一歩: 未宣言参照は fail-closed。型検査は次段 |
| **テンプレ parser が正規表現ベース** | 端で誤解析しうる（C を自分で作り込む危険） | ⏳ 残: 文法を狭くして回避中。将来は本式パーサで検証 |

---

### 4. まとめ：避けるべき設計判断（この lab の禁止リスト）

1. **Proxy 自動追跡・暗黙代入リアクティビティを入れない**（追えない魔法）。
2. **手動 memo API を作らない**（最適化はコンパイラ側）。
3. **テンプレ/props を runtime で落とさない**（コンパイル時に fail-closed）。
4. **制約を lint / runtime 任せにしない**（コンパイル時に許可集合つきエラー）。
5. **runtime を太らせない**（budget-gate で監視、既定 static を用意）。
6. **フレームワーク化して churn を背負わない**（build 層・framework 非依存・runtime 置換可能）。

> 「いいところ取り」の相棒は「**ダメなところを制度で踏まない**」こと。
> sunao の強みは小ささゆえに**これらを規則として持てる**点にある。大きな framework は互換性ゆえに
> 魔法や重さを捨てられない。個人の小さな道具だからこそ、north-star を妥協せずに保てる。


## どこを作りまくると見返りが大きいか（レバレッジ地図）

判断式: **見返り ＝（north-star への効き × 量産での複利）÷ コスト**。
「作りまくる」前提なので、**量産するほど効きが増す**ものを上に置く。一度作れば終わりの局所改良は下。
EXP-1〜4 の実測が「作っても無駄な場所」も教えてくれている（下段）。

---

### 結論（先に）

見返りが一番大きいのは **「AI が狙い撃ちできる型付き契約」×「直し方まで言う診断」** の二点セット。
理由: この lab の目的は「AIが好きそうなコンパイラ」＝ **AI が大量に UI を生成・改修しても安全**であること。
量産すると「間違いの総量」も増える。だから価値が出るのは機能の数ではなく、
**間違いを build 時に・原因つきで・直し方つきで止める層**。ここは作るほど複利で効く。

---

### レバレッジ順位

#### ◎1. 型付き契約（typed `.sunao`）— north-star 唯一の欠けを埋める“土台”
- **今**: `expose` は名前レベル。型そのものは未検査（sunao.md 参照）。
- **作ると**: props/state/events を**型つきで宣言**し、コンパイル時に検査（未知・型不一致は fail-closed）。
- **なぜ複利**: 量産する全コンポーネントがこの契約に乗る。AI は契約を読んで書き、外したら build が赤。
  **"volume を risk でなく safe output に変える"** 変換器。repo の Recipe/条件 E/F 思想の直系。
- コスト: 中（スキーマ言語＋検査）。**最優先**。

#### ◎2. 診断＝コンパイラの"対話面"（エラーが直し方を言う）
- **今**: CompileError は原因と許可集合を出す（良い出発点）。
- **作ると**: 構造化エラー（位置・該当コード片・許可集合・**修正候補**）を全エラーに。
- **なぜ複利**: 量産＝ミスも量産。良い診断は **1 ミス＝1 回の自己修正**で済ませる。
  AI にとって**エラー文がそのまま仕様書**。ここは作るほど「AI が自分で直せる率」が上がる。
- コスト: 低〜中。**最優先（1 と対で効く）**。

#### ◎3. 量産ガードレール（factory）＝全部品を自動検査
- **作ると**: 新コンポーネントごとに **決定論(hash)・予算(bytes)・契約・fail-closed** を CI で自動チェック。
  P1 予算ゲート・P2 レシートを「1 回」でなく「全部品に常設」へ。
- **なぜ複利**: 「作りまくる」の安全装置そのもの。ガードが無いと量産＝品質崩壊。
  **量産を前提にするなら、ここは作るほど事故を減らす**。
- コスト: 低（既存 P1/P2 を束ねるだけ）。**早く効く**。

#### ○4. コンポーネント合成（typed props 受け渡し）— “実アプリ”の解錠
- **今**: 単一コンポーネント。
- **作ると**: `<Child :x="..."/>` の入れ子と **型つき props 伝播**。
- **なぜ複利**: これが無いと「作りまくる」がトイの域を出ない。かつ **1 の型契約が本当に効くのは
  props が部品間を流れるとき**。1 と一緒に設計すると相乗。
- コスト: 中。1 の直後に。

#### △5. 局所の完成度（keyed diff / scoped styles / ディレクティブ追加）
- v-for の keyed diff、scoped の正確化、directive 追加。**必要になったら**。
- **複利は小さい**（部品数に比例せず、使う所だけ）。作り込みは需要が出てから。

---

### 作っても見返りが小さい（EXP が実証済み）

- **自作 transpiler / bundler / minifier** … native が 1〜2 桁速く決定論的（EXP-1/4）。**ほぼ 0 の見返り**。
- **速度最適化** … native で十分（EXP-1/2）。体感差は出ない。
- **遅延読込の作り込み** … 総量は減らない（EXP-3）。初期表示の所だけで十分。
- **React/Vue と張り合う機能網羅** … 方針に反する（公開競合しない）。量産しても個人利用の価値に寄らない。
- **VDOM・Proxy 自動追跡** … pitfalls で捨てた魔法。作るほど north-star から遠ざかる。

---

### 一言でいうと

> **「機能を増やす」より「AI が外さない壁（型契約）と、外したとき直せる診断、そして全部品を自動で測るガードレール」を作りまくる。**
> 量産の価値は、速い部品でも多機能でもなく、**大量に作っても壊れない・直せる**ことから出る。
> これは同時に north-star（決定論・fail-closed・低 context・型付き）をそのまま厚くする方向。

### 次の一手 → **sunao v0.3 で実装済み**（[sunao.md](sunao.md)）
1. ✅ **型付き props（契約, fail-closed）**: 未知 prop・型不一致・必須欠落を throw（精密メッセージ）。
2. ✅ **診断**: 未宣言参照を「もしかして: X？」提案つきで停止。
3. ✅ **factory** `npm run check`: 全部品 compile ＋ 全入口 build（決定論・予算）を一括、落ちれば exit 1。
4. ✅ **コンポーネント合成（typed props）**: 大文字タグ＝子、import 必須、props は reactive accessor。

> 残り: prop の**コンパイル時型推論**（今は runtime 境界）／スロット／v-for keyed diff。次に見返りが大きいのは
> 「診断のさらなる構造化（位置・コード片）」と「Recipe schema との接続（repo 条件 E/F）」。


## 向かうべき道（sunao / frontendlab の direction）

これまでの積み上げ（EXP-1〜4・方針・sunao v0.3・いいところ/ダメところ洗い出し・レバレッジ地図）を
1 本の道に束ねる。結論を先に置く。

### 目的地（true north を一言で）

> **AI が「宣言的・型付きの契約」だけを書けば、compiler が「小さい・決定論的・壊れない」出力を保証する。
> 人はレシートで見張るだけでよい。**

これは repo の当初の目的（別セッションの AI が Owner Control Center の UI を安全に創造・改修する）と、
north-star（AIが好きそうなコンパイラ）を、同じ 1 点に重ねたもの。sunao はその toolchain 実装。

### 現在地（積み上げは、もうそこを向いている）

- **EXP の事実**: 軽さは依存の判断で決まる／速さは native で十分／決定論は既製にある／遅延は総量を減らさない。
  → 作るべきは「速い変換器」でなく「AI が外さない契約と、外したら止める門番」。
- **方針**: 公開 framework も自作変換器も作らない。**契約層＋fail-closed＋レシート**を作る。
- **sunao v0.3**: signals(細粒度)・既定static(8x小)・computed・**型付き props(fail-closed)**・**診断(もしかして)**・
  **factory(check)**・**合成**。north-star の性質（決定論・軽さ・fail-closed・低マジック・型付き）が一通り立った。

**残っているのは「機能」ではなく「AI が一人で回せるループ」を閉じること。**

### 道（フェーズ）— 見返り順

#### A. 契約と診断を厚くする（AI 対面の“面”）← 最優先の継続
compiler のエラーは AI のフィードバックループそのもの。ここを厚くするほど AI の自己修正率が上がる。
- ✅ **構造化診断**（実装済み, v0.3.1）: 機械可読 `diagnostic`（code・loc・コードフレーム・候補）。
- **契約＝単一の真実**: コンポーネントの宣言（props/state/events）だけ読めば AI が書ける **低 context** 入口。
- prop 型検査を可能な所は **コンパイル時**へ寄せる（今は runtime 境界）。

> 進捗（v0.4）: 「並び替え・DnD（keyed v-for）」「詳細画面のフロントエンドルーティング（hash ルーター）」も実装済み。
> [sunao.md](sunao.md) 参照。残る壁は「コンパイル時 prop 型」「スロット」「ネスト/ガード付きルート」。

#### B. repo の Recipe（条件 E/F）と接続する ← “なぜ存在するか”の橋 ／ **着手済み: [Recipe ブリッジ節（後述）](#recipe-ブリッジ--sunao-と-repo-の条件-ef-をつなぐ)**
sunao の **型付き `.sunao`** と、KAS の **PresentationRecipe → 決定論的 HTML/CSS（条件 E/F）** は、
*同じ思想の二層*（toolchain 層と UI 生成言語層）。ここを繋ぐと sunao は「トイ」から
**repo の中心命題の toolchain 実装**になる。＝これまでの全実装が複利になる。
- **実装済み**: sunao props に **閉じた語彙(enum)** を追加（Recipe と同じ fail-closed）。`OwnerCard.sunao` が
  Recipe を閉じた語彙 props で受けて対話カードを描画。テストが **repo schema との語彙一致（drift）を機械検査**。
- 次段: Recipe→sunao props のコード生成 / `compile()` 出力 × sunao hydration / 5 カード型へ拡大。

#### C. AI ループを閉じる ← 目的地の完成形
```
AI が一度読む spec（低 context の契約リファレンス＋fail-closed 文法）
  → AI が .sunao を生成/改修
    → factory(check) が門番: 決定論・予算・fail-closed・契約 を機械検査
      → レシート(P2) が before/after を bytes/hash で提示
        → Owner が承認
```
これが揃うと「AIが好きそうなコンパイラ」が実体になる。**AI が好むのは、静かに壊せず・精密な指摘が返るから。**

#### D. 正しさの磨き（需要が出たら） ← 後回しでよい
v-for の keyed diff・スロット・複雑 scoped。実アプリが要求してから。複利は小さい（使う所だけ）。

### 分岐点（戦略の選択）と推奨

この道は 3 つの「目的地の色」を持ちうる。排他ではないが、次に作る物の重心が変わる:

| 色 | 何に寄せるか | 得るもの / 失うもの |
|---|---|---|
| (a) 個人の道具 | 自分が使う UI を速く安全に | 手軽。ただし repo の命題から切れて“趣味”に留まる |
| **(b) KAS Recipe(条件E/F)の toolchain 層** | AI が Owner UI を安全に作る、を実装 | **積み上げが複利。repo の中心に接続。** 設計の合意が要る |
| (c) 研究アーティファクト | 「AI 向け compiler の性質」を測って示す | 論としては綺麗。実利は薄い |

**推奨は (b)。** 理由: EXP も方針も sunao も、すでに「AI が UI を安全に作る」に向いている。
(b) に寄せれば、これまで作った契約・診断・factory・合成・レシートが **repo の命題の上で複利になる**。
個人利用の“規模”（root に依存を出さない・小さく保つ）はそのまま維持できる。

### 道を外れないためのガードレール（禁止リスト再掲）

- **compiler があるのに VDOM を runtime に積まない**（VDOM 自体の否定ではない。[cherry-pick 注](#フレームワークのいいところ洗い出しとsunao-への採否)）。
- Proxy 自動追跡・暗黙代入の魔法を入れない（明示 signal）。
- 自作 transpiler / minifier を作らない（native 委譲。EXP-1/4）。
- 公開 framework 化・runtime 依存追加をしない（方針）。
- **すべて before/after を実測**し、仮説は先に凍結、桁で語る（lab の作法）。

### 最初の一歩（この道の入口）

1. **構造化診断**（機械可読 JSON エラー: code・位置・候補）— A の土台。AI ループの前提。
2. **契約リファレンス**（AI が一度読めば `.sunao` を書ける低 context spec）を書く。
3. **Recipe(条件E/F) 対応表**を作り、接続点を 1 つ試作（B の橋を 1 本架ける）。

> 一言で: **「もっと機能」ではなく「AI が一人で安全に回せるループ」を閉じにいく。**
> その最短が、診断を機械可読にし、契約を単一の真実にし、repo の Recipe に橋を架けること。


## 方針: 個人用途に閉じたプラグイン — React/Vue/Vite の「代替」ではなく上下に置く

EXP-1〜4 の実測から、個人で持つプラグインの方針を決める。これは**公開フレームワークを作る話ではない**。
自分（と、この repo で走る別セッションの AI）が使う道具を、測定に基づいて絞り込む話。

### 実測が意思決定に与えた 4 点（根拠は EXP-1〜4）

| 分かったこと | 桁 | 方針への含意 |
|---|---|---|
| 速度は transpiler で 1〜2 桁動く | 61x (EXP-1) | native(oxc/swc/esbuild) なら**どれでも十分速い**。速度で選ぶ意味は薄い |
| 呼び出し形態でも桁が動く | 16x (EXP-2) | 単発 transform か束ね bundle かは**形態の問題**。道具の優劣ではない |
| 出力サイズは transpiler ではほぼ動かない | raw 1.6x / minify 1.05x (EXP-1/4) | **どの道具を選んでも軽さは変わらない**。ここで悩まない |
| サイズを 2〜3 桁動かすのは依存の判断だけ | 753x (EXP-3) | **軽さの唯一のレバーは「依存を足すか/分割か/遅延か」** |
| 決定論は全道具・全段で保たれた | — | 「決定論」は既製にある。前提にできる |

**結論の芯**: フロントの「軽さ・速さ」を左右するのは transpiler の選択ではなく、**依存の判断**。
だから個人で書く価値があるプラグインは「速い変換器」ではなく、**依存の判断を機械で効かせる小さな build ステップ**。

### 立場 — React/Vue/Vite を置き換えない

世界の潮流は compiler-first（React Compiler / Svelte runes / Vue Vapor）と unplugin（1 回書いて
全 bundler で動く）で、しかも**サイズは道具で変わらない**（EXP-4）。この状況で自作フレームワークを
公開して競う理由は無い。サプライチェーンの心配も増えるだけ。よって:

- **React/Vue/Vite はそのまま使う。** UI runtime / HMR / エコシステムは彼らが強い。
- 自作プラグインは彼らの**下（build ステップ = esbuild/rollup/unplugin プラグイン API）**か、
  **上（宣言的入力 → 決定論出力の compiler）**に置く。framework の寿命に縛られない層だから長寿命。
- **runtime 依存を足すプラグインは書かない。** 足すのは build 時だけに効く、出力に残らないもの。

### 作る — 個人用途の 3 プラグイン形（すべて framework 非依存・build 層）

#### P1. 依存予算ゲート（fail-closed）— EXP-3 の方法をそのまま道具化
- entry ごとに「初期 bytes / gzip」を測り、**閾値を超えたら build を止める**（unknown/超過→エラー）。
- 梯子「足さない > 分割 > 遅延」を破った瞬間（例: 誤って `import _ from 'lodash'` = 753x）に気づける。
- 実装: esbuild `metafile` or `onEnd` で出力を計量 → 受領書 + 予算比較。既に `measure.mjs` に核がある。
- **AI 向けの意味**: AI が依存を足す判断を、prose のレビューでなく **bytes の fail-closed** で縛れる。

#### P2. 決定論レシート — provenance を出力に添える
- build のたびに raw/gzip/**sha256**・道具バージョン・Node を受領書に落とす（`measure.mjs` と同形式）。
- 同入力 → 同 hash を CI で検査（EXP-1/4 で全道具が決定論的と確認済みなので、破れたら回帰）。
- **AI 向けの意味**: 「同じ指示 → 同じ出力」を hash で保証。AI の変更の before/after を桁で見せる土台。

#### P3. Recipe → 決定論出力の compiler（north-star の到達点）— repo の条件 E/F と接続 ／ **試作済み: [sunao](sunao.md)**
- この repo は既に上位層で「型付き PresentationRecipe → 決定論的 HTML/CSS（fail-closed・低 context）」を
  実験している（root README の条件 E/F）。frontendlab はその**汎用ツールチェーン版の土台**を測った。
- P3 は両者を繋ぐ: **宣言的入力（Recipe 的）→ 既製 native transpiler で決定論的に出力**する薄い層。
  変換エンジンは自作しない（EXP で native が十分速い・決定論的と確認済み）。自作するのは
  **入力の型付けと fail-closed と低 context の契約**だけ。
- **試作 = sunao**: Vue 風 SFC(`.sunao`) を esbuild プラグインで build 時コンパイル ＋ 極小 runtime。
  アプリ一式 ~1KB gzip・決定論的・未知ディレクティブは fail-closed・実機ブラウザで動作確認済み。
  詳細と「自作 runtime を持つことの方針整合」は [sunao.md](sunao.md)。次段は `.sunao` の型付け（Recipe 化）。

### 受け入れ基準 = 「AIが好きそうなコンパイラ」の性質（north-star）

個人プラグインは、次を満たすものだけ採る。EXP でどれが既製にあるか分かったので、
**足りない 3 つ（下段）を自作の焦点にする**:

| 性質 | 既製にあるか | 誰が担うか |
|---|---|---|
| 決定論（同入力→同 hash） | ✓ ある (EXP-1/4) | 既製 transpiler。P2 が検査 |
| 出力の予測可能性・軽さ | ✓ ある (EXP-1/4) | 既製。P1 が予算で守る |
| **fail-closed（未知/超過→エラー）** | ✗ 無い | **自作 P1/P3** |
| **型付き・宣言的入力（Recipe 的）** | ✗ 無い | **自作 P3** |
| **低 context（少ない前提で正しく使える）** | ✗ 無い | **自作 P3** |

### 作らないもの（非目標）

- **公開フレームワーク / React・Vue の代替 runtime。** 潮流と実測（サイズは道具で変わらない）に反する。
- **自作の transpiler / minifier。** native が 1〜2 桁速く決定論的（EXP-1/4）。車輪の再発明。
- **runtime 依存を増やすプラグイン。** 梯子「足さない」に反する。build 時だけに効くものに限る。
- **framework バージョンに固定される runtime プラグイン。** 寿命が短い。build 層に置く。

### 次の一歩（この方針の最初の実装）

1. **P1 依存予算ゲート**を最小実装（esbuild metafile → 予算 JSON と比較 → 超過で exit 1）。
   EXP-3 の計量ロジックを再利用でき、効果（753x の事故を止める）が一番はっきり見える。
2. P2 は `measure.mjs` を build フックから呼ぶだけで芽がある。
3. P3 は repo の Recipe（条件 E/F）と接続する設計 doc を先に凍結してから。


## Recipe ブリッジ — sunao と repo の条件 E/F をつなぐ

[向かうべき道の節（direction, 前述）](#向かうべき道sunao--frontendlab-の-direction) の **B**。sunao（汎用ツールチェーン層）と、repo 本体の
**PresentationRecipe → 決定論的 HTML/CSS を生成する Semantic UI Compiler（条件 E/F）**を接続する。
両者は *同じ思想の二層*であることを、実コードと機械検査で示す。

```
repo 側: contracts/presentation-recipe.schema.json（閉じた語彙の Recipe）
        experiments/e-compiler/compiler.mjs（compile(cards, recipe) -> {html, css, recipeHash}）
sunao 側: sunao/（型付き props・enum・決定論・fail-closed）
接続の実証: examples/app-ui/OwnerCard.sunao（Recipe を閉じた語彙 props で受ける対話カード）
           tests: OwnerCard の語彙 == repo schema（drift 検査）
```

### 同じ 4 性質を二層で持つ

| north-star 性質 | 条件 E/F（Recipe + Semantic UI Compiler） | sunao |
|---|---|---|
| **閉じた語彙 / fail-closed** | Recipe は enum のみ・`additionalProperties:false`、VOCAB 外は fail-loud | **props の `enum`**（今回追加）＋ 未知 prop・未宣言参照を fail-closed |
| **決定論** | `compile(cards,recipe)` は同入力→同 bytes（`recipeHash`） | コンパイル・レンダ・ビルドすべて決定論（2 回 sha 一致） |
| **低 context** | AI が書いてよいのは Recipe だけ（class も CSS も書かない） | AI が書くのは `.sunao` の宣言だけ（契約＝単一の真実） |
| **型付き・宣言的入力** | Recipe schema（JSON Schema） | 型付き props（type/required/enum）＋ビルド時契約検査 |

→ **sunao は条件 E/F の思想を toolchain 層で持つ実装**。これまでの全機能（診断・factory・合成・keyed・router）が
repo の中心命題「AI が UI を安全に作る」の上で意味を持つ。

### どう合成するか（役割分担）

- **Recipe コンパイラ = 見た目の契約**。閉じた語彙から決定論的に HTML/CSS（palette/density/shape…）を生成。**振る舞いは持たない**。
- **sunao = 振る舞い**。signal/effect で状態、`@event` で操作、router で画面遷移、keyed で並び替え。
- **合わせると Owner Control Center** になる: AI が Recipe を宣言 → 見た目が決定論的に決まり → sunao が承認/却下・詳細遷移などの操作を足す。

### 実証（今回作ったもの）

1. **sunao props に `enum`（閉じた語彙）** を追加。Recipe と同じく **enum 外は fail-closed**。
2. **`OwnerCard.sunao`**: PresentationRecipe の部分（`palette`/`density`/`cardShape` を閉じた語彙 props）＋
   カードのデータ（title/effect/scope/risk）を受け、**承認/却下の操作つきカード**を描画。
   `OwnerCardDemo.sunao` は Recipe.palette を切り替えると見た目が決定論的に変わる様子を見せる。
3. **drift 検査（機械）**: テストが `contracts/presentation-recipe.schema.json` を読み、OwnerCard の
   `palette/density/cardShape` の語彙が **repo schema と 1:1 一致**することを検査。語彙がずれたら CI が赤くなる。
   → prose の「対応しています」ではなく、**ずれない接続**を制度にした。

### 正直な線引き

- sunao は **Semantic UI Compiler の CSS 生成そのものは再実装していない**。Recipe の *閉じた語彙＋fail-closed* の
  思想を props に取り込み、**振る舞い層**を足した、という接続。
- より密な統合（repo の `compile(cards,recipe)` の `{html,css}` を sunao の既定 static 土台にして、
  sunao が対話だけ足す「islands 的 hydration」）は次段。Recipe schema から sunao props を自動生成するのも候補。

### 次 → **v0.6 で 3 つとも着手**

1. ✅ **Recipe → props コード生成**: `cli/gen-recipe-vocab.mjs` が両 schema から `recipe-vocab.mjs`
   （`RECIPE_PROPS`/`RECIPE_KINDS`）を生成。OwnerCard は `import from 'sunao/recipe'`＝**単一の真実・drift 不能**。
2. 🔶 **見た目の統合（CSS トークン）**: `compile()` の DOM 再利用 hydration までは行かず、Recipe compiler と
   **同値の PALETTE(oklch) を `sunao/theme` に持ち**、`recipeStyle(recipe)` で決定論的に配色。見た目は Recipe 由来・対話は sunao。
3. ✅ **5 カード型**: `OwnerCard` が `kind` enum で 5 型（OWNER_QUESTION…INFORMATION）を描画。
   → [Owner Inbox](https://claude.ai/code/artifact/fc4a364a-caf9-4081-915d-220cdbcd8293) で 5 型＋非同期取得＋palette 切替を公開。

> 残る密統合（repo の `compile()` が吐く HTML/CSS を sunao が hydrate して DOM を再利用）は次段。今は
> *語彙と配色を同値に保つ*ところまで（drift 検査つき）。


## 他言語・フレームワークからの借用（実装済み）

JS の UI フレームワーク（[cherry-pick](#フレームワークのいいところ洗い出しとsunao-への採否)）と Go（context/ticker/resource）に続き、
**他の言語・フレームワークの良さ**を sunao の north-star（宣言的・fail-closed・決定論・小さい）に寄せて再現した。
すべて runtime プリミティブ（`import from 'sunao'`、使わなければ tree-shake）。テスト 40/40 green。

| 借用元 | 良さ | sunao API | fail-closed / 決定論 |
|---|---|---|---|
| **XState / statechart** | 宣言した状態・遷移だけ＝不正状態が作れない | `machine({initial, states:{s:{on:{E:'t'}}}})` → `m()` / `m.send(E)` / `m.can(E)` / `m.matches(s)` | ✓ 宣言外イベント・遷移先は throw |
| **Elm / Redux（MUV）** | 純 update・runtime 例外なし・タイムトラベル | `store(init, update)` → `s()` / `s.dispatch(msg)` / `s.undo()` / `s.redo()` / `s.history()` | ✓ update は純関数、履歴で決定論的に巻戻し |
| **Zod / Elm decoder** | 外部データを宣言スキーマで検証 | `decode({id:'number', tags:['array','string']}, json)` | ✓ 不正は **path つき**で throw |
| **Rust の match** | 網羅しないとコンパイルエラー | `match(kind, { A:()=>…, B:…, _:… })` | ✓ `_` 無しで未対応値は throw |
| **Immer** | mutable 記法で immutable 更新 | `produce(base, d => { d.x = 1 })` → 新オブジェクト | 元を壊さない |
| **Erlang "let it crash" / React error boundary** | 子の失敗で fallback・復帰 | `boundary(() => risky(), e => fallbackVnode)` | 同期描画例外を捕捉 |
| **SwiftUI environment / React context** | prop drilling を消す | `provide(key, value)` / `inject(key, default)`（setup 内） | 同期レンダ木に沿って親→子へ |
| **SWR / React Query** | キャッシュ + stale-while-revalidate | `resource(fetcher, { key, swr:true })` | キャッシュ即出し＋裏で再取得 |

### なぜこの選択か（north-star）

一番効くのは **状態機械（machine）と ストア（store）**。どちらも
**「宣言した状態・遷移・メッセージしか許さない」→ AI が UI ロジックを書いても不正状態に落ちない**。
sunao の「型契約（props）」を *振る舞い* まで広げた形で、fail-closed・決定論・低 context の直系。
`decode` は通信（`resource`）の入口を fail-closed にし、`match` は enum/kind を網羅で守る。
`provide/inject`・`produce`・`boundary` は実務の接着剤・安全網。

### ショーケース（全部を 1 アプリに）

**Deploy Console** — 公開: https://claude.ai/code/artifact/bc19a414-97f2-46b3-a600-c523feb4a72f

`machine`(デプロイ状態機械)＋`store`+`produce`(操作ログ・時間旅行)＋`resource`+`decode`(最新ビルドを非同期取得＆検証)＋
`provide/inject`(状態を子バッジへ prop 無しで)＋`match`(状態表示)＋`now`(経過秒)＋Recipe テーマ(palette 切替)を 1 つに。
実機テスト green（デプロイ→終端遷移・ログ undo・context バッジ・resource 取得）。runtime 込み ~6.5KB gzip。

### 使用例（組み合わせ）

```js
// 状態機械で承認フロー、store で履歴、decode で受信データ検証
const flow = machine({ initial:'pending', states:{
  pending:{ on:{ APPROVE:'approved', REJECT:'rejected' } },
  approved:{ on:{} }, rejected:{ on:{} },
}});
const user = resource((sig)=>fetch('/me',{signal:sig}).then(r=>r.json()).then(j=>decode({id:'number',name:'string'}, j)), { key:'me', swr:true });
```

### 見送り（方針・実測に反する）

- **HTMX / Phoenix LiveView / Hotwire**（サーバ駆動 HTML）… compiler-first・個人利用の方針と逆。
- **RxJS の巨大 observable**… signals が軽い代替、既にある。
- **Angular DI の重装 / Tailwind**… [pitfalls](#フレームワークのダメなところ洗い出しとsunao-の-guardrail) で棄却済み。

### 限界（正直に）

- `boundary` は**同期描画の例外のみ**捕捉（effect 内の非同期例外は別途 try/catch）。
- `provide/inject` は**同期レンダ木**に沿う（setup 内で使う。後から呼ぶと文脈が外れる）。
- `machine`/`store` はガード/並列状態・ミドルウェアは未実装（最小）。`produce` は structuredClone ベース（関数等は不可）。
