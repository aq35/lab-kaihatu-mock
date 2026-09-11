# sunao リファレンス（AI 向け・低 context）

1 ファイルで完結する API 表。**宣言的・fail-closed・決定論・小さい**。
迷ったら「宣言しろ、さもなくば build で止まる」。未知の書き方は静かに動かず **コンパイルエラー**になる。

---

## SFC（`.sunao`）

```
<template> … </template>   ← 必須。1 つ。
<script>   export default { … } </script>   ← 対話コンポーネントは必須。静的なら省略可。
<style>    …scoped… </style>   ← 任意。この部品だけに効く（他へ漏れない）。
```

`<script>` の形（**この形以外は build で止まる**）:

```js
export default {
  name: 'Thing',            // 任意（契約検査の識別に使う）
  props: {                  // 任意。宣言した prop だけ受け取れる（未知 prop は fail-closed）
    title: { type: 'string', required: true },
    palette: { enum: ['calm', 'editorial'] },   // 閉じた語彙。範囲外は throw
  },
  setup(props) {            // 1 回だけ実行。signal などを作って return
    const n = signal(0);
    return { n };           // ← template から参照できるのは「return したもの ∪ props」だけ
  },
};
```

**宣言必須（fail-closed）**: template が参照する識別子は `props` / `setup の return` / `expose:[...]` の
いずれかに無いと `SUNAO_UNDECLARED_REF`（typo は「もしかして: …？」提案つきで build で止まる）。

---

## テンプレート文法（これで全部）

| 書き方 | 意味 | 備考 |
|---|---|---|
| `{{ expr }}` | 補間 | 動的なら箇所ごとに effect（fine-grained） |
| `:attr="expr"` | 属性バインド | reactive |
| `@event="expr"` | イベント | `expr` が式/文なら `($event)=>{…}` に包む。`$event` 使用可 |
| `v-if="expr"` | 条件描画 | |
| `v-for="item in list"` | 反復 | `list` は配列 |
| `v-for="(item, i) in list"` | index つき反復 | `i` は 0 始まり |
| `:key="expr"` | keyed 反復 | ノード再利用・移動（DnD/並び替えに必須） |
| `flip` | FLIP アニメ | `:key` つき v-for に付けると並び替え/enter/leave が滑る |
| `v-model="sig"` | 双方向糖衣 | `:value + @input`。`sig` は signal |
| `class` + `:class` | class 合成 | 両方書くと結合される |
| `<Child :p="x"/>` | 子部品 | **import 必須**（大文字始まり = 部品） |
| `<slot>` / `<slot>default</slot>` | 差し込み | 親の子要素を描画（無ければ default） |

**それ以外の `v-*` は `SUNAO_UNKNOWN_DIRECTIVE`（fail-closed）。** `v-show`/`v-html` 等は無い。

---

## runtime プリミティブ（`import { … } from 'sunao'`／未使用は tree-shake で消える）

### 反応性（コア）
```js
const n = signal(0);   n()            // 読む（購読する）
n.set(1); n.update(v => v + 1); n.peek()   // 書く / 無購読で読む
const d = computed(() => n() * 2);     // 派生（依存が変われば再計算）
effect(() => console.log(n()));        // 副作用（依存が変わると再実行）
onCleanup(() => …);                    // 現在の effect/scope 破棄時に実行
```

### 描画・マウント / SSR / hydration
```js
mount(Component, el)      // → { ctx, dispose }。<style scoped> は head に 1 度注入
component(Child, props)   // template の <Child/> が展開されるもの（手書き不要）
prerender(Component)      // → { html, styles, meta }（server モード＝タイマー張らない・決定論）
hydrate(Component, el)    // サーバ HTML を作り直さず既存 DOM に effect/イベントを乗せる
renderComponentToString(Component)  // 文字列描画（テスト/簡易 SSR）
isServer()                // server モードか（now/interval/resource が発火しない）
```

### ルーティング（hash・公開ホストで安全）
```js
useRoute()               // 現在パスの signal
navigate('/x')           // 遷移
matchRoute(path, '/u/:id')   // → params or null（'*' ワイルドカード可）
setRouteGuard(fn)        // 遷移可否
```

### 時間・非同期（Go 風）
```js
now()                    // 100ms 刻みの現在時刻 signal
interval(fn, ms) / timeout(fn, ms)     // onCleanup で自動停止
debounce(fn, ms) / throttle(fn, ms)
context()                // { signal, cancel }（AbortController ラッパ）
go(fn)                   // 中断可能な非同期タスク
resource(fetcher, { key, swr:true })   // キャッシュ + stale-while-revalidate
```

### 他言語からの借用（[borrowings.md](borrowings.md)）
```js
machine({ initial, states })    // 状態機械（宣言外の遷移は throw）
store(init, update)             // Elm/Redux + undo/redo/history
decode(schema, json)            // Zod 風・path つきで throw
match(kind, { A:…, _:… })       // 網羅しないと throw（_ で default）
produce(base, d => { d.x = 1 }) // Immer 風 immutable 更新
boundary(() => risky(), e => fb)// 同期描画例外の fallback
provide(key, v) / inject(key, d)// context（prop drilling 回避・setup 内）
```

### Recipe テーマ（`import { … } from 'sunao/theme'`）
```js
recipeStyle({ palette, density, cardShape, typography })  // → CSS 変数の inline 文字列
// ルート要素に :style="recipeStyle(...)" で載せると配下が全部そのトークンで揃う
KIND_ACCENT / KIND_LABEL / themeCSS
```

---

## 落とし穴（footgun）と機械の助け

| 罠 | 症状 | sunao の対応 |
|---|---|---|
| **`{{ count }}`（`()` 忘れ）** | signal オブジェクトが出て更新もされない | ⚠ **`SUNAO_CALL_FORGOTTEN` 警告**。`<script>` を走査して signal/computed/resource/now/useRoute/store/machine の束縛と props を把握し、**一度も呼んでいない裸参照でも**検出（`node check.mjs`／`warningsOf()`）。非致命 |
| 未宣言の識別子 | 実行時 undefined | build で止まる（提案つき） |
| 未知ディレクティブ | 黙って無視されがち | build で止まる |
| 子に無い prop / 必須欠落 | props 不一致 | **build 時**にクロス検査（`check.mjs`） |
| enum 外の値 | 不正な見た目 | runtime で throw（閉じた語彙） |
| 並び替えで DOM が壊れる | 状態・focus が飛ぶ | `:key` で keyed 再利用（`flip` で FLIP） |
| unmount でタイマ漏れ | メモリリーク | `interval`/`now` 等は `onCleanup` で自動停止。`dispose()` で全片付け |

**signal は「呼んで読む」**: `count()` が値、`count` は signal 本体。値位置では常に `()`。
イベントハンドラ内の書き込みは `count.set(...)` / `count.update(...)`。

---

## SSR / SSG / SEO / 開発

- **`npm run dev [-- --entry X.js --port 8000]`** … esbuild watch + serve。**保存→自動リビルド→ブラウザ自動リロード**。sourcemap は inline（実行時エラーが .sunao の `<script>` 行へ戻る＝line-level）。
- **`npm run prerender -- --entry page.sunao --out dist/x.html [--client main.js]`** … ページを **実 HTML へ prerender**（title/description/canonical/OG メタ＋scoped CSS を inline＋`#app` に中身を焼く）。`--client` があれば hydrate 用 bundle も出す。
- **SEO の考え方**:
  - 静的な中身（コンテンツ/LP/ドキュメント）は prerender で **初期 HTML に焼かれ**、クローラが JS 実行なしで読める。
  - 対話は `hydrate()` が**既存 DOM を作り直さず**乗せる。骨格は adopt、動的な島（v-if / v-for over signal / 補間）だけ再構築。
  - `now`/`interval`/`resource` は server モードで発火しない＝Node 描画が hang しない・決定論。
- **限界（正直に）**: source map は **line-level**（`<script>` 行に対応。テンプレ由来行は script 先頭に寄る＝列単位ではない）。hydration は骨格 adopt＋動的島の再構築（完全な node 単位ハイドレーションではない。SEO 目的＝初期 HTML に中身、は満たす）。

## 決定論・予算（factory）

- `node check.mjs` … 全部品の compile / 全入口の build（**2 回 sha 一致＝決定論** + **bytes 予算** + クロス契約 + ⚠警告表示）。1 つでも落ちれば exit 1。
- `node build.mjs --entry …` … 決定論レシートを `results/raw/` に残す。
- 動的もイベントも無い部品は **定数 HTML** にコンパイルされ runtime を import しない（tree-shake で反応性が落ちる）。
- `v-for` が **裸の非 signal 識別子**（`const items = [...]`）なら thunk 化せず静的 map＝hydrate で adopt でき tree-shake にも効く。signal リスト（`items()`）は従来どおり reactive。

## 公開ショーケース
- Priority Board（FLIP・keyed・enter/leave）: https://claude.ai/code/artifact/e8659c38-a848-48de-87cd-53d1d4ed4f10
- SEO ページ（SSG prerender→hydrate）: https://claude.ai/code/artifact/d5d26d6f-9974-498e-ad01-cd9fb6e0fa9a
- Deploy Console（machine/store/resource/context）: https://claude.ai/code/artifact/bc19a414-97f2-46b3-a600-c523feb4a72f
