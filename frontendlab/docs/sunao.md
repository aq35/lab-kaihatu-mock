# sunao — 個人用途の「Vue 風プラグイン」＋ビルドツール（P3）

方針 [`design-history.md`（プラグイン方針）](design-history.md#方針-個人用途に閉じたプラグイン--reactvuevite-の代替ではなく上下に置く) の P3「Recipe → 決定論出力」を、
**Vue の形（SFC コンパイラ ＋ 極小リアクティブ runtime）**で実装。EXP-1〜4 の結論に沿って
**変換器・bundler は native(esbuild) に任せ**、自作するのは「入力の型・fail-closed・決定論・低 context」だけ。
**v0.2** で [いいところ取り洗い出し](design-history.md#フレームワークのいいところ洗い出しとsunao-への採否) のロードマップを実装。
**v0.3** で [レバレッジ地図](design-history.md#どこを作りまくると見返りが大きいかレバレッジ地図) の最優先（型付き契約・診断・量産ガードレール・合成）を実装した。

```
再現: cd frontendlab && npm run build && npm run check && npm test
開発: npm run dev（保存→自動リロード）/ npm run prerender -- --entry examples/seo/Landing.sunao --out dist/seo/index.html --client examples/seo/landing-main.js
実装: sunao/{runtime,compile,expr,esbuild-plugin}.mjs（本体）/ cli/{build,dev,prerender,check,create,format,doctor,manifest,lsp}.mjs（コマンド）
デモ: examples/app-ui/（対話・合成・カレンダー・並び替えDnD・ルーティング・スロット・FLIPボード）, examples/seo/（SSG→hydrate）, examples/static-ui/（静的）
参照: docs/reference.md（AI 向け・低 context の API 表）
受領書: results/raw/build-app-ui.json
```

## v0.3 で実装した「見返りの大きい所」（レバレッジ地図）

| 所 | 実装 | fail-closed / 実測 |
|---|---|---|
| **① 型付き契約（props）** | `export default { props: { name:'string', count:{type:'number',required:true} } }`。runtime 境界で **未知 prop・型不一致・必須欠落を throw**（精密メッセージ） | 3 種の違反すべてテストで停止確認 |
| **② 診断（エラーが直し方を言う）** | 全 CompileError が **機械可読 diagnostic**（`code` / `loc{line,column}` / コードフレーム(^) / `suggestions[]`）を持つ。未宣言参照は Levenshtein で「もしかして: count？」 | 構造化フィールドをテストで検証（AI が parse して自己修正できる） |
| **③ 量産ガードレール（factory）** | `npm run check`: 全 `*.sunao` を compile-check ＋ 全 `main.js` を build して **決定論(2回sha)・予算** を一括検査。1 つ落ちれば exit 1 | 4 部品 compile / 3 入口 build すべて green |
| **④ コンポーネント合成** | 大文字タグ＝子。`<Greeting name="Alice" :count="n()"/>`。**import 必須（fail-closed）**、props は accessor で渡し reactive。宣言必須は props∪`return{}`∪expose で判定 | 親が 2 つの子を型付き props で描画（e2e テスト green） |

## v0.4 で実装した「並び替え・DnD・ルーティング」

| 課題 | 実装 | 実測・テスト |
|---|---|---|
| **keyed `v-for`**（並び替え・DnD の本体） | `:key` で **キー差分**（再利用・移動・削除）。`createRoot` で各アイテムを独立スコープに置き、再利用時は effect も保持 | **実機: 行をドラッグ移動しても `<li>` は同一ノード・チェックボックス状態も保持**（作り直しでない） |
| **ドラッグ&ドロップ** | 任意 DOM イベント（`@dragstart`/`@dragover`/`@drop`）＋ `$event.preventDefault()`。drop で配列を並び替え | `Sortable.sunao` 実機で DnD 並び替え green |
| **フロントエンドルーティング** | `useRoute()`（hash ベース signal）/ `navigate()` / `matchRoute('/day/:date', path)`。未使用なら tree-shake | `matchRoute` 単体＋**実機カレンダーで URL hash 同期・ブラウザ戻る** green |

> ルーターは **hash ベース**（公開ホストでリロードしても 404 にならない）。使わないアプリには load されない。

## v0.5 で実装した「残りの問題点」

| 問題点 | 実装 | テスト |
|---|---|---|
| **スロット** | 子 `<slot>`（デフォルト内容可）＋ 親 `<Card>…</Card>` の子を `$slot` で渡す（親スコープで評価） | 親の子要素が子の `<slot>` に差し込まれる e2e green |
| **ルートガード / ネスト** | `setRouteGuard((to,from)=>false|'/redirect'|true)` で遷移中止・リダイレクト。`matchRoute` 末尾 `*` で前方一致（ネスト） | ガードの中止/リダイレクト・`*` 前方一致 green |
| **keyed の unmount 破棄** | `createRoot(fn, owner)` ＋ 安定スコープ。v-if 解除や `mount().dispose()` で keyed アイテムの effect も一括破棄 | `createRoot` dispose 後は effect 再実行しない green |
| **ビルド時の契約検査**（コンパイル時 prop の実現可能な部分） | `analyze()` で全 `.sunao` の props 宣言と `<Child/>` 使用を集め、**子に無い prop・必須欠落を `npm run check` で停止**（型そのものは runtime 境界のまま） | analyze 抽出＋不一致検出 green、factory に常設 |

> **正直な非対応**: 式の *値の型* のコンパイル時推論（TS 相当の型システムが要る）と、**遅延ルート**（= `import()`＋esbuild splitting で可能だが専用 API は無し）。

## v0.6 で実装した「通信・時間・CSS・Recipe 統合」

| 領域 | 実装 | テスト |
|---|---|---|
| **通信（Go 並み）** | `resource(fetcher)`（reactive な loading/error/data・refetch）＋`context()`/`go()`（AbortController = Go の context キャンセル）。前の取得は refetch/scope 破棄で abort | resource loading→data→error、Inbox 実機で非同期 5 枚取得 |
| **時間（Go 並み）** | `now(tick)` 実時計 signal・`interval`/`timeout`（scope 破棄で自動停止）・`debounce`/`throttle` | interval 発火/stop・debounce 畳み込み・実機の時計 |
| **CSS をいい感じに** | `sunao/theme`: 閉じた Recipe 語彙 → 実 CSS トークン(oklch, repo compiler と同値)。`recipeStyle(recipe)` で `:style` に流すだけ。`themeCSS` の良い既定 | recipeStyle がトークン生成・実機で palette 切替→配色変化 |
| **Recipe→props コード生成** | `node cli/gen-recipe-vocab.mjs` が schema から `recipe-vocab.mjs`(RECIPE_PROPS/RECIPE_KINDS) を生成。`import from 'sunao/recipe'`。**手コピー無し＝drift 不能** | vocab==schema、kinds=5 |
| **5 カード型** | `OwnerCard` が `kind` enum(OWNER_QUESTION…INFORMATION)で 5 型を描画（役割ごとの強調色） | Inbox 実機で 5 枚＋承認 |

> **Owner Inbox 公開**: https://claude.ai/code/artifact/fc4a364a-caf9-4081-915d-220cdbcd8293
> （5 型カードを非同期取得・Recipe.palette 切替で配色が決定論的に変化・実時計）。これが direction B の
> 「Recipe=見た目 / sunao=振る舞い」の合成そのもの。

## v0.7 で実装した「使いやすさの角・アニメ・低 context リファレンス」

「あなたは使いやすい？難しめデザインできそう？」への回答。**角（footgun）を機械で潰し**、
**難しめデザイン（FLIP アニメ）を 1 プリミティブ**にし、**AI 向けリファレンス**を 1 枚に畳んだ。

| 課題 | 実装 | テスト・実測 |
|---|---|---|
| **① `()` 呼び忘れ警告**（一番効く角） | 値位置に裸で出た識別子が他所で `name()` と呼ばれていれば `SUNAO_CALL_FORGOTTEN` を**非致命警告**（`warningsOf()` / `check.mjs` が ⚠ 表示）。signal は「呼んで読む」ので `{{ count }}` の取り違えを機械が指摘 | 警告の発火/非発火・`warningsOf` を単体 green |
| **① `v-for="(item, i)"`** | index つき反復（`i` は 0 始まり・束縛済み扱い＝未宣言参照にならない） | 生成コードで `(item, i) =>`・index 束縛を確認 |
| **① keyed component** | `<Child :key="x.id" v-for=…/>` を `keyed()` 経路で再利用（部品リストの並び替えも状態保持） | 生成コードで `keyed(` + `component(` を確認 |
| **② FLIP アニメ**（難しめデザイン） | keyed `v-for` に `flip` を付けるだけで **並び替え=FLIP（First-Last-Invert-Play）移動・追加=enter・削除=leave** を WAAPI で。ブラウザのみ（Node では無視＝SSR 安全） | 実機: shuffle で 4 つの移動アニメ・追加で enter・削除で leave が発火 |
| **`<style scoped>` が実際に効く** | `mount()`/`component()` が scoped CSS を **1 度だけ** head へ注入。scope は **Vue 方式の compound**（`.x` → `.x[data-s]`）に修正＝**ルート要素にも効き**他部品へ漏れない | 実機で root 背景・カード・疑似要素すべて適用。compound/疑似/combinator を単体 green |
| **④ 低 context リファレンス** | [`reference.md`](reference.md): 文法・runtime・借用・**footgun 表**・決定論/予算を 1 枚に。AI が最小 context で全 API を掴める | — |

> **Priority Board 公開**: https://claude.ai/code/artifact/e8659c38-a848-48de-87cd-53d1d4ed4f10
> （FLIP 並び替え・追加/削除アニメ・カードクリックで優先度巡回＝色も動く・palette 5 種切替を 1 SFC で）。
> 「難しめデザイン（滑るアニメ・リッチな配色）」も宣言のまま書けることの実証。

## v0.8 で実装した「使いやすさ深掘り・SSR/SEO・開発体験」

「もっと使いやすく？ SEO に使える？」への回答。**呼び忘れの穴を塞ぎ**、**SSG prerender + hydration で SEO を実戦投入可能**にし、**dev server + source map で反復ループを速く**した。

| 課題 | 実装 | テスト・実測 |
|---|---|---|
| **① `()` 警告の穴** | `<script>` を走査し signal/computed/resource/now/useRoute/store/machine の束縛＋props を把握。**一度も呼んでいない裸参照でも**警告（従来は「他所で呼ばれてる時だけ」だった穴を閉じる）。全 14 部品で誤検出 0 | 単体（silent ケース・props）green |
| **② SSR server-mode** | server モードで `now`/`interval`/`timeout`/`resource` が**実タイマーを張らない**＝Node 描画が hang しない（DeployConsole を Node で prerender しても止まらない）・決定論 | prerender(DeployConsole) が hang せず描画 green |
| **② SSG prerender** | `node cli/prerender.mjs --entry x.sunao --out x.html [--client m.js]`。**中身入り HTML**（title/description/canonical/OG＋scoped CSS inline＋`#app` に描画済み）を吐く | Landing を prerender→中身/CSS/meta green |
| **③ hydration** | `hydrate()` が**サーバ HTML を作り直さず** adopt。静的骨格は既存 DOM を再利用し props effect/イベントだけ張り、**動的な島だけ**再構築。裸の非 signal `v-for` を静的化して骨格に含めた | 実機: main/h1/output/feat×4 に SSR 印が残る（adopt）＋カウンタ hydrate green |
| **④ dev server** | `npm run dev`。esbuild watch+serve で**保存→自動リビルド→自動リロード**（/esbuild SSE） | 起動→index/main.js/livereload 配信を確認 |
| **④ source map** | codegen は位置追跡しないが script 本文は逐語保持 → **line-level map** を inline（実行時エラーが .sunao の `<script>` 行へ）。build が sourcemap を出す時だけ付与＝本番の予算に載せない | 実機: setup の throw が `Boom.sunao:5` に対応・単体 green |

> **SEO ページ 公開（SSG→hydrate）**: https://claude.ai/code/artifact/d5d26d6f-9974-498e-ad01-cd9fb6e0fa9a
> 見出し・本文・特徴リストは**初期 HTML に焼かれ**（クローラ可読）、カウンタだけ hydrate で対話が戻る。
> **正直な限界**: source map は line-level（列単位でない）、hydration は骨格 adopt＋動的島の再構築（完全な node 単位でない）。SEO 目的＝初期 HTML に中身、は満たす。

## v0.9 で実装した「残りの大物」（式パーサ堅牢化・エディタ支援）

「残りの大物」＝正規表現の式解析と、エディタ支援。前者は**本式パーサに置換**、後者は**検証可能なスライス**を提供（当時はフル LSP を「エディタ無しで検証できない」と保留した — が **v0.11 でこれを撤回**し、プロトコルを直接叩く形で実 LSP を建てて検証した）。

| 大物 | 実装 | テスト・実測 |
|---|---|---|
| **式パーサの堅牢化** | `collectIdents` を **AST 自由変数解析**に置換（当時は `@babel/parser`＝`@babel/core` の推移依存。**v0.13 で自前 `expr.mjs` に置換し core を依存ゼロ化**）。MemberExpression / ObjectProperty(shorthand/computed) / arrow・分割の仮引数スコープを正しく処理。パース失敗時は文列→regex fallback で非回帰 | **regex の誤収集を修正**: `items.map(x => x.a)` の `x` を ctx 参照と誤検出しない＝**arrow 仮引数の誤・未宣言参照エラーが消える**。単体 green |
| **診断の機械可読エクスポート** | `diagnose(source)`＝throw せず `{diagnostics:[{severity,code,message,line,column,...}]}`（LSP の publishDiagnostics 相当）。`node cli/diagnose.mjs`（`npm run diagnose`）で JSON 出力、error があれば exit 1 | 壊れた SFC→error、`()` 忘れ→warning、正常→0 を単体 green |
| **構文ハイライト** | `editor/sunao.tmLanguage.json` + `language-configuration.json`（VSCode）。template(`{{}}`/`:bind`/`@event`/`v-*`/`flip`) / script(JS) / style(CSS) を色分け。`editor/README.md` に導入手順 | JSON 妥当性を確認（エディタ実機はこの環境で検証不能＝正直に明記） |

> **フル LSP（補完・ホバー・定義ジャンプ）は未実装**。LSP サーバ＋エディタが要り動作検証できないため。
> 土台は提供済み: 診断=`diagnose()`、補完候補=`analyze()`(props)＋`scanSignals()`(signal 束縛)。あとは薄くラップするだけ。

## v0.10 で実装した「パフォーマンス改善（Vue 実測比較つき）＋ correctness 修正」

Vue3 と **同じアプリを実測**（`bench/`・`npm run bench`）して住み分けを数字で確認し、負けていた所を改善した。

**correctness 修正（重要）**: `{{ row.label() }}` のような **per-item signal 読み**を「ctx 非参照＝静的」と誤判定して更新漏れしていた。
→ **「呼び出しを含む式は reactive」** に修正（signal は呼んで読むため）。keyed リスト内の signal 更新が正しく反映されるようになった。

| 改善 | 内容 | 効果（vs Vue3, commit ms） |
|---|---|---|
| **① keyed reconcile 最小移動** | 毎回全ノード再挿入 → 右→左走査で新規・位置ズレだけ移動 | removeFirst vue1.3x→**sunao9.4x**、append 互角→**sunao1.9x** |
| **② 仮想化 `windowed()`** | 可視範囲だけ描画（固定 rowHeight/height） | 10k 件でも実 DOM **23 行**・create **1.3ms**・scroll **0.6ms** |
| **③ 割当軽量化** | signal の subs 集合・effect の children/cleanups を遅延生成 | create10k 115→**96ms**、create1k **互角**に |
| **④ `batch()`（opt-in）** | 複数 set を 1 回の effect に畳む（既定は同期のまま） | グリッチ回避・大量更新の coalesce |

**実測サマリ（最適化後）**: 局所更新（update/select/remove）は **sunao 7〜10x**・追加は sunao 1.9x・**bundle は 11.3x 小**。
10k の全構築(1.8x)・swap(3.1x) はまだ Vue 有利だが、**仮想化で実アプリはこの規模を作らない**ので実害小。受領書は [`bench/README.md`](../bench/README.md)。

> 結論: **「軽くて、大きな画面の一部が素早く動く UI」に最適化**。局所更新・削除・追加・配信サイズで Vue に勝ち、
> 10k 全構築/並び替えは Vue に譲る（＝仮想化で回避）。数字は環境依存・桁で読む。

**可変高の仮想化 `windowedVar()`**（v0.10 追記）: チャット/フィード/コメントのような**行高がバラバラ**なリスト向け。
Fenwick(BIT) で累積オフセットを O(log N)・初期は estimate・描画後に ResizeObserver で実測補正（`vp.attach(el)`）。
実機で 1,000 件・可変高でも実 DOM 数十行・末尾まで到達を確認。
**正直な限界**: estimate ベースなので初期のスクロール位置は近似（実測で数フレームで収束）、`attach` 必須。
これで「巨大リスト」は固定高（`windowed`）・可変高（`windowedVar`）どちらもカバー。残るは swap の LIS 最小化のみ（数千行の全ソートというニッチ・仮想化で回避可能なため保留）。

## v0.11 で実装した「依存ゼロの LSP（エコシステム＝思想）」

「エコシステムとは巨大なコードやコミュニティではなく**思想**」という立場で、**依存ゼロの Language Server** を建てた（`cli/lsp.mjs`・`npm run lsp`）。巨大な依存に頼らず、頭脳は既存の compiler（`diagnose()`/`symbols()`）。

| 機能 | 内容 | 思想 |
|---|---|---|
| **publishDiagnostics** | 編集ごとに error(fail-closed)＋warning(()呼び忘れ) を range/severity つきで | エラーが教える |
| **completion** | 式位置=signal/prop/return（**signal/prop は `name()` を挿入して () 呼び忘れを未然に防ぐ**）・タグ位置=component＋HTML・属性位置=ディレクティブ | 良い既定・footgun を消す |
| **hover** | signal（呼んで読む）/ prop / component / local を説明 | 宣言が語る |

`symbols(source)` を compiler に追加（props/returns/exposed/signals/components を非 throw 抽出＝補完/hover の頭脳）。
**検証**: `tests/lsp.test.mjs` が **stdio プロトコルを直接叩いて**（エディタ不要）initialize/診断/補完/hover を確認。5/5 green。
LSP フレーミングも手書き（Content-Length + JSON-RPC）＝依存ゼロ。

> これで sunao のツール（compile / dev / prerender / diagnose / check / bench / **lsp**）は全部**同じ思想**で一つに繋がる。
> 規模ではなく「統合・決定論・fail-closed・教えるエラー」という **Cargo 的な一貫性**を、依存ゼロで通した。
> 未実装（正直）: 定義ジャンプ/リネーム（土台 `symbols()` はある）・VSCode 拡張の配布・swap の LIS 化。

## v0.12 で実装した「開発者体験（VSCode・SCSS・scaffold・formatter・LSP発展）」

「vscode で開発／DX 向上／LSP 発展／整理／展開しやすく／SCSS／formatter／どう起動するか」への回答。**同じ思想のまま道具を増やした**。

| 要望 | 実装 | 検証 |
|---|---|---|
| **VSCode で開発** | `editor/vscode/`（package.json＋extension.js）。`vscode-languageclient` で `cli/lsp.mjs` に stdio 接続。F5 で起動 | JSON/JS 妥当性・LSP 本体は protocol テスト |
| **LSP 発展** | 定義ジャンプ・アウトライン(documentSymbol) を追加。`symbols()` を signal/prop 分離に修正 | `tests/lsp.test.mjs` 7/7 |
| **展開しやすく** | `npm run new -- apps/foo`（App.sunao/main.js/index.html/README を出力・即 build 可） | 生成→バンドル通過を単体で |
| **SCSS 連携** | `<style lang="scss">`（sass で CSS 化してから scoped。他 lang は fail-closed） | ネスト/変数/& を単体で |
| **formatter** | `npm run fmt`（`format.mjs`・冪等・content 非破壊・template 再インデント・script/style は保持） | 冪等/非破壊/整形後コンパイル可・全 fixtures 整形済み |
| **起動手順/整理** | `GETTING_STARTED.md`（dev/build/new/fmt/prerender/lsp・VSCode 繋ぎ・リポジトリ地図） | — |

依存追加は build 時のみ（`sass`）＋拡張側のみ（`vscode-languageclient`）＝アプリ bundle には一切入らない。
これで **compile / dev / prerender / diagnose / check / bench / lsp / new / fmt** が同じ思想で一続きになった。

## v0.13 で実装した「依存は捨てる（core を第三者依存ゼロに）」

「依存は捨てました」への回答。**式解析を担っていた唯一の core 依存 `@babel/parser` を撤去**し、自前の Pratt パーサ `sunao/expr.mjs`（**import 一切なし**）に置換した。「思想としてのエコシステム」の徹底 — core は自分だけで閉じる。

| 対象 | before | after | 検証 |
|---|---|---|---|
| **式の自由変数解析** | `@babel/parser` の `parseExpression`（top-level static import＝無いと compile.mjs ごと落ちる） | 自前 `expr.mjs`（tokenizer＋Pratt）が **Babel 互換の AST サブセット**を出す。`walkFreeIdents`/`collectBindingNames`/`exprHasCall` は**無改変**で動く | member vs call callee・shorthand/computed key・arrow/分割の仮引数スコープ・optional chaining・テンプレリテラル・文列 `a(); b()` を Babel と一致（単体 25 ケース＋既存 92 テスト green） |
| **フォールバック** | 文列ラップ→regex | 1式→文列(program)→regex（安全網は維持・parse 不能な稀式のみ regex） | 既存の非回帰テスト green |
| **package.json** | `@babel/parser` を devDependency に明示 | 撤去（`@babel/core` 等は transpiler 実験の被験体として残置） | `npm run verify` green |

いま **sunao の core（`compile.mjs` / `runtime.mjs` / `expr.mjs`）は第三者依存ゼロ**。`sass` は `lang="scss"` 時のみ lazy require、`esbuild` はホストのバンドラ（Vite に対する vue と同じ関係）、`vue`/`@vue/compiler-dom` は bench の比較対象、`vscode-languageclient` は拡張側だけ。runtime（ブラウザに出る側）は元から依存ゼロ。

**「文法が増えたら？」への回答**（自前化の唯一の実コスト＝JS 文法追従を自分で持つ、への対策）:

| 対策 | 中身 |
|---|---|
| **壊れ方が安全側** | 未知構文は crash せず regex フォールバック＝「多めに拾う（動的扱い）」に倒れる＝更新漏れ方向には外れない。ビルドは止まらない |
| **文法ドリフト検出ガード** | `@babel/parser` が居る dev では **自前 vs Babel の差分テスト**を実行（実 fixtures 全式＝完全一致／難式＝silent-wrong 検出）。**ズレた瞬間に赤くなる**。core に無ければ skip＝依存ゼロは維持 |
| **明文化＋先回り** | `expr.mjs` 冒頭に対応/非対応文法を列挙。一番来そうな **async アロー/`await`** は先に AST 対応（`@click="async ()=>await save()"` も解析される） |
| **拡張が安い** | 新演算子＝Pratt テーブルに 1 行、新単項＝集合に 1 語。Babel と違いリリース待ち不要 |

実証: 実 examples 116 式は Babel と**完全一致・regex 落ちゼロ**、難式 53 で **silent-wrong 0**（テスト 92→101 green）。

## v0.14 で実装した「テンプレ量産・ストリーミング動画・リポジトリ再構成」

「展開しやすく」を一段進め、`npm run new` を**テンプレ機構**にし、**YouTube 風ストリーミング**まで雛形化した。あわせてディレクトリを **sunao 主役**に再構成（`sunao/` `cli/` `examples/` `templates/` `research/`）。

| 項目 | 実装 | 検証 |
|---|---|---|
| **リポジトリ再構成** | `plugins/sunao→sunao`・CLI を `cli/` に集約・デモを `examples/`（few-shot 兼）・計測実験を `research/` に隔離。全 import/scripts/docs 追随 | verify green・`git mv` で履歴保持・研究実験(exp1)も再配置後に動作確認 |
| **few-shot index** | `examples/README.md`（パターン → 見る例）。drift チェックで**全 .sunao 掲載＋参照先実在**を検証 | 腐らない正例（載せ忘れ・リンク切れは test 赤） |
| **context の載せ方（型）** | AGENTS.md に「reference＋近い正例1〜2＋doctor」の 3 点セットを明記。学習データ非依存を in-context で埋める運用 | — |
| **テンプレ機構** | `node cli/create.mjs <dir> [--template <name>]`。`templates/<name>/` を再帰コピー＋`__APP_NAME__`/`__APP_DIR__` 置換。上書き/`..`/不明テンプレは fail-closed | 各テンプレを**展開→ビルド**で検証 |
| **テンプレ 5 種** | `basic`（カウンタ）・`form`（`v-model`＋派生検証）・`table`（keyed＋computed 並替/絞込）・`dashboard`（`now` 実時計＋KPI）・`video`（YouTube 風） | 5 種すべてバンドル可 |
| **ストリーミング動画** | `video` テンプレ＋`examples/video`: hash ルーティング（一覧⇄視聴）・`<video>` を `onMount` で掴み `effect` で stream 貼り直し・signal 連動のカスタムコントロール。`stream.js`（**依存ゼロ**）が ネイティブHLS / hls.js(CDN・任意) / progressive を選択＝**HLS(adaptive)＋MP4 両対応** | **実機ブラウザテスト**: フィード→視聴の routing・メディアイベント→signal→UI の配線・戻ると unmount |
| **compiler 修正** | `returnNames` が **最も浅い brace 深度の `return {`**（＝setup 自身の返却）を選ぶよう修正。`.map(()=>{ return {...} })` 等のネスト return を top-level と誤認しなくなった（文字列/コメントは潰して深度計測） | 回帰テスト追加。dashboard テンプレで顕在化→修正（92→105 green） |

これで **書く（new でテンプレ）→ 動かす（dev）→ 確かめる（verify）** が、動画ストリーミングのような実アプリまで一続きになった。

## v0.15 で実装した「ヒューリスティックの根治＋ファズで先取り」

「使うとバグが出る」＝**文字列/正規表現/brace 数えの"推測"が未知入力で崩れる**、という傾向への根治。`<script>` の `export default {}` を自前パーサで **AST 化**して解析に切り替えた（パース失敗時は既存ヒューリスティックに fallback＝非回帰）。

| 対象 | before（ヒューリスティック） | after（AST） |
|---|---|---|
| **`returnNames`** | brace 深度スキャンで setup の `return {}` を推定（ネスト return を誤認しうる） | setup の **直下 `return`** を AST で正確に取得。`.map(()=>{ return {...} })` に一切惑わされない |
| **`scanSignals`** | `const x = signal(` の regex（分割代入・順序に弱い） | setup 本体を walk して factory 呼び出し束縛を収集（分割代入も） |
| **`analyze` props** | `props:{}` を brace スキャン＋regex | props 値を AST で読む（型/enum はリテラルのみ＝既存と同義・文字列内カンマ等に強い） |

**共通基盤**: `export default {}` を `parseExpressionString`（v0.13 の自前パーサ）で ObjectExpression として parse。そのため式パーサを **文レベル（for/while/switch/try/throw/function 宣言・for-of/in）まで拡張**した。

**先取り（ファズ）**: `tests/sunao.test.mjs` に**プロパティ/ファズテスト**を 2 段追加。
1. **setup ファズ**: ネスト return・for・switch・try・分割代入を乱択で混ぜた setup を 30+ 本コンパイルし、**返却済みの名前が false な未宣言エラーにならない**ことを検証。dashboard で踏んだ returnNames の穴の形が回帰に入っている。
2. **式ファズ（生成空間で差分ガード）**: メンバ/呼び出し/optional chaining/三項/アロー/オブジェクト/配列/テンプレリテラルを**乱択生成した式を 400 本**、自前パーサと Babel で解析して **used/calls が一致**することを検証（150+ 本比較・`@babel/parser` が居る dev のみ）。＝固定コーパスを超えて「未知の式で自前が Babel とズレないか」を CI で見張る。
3. **テンプレファズ（parseTemplate＋genNode）**: `v-if`/`v-for(:key)`/`:bind`/`@event`/コンポーネント合成/補間/ネストを**乱択生成したテンプレを 80 本**、(1) コンパイルが通る (2) 生成 JS が **esbuild で構文的に有効** (3) **決定論（2 回一致）** を検証。＝テンプレ側の未知の組み合わせで codegen が壊れないかを CI で見張る。

**入口の堅牢化**: `extractBlocks` を、`<script setup>` 等の**属性つき開始タグ**を許し、**未閉じ**（`</template>`/`</script>`/`</style>` 欠落）は専用コード（`SUNAO_*_UNCLOSED`）で fail-closed にした（誤解を招く「no template」エラーを解消）。

（92→109 green）

> 効いた場所の傾向が明確だったので（＝推測ロジック）、**バグ族ごと**を AST で断ち、ファズで再発を止めた。式解析（v0.13）に続き、script 解析も推測から AST へ。

## v0.2 の柱（維持）

① 細粒度更新（thunk→箇所ごと effect・render 1 回・所有権つき破棄） ② 既定 static（非対話は runtime 0, **8x 小**）
③ computed ④ 宣言必須 fail-closed ⑤ v-model 糖衣 / scoped styles（最小）。

## 実例: カレンダーを作って公開した（`examples/app-ui/Calendar.sunao`）

**公開URL**: https://claude.ai/code/artifact/20e0f784-a1fd-4e38-b5c9-002675c9e15e （self-contained HTML に runtime 込みで inline）

月カレンダー（月移動・**今日**・**日クリックで `#/day/:date` の詳細画面へ（ブラウザ戻る対応）**・
**予定の追加/表示**・イベントドット・週末色分け・**keyed セル**・**localStorage 保存**）を sunao で実装。
**実機ブラウザで全操作＋ルーティングが動く**（テスト green）。バンドル **6,553 B / 2,872 B gzip**
（runtime＋ルーター込み）・決定論・予算内。再生成: esbuild + `sunao()` で `calendar-main.js` を bundle し HTML に inline。

**正直な到達点**: これは実用的な「月ビュー＋予定」カレンダー（date-planner 相当）。Google Calendar 級の
週/日ビュー・ドラッグ・繰り返し予定・同期は範囲外（sunao の限界でなく機能量の問題）。

作る過程で **見つけて直した gap**:
- **パーサのバグ**: 属性値中の `>`（arrow `=>` や `a > b`）で開きタグが誤終端 → 引用符内を無視して `>` を探す修正。
- **識別子抽出のバグ**: `$event` が `event` として拾われ、文字列リテラル内（`'Enter'`）も誤検出 → 文字列除去＋
  lookbehind で修正。
- **イベント引数の糖衣**: `@click="pick(c)"` を `($event) => { pick(c); }` に自動 desugar（Vue 互換、`$event` 可）。
- **class マージ**: 静的 `class` と `:class` を結合（Vue 同様）。
→ これらにより **`@click="pick(c)"` / `class="cell" :class="cellClass(c)"` と自然に書ける**ようになった。

## これは何か（2 つ）

### 1. Vue 風プラグイン = コンパイラ ＋ 極小 runtime
- **runtime**（`runtime.mjs`）: `signal` / `effect` / `computed` / `h` / `renderToString` / `mount` / `mountStatic`。
  Vue の reactivity + render の芯。隠れた unref をしない（値が要る所は自分で `count()` を呼ぶ）。
- **compiler**（`compile.mjs`）: SFC(`.sunao`) の `<template>` を **build 時に** render へコンパイル。
  対応: `{{ }}` / `:bind` / `@event`(引数糖衣・`$event`) / `v-if` / `v-for` / `v-model` / class マージ / `<style>`(scoped)。**それ以外の `v-*` は CompileError。**

### 2. ビルドツール = プラグインを native bundler に載せる薄い束ね
- `esbuild-plugin.mjs`: `import 'sunao'` を runtime に解決し、`*.sunao` を onLoad でコンパイル（vite-plugin-vue と同発想）。
- `build.mjs`: esbuild で bundle+minify → **決定論チェック**（2 回ビルドの sha256 一致）→ **予算ゲート**（超過で exit 1）→ **レシート**。

## v0.2 で実装した「いいところ取り」（ロードマップ全部）

| # | idea（出自） | sunao での実装 | 実測・テスト |
|---|---|---|---|
| ① | **細粒度更新**（Solid × Vue patch flags） | 動的な式を **thunk** で出力 → runtime が箇所ごとに effect。render は 1 回だけ。所有権つき effect で消えたサブツリーを破棄 | ブラウザ実機: 更新しても `<output>` は**同一ノード**のまま、値は text の in-place 更新（characterData） |
| ② | **既定 static**（Astro islands） | 動的もイベントも無いコンポーネントは **定数 HTML 文字列**へ。runtime を import しない | **静的アプリ 352B vs 対話アプリ 2,802B = 8.0x raw / 5.0x gzip 小**（reactivity が tree-shake で落ちる） |
| ③ | **computed**（Svelte $derived / Vue） | `computed()` を runtime に追加 | 依存変化で派生値が更新されるテスト green |
| ④ | **宣言必須・fail-closed**（型付き入力の第一歩） | `<script>` に `expose:[...]` があれば、テンプレの未宣言参照（typo 等）を **CompileError** | 未宣言参照で throw、宣言済みは通るテスト green |
| ⑤ | **v-model 糖衣 / scoped styles** | `v-model` → `:value + @input` に**純粋 desugar**（魔法を runtime に持ち込まない）。`<style>` は scope 属性＋`[scope]` 限定 CSS（最小） | desugar 形・scope 限定をテストで確認 |

## 実測（この環境）

| 対象 | raw | gzip | 決定論 |
|---|--:|--:|:--:|
| 対話アプリ（Counter + 細粒度 runtime） | 2,802 B | 1,318 B | ✓ |
| 静的アプリ（Hello + `mountStatic`） | **352 B** | **264 B** | ✓ |

- v0.1（~1.9KB）より対話 runtime は増えた（細粒度 + 所有権/破棄のコード分）。代わりに更新が最小 DOM に限定。
- **②の効果が一番はっきり**: 対話しない画面は runtime を引かず **8x 小**。EXP-3 の「使った分だけ」を構造で保証。

## テスト（`npm test`、74 件すべて green）

reactivity / computed / 決定論（compile・render）/ fail-closed（未知ディレクティブ・空補間・タグ不整合・
未宣言参照・**型付き props 3 種・未 import コンポーネント**）/ render 正当性（v-if・v-for・補間・イベント）/
既定 static（import 無し）/ v-model desugar / scoped styles / **診断の提案**（もしかして）/
**合成 e2e**（親が子を型付き props で描画）/ **factory**（`node cli/check.mjs` exit 0）/
**ブラウザ実機**（クリック→DOM 更新・**要素は再生成されない＝細粒度**）。

## 「AIが好きそうなコンパイラ」の性質

| 性質 | v0.2 の状態 |
|---|---|
| 決定論（同入力→同 hash） | ✓ コンパイル・レンダ・ビルドすべて |
| 出力の予測可能性・軽さ | ✓ 予算ゲートで監視。静的は 8x 小 |
| **fail-closed（未知→エラー）** | ✓ 未知ディレクティブ＋**未宣言参照**（expose） |
| **低マジック / 低 context** | ✓ 式 verbatim・自動 unref 無し・明示 signal・エラーは許可集合を明示 |
| **型付き・宣言的入力** | △→○ 第一歩（expose の宣言必須）。本格的な型検査は次段 |

## 方針との整合（正直に）

[`design-history.md`（プラグイン方針）](design-history.md#方針-個人用途に閉じたプラグイン--reactvuevite-の代替ではなく上下に置く) の「自作 runtime は作らない（公開競合しない）」に、sunao は runtime を持つ点で触れる。区別:
- **公開競合でなく個人利用・実験**。依存はここだけ（root に出さない）。
- runtime は出力に残る唯一の依存 → **極小に保ち budget で監視**。**対話しない画面は 0 runtime**（②）。
- 変換エンジンは native 委譲。自作は契約層（fail-closed・決定論・低 context・宣言）だけ。

## 限界・次（正直に）

- **prop 値の型のコンパイル時推論は非対応**（名前・必須はビルド時 `check` で検査、値の型は runtime 境界）。TS 相当の型システムが要る。
- **遅延ルート**は専用 API なし（`import()`＋esbuild splitting で実現可能）。
- **名前付きスロット**は未対応（デフォルトスロットのみ）。ルーターは hash ベース。
- **`count()` / `prop()` 呼び忘れ**が静かに関数を返す（Solid と同じ footgun）。値位置の関数参照を compiler で警告する案。
- **scoped styles は最小**（descendant 限定）。複雑セレクタの正確な scoping は未対応。
- テンプレ式は正規表現ベースの識別子抽出。将来は本式パーサで検証し fail-closed を厚くする。
