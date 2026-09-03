/**
 * 有効 Recipe 空間を数え直す（§7）。「38,880 通り」は組合せ数であって多様性ではない。
 *   node tools/tailwind/effective-space.mjs
 *
 * 除外するもの:
 *  - 同じ CSS bytes になる組合せ（見た目が同一）
 *  - a11y 違反（palette のコントラストが AA 未満）になる組合せ
 * 残りを「機械的に区別可能な Recipe 空間」とする。知覚的多様性は別（Owner 評価）。
 */
import { compileCss, VOCAB } from '../../experiments/e-compiler/compiler.mjs';
import { contrastRatio, parseColor } from '../../tools/color.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const keys = Object.keys(VOCAB);
const total = keys.reduce((n, k) => n * VOCAB[k].length, 1);

// palette ごとの本文コントラスト（AA 判定）。palette は CSS の :root 色を決める
const PAL_INK = {
  calm:['oklch(22% 0.016 250)','oklch(100% 0 0)'], editorial:['oklch(24% 0.02 60)','oklch(99% 0.008 85)'],
  'command-center':['oklch(95% 0.005 260)','oklch(24% 0.018 260)'], conversational:['oklch(22% 0.016 320)','oklch(100% 0 0)'],
  'high-contrast':['oklch(15% 0 0)','oklch(100% 0 0)'],
};
const paletteAA = Object.fromEntries(Object.entries(PAL_INK).map(([p, [ink, card]]) => [p, contrastRatio(ink, card) >= 4.5]));

// 全組合せを列挙して CSS hash を取る（38,880。数分かかるのでサンプルでなく全数）
const seen = new Map();      // cssHash -> 代表 recipe
let a11yViolating = 0, counted = 0;
const idx = keys.map(() => 0);
function* enumerate() {
  const n = keys.length;
  const c = new Array(n).fill(0);
  while (true) {
    yield Object.fromEntries(keys.map((k, i) => [k, VOCAB[k][c[i]]]));
    let i = n - 1;
    while (i >= 0 && ++c[i] >= VOCAB[keys[i]].length) { c[i] = 0; i--; }
    if (i < 0) break;
  }
}

for (const recipe of enumerate()) {
  counted++;
  if (!paletteAA[recipe.palette]) { a11yViolating++; continue; }
  const css = compileCss(recipe).replace(/\/\* generated[^*]*\*\//, '');
  const h = sha(css);
  if (!seen.has(h)) seen.set(h, recipe);
}

// どの軸が CSS を実際に変えるか（他を固定して 1 軸だけ動かす）
const baseRecipe = Object.fromEntries(keys.map((k) => [k, VOCAB[k][0]]));
const stripC = (r) => compileCss(r).replace(/\/\* generated[^*]*\*\//, '');
const axisEffect = {};
for (const k of keys) {
  const outputs = new Set(VOCAB[k].map((v) => sha(stripC({ ...baseRecipe, [k]: v }))));
  axisEffect[k] = { values: VOCAB[k].length, distinctOutputs: outputs.size, affectsCss: outputs.size > 1 };
}

const out = {
  totalCombinations: total,
  enumerated: counted,
  a11yViolatingCombinations: a11yViolating,
  distinctCssAfterA11y: seen.size,
  note: 'distinctCssAfterA11y = a11y を満たし、かつ CSS bytes が互いに異なる組合せ数。知覚的多様性ではない（Owner 評価が別途必要）',
  paletteAA,
  axisEffect,
  axesThatAffectCss: Object.entries(axisEffect).filter(([,v])=>v.affectsCss).map(([k])=>k),
  axesWithNoCssEffect: Object.entries(axisEffect).filter(([,v])=>!v.affectsCss).map(([k])=>k),
};
mkdirSync('docs/results/raw', { recursive: true });
writeFileSync('docs/results/raw/effective-space.json', JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
