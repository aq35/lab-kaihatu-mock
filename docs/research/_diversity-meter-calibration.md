# 多様性測定器の校正（結果を見る前に凍結）

```
凍結時刻: この doc の commit 時点（測定前）
目的: VGUI の「表現の多様性」を判定する測定器を、既知の対照で校正する。
規律: pixel diff 単独では判定しない。複数の独立指標に分け、既知の順序を復元できるか見る。
      復元できなければ、この測定器を VGUI の多様性判定に使わない。
```

これは VGUI の結果ではなく**測定器そのものの検証**。V3 は新証拠が出るまで SUPPORTED に戻さない。

## 対照（すべて同一の意味 DOM＝`fixtures/cards.happy.json` の 5 カード上で描く）

負の対照（多様であってはならない）:
- **N1 identical**: 同一ページ ×3（byte 一致）。多様性 ≈ 0 のはず。
- **N2 color-only**: VGUI の基準 CSS のまま、**accentHue だけ**を変えた 4 案。
- **N3 spacing-only**: 同じ基準 CSS の `--pad/--gap/--feed` **だけ**を倍率変更した 4 案（書体・色・構造は不変）。

被験（今回問題になったもの）:
- **T current-vgui**: gen1 の生存 4 案（cand-01/04/07/08）。連続スカラー（density・contrast・radius・hue…）の複合。

正の対照（明確に多様であるべき）:
- **P structural**: ui-11 の構造テーマ群（同一意味 DOM から作った、書体・レイアウト様式・種別の示し方が違う案）
  = {standard, calm-console, editorial, command-center, conversational, timeline}。

## 指標（分離する。pixel だけに頼らない）

各条件の**全ペア平均**で出す。0=同一、大きいほど多様。

1. **pixel**: 固定枠に描いた画素の平均絶対差（0..1）。
2. **ssim**: 構造的類似度 SSIM を距離化（1−SSIM、グレースケール窓）。レイアウト構造の差に効く。
3. **geometry**: レイアウト幾何。カード/フィールド/アクションの bounding box（位置・大きさ・列数・
   rail や timeline 軸の有無・カード間隔）から特徴ベクトルを作り距離化。**色や本文は無視し、配置だけ**見る。
4. **typography**: 主要要素の computed font-family（カテゴリ）・本文/見出し/ラベルの px・weight の距離。
5. **emphasis**: 画面内で視覚的に最も支配的な要素（面積×コントラスト×太さ）の対象と位置。カテゴリ距離。
6. **grouping**: フィールドが空間的にいくつの塊に分かれるか（枠・間隔から推定）の距離。

（**Owner same/different** は人間の指標。自動校正には含めない。器械の自動指標だけで順序を復元できねばならない。）

## 凍結する期待順序（測定前に固定）

```
identical  <  scalar-only(N2,N3)  <  current-vgui(T)  <  structural(P)
```

## 合否規則（測定前に固定）

測定器を VGUI の多様性判定に**使ってよい条件**:

1. **composite（全指標の合成）が上記の狭義順序を復元する**こと。
2. かつ、**構造に敏感な指標（geometry・typography）が structural を current-vgui より明確に上に置く**こと
   （スカラー変化では geometry/typography はほぼ 0、構造変化では大きく出る、という分離が見えること）。
3. pixel 単独の順序が合っていても、それだけでは合格にしない（1 と 2 の両方が要る）。

どれかを満たさなければ「測定器がまだ正しく測れていない」とみなし、VGUI 判定には使わず器械を直す。

## 予想（当てにいく。外れたら記録する）

- pixel・ssim: structural で最大。ただし color-only も色差で pixel はそこそこ出るはず → pixel 単独が
  当てにならない例が見えるかもしれない（それが「pixel だけに頼らない」理由の実証になる）。
- geometry・typography: N1/N2 でほぼ 0、N3 で小、T で小〜中、P で大。ここが effective な弁別器のはず。
- current-vgui は scalar-only より上（複合スカラー）だが structural には届かない、が予想。

## 成果物

- 測定器: `tools/vgui-diversity-meter.mjs`
- 生データ: `docs/results/raw/vgui-diversity-calibration.json`
- 判定: この doc に合否と、各指標が順序を復元したかを追記（測定後）。
