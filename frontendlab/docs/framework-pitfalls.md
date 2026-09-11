# フレームワークの「ダメなところ」洗い出しと、sunao の guardrail

[いいところ取り](framework-cherrypick.md)の裏返し。各社の**失敗・地雷**を洗い出し、
**なぜダメか（north-star 違反 or 個人利用に不利）**を言い、**sunao が踏まないための規則(guardrail)**に変える。
最後に **sunao 自身の今のダメなところ**も正直に書く（この lab の作法）。

基準（ダメの定義）: 決定論を崩す／出力が重い・読めない／runtime で初めて落ちる（not fail-closed）／
魔法で追えない（高マジック・高 context）／個人利用に過剰。

---

## 1. 各社のダメなところ（洗い出し）

### React
- **useEffect の乱用が最大の罠**。派生状態や同期を effect で書く→依存配列ミス・stale closure・二重発火。
  （React 公式が "You Might Not Need an Effect" を出すほど）。→ **runtime の footgun、決定論を崩す**。
- **手動 memo 化（useMemo/useCallback/memo）が既定**。人間が最適化を背負う。Compiler が後で救ったが、
  それは **"最適化を人にやらせる設計が誤りだった"** 証拠。
- **既定で再レンダー伝播**：memo しないと親更新で子まで再実行→**見えない性能崖**。
- **Rules of Hooks = 隠れた制約**。条件付き呼び出しで runtime 崩壊。lint 頼み。
- **JSX は型/typo をコンパイルで守らない**箇所が多い（prop 名ミスが静かに通る）。→ **not fail-closed**。
- **runtime baseline が重い**（react+react-dom ~40KB+）。→ **軽さに反する**。
- hydration mismatch のデバッグ地獄／エコシステムの選択疲れ。

### Vue
- **リアクティビティが魔法**：Proxy 追跡ゆえ**分割代入で reactivity が切れる**、`ref` と `reactive` の混乱、
  `.value` 定型、テンプレの自動 unwrap と JS 側の非 unwrap が**不一致**。→ **高マジック・追えない**。
- **Options/Composition の二系統**の歴史＝分断と移行コスト。
- **テンプレ DSL を覚える必要**、テンプレ式は **runtime で落ちる**、`v-if`+`v-for` の優先順位地雷。→ not fail-closed。
- SFC コンパイラが不透明で「なぜ reactive にならない」の温床。

### Svelte
- **v5 以前が魔法**：`$:` と「代入が更新を起こす」暗黙モデル。`arr.push()` が更新しない等の**直感外の穴**。
  runes で直したが、それは **3→5 の破壊的書き直し＝churn**（フレームワークである代償）。
- コンパイラ任せ＝**runtime 内省が効きにくい**（生成物のデバッグ）。
- コンポーネント跨ぎの reactivity は **store という別概念**が要る。エコシステム小。

### Solid
- **「component は 1 回だけ実行」が心的トラップ**：**props を分割代入すると reactivity が切れる**（最頻出 footgun）、
  早期 return 不可、条件は `<Show>`・ループは `<For>`（`.map` だと keyed 更新にならない）。→ **暗黙の制約が多い**。
- **全部 signal ＝ 読むとき `()` を呼び忘れる**と関数が返る。→ 静かな bug。
- エコシステム小。

### Angular
- **重い**：module・decorator・DI・RxJS の学習曲線。小さいアプリに儀式が過剰。
- **Zone.js の変更検知が魔法**（global を patch）。不透明ゆえ signals へ移行中。
- bundle baseline 大・ビルド遅い（歴史的に）。→ **軽さ・低マジックに反する**。

### Qwik
- **resumability がコードに滲む**：状態を直列化可能に保つ制約、`$()` 境界を至る所に、
  **非直列化な closure を掴めない**。→ **高 context の制約**、個人小規模に過剰。
- 新しく事例・パターンが少ない／lazy 境界のデバッグ。

---

## 2. 横断アンチパターン（本当の教訓）と sunao の guardrail

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

## 3. sunao 自身の「今ダメなところ」（正直に）

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

## 4. まとめ：避けるべき設計判断（この lab の禁止リスト）

1. **Proxy 自動追跡・暗黙代入リアクティビティを入れない**（追えない魔法）。
2. **手動 memo API を作らない**（最適化はコンパイラ側）。
3. **テンプレ/props を runtime で落とさない**（コンパイル時に fail-closed）。
4. **制約を lint / runtime 任せにしない**（コンパイル時に許可集合つきエラー）。
5. **runtime を太らせない**（budget-gate で監視、既定 static を用意）。
6. **フレームワーク化して churn を背負わない**（build 層・framework 非依存・runtime 置換可能）。

> 「いいところ取り」の相棒は「**ダメなところを制度で踏まない**」こと。
> sunao の強みは小ささゆえに**これらを規則として持てる**点にある。大きな framework は互換性ゆえに
> 魔法や重さを捨てられない。個人の小さな道具だからこそ、north-star を妥協せずに保てる。
