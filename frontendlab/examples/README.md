# examples — 動くデモ兼 few-shot 正例

sunao で「このパターンはどう書くか」を **1 例 1 パターン**で示す正例集。AI に sunao を書かせる時は、
書きたいパターンに近い例を **1〜2 個だけ context に載せる**と精度が上がる（[AGENTS.md](../AGENTS.md) の「context の載せ方」参照）。
全例は `npm run check` で **compile・決定論・予算**を常時通過している（腐らない正例）。

## パターン → 見る例（ここから選ぶ）

| やりたいこと | 例 | 主な API |
|---|---|---|
| signal の基礎（読み `n()`・書き `n.set/.update`・`{{ n() }}`） | `app-ui/Counter.sunao` | `signal` |
| 型付き props（fail-closed な契約） | `app-ui/Greeting.sunao` / `app-ui/OwnerCard.sunao` | `props` |
| コンポーネント合成（子 import・`:prop` 受け渡し） | `app-ui/Parent.sunao` | `<Child :p=/>` |
| スロット（子の内容差し込み） | `app-ui/SlotHost.sunao` ＋ `app-ui/Card.sunao` | `<slot>` |
| keyed `v-for`・並び替え・ドラッグ&ドロップ | `app-ui/Sortable.sunao` | `v-for` `:key` `@drag*` |
| FLIP アニメ・パレット・派生値 | `app-ui/Board.sunao` | `flip` `computed` `match` `recipeStyle` |
| ルーティング（hash）・`v-model`・グリッド | `app-ui/Calendar.sunao` | `useRoute` `navigate` `v-model` |
| 非同期取得（loading/error）・実時計 | `app-ui/OwnerCardDemo.sunao` | `resource` `now` `recipeStyle` |
| ステートマシン・store・provide/inject・入力検証 | `app-ui/DeployConsole.sunao` ＋ `app-ui/StatusBadge.sunao` | `machine` `store` `provide`/`inject` `decode` |
| SSG（中身入り HTML）→ hydrate（SEO） | `seo/Landing.sunao` | `prerender` `hydrate` |
| 静的（runtime を一切積まない） | `static-ui/Hello.sunao` | —（純出力） |

## そのまま動かせる入口（entry = `*-main.js`）

```bash
npm run dev -- --entry examples/app-ui/board-main.js     # 保存→自動リロード
npm run build -- --entry examples/app-ui/main.js --out dist/counter
npm run prerender -- --entry examples/seo/Landing.sunao --out dist/seo/index.html --client examples/seo/landing-main.js
```

| entry | 根コンポーネント | 示すもの |
|---|---|---|
| `app-ui/main.js` | Counter | signal 基礎 |
| `app-ui/parent-main.js` | Parent | コンポーネント合成 |
| `app-ui/slot-main.js` | SlotHost | スロット |
| `app-ui/sortable-main.js` | Sortable | keyed v-for ＋ DnD |
| `app-ui/board-main.js` | Board | FLIP・palette・computed・match |
| `app-ui/calendar-main.js` | Calendar | ルーティング・v-model |
| `app-ui/owner-main.js` | OwnerCardDemo | resource・now・enum props |
| `app-ui/deploy-main.js` | DeployConsole | machine・store・provide・resource・decode（全部盛り） |
| `seo/landing-main.js` | Landing | SSG → hydrate |
| `static-ui/main.js` | Hello | 静的 |

## import される部品（単体では動かさない）

- `app-ui/Greeting.sunao` … 型付き props の最小例（`name` / `count`）。
- `app-ui/Card.sunao` … `<slot>` を持つ子（`SlotHost` から使う）。
- `app-ui/OwnerCard.sunao` … enum props ＋ `recipeStyle` の子（`OwnerCardDemo` から使う）。
- `app-ui/StatusBadge.sunao` … `inject`（provide/inject の受け）＋ `match` ＋ props。

> この index は `tests/sunao.test.mjs` の drift チェックで**ファイルと同期していること**を検証している
> （例を足したら README に載せる。載せ忘れ・リンク切れは test が赤くなる＝fail-closed）。
