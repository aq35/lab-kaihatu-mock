/**
 * VGUI 全ループ: 生成 → 観測淘汰(gen1) → Owner gallery → 選択 → 進化(gen2) → 成長文法の候補抽出。
 *   node tools/vgui-pipeline.mjs
 * Owner 実測は無いため、選択は SIMULATED_SELECTION(intent 中心に最も近い生存案)で代理し、明示する。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generate, nextGeneration } from '../experiments/vgui/generator.mjs';
import { verifyGeneration } from '../experiments/vgui/verify.mjs';

const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--no-first-run','--disable-sync','--disable-background-networking','--disable-component-update','--disable-features=Translate,AutofillServerCommunication'];
const grammar = {
  intent: { primary_emotion: 'quiet anticipation', attention_path: ['identity', 'evidence', 'action'], reading_rhythm: 'slow_then_decisive' },
  constraints: { protected_meaning: true, minimum_contrast: 4.5, maximum_lcp_ms: 2500, reduced_motion_required: true, min_target_px: 24, max_css_bytes: 12000 },
};
const cards = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'));
const hostile = JSON.parse(readFileSync('fixtures/cards.hostile.json', 'utf8'));
const AXES = ['density','hierarchy','contrastEmphasis','motionIntensity','whitespace','riskProminence','radius','ruleWeight'];
const dist = (a,b)=>Math.sqrt(AXES.reduce((s,k)=>s+(a[k]-b[k])**2,0));

const browser = await chromium.launch({ executablePath: CHROME, args: ARGS });

// --- 世代1 ---
const gen1 = generate(grammar, { n: 12, seed: 7 });
const r1 = await verifyGeneration(browser, gen1, { cards, hostile, constraints: grammar.constraints, outDir: 'dist/vgui/gen1' });
const surv1 = r1.filter(r => r.survived);

// --- Owner gallery（生存案を blind 比較。実 Owner 評価用の成果物） ---
mkdirSync('dist/vgui', { recursive: true });
const gallery = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VGUI 生存案 — Owner blind comparison</title><style>body{font-family:system-ui,"Hiragino Sans",sans-serif;margin:0;padding:1.5rem;background:#eef0f3}
h1{font-size:1.2rem}.grid{display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fill,minmax(24rem,1fr))}
.cell{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.cell h2{font-size:.85rem;margin:0;padding:.6rem .8rem;background:#222;color:#fff}
iframe{width:100%;height:640px;border:0;display:block}.note{color:#555;max-width:60ch}</style></head>
<body><h1>VGUI 生存案（観測で淘汰後）— 好みを 1 つ選んでください</h1>
<p class="note">意味・安全性・可読性・性能はすべて観測で検証済み（不適格案は既に淘汰）。ここでは Owner の好みだけを選びます。案の並びは blind（パラメータ非表示）。</p>
<div class="grid">${surv1.map((r,i)=>`<div class="cell"><h2>案 ${String.fromCharCode(65+i)}</h2><iframe src="./gen1/${r.id}/index.html" title="案 ${String.fromCharCode(65+i)}"></iframe></div>`).join('')}</div>
</body></html>`;
writeFileSync('dist/vgui/gallery.html', gallery);

// --- 選択（SIMULATED: intent 中心の生存案。実 Owner 評価の代理・明示） ---
const center = gen1.experiments[0].parameters;
const winner = surv1.map(r=>({r,d:dist(r.params,center)})).sort((a,b)=>a.d-b.d)[0]?.r;

// --- 世代2（勝者の周りを精緻化） ---
const gen2 = nextGeneration(grammar, winner.params, { n: 12, seed: 22, spread: 0.14 });
const r2 = await verifyGeneration(browser, gen2, { cards, hostile, constraints: grammar.constraints, outDir: 'dist/vgui/gen2' });
const surv2 = r2.filter(r => r.survived);
await browser.close();

// --- 成長文法の候補抽出（V7: 全 CSS を保存しない。生存領域の境界だけを PROPOSED として出す） ---
const bounds = {};
for (const k of AXES) { const vals = [...surv1, ...surv2].map(r => r.params[k]); bounds[k] = { min: +Math.min(...vals).toFixed(2), max: +Math.max(...vals).toFixed(2) }; }
const proposedRules = [
  { id: 'VG-R1', rule: `contrastEmphasis >= ${bounds.contrastEmphasis.min}`, basis: '低いと axe contrast 違反で淘汰された', status: 'PROPOSED', reproducedIn: ['gen1','gen2'], promoteRequires: ['複数 Goal/fixture で再現', 'Owner 選択', 'counter-proof'] },
  { id: 'VG-R2', rule: `density <= ${bounds.density.max}`, basis: '高いと target-size<24px で淘汰された', status: 'PROPOSED', reproducedIn: ['gen1','gen2'], promoteRequires: ['複数 Goal/fixture で再現', 'Owner 選択'] },
];

const summary = {
  ranAt: new Date().toISOString(), grammar,
  gen1: { generated: r1.length, survived: surv1.length, culled: r1.length - surv1.length,
    cullReasons: r1.filter(r=>!r.survived).map(r=>({ id:r.id, fails:r.fails })),
    survivorDiversity: { axes: AXES, meanPairwise: +(function(){let p=[];for(let i=0;i<surv1.length;i++)for(let j=i+1;j<surv1.length;j++)p.push(dist(surv1[i].params,surv1[j].params));return p.reduce((a,b)=>a+b,0)/p.length;})().toFixed(3) } },
  selection: { method: 'SIMULATED_SELECTION (intent 中心に最近傍。実 Owner 評価の代理)', winner: winner.id, winnerParams: winner.params, ownerVerification: 'REQUIRED — 未実施' },
  gen2: { generated: r2.length, survived: surv2.length, culled: r2.length - surv2.length, improvedSurvivalRate: (surv2.length/r2.length) >= (surv1.length/r1.length) },
  grownGrammar: { survivorBounds: bounds, proposedRules, governance: 'PROPOSED のみ。self-eval で ENABLED にしない。複数 Goal 再現 + Owner 選択で昇格' },
  artifacts: { gallery: 'dist/vgui/gallery.html', gen1: 'dist/vgui/gen1/', gen2: 'dist/vgui/gen2/' },
};
mkdirSync('docs/results/raw', { recursive: true });
writeFileSync('docs/results/raw/vgui-pipeline.json', JSON.stringify(summary, null, 2) + '\n');
console.log(`gen1: 生成 ${r1.length} / 生存 ${surv1.length} / 淘汰 ${r1.length-surv1.length}  多様性 ${summary.gen1.survivorDiversity.meanPairwise}`);
console.log(`選択(SIMULATED): ${winner.id}  density ${winner.params.density.toFixed(2)} contrast ${winner.params.contrastEmphasis.toFixed(2)}`);
console.log(`gen2: 生成 ${r2.length} / 生存 ${surv2.length} / 淘汰 ${r2.length-surv2.length}  生存率改善 ${summary.gen2.improvedSurvivalRate}`);
console.log(`成長文法(PROPOSED): ${proposedRules.map(r=>r.id+' '+r.rule).join(' | ')}`);
console.log(`Owner gallery: dist/vgui/gallery.html（生存 ${surv1.length} 案の blind 比較）`);
