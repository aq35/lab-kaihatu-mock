# 決定 0006 — Verified Generative UI（研究段階・有望）

- 日付: 2026-09-03
- 状態: **有望だが未採用（Owner 評価が最大の未検証）**。Foundry 先行実装ではない研究成果として隔離
- 関連: `docs/research/_hypotheses-vgui.md` / `docs/results/ui-vgui.md` / `docs/results/raw/vgui-*.json`

## 結論

「Tailwind より良い CSS の書き方」の比較から抜け、**書く AI から、体験を仮説化し現実で選別する AI へ**の
転換を、KAS card surface で実装・実行した。仮説 V1-V7 のうち機械検証できるものはすべて支持:

- 生成 12 → 観測淘汰 8 → 生存 4（V1）。淘汰は contrast/target の実測（V4）
- 生存案は意味 DOM byte 一致（V2）、param 距離 0.72 の多様性（V3）
- 同 seed 決定論（V5）、勝者周りの進化で生存率 33%→83%（V6）
- 成長文法は PROPOSED のみ・self-eval で昇格しない governance（V7）

**核心の主張**（実装で具体化した）:
> AI 時代の design system は、人が決めた部品集ではなく、
> 意味を守りながら表現を探索し、現実の観測から生き残った規則の集合である。

## KAS への位置づけ

- 中核は既存資産の**再利用**: 意味 DOM 契約（0001-0005）・fail-closed・決定論の上に、
  **観測駆動の探索と淘汰**を足した。新しい汎用 framework を作ってはいない
- 所有するのは意味契約・制約・検証器・生成文法・生存領域だけ。CSS は使い捨て生成物（原則どおり）
- 生成文法（連続パラメータ）は前サイクルの閉じた Recipe の**表現の天井**を超える候補

## 採用しない理由（保留）
- **Owner 評価が無い**。judge の本命（判断精度・時間・誤認・見落とし・好み・次世代改善）は Owner が要る。
  現状は「観測で安全・可読・高速な生存案を作れる」ことまで
- 1 seed / 1 intent / 1 fixture / 2 世代。多 Goal 再現（V7 昇格の前提）と多世代収束が未実施
- 「未知の表現」の**知覚的新規性**は未評価

## 次の正確なアクション
1. `dist/vgui/gallery.html` で Owner blind comparison を実施（判断精度・時間・誤認・見落とし・好みを記録）
2. 複数 intent / 複数 fixture(Goal) で再現し、PROPOSED 規則が再現するか確認（V7 昇格の前提）
3. Owner 選択を実データにして進化を 3+ 世代回し、収束と改善を測る
4. 淘汰器に stale/expired・evidence 偽装・危険操作の誤認テストを追加（安全 judge の強化）
5. 生成文法に attention_path を実際に効かせる展開（視線誘導の実装）を足し、知覚的多様性を上げる

## 原則の再確認（この実験でも守った）
生成 CSS を知識保存しない / 一度の選択を標準化しない / Owner の好みを普遍正解にしない /
self-eval で規則を昇格しない / 汎用 builder を作らない / 意味契約と検証器だけを所有 / CSS は使い捨て /
複数 Goal で再現した規則だけ候補にする。
