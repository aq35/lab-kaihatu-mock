# 方針: 個人用途に閉じたプラグイン — React/Vue/Vite の「代替」ではなく上下に置く

EXP-1〜4 の実測から、個人で持つプラグインの方針を決める。これは**公開フレームワークを作る話ではない**。
自分（と、この repo で走る別セッションの AI）が使う道具を、測定に基づいて絞り込む話。

## 実測が意思決定に与えた 4 点（根拠は EXP-1〜4）

| 分かったこと | 桁 | 方針への含意 |
|---|---|---|
| 速度は transpiler で 1〜2 桁動く | 61x (EXP-1) | native(oxc/swc/esbuild) なら**どれでも十分速い**。速度で選ぶ意味は薄い |
| 呼び出し形態でも桁が動く | 16x (EXP-2) | 単発 transform か束ね bundle かは**形態の問題**。道具の優劣ではない |
| 出力サイズは transpiler ではほぼ動かない | raw 1.6x / minify 1.05x (EXP-1/4) | **どの道具を選んでも軽さは変わらない**。ここで悩まない |
| サイズを 2〜3 桁動かすのは依存の判断だけ | 753x (EXP-3) | **軽さの唯一のレバーは「依存を足すか/分割か/遅延か」** |
| 決定論は全道具・全段で保たれた | — | 「決定論」は既製にある。前提にできる |

**結論の芯**: フロントの「軽さ・速さ」を左右するのは transpiler の選択ではなく、**依存の判断**。
だから個人で書く価値があるプラグインは「速い変換器」ではなく、**依存の判断を機械で効かせる小さな build ステップ**。

## 立場 — React/Vue/Vite を置き換えない

世界の潮流は compiler-first（React Compiler / Svelte runes / Vue Vapor）と unplugin（1 回書いて
全 bundler で動く）で、しかも**サイズは道具で変わらない**（EXP-4）。この状況で自作フレームワークを
公開して競う理由は無い。サプライチェーンの心配も増えるだけ。よって:

- **React/Vue/Vite はそのまま使う。** UI runtime / HMR / エコシステムは彼らが強い。
- 自作プラグインは彼らの**下（build ステップ = esbuild/rollup/unplugin プラグイン API）**か、
  **上（宣言的入力 → 決定論出力の compiler）**に置く。framework の寿命に縛られない層だから長寿命。
- **runtime 依存を足すプラグインは書かない。** 足すのは build 時だけに効く、出力に残らないもの。

## 作る — 個人用途の 3 プラグイン形（すべて framework 非依存・build 層）

### P1. 依存予算ゲート（fail-closed）— EXP-3 の方法をそのまま道具化
- entry ごとに「初期 bytes / gzip」を測り、**閾値を超えたら build を止める**（unknown/超過→エラー）。
- 梯子「足さない > 分割 > 遅延」を破った瞬間（例: 誤って `import _ from 'lodash'` = 753x）に気づける。
- 実装: esbuild `metafile` or `onEnd` で出力を計量 → 受領書 + 予算比較。既に `measure.mjs` に核がある。
- **AI 向けの意味**: AI が依存を足す判断を、prose のレビューでなく **bytes の fail-closed** で縛れる。

### P2. 決定論レシート — provenance を出力に添える
- build のたびに raw/gzip/**sha256**・道具バージョン・Node を受領書に落とす（`measure.mjs` と同形式）。
- 同入力 → 同 hash を CI で検査（EXP-1/4 で全道具が決定論的と確認済みなので、破れたら回帰）。
- **AI 向けの意味**: 「同じ指示 → 同じ出力」を hash で保証。AI の変更の before/after を桁で見せる土台。

### P3. Recipe → 決定論出力の compiler（north-star の到達点）— repo の条件 E/F と接続 ／ **試作済み: [sunao](sunao.md)**
- この repo は既に上位層で「型付き PresentationRecipe → 決定論的 HTML/CSS（fail-closed・低 context）」を
  実験している（root README の条件 E/F）。frontendlab はその**汎用ツールチェーン版の土台**を測った。
- P3 は両者を繋ぐ: **宣言的入力（Recipe 的）→ 既製 native transpiler で決定論的に出力**する薄い層。
  変換エンジンは自作しない（EXP で native が十分速い・決定論的と確認済み）。自作するのは
  **入力の型付けと fail-closed と低 context の契約**だけ。
- **試作 = sunao**: Vue 風 SFC(`.ui`) を esbuild プラグインで build 時コンパイル ＋ 極小 runtime。
  アプリ一式 ~1KB gzip・決定論的・未知ディレクティブは fail-closed・実機ブラウザで動作確認済み。
  詳細と「自作 runtime を持つことの方針整合」は [sunao.md](sunao.md)。次段は `.ui` の型付け（Recipe 化）。

## 受け入れ基準 = 「AIが好きそうなコンパイラ」の性質（north-star）

個人プラグインは、次を満たすものだけ採る。EXP でどれが既製にあるか分かったので、
**足りない 3 つ（下段）を自作の焦点にする**:

| 性質 | 既製にあるか | 誰が担うか |
|---|---|---|
| 決定論（同入力→同 hash） | ✓ ある (EXP-1/4) | 既製 transpiler。P2 が検査 |
| 出力の予測可能性・軽さ | ✓ ある (EXP-1/4) | 既製。P1 が予算で守る |
| **fail-closed（未知/超過→エラー）** | ✗ 無い | **自作 P1/P3** |
| **型付き・宣言的入力（Recipe 的）** | ✗ 無い | **自作 P3** |
| **低 context（少ない前提で正しく使える）** | ✗ 無い | **自作 P3** |

## 作らないもの（非目標）

- **公開フレームワーク / React・Vue の代替 runtime。** 潮流と実測（サイズは道具で変わらない）に反する。
- **自作の transpiler / minifier。** native が 1〜2 桁速く決定論的（EXP-1/4）。車輪の再発明。
- **runtime 依存を増やすプラグイン。** 梯子「足さない」に反する。build 時だけに効くものに限る。
- **framework バージョンに固定される runtime プラグイン。** 寿命が短い。build 層に置く。

## 次の一歩（この方針の最初の実装）

1. **P1 依存予算ゲート**を最小実装（esbuild metafile → 予算 JSON と比較 → 超過で exit 1）。
   EXP-3 の計量ロジックを再利用でき、効果（753x の事故を止める）が一番はっきり見える。
2. P2 は `measure.mjs` を build フックから呼ぶだけで芽がある。
3. P3 は repo の Recipe（条件 E/F）と接続する設計 doc を先に凍結してから。
