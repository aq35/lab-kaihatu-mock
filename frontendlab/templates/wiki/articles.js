/**
 * 記事カタログ（静的）。本番は resource(fetcher) で Wiki API / Markdown から取得する形に。
 * body はプレーンテキスト（sunao は v-html を持たない＝XSS 安全。装飾したいなら構造化して要素で持つ）。
 */
export const ARTICLES = [
  {
    id: 'signal', title: 'signal（状態）', updated: '2026-09-12', tags: ['基礎', 'リアクティブ'],
    sections: [
      { id: 'sig-what', h: 'signal とは', body: 'signal は sunao の状態の最小単位。値を 1 つ包み、変化すると、それを読んでいる箇所だけを自動で更新する（細粒度リアクティブ）。仮想 DOM の差分計算を持たないため、更新は「読んだ場所」に限定される。' },
      { id: 'sig-read', h: '読み書き', body: '読むときは関数呼び出し n()。書くときは n.set(x) または n.update(fn)。テンプレでも {{ n() }} と呼んで読む。() を忘れると signal オブジェクトそのものが出てしまうため、コンパイラが警告する。' },
      { id: 'sig-derived', h: '派生値（computed）', body: 'computed(() => a() + b()) は依存する signal が変わったときだけ再計算されるキャッシュ付き派生値。フィルタ済みリストや整形済み文字列など「元データから導けるもの」は computed にすると状態が二重管理にならない。' },
    ],
  },
  {
    id: 'template', title: 'テンプレート構文', updated: '2026-09-10', tags: ['基礎', 'テンプレ'],
    sections: [
      { id: 'tpl-interp', h: '補間 {{ }}', body: '{{ 式 }} でテキストに式を埋め込む。式が signal を呼べば反応的に、呼ばなければ静的に評価される。文字列やオブジェクトも String() 化されて表示される。' },
      { id: 'tpl-dir', h: 'ディレクティブ', body: ':attr で属性を式に束縛、@event でイベント購読、v-if で条件表示、v-model で双方向。未知の v-* はコンパイル時にエラーで止まる（fail-closed）ので、綴り間違いが実行時まで潜らない。' },
      { id: 'tpl-for', h: 'v-for とキー', body: 'v-for="item in list()" で反復。:key を付けるとキー差分で要素を再利用し、並び替えや削除でもノードと状態を保つ。flip を足すと移動・追加・削除がアニメーションになる。' },
    ],
  },
  {
    id: 'router', title: 'ルーティング', updated: '2026-09-08', tags: ['応用'],
    sections: [
      { id: 'rt-hash', h: 'hash ルーター', body: 'useRoute() は現在の hash（先頭の # を除いたパス）を返す signal。navigate("/page/1") で遷移する。hash ベースなので公開ホストでリロードしても 404 にならない。' },
      { id: 'rt-guard', h: 'ガード', body: 'setRouteGuard((to, from) => …) で遷移を中止したりリダイレクトできる。matchRoute("/page/:id", path) でパラメータを取り出す。使わなければ tree-shake で bundle に入らない。' },
    ],
  },
];
