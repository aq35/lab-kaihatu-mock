# AIが創造しやすいHTML・CSS・JavaScript UI実験指示書

> このファイルは Owner から渡された指示書の原文である。
> 別セッションの Claude Code へは、このファイルをそのまま渡せばよい。
> 実験の進行状況は `docs/experiments.md` と `docs/results/` を参照すること。

## 0. 目的

HTML・CSS・JavaScriptを使い、AIが別セッションでも安全かつ臨機応変にUIを創造・改修できる設計を、実験によって見つける。

最終的な参照実装ではTailwind CSSを使用しない。
ただし「Tailwindを使わない方が優れている」という結論を先に置かない。Tailwindは比較条件としてのみ使用し、実験で差を測る。最終成果物へTailwind dependencyを残さない。

この実験の利用先はKASのOwner Control Centerである。
KASのUIは一般的な管理画面ではない。KASとOwnerが次を正確にやり取りする場所である。

* KASがOwnerにしか答えられない質問をする
* Ownerが回答する
* KASが危険なactionの承認を求める
* Ownerがeffect、scope、費用、期限を理解して判断する
* 結果不明を人へ返す
* 実行結果と証拠をOwnerへ返す
* Goalの進行、停止理由、次の行動を継続的に共有する

## 1. 作業場所

この実験はKAS本体とは別の専用リポジトリで行う。
推奨名:

```text
web_ui_manual
```

KASのPython・Goコードへ直接変更を入れない。
KASから持ち込むのは、公開可能なUI契約、匿名化したfixture、カード型、状態遷移だけにする。
`sample_manual`の進め方を参考にする。

```text
https://github.com/aq35/sample_manual
```

参考にするのは次の方法論である。

* 仮説を結果より先に固定する
* 事故や不便を先に再現する
* 複数方式を同条件で比較する
* 数字を測定環境とセットで保存する
* 防止策を外すcounter-proofを行う
* 説明、コード、テスト、実測結果を相互に到達可能にする
* 最後にClaude Code用のreview skillへ変換する

## 2. 成功条件

成功とは、見た目の良い画面を1枚作ることではない。
次を満たすことである。

1. 別セッションのAIが既存設計を短時間で理解できる
2. 新しいカードやテーマを追加しても既存画面を壊しにくい
3. HTMLの意味とアクセシビリティが外観変更から保護される
4. 必須情報をCSSで隠して安全性を変えられない
5. 同じ意味構造から複数の明確に異なるデザインを作れる
6. TailwindなしでもCSSが無秩序に増えない
7. JavaScriptなしでも重要な情報を読める
8. JS失敗時に承認済み、送信済みと誤表示しない
9. UIがauthorityを決めず、serverが必ず再検証する
10. 人が質問・承認・結果不明を取り違えない
11. 長い日本語、英語、URL、空状態、大量状態でも壊れない
12. 性能、アクセシビリティ、保守性を測定できる

## 3. 固定する意味契約

外観を作る前に、次の5カード型をJSON Schemaまたは同等の閉じた契約として定義する。

```text
OWNER_QUESTION
ACTION_APPROVAL
OUTCOME_UNKNOWN_REVIEW
RESULT_REVIEW
INFORMATION
```

### OWNER_QUESTION

表示必須:

* 何を聞いているか
* なぜOwnerにしか答えられないか
* どのGoalに関係するか
* 回答の選択肢
* free-form可否
* 回答期限
* 回答後に何が再開するか

### ACTION_APPROVAL

表示必須:

* 実行するaction
* effect
* resource scope
* 対象Goal・Run
* 外部送信、公開、費用、削除、credential利用の有無
* 期限
* one-shotであること
* 承認しない場合に何が止まるか

初期版は次のみ。

```text
ALLOW_ONCE
REFUSE
SNOOZE
```

永続許可を入れない。

### OUTCOME_UNKNOWN_REVIEW

表示必須:

* 何をdispatchしたか
* どこまで確認できたか
* 何が不明か
* 再実行すると二重effectになる可能性
* Ownerが安全に確認できる方法

retryをprimary actionにしない。

### RESULT_REVIEW

表示必須:

* 何が完了したか
* action claim
* independent observation
* verification receipt
* 未確認事項
* 次の候補

### INFORMATION

Ownerの操作を要求しない通知である。
質問、承認、結果不明と同じ強調度・同じbutton表現にしない。

カード型を色だけで区別しない。

## 4. 最重要設計原則

意味と表現を分離する

固定するもの:

* card type
* required fields
* action semantics
* form endpoint
* reason code
* expiry
* authority
* evidence level
* accessible name
* focus order

AIが変更してよいもの:

* 色
* typography
* spacing
* density
* layout
* visual hierarchy
* animation
* illustration
* background
* card shape
* responsive composition
* theme

AIが変更してはならないもの:

* 質問を承認として表示する
* effectやscopeを折り畳んで初期非表示にする
* `OUTCOME_UNKNOWN`のretryを主要操作にする
* disabledを承認済みとして表現する
* expired itemをlive itemとして表示する
* evidenceのない結果をverifiedに見せる
* CSSだけでrequired fieldを消す
* browser内の状態だけでauthorityを成立させる

## 5. 比較する実装方式

同じUI契約、同じfixture、同じ変更課題を使って次を比較する。

### A — Tailwind

比較専用。一時worktreeまたは比較branchだけで使用する。
最終成果物とmainへdependencyを残さない。

### B — 無規律な素のCSS

* グローバルCSS
* 自由なclass名
* tokenなし
* layerなし

これは「Tailwindを外しただけ」の対照群である。

### C — Semantic CSS

有力候補だが、結果を見る前に勝者と決めない。

候補構成:

```text
src/
  index.html
  styles/
    reset.css
    tokens.css
    base.css
    layout.css
    components/
    states.css
    themes/
  scripts/
    api.js
    cards.js
    forms.js
    navigation.js
  contracts/
  fixtures/
  catalog/
```

Cascade Layersの候補:

```css
@layer reset, tokens, base, layout, components, states, themes, overrides;
```

class名は見た目ではなく役割を表す。

```text
owner-question
action-approval
decision-actions
effect-summary
evidence-list
goal-context
```

次のような命名を主要契約にしない。

```text
blue-box
mt-4
flex-row
rounded-lg
text-small-gray
```

### D — Native Web Components

比較対象として試すが、採用を前提にしない。

確認するもの:

* server-rendered HTMLとの相性
* form participation
* accessibility
* styling boundary
* AIが修正箇所を見つけられるか
* Shadow DOMがデバッグを難しくしないか
* JavaScript無効時の劣化

## 6. AI保守性実験

同じモデル・同じ初期指示・独立した新規セッションで、A/B/C/Dへ同じ変更を依頼する。
各セッションは前の会話を読まず、リポジトリ内の文書だけを読む。

変更課題:

1. 新しいカード型を追加
2. 全体のthemeを変更
3. 承認カードだけ情報密度を上げる
4. dark themeを追加
5. narrow containerへ配置
6. 長い日本語を表示
7. actionを3個から8個へ増やす
8. status表現を追加
9. required fieldを追加
10. mobile layoutを変更
11. keyboard操作を修正
12. loading、empty、errorを追加

測定:

```text
task success
初回test成功率
経過時間
prompt/output token数
変更ファイル数
diff行数
既存HTML構造の変更数
新規CSS rule数
重複宣言数
specificity
!important数
未使用CSS
visual regression数
accessibility regression数
修正に必要な追加prompt数
```

学習効果を避けるため、方式の実行順を固定せず入れ替える。

## 7. 創造性実験

「違う色にしただけ」を創造性と数えない。
同じsemantic HTMLとcard contractから、最低5つの明確に異なる表現を作る。

例:

* calm operations console
* editorial notebook
* high-density command center
* humane conversational workspace
* visual timeline
* mobile-first attention inbox

各案で変更可能なのは、原則としてtoken、theme、layout recipe、装飾層だけとする。
意味DOMを変更しなければ作れない場合は、その理由を記録する。

評価:

* required information保持
* keyboard操作
* screen reader構造
* responsive
* human preference
* task completion time
* 誤操作
* 情報の見落とし
* 見た目の差
* theme間の共有コード量
* themeを削除した際の残骸

自動的なpixel差だけで創造性を評価しない。Ownerによるblind comparison用ページを作る。

## 8. Owner Communication実験

KASの目的はチャット画面を作ることではない。
次の3 surfaceを比較する。

1. Attention Inbox
2. Goal Detail / Timeline
3. Card Detail / Decision

最低シナリオ:

```text
KASがOwnerへ質問
Ownerが回答
別Runが回答を消費
KASがaction承認を依頼
OwnerがALLOW_ONCE
actionが進む
結果がOUTCOME_UNKNOWN
Ownerが状況を確認
independent observation後にRESULT_REVIEW
```

比較するUI:

* chat中心
* inbox＋detail
* timeline中心
* hybrid

測定:

* 未処理項目を見つける時間
* 質問と承認の取り違え
* effect/scopeの理解
* `OUTCOME_UNKNOWN`での誤retry率
* 完了済みと未検証の取り違え
* Goal全体の理解
* Ownerが「次に何をすべきか」を答えられるか

AIの自己評価だけで使いやすさを確定しない。Owner実測がないものは `SELF_TESTED` とする。

## 9. HTML規律

* semantic HTMLを先に使う
* buttonの代わりにclickable divを使わない
* heading階層を見た目で決めない
* form、fieldset、legend、labelを正しく使う
* linkとbuttonの役割を混同しない
* interactive elementを入れ子にしない
* DOM順と視覚順を不必要に変えない
* ARIAはnative HTMLで表現できない場合だけ使う
* required informationをhoverだけに置かない
* 色だけで状態を伝えない
* JavaScriptが無くても重要情報を読める
* server-rendered formを基準にprogressive enhancementする

custom elementを使う場合も、WHATWG HTMLの制約とアクセシビリティを検証する。

## 10. CSS規律

* Tailwindを最終成果物へ入れない
* CSS Custom Propertiesをdesign tokenに使う
* raw colorをcomponentへ直接散らさない
* primitive tokenとsemantic tokenを分ける
* spacing scaleを持つ
* fluid typographyは`clamp()`等で上限・下限を持つ
* logical propertiesを優先する
* componentはviewportだけでなくcontainerへ適応する
* `@layer`でcascade順を固定する
* selectorの深さとspecificityにbudgetを置く
* `!important`は原則0
* inline styleを通常経路にしない
* animationは`prefers-reduced-motion`へ対応する
* dark mode、forced colors、高contrastを検証する
* contentによって高さが変わってもlayout shiftを起こしにくくする

token数を増やすことを進捗にしない。実際に複数componentまたはthemeで必要になったtokenだけ残す。

## 11. JavaScript規律

* native ES modulesを基準候補にする
* global mutable stateを作らない
* DOM要素の存在を暗黙の状態正本にしない
* server responseをauthorityの正本にする
* request中の二重submitを防ぐ
* stale responseが新しい画面を上書きしない
* `AbortController`で画面離脱・再送時のrequestを中止する
* timeoutをsuccessやeffectなしとして扱わない
* network failureとserver refusalを区別する
* raw `innerHTML`へ外部文字列を入れない
* 可能なら`textContent`または安全なtemplateを使う
* event listenerとtimerをcleanupする
* optimistic UIはauthorityを伴わない表示に限定する
* expired approvalをclient clockだけで判定しない
* no-JS、slow JS、JS exceptionを試す

frameworkを使わないこと自体を成果にしない。必要性が実測されるまで導入しない。

## 12. アクセシビリティ

WCAG 2.2 AAを基準にする。

最低限:

* keyboardだけで全操作
* visible focus
* focusがsticky headerやdialogに隠れない
* target size 24×24 CSS px以上または十分な間隔
* 200% zoom
* 320 CSS px幅
* screen reader向け名称
* error summaryとfield errorの関連
* reduced motion
* forced colors
* high contrast
* dialogを閉じた後のfocus復帰
* live regionの過剰読み上げ防止
* expiryやtimeoutで入力を失わない

自動axe検査だけで合格にしない。keyboard sequenceとaccessibility treeも検査する。

## 13. 敵対的content

最低限、次をfixtureにする。

* 空文字
* 1文字
* 非常に長い日本語
* 長い英単語
* 長いURL
* 絵文字
* RTL
* combining character
* HTMLらしい文字列
* scriptタグ文字列
* 0件
* 1件
* 100件
* 1,000件
* expired
* revoked
* stale
* outcome unknown
* evidenceなし
* conflicting evidence
* action 1件
* action 20件

見た目が崩れないだけでなく、誤ったactionが押されないことを確認する。

## 14. 性能予算

静的fixtureだけでなく、低速CPU・低速network相当でも測る。

参考目標:

```text
LCP <= 2.5s
INP <= 200ms
CLS <= 0.1
```

75 percentileを基準にする。

追加で測定:

* HTML bytes
* CSS bytes
* JavaScript bytes
* request数
* DOM node数
* style recalculation
* layout回数
* long task
* memory
* 1,000カード時のrender時間
* filter/search応答
* theme切替
* navigation後のlistener残存

性能改善のためにrequired informationやaccessibilityを削らない。

## 15. Security境界

UIはauthorityではない。

* serverがlive sessionを再検証する
* serverがexpiryを再検証する
* serverがeffectとscopeを再検証する
* hidden inputを信用しない
* disabled inputを信用しない
* stale pageからのsubmitを拒否する
* CSRFを検査する
* CSPを導入する
* inline scriptを通常経路にしない
* clickjackingを防ぐ
* sensitive pageは`Cache-Control: no-store`
* external contentをtrusted HTMLとして描画しない

CSSで非表示になっていることをauthorizationに使わない。

## 16. Test構成

候補:

```text
tests/
  contract/
  html/
  css/
  javascript/
  accessibility/
  visual/
  responsive/
  performance/
  security/
  ai-maintainability/
  owner-scenarios/
```

必須:

* unit
* DOM contract
* browser E2E
* visual regression
* accessibility
* keyboard
* no-JS
* hostile content
* slow network
* stale response
* duplicate click
* expiry
* session revoke
* responsive
* performance
* memory/listener leak

通常testは外部ネットワークへ出ない。font、icon、imageもfixtureを使う。
live browser/provider実験は別jobにする。

## 17. 成果物

```text
README.md
docs/principles.md
docs/experiments.md
docs/measurements.md
docs/results/
docs/decisions/
src/
experiments/
tests/
.claude/skills/html-css-js-ui-review/SKILL.md
.claude/skills/owner-communication-ui-review/SKILL.md
```

レビューSkillは最初に理想を書いて作らない。
実験で支持された規則だけをSkillへ入れる。

各規則には次を付ける。

```text
Rule ID
壊れ方
修正前の再現
推奨構造
検査方法
適用範囲
例外
対応するtest
実測receipt
```

## 18. PR順序

```text
UI-0  contract・fixture・measurement harness
UI-1  Tailwind / raw CSS / semantic CSS比較
UI-2  HTML semantics・progressive enhancement
UI-3  design tokens・cascade layers
UI-4  responsive・container queries
UI-5  JavaScript state・network failure
UI-6  accessibility
UI-7  hostile content
UI-8  Owner Communication scenarios
UI-9  AI multi-session maintainability
UI-10 performance
UI-11 visual creativity
UI-12 review skills・最終ガイド
```

1 PRを大きなdesign system全体にしない。

## 19. 各実験の報告形式

```text
Experiment:
Starting SHA:
Ending SHA:
Hypothesis frozen before result:
Compared conditions:
Model/session conditions:
Fixture corpus:
Before:
After:
Counter-proof:
Accessibility:
Performance:
AI task success:
Human evaluation required:
Supported:
Refuted:
Remaining uncertainty:
Reusable artifact:
Next experiment:
```

「美しい」「保守しやすい」「AIが書きやすい」を自己評価だけで確定しない。
対応する測定値またはOwner評価が無ければ未検証とする。

## 20. 最終選定条件

Tailwindなしの参照実装を採用するには次を満たす。

* Tailwind条件以上の変更成功率
* raw CSS条件より低い重複・specificity・regression
* 5つ以上の異なるthemeを意味DOMの大幅変更なしで表現
* 新しいAIセッションが文書だけで正しい拡張箇所を発見
* required information保持
* WCAG 2.2 AA
* keyboard E2E green
* no-JSで重要情報が読める
* hostile contentで崩れない
* performance budget内
* JavaScript・listener・process残存なし
* production dependencyにTailwindなし

結果が支持しなければ、理由を隠さず設計を変更する。
最終目的はTailwindを排除することではない。
KASがOwnerと正確に話せる意味構造を守りながら、AIが新しい視覚表現を自由に作れる状態を実証することである。
