# T9 補正 — 有効 Recipe 空間（「38,880 通り」の訂正）

```
再現: node tools/tailwind/effective-space.mjs → docs/results/raw/effective-space.json
訂正: docs/results/CORRECTIONS.md C6
```

前サイクルは E の presentation 空間を「38,880 通り」と書いた。これは enum の直積であって、
**知覚可能なデザイン多様性ではない**。数え直した。

| 指標 | 値 |
|---|---|
| enum の総組合せ | 38,880 |
| a11y 違反（palette コントラスト AA 未満） | 0 |
| **コメントを除いた distinct な CSS** | **12,960** |
| CSS に効く軸 | 9 / 10 |
| **CSS に一切効かない軸** | **1（`readingMode`）** |

## 判明したこと

1. **38,880 のうち distinct な CSS は 12,960。** 差の 3 倍は、
   `readingMode`（3 値）が **CSS 出力に一切影響しない**ことによる。
   readingMode は意味 DOM の並び順に効くはずだが、現 Compiler は未実装。
   これは「互いに打ち消す / 到達不能な軸」(§7) の実例であり、**設計上の smell** として記録する。
2. distinct CSS 12,960 も **「機械的に区別できる」だけ**で、
   「Owner が明確に異なると感じる」数ではない。知覚的多様性は Owner の blind comparison が要る（`SELF_TESTED`）。
3. したがって創造性の根拠に「12,960」も使わない。使えるのは
   「同じ意味 DOM から、意味を壊さず機械的に区別できる表現を多数作れる」ことまで。

## 次にやること

- 有効 Recipe 空間の再定義: 同じ見た目・到達不能・a11y 違反・互いに打ち消す軸・色だけ違いを除く
  （今回は「同じ CSS bytes」と「a11y 違反」だけ除いた。「知覚的に同じ」はまだ除けていない）
- `readingMode` を実装するか、語彙から外すか決める（inert な軸を残さない）
- Owner blind comparison で「明確に異なる」案の数を測る
