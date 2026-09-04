/**
 * Verified Generative UI パイプライン実行:
 *   node tools/vgui-run.mjs [seed] [n]
 * 生成 → 展開 → ブラウザ観測 → 淘汰 → 生存案を gallery に、結果を JSON に。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { generate } from '../experiments/vgui/generator.mjs';
import { renderCandidatePage } from '../experiments/vgui/compiler.mjs';

const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--no-first-run','--disable-sync','--disable-background-networking','--disable-component-update','--disable-features=Translate,AutofillServerCommunication'];
const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const DOM_CONTRACT = JSON.parse(readFileSync('contracts/dom-contract.json', 'utf8'));
const seed = Number(process.argv[2] ?? 7), n = Number(process.argv[3] ?? 12);
const OUT = 'dist/vgui/gen1';

const grammar = {
  intent: { primary_emotion: 'quiet anticipation', attention_path: ['identity', 'evidence', 'action'], reading_rhythm: 'slow_then_decisive' },
  constraints: { protected_meaning: true, minimum_contrast: 4.5, maximum_lcp_ms: 2500, reduced_motion_required: true, min_target_px: 24, max_css_bytes: 12000 },
};
const cards = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'));
const hostile = JSON.parse(readFileSync('fixtures/cards.hostile.json', 'utf8'));

const gen = generate(grammar, { n, seed });
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });

// 各候補の静的ページを書き出す
const shell = (title, css) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="./app.css"></head><body>{{BODY}}</body></html>`;
for (let i = 0; i < gen.experiments.length; i++) {
  const p = gen.experiments[i].parameters;
  const d = `${OUT}/cand-${String(i).padStart(2, '0')}`; mkdirSync(d, { recursive: true });
  const happy = renderCandidatePage(cards, p);
  const host = renderCandidatePage(hostile, p);
  writeFileSync(`${d}/app.css`, happy.css);
  writeFileSync(`${d}/index.html`, shell(`cand ${i}`, happy.css).replace('{{BODY}}', happy.html));
  writeFileSync(`${d}/hostile.html`, shell(`cand ${i} hostile`, happy.css).replace('{{BODY}}', host.html));
}

// serve OUT
const TYPES = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8' };
const srv = createServer(async (req, res) => {
  try { const p = decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/+/,'');
    const fs = await import('node:fs/promises'); const buf = await fs.readFile(`${OUT}/${p}`);
    res.writeHead(200,{'content-type':TYPES['.'+p.split('.').pop()]??'text/plain'}); res.end(buf); }
  catch { if(!res.headersSent) res.writeHead(404); res.end('nf'); }
});
const port = await new Promise((r) => srv.listen(0,'127.0.0.1',()=>r(srv.address().port)));

const browser = await chromium.launch({ executablePath: CHROME, args: ARGS });
const results = [];
for (let i = 0; i < gen.experiments.length; i++) {
  const id = `cand-${String(i).padStart(2,'0')}`;
  const p = gen.experiments[i].parameters;
  const obs = { id, params: p };
  // 1) contract + target + contrast (axe) at 1280
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/${id}/index.html`, { waitUntil: 'load' });
  obs.contract = await page.evaluate((contract) => {
    const hidden = [];
    for (const card of document.querySelectorAll('[data-card-type]')) {
      const req = contract.requiredVisibleFields[card.dataset.cardType] ?? [];
      for (const f of card.querySelectorAll('[data-field]')) {
        if (!req.includes(f.dataset.field)) continue;
        const b = f.getBoundingClientRect(); const cs = getComputedStyle(f);
        if ((b.width===0&&b.height===0)||cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0) hidden.push(`${card.dataset.cardId}.${f.dataset.field}`);
      }
    }
    return { hidden };
  }, DOM_CONTRACT);
  obs.targetTooSmall = await page.evaluate(() => {
    let bad=0; for (const b of document.querySelectorAll('button,a[href],input,select,textarea')) { const r=b.getBoundingClientRect(); if(r.width===0&&r.height===0)continue; if(r.width<24||r.height<24)bad++; } return bad;
  });
  await page.evaluate(AXE);
  obs.contrastViolations = await page.evaluate(async () => { const r = await window.axe.run(document,{runOnly:['color-contrast']}); return r.violations.reduce((n,v)=>n+v.nodes.length,0); });
  obs.cssBytes = (await (await import('node:fs/promises')).readFile(`${OUT}/${id}/app.css`)).length;
  await ctx.close();
  // 2) reduced-motion honored: with reduce, element must not be mid-animation (opacity 1 immediately)
  const rm = await browser.newContext({ viewport:{width:1280,height:900}, reducedMotion:'reduce' });
  const rp = await rm.newPage(); await rp.goto(`http://127.0.0.1:${port}/${id}/index.html`,{waitUntil:'load'});
  obs.reducedMotionOk = await rp.evaluate(() => { const s=document.querySelector('.kslot'); if(!s)return true; const cs=getComputedStyle(s); return cs.animationName==='none'||cs.animationDuration==='0s'||Number(cs.opacity)===1; });
  await rm.close();
  // 3) hostile overflow at 360
  const h = await browser.newContext({ viewport:{width:360,height:800} });
  const hp = await h.newPage(); await hp.goto(`http://127.0.0.1:${port}/${id}/hostile.html`,{waitUntil:'load'});
  obs.hostileOverflow = await hp.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  await h.close();
  // verdict: hard constraints
  const fails = [];
  if (obs.contract.hidden.length) fails.push(`protected_meaning: ${obs.contract.hidden.length} hidden`);
  if (obs.contrastViolations > 0) fails.push(`min_contrast: ${obs.contrastViolations} axe`);
  if (obs.targetTooSmall > 0) fails.push(`target_px: ${obs.targetTooSmall}<24`);
  if (!obs.reducedMotionOk) fails.push('reduced_motion not honored');
  if (obs.hostileOverflow > 1) fails.push(`hostile_overflow ${obs.hostileOverflow}px`);
  if (obs.cssBytes > grammar.constraints.max_css_bytes) fails.push(`css_bytes ${obs.cssBytes}`);
  obs.survived = fails.length === 0; obs.fails = fails;
  results.push(obs);
}
await browser.close(); srv.close();

const survivors = results.filter(r => r.survived);
const summary = { ranAt: new Date().toISOString(), seed, n, grammar,
  generated: results.length, survived: survivors.length, culled: results.length - survivors.length,
  cullReasons: results.filter(r=>!r.survived).map(r=>({id:r.id,fails:r.fails})),
  results };
mkdirSync('docs/results/raw', { recursive: true });
writeFileSync('docs/results/raw/vgui-gen1.json', JSON.stringify(summary, null, 2)+'\n');
console.table(results.map(r=>({ id:r.id, dens:r.params.density.toFixed(2), contrast:r.params.contrastEmphasis.toFixed(2),
  hidden:r.contract.hidden.length, axe:r.contrastViolations, small:r.targetTooSmall, rm:r.reducedMotionOk?'ok':'BAD', hOver:r.hostileOverflow, css:r.cssBytes, survived:r.survived?'✓':'✗' })));
console.log(`\ngenerated ${results.length}, survived ${survivors.length}, culled ${results.length-survivors.length}`);
