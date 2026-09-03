# UI-2 Cinematic surface 仮説（結果より先に凍結）

このファイルが追加された commit SHA が凍結の証拠。今サイクルのスコープ:
**Cinematic Product surface のみ / 初回生成 n=3 / 長期変更なし（次サイクル）/ Sonnet 中心。**

## 4 要因の分離（この実験の核心）
1. Tailwind か Native CSS か
2. AI が直接スタイルを書くか、意味 Recipe を書くか
3. 初回の再現力か、長期変更後の品質か（今回は初回のみ）
4. 外部パッケージ利用か、KAS が支配権を持つ契約か

## 条件（同じ要件・同じ fixture・同じ target・同じ model 予算）
- A: Direct Tailwind（AI が utility を直接編集）
- B: Direct Native CSS（AI が semantic HTML + native CSS を直接編集）
- C: PresentationRecipe → Native CSS（AI は Recipe だけ。KAS compiler が生成）
- D: PresentationRecipe → Tailwind（同じ Recipe、backend が Tailwind）

C と D は Recipe・意味 DOM・fixture・期待結果を共有 → **Recipe 境界の効果と backend の効果を分離**。

## 凍結する仮説（実測前）
- U1: A/B（direct）は独立セッション間で成果物が byte 一致しない。C/D（recipe）は recipe 一致なら決定論
- U2: Cinematic 表現で、A の arbitrary-value 比率 + escape ratio（custom CSS / inline / CSS var / JS style）が
  30% を超える（＝Tailwind の design vocabulary が実質使われていない領域が出る）
- U3: C と D は **同じ Recipe から同じ意味 DOM・同じ a11y tree** を生成する（backend が違っても）。
  差が出るのは CSS bytes・computed style・性能であって意味ではない（RC-4 backend parity）
- U4: Cinematic の fidelity（参照 target との geometry/typography/spacing 差）は
  A（Tailwind）と B（Native）で大きな差が出ない。表現力は backend でなく実装者次第
- U5: C/D の Recipe 境界は、Cinematic のような連続演出では **表現の天井**にぶつかる
  （既存語彙で表せない要求が n=3 のうち 1 回以上出る。RC-1 vocabulary gap）
- U6: no-JS でも 4 条件すべて hero の見出しと CTA と本文が読める（animation 失敗でも CTA 到達可）
- U7: fail-closed。C/D は未知の Recipe 値を RecipeError で拒否する（silent fallback しない）

## 反証条件
- U1 反証: A/B が byte 一致する / C/D が非決定
- U2 反証: A の arbitrary+escape が 30% 未満（Tailwind 語彙で Cinematic を賄えた）
- U3 反証: C と D で意味 DOM か a11y tree が異なる（Recipe 境界が backend 差を隠せていない）
- U5 反証: Recipe 語彙が Cinematic を破綻なく賄い、gap が出ない

## 合否・判定軸（§15）
表現力 / 創造性 / 決定性 / 安全性 / (保守性は次サイクル) / AI 効率 / 性能 / 可逆性 / 運用費 / Owner 価値。
Surface 別に結論を出してよい。全用途を 1 方式へ統一することを成功条件にしない。

## 禁止（§3 公平性 / §19）
- どの方式も best-effort。Tailwind に component 化・token・custom CSS を禁止しない
- Native を場当たり巨大 CSS にしない。Recipe の compiler 開発費を隠さない
- screenshot だけで成功を主張しない。存在・類似・意味正しさ・性能を別々に検証
- AI の自己評価を verification に昇格しない
