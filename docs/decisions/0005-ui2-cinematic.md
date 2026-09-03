# 決定 0005 — UI-2 Cinematic surface（暫定・初回生成のみ）

- 日付: 2026-09-03
- 状態: **INSUFFICIENT_EVIDENCE（採用確定には至らない）**。初回生成のみ・Owner 評価と長期変更が未了
- 関連: `docs/research/_hypotheses-ui2-cinematic.md` / `docs/results/ui-2-cinematic.md` /
  `docs/results/raw/{surface-cinematic,recipe-authoring}.json` / `docs/results/raw/ui2-artifacts/`

## この surface で分かったこと（証拠に基づく）

1. **Recipe 境界の効果は backend 非依存**（U3/RC-4）: C(native) と D(tailwind) は同じ Recipe から
   **意味 DOM が byte 一致**し、fail-closed・低 context・recipe 収束を共有した。前サイクルの結論を Cinematic でも再現。
2. **CSS backend の効果は明確**: 同じ Recipe・同じ DOM で **C 3.5KB vs D 28.8KB（8.2×）**、
   D は arbitrary value 37。Native backend が Cinematic では桁違いに小さい。
3. **Tailwind は Cinematic で design vocabulary を実質バイパス**（U2）: 直接 Tailwind(A) は
   arbitrary value 30-61 + 全員 raw keyframes escape。motion は utility で書けない。
4. **表現力は方式で頭打ちにならない**（U4）: A/B/C/D すべて cinematic 基準（40px+ headline / 80vh+ hero）に到達、
   no-JS で hero+CTA 可読、mobile 溢れ 0。**direct Native(B) も十分な品質**（15KB, axe≈0）。
5. **閉じた Recipe の天井**（U5/RC-1）: 3/3 が `sectionTheme` の per-section 非対称を表現できないと報告。
   Cinematic の精密演出では語彙拡張が要る。

## §16 の採用判断（この surface・初回のみ）

**INSUFFICIENT_EVIDENCE** を選ぶ。ただし方向性の示唆:
- Cinematic surface に限れば、**Recipe→Native backend(C)** が CSS 最小・arbitrary/escape 不要・意味保護で最有力。
- ただし Recipe の**表現の天井**（per-section theme 等）が実在するため、**語彙拡張なしでは Cinematic を完全には賄えない**。
  この拡張コスト（RC-2 compiler growth）と、direct Native(B) の自由度との比較が未了。
- **direct Tailwind(A)** は動く（fidelity 到達）が、arbitrary+keyframes escape で Tailwind を採用した意味が薄い（TW-4）。

## 確定を保留する理由（正直に）
- **初回生成のみ**。長期 12 変更後の劣化（direct Tailwind の arbitrary 増殖 / Native の CSS 肥大 / Recipe の語彙膨張）が未計測。ここが用途判断の本命
- **Owner 評価が無い**（知覚的品質・「明確に異なる」創造性は SELF_TESTED）
- fidelity の geometry probe に測定欠陥（§18 記録済み。次サイクルで条件非依存な採点へ）
- 他 2 surface（Activity Stream / Campaign）未実施。用途別結論（USE_BY_SURFACE）はまだ出せない

## 次の正確なアクション
1. fidelity 採点を DOM geometry + computed style の条件非依存版へ差し替え
2. Cinematic に 12 変更列（T3）を A/B/C/D へ適用し、長期劣化を計測（本命）
3. Recipe 語彙の天井に対し、`sectionTheme` を per-section 指定できる拡張を設計し RC-2(compiler growth)を測る
4. Activity Stream surface を実施し、用途別結論の 2 点目を得る
5. Owner blind comparison 用に dist/surfaces の 4 条件を並べる
