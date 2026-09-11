# 他言語・フレームワークからの借用（実装済み）

JS の UI フレームワーク（[cherry-pick](framework-cherrypick.md)）と Go（context/ticker/resource）に続き、
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

## なぜこの選択か（north-star）

一番効くのは **状態機械（machine）と ストア（store）**。どちらも
**「宣言した状態・遷移・メッセージしか許さない」→ AI が UI ロジックを書いても不正状態に落ちない**。
sunao の「型契約（props）」を *振る舞い* まで広げた形で、fail-closed・決定論・低 context の直系。
`decode` は通信（`resource`）の入口を fail-closed にし、`match` は enum/kind を網羅で守る。
`provide/inject`・`produce`・`boundary` は実務の接着剤・安全網。

## ショーケース（全部を 1 アプリに）

**Deploy Console** — 公開: https://claude.ai/code/artifact/bc19a414-97f2-46b3-a600-c523feb4a72f

`machine`(デプロイ状態機械)＋`store`+`produce`(操作ログ・時間旅行)＋`resource`+`decode`(最新ビルドを非同期取得＆検証)＋
`provide/inject`(状態を子バッジへ prop 無しで)＋`match`(状態表示)＋`now`(経過秒)＋Recipe テーマ(palette 切替)を 1 つに。
実機テスト green（デプロイ→終端遷移・ログ undo・context バッジ・resource 取得）。runtime 込み ~6.5KB gzip。

## 使用例（組み合わせ）

```js
// 状態機械で承認フロー、store で履歴、decode で受信データ検証
const flow = machine({ initial:'pending', states:{
  pending:{ on:{ APPROVE:'approved', REJECT:'rejected' } },
  approved:{ on:{} }, rejected:{ on:{} },
}});
const user = resource((sig)=>fetch('/me',{signal:sig}).then(r=>r.json()).then(j=>decode({id:'number',name:'string'}, j)), { key:'me', swr:true });
```

## 見送り（方針・実測に反する）

- **HTMX / Phoenix LiveView / Hotwire**（サーバ駆動 HTML）… compiler-first・個人利用の方針と逆。
- **RxJS の巨大 observable**… signals が軽い代替、既にある。
- **Angular DI の重装 / Tailwind**… [pitfalls](framework-pitfalls.md) で棄却済み。

## 限界（正直に）

- `boundary` は**同期描画の例外のみ**捕捉（effect 内の非同期例外は別途 try/catch）。
- `provide/inject` は**同期レンダ木**に沿う（setup 内で使う。後から呼ぶと文脈が外れる）。
- `machine`/`store` はガード/並列状態・ミドルウェアは未実装（最小）。`produce` は structuredClone ベース（関数等は不可）。
