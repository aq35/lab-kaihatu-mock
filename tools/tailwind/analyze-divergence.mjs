/**
 * T2 — 同じ視覚要求に対する独立セッション間の発散を測る。
 *   node tools/tailwind/analyze-divergence.mjs
 *
 * scratchpad の t2-a-1..3 / t2-e-1..3 を baseline (HEAD) と比べ、
 * A: 追加された class 集合の一致率（Jaccard）と生成 HTML hash
 * E: recipe の一致・生成 CSS bytes hash の一致
 * を測る。
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SB = '/tmp/claude-0/-home-user-lab-kaihatu-mock/51dc3877-856d-5de2-99d7-cd06401472c5/scratchpad';
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); const inter = [...A].filter((x) => B.has(x)).length; const uni = new Set([...A, ...B]).size; return uni ? (inter / uni) : 1; };

// A: 各コピーの render.mjs から ACTION_APPROVAL に追加された utility を集める
function tailwindClasses(dir) {
  const f = `${dir}/experiments/a-tailwind/render.mjs`;
  if (!existsSync(f)) return null;
  const src = readFileSync(f, 'utf8');
  // ACTION_APPROVAL body + 定数群の class 文字列を全部集める
  const classes = [...src.matchAll(/(?:class[=:]\s*|["'`])([a-z][a-z0-9:_\-\[\]#./%]+(?:\s+[a-z][a-z0-9:_\-\[\]#./%]+)+)["'`]/g)]
    .flatMap((m) => m[1].split(/\s+/)).filter((c) => /^[a-z].*[-:\[]/.test(c));
  return [...new Set(classes)];
}
function builtHtmlHash(dir, variant) {
  try {
    execSync(`cd ${dir} && node tools/build-variants.mjs`, { stdio: 'pipe' });
    return sha(readFileSync(`${dir}/dist/${variant}/cards.happy.html`, 'utf8'));
  } catch { return 'build-failed'; }
}
function recipe(dir) {
  const f = `${dir}/experiments/e-compiler/recipe.default.json`;
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
}

// --- A の発散 ---
const aRuns = [1, 2, 3].map((i) => ({ i, dir: `${SB}/t2-a-${i}` })).filter((r) => existsSync(r.dir));
const aClasses = aRuns.map((r) => tailwindClasses(r.dir)).filter(Boolean);
const aHtml = aRuns.map((r) => builtHtmlHash(r.dir, 'a-tailwind'));
let aPairwise = [];
for (let i = 0; i < aClasses.length; i++) for (let k = i + 1; k < aClasses.length; k++)
  aPairwise.push({ pair: `${i + 1}-${k + 1}`, jaccard: +jaccard(aClasses[i], aClasses[k]).toFixed(3) });

// --- E の発散 ---
const eRuns = [1, 2, 3].map((i) => ({ i, dir: `${SB}/t2-e-${i}` })).filter((r) => existsSync(r.dir));
const eRecipes = eRuns.map((r) => recipe(r.dir)).filter(Boolean);
async function eCssHash(dir) {
  const mod = await import(`${dir}/experiments/e-compiler/compiler.mjs`);
  const rec = JSON.parse(recipe(dir));
  return sha(mod.compileCss(rec));
}
const eCss = [];
for (const r of eRuns) eCss.push(await eCssHash(r.dir).catch(() => 'err'));

const out = {
  A: { runs: aRuns.length, htmlHashes: aHtml, distinctHtml: new Set(aHtml).size,
       classJaccardPairwise: aPairwise, meanJaccard: aPairwise.length ? +(aPairwise.reduce((s, p) => s + p.jaccard, 0) / aPairwise.length).toFixed(3) : null },
  E: { runs: eRuns.length, recipes: eRecipes.map((r) => JSON.parse(r)), cssHashes: eCss,
       distinctRecipes: new Set(eRecipes).size, distinctCss: new Set(eCss).size },
};
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('docs/results/raw', { recursive: true });
writeFileSync('docs/results/raw/divergence.json', JSON.stringify({ ranAt: new Date().toISOString(), ...out }, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
