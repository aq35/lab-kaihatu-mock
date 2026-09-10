# EXP-2 / EXP-3 / EXP-4 の仮説（結果より先に凍結）

このファイルが追加されたコミット SHA が凍結の証拠。**実装・測定はこのコミットの後に行う。**
共通の立場は EXP-1 と同じ: 絶対値でなく桁で語る／自己評価で確定しない／環境を受領書に残す。

---

## EXP-2: bundle-orders（束ね変換の桁）

EXP-1 の caveat「esbuild の単発 transform は Go 子プロセスへの IPC 律速」を、
**束ね変換（bundle）の土俵**で検証する。N 個の小モジュールを用意し、次を比べる:

- esbuild を **1 回 bundle** する（IPC 1 回で N ファイルを束ねる）
- esbuild で **transformSync×N**（EXP-1 と同じ、IPC が N 回）
- oxc / swc で **transform×N**（プロセス内・IPC 床なしの基準線）

凍結する予想:

- **H2-1**: esbuild は「1 回 bundle」の 1 ファイルあたりコストが「transform×N」より小さい
  → EXP-1 の 15x は bundle で縮む（IPC が償却される）。
- **H2-2**: oxc/swc の transform×N は IPC 床が無いので、N が小さくても esbuild per-file より速いまま。
  「bundle しないと速くない」のは esbuild 固有。
- **H2-3**: N を増やすと esbuild bundle の per-file コストは下がる（固定 IPC ÷ N の償却曲線）。
- 反証: bundle しても esbuild per-file が縮まない／oxc,swc が esbuild per-file より遅い。

## EXP-3: dependency-cost（依存 1 つの本当のコスト＝梯子の実測）

梯子「**依存を足さない > 共有する > 分割する(tree-shake) > 遅延読込する**」を bundle bytes で裏づける。
同じ機能（debounce 相当）を 4 通りで用意し、esbuild で bundle+minify して出力バイトを測る:

1. **自作**（足さない）: 10 行程度を自分で書く
2. **tree-shake**（分割）: `import { debounce } from 'lodash-es'`
3. **全体依存**（悪い形）: `import _ from 'lodash'`
4. **遅延**（dynamic import）: `import('lodash-es')` で別 chunk 化

凍結する予想:

- **H3-1**: 「全体依存」は「自作」より **2〜3 桁**重い。tree-shake しても自作より重い。
- **H3-2**: bytes は梯子順に単調: 自作 < tree-shake < 全体依存。桁で分かれる。
- **H3-3**: 遅延は **main（初期 bytes）を自作並みに小さく保つ**が、総 bytes は減らない
  （コストは消えず、初期表示から後ろへ移動しただけ）。
- 反証: tree-shake が自作と同桁まで小さい／遅延が総 bytes を減らす。

## EXP-4: minify-orders（minify 込みサイズの桁）

EXP-1 の非圧縮出力を、native minifier で圧縮して比べる。土俵: EXP-1 の各 transpiler 出力ではなく、
**公平のため単一の入力**（fixture を esbuild で型除去したもの）を全 minifier に通す。

- esbuild `minify:true` / swc `minifySync(compress+mangle)` / oxc-minify `minifySync`

凍結する予想:

- **H4-1**: minify 後サイズは minifier 間で**桁は変わらず**、定数倍（〜1.5x 以内）。
- **H4-2**: minify は EXP-1 の raw を大きく縮めるが、**gzip 後の差はさらに縮む**
  （圧縮と minify は仕事が重なる）。
- **H4-3**: 決定論は minify でも保たれる（同入力 → 同 hash）。
- 反証: どれかが桁違いに小さい／gzip 後にむしろ差が開く／再実行で hash が変わる。

---

## north-star（AIが好きそうなコンパイラ）への接続

EXP-1 で「決定論・出力の軽さ」は既製 transpiler にあると分かった。EXP-2〜4 は
**AI が道具を選ぶときに効く軸**を足す:

- EXP-2 → **呼び出し形態のコストは予測可能か**（単発 vs 束ね で桁が動くなら、AI は形態込みで選ぶ必要）
- EXP-3 → **依存の重さは桁で見えるか**（AI が「足す/自作/遅延」を bytes 根拠で判断できるか）
- EXP-4 → **最終出力の軽さと決定論は minify 後も保たれるか**
