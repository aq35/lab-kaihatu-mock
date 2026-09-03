# T7 補正 — 公平化した context コスト（訂正 C5）

```
再現: node tools/tailwind/context-cost-fair.mjs → docs/results/raw/context-cost-fair.json
Tokenizer: gpt-tokenizer（GPT。Claude の代理指標）。値は「AI が最低限読む source」の下限見積り
訂正: docs/results/CORRECTIONS.md C5
```

前サイクルの「A=4,346 / E=94 token」は、**A の renderer 全体 vs E の recipe だけ**を比べる不公平な比較だった。
変更を 3 種類に分け、E の新語彙追加では schema+compiler+tests+docs も数えた。

| 変更の種類 | A: Tailwind | C: Semantic CSS | E: Compiler | F: Recipe→TW |
|---|---|---|---|---|
| (1) 既存語彙内（density=compact） | 4,346 | 1,136 | **94** | **94** |
| (2) 組合せ変更（承認だけ強調） | 4,346 | 1,163 | 94※ | 94※ |
| (3) **新しい表現軸の追加** | 4,346 | **700** | 1,129 | 1,129 |

※ (2) は E/F では **per-card 変更ができない**（palette 全体を変える。T2）。token は小さいが粒度が粗い。

## 判定 — 訂正後の正確な結論

- **既存語彙内の変更では E/F が圧倒的に軽い**（94 vs 1,136 vs 4,346）。ここは前サイクルの主張どおり
- しかし **新しい表現軸の追加では C が最も軽い**（700）。
  C の `:has()` と属性セレクタは、新しい意図を **1 CSS 規則**で表現でき、語彙を拡張しなくてよい。
  E/F は schema+compiler+tests+docs を触るため 1,129 token かかる
- つまり「E は常に 94 token」は誤り。**94 token は既存語彙内に限る**

## 含意（H-main への寄与）

context コストの優位は「Compiler（recipe 抽象化）」由来であって、CSS backend 由来ではない。
E と F は (1)(2)(3) すべてで同じ token 数を示した（backend が Tailwind でも Native でも変わらない）。
→ **低 context は Compiler 効果。Tailwind か Native かは無関係**（HF1 の裏付け）。

一方 C（direct semantic CSS）は、新しい意図に対しては Compiler より軽いことがある。
これは「閉じた語彙の一度きりの拡張コスト」と「その場の CSS 表現力」のトレードオフ。
