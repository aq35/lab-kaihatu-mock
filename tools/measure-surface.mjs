/**
 * Cinematic surface の全条件を同一基準で計測する（初回生成実験）。
 *   node tools/measure-surface.mjs
 * 対象: dist/surfaces/{c,d} と scratchpad の ui2-a-*/ui2-b-*（AI 生成）。
 * 測る: fidelity(target 契約との一致) / no-JS / hostile overflow / a11y(axe) /
 *       CSS bytes / arbitrary-value & escape ratio(A) / 意味フィールド可視。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--no-first-run','--disable-sync','--disable-background-networking','--disable-component-update','--disable-features=Translate,AutofillServerCommunication'];
const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const target = JSON.parse(readFileSync('fixtures/surfaces/cinematic.target.json', 'utf8'));
const SB = '/tmp/claude-0/-home-user-lab-kaihatu-mock/51dc3877-856d-5de2-99d7-cd06401472c5/scratchpad';
const TYPES = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml' };

function serve(root) {
  const s = createServer(async (req, res) => {
    try { let p = normalize(decodeURIComponent(new URL(req.url,'http://x').pathname)).replace(/^(\.\.[/\\])+/,'');
      let f = join(root, p); const st = await stat(f).catch(()=>null); if (st?.isDirectory()) f = join(f,'index.html');
      res.writeHead(200,{'content-type':TYPES[extname(f)]??'application/octet-stream','cache-control':'no-store'}); res.end(await readFile(f)); }
    catch { res.writeHead(404); res.end('nf'); }
  });
  return new Promise((r)=>s.listen(0,'127.0.0.1',()=>r({s,port:s.address().port})));
}

// 計測対象を収集: c,d は dist/surfaces、a*,b* は scratchpad の生成物
const roots = {};
for (const c of ['c','d']) if (existsSync(`dist/surfaces/${c}/index.html`)) roots[c] = `dist/surfaces/${c}`;
for (const cond of ['a','b']) for (const i of [1,2,3]) {
  const d = `${SB}/ui2-${cond}-${i}`;
  if (existsSync(`${d}/index.html`)) roots[`${cond}${i}`] = d;
}

const browser = await chromium.launch({ executablePath: CHROME, args: ARGS });
const results = {};
for (const [name, root] of Object.entries(roots)) {
  // serve a copy (avoid path issues); measure at 1280 and 390
  const { s, port } = await serve(root);
  const row = { root };
  try {
    // desktop geometry + fidelity
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 20000 });
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' }).catch(()=>{});
    row.geom = await page.evaluate((t) => {
      const q = (s) => document.querySelector(s);
      const heroSel = '[data-section="hero"], header, .hero, [class*="hero"]';
      const hero = q(heroSel);
      const h1 = q('h1');
      const cta = q('a[href],button');
      const sections = document.querySelectorAll('section, [data-section]').length;
      const imgs = document.querySelectorAll('img').length;
      return { heroVh: hero ? Math.round(hero.getBoundingClientRect().height/window.innerHeight*100) : 0,
        h1px: h1 ? Math.round(parseFloat(getComputedStyle(h1).fontSize)) : 0,
        sections, imgs, hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    }, target);
    // fidelity score vs target contract
    row.fidelity = {
      heroTall: row.geom.heroVh >= target.heroMinHeightVh * 0.9,
      headlineBig: row.geom.h1px >= target.typeScale.headlineMinPx,
      sectionsEnough: row.geom.sections >= 5,
      noOverflow1280: row.geom.hOverflow <= 1,
    };
    // axe
    await page.evaluate(AXE);
    row.axe = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type:'tag', values:['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } });
      return r.violations.reduce((n,v)=>n+v.nodes.length,0);
    });
    await ctx.close();
    // mobile overflow
    const m = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const mp = await m.newPage(); await mp.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load',timeout:20000});
    row.mobileOverflow = await mp.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await m.close();
    // no-JS
    const nj = await browser.newContext({ javaScriptEnabled: false, viewport:{width:1280,height:900} });
    const np = await nj.newPage(); await np.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load',timeout:20000});
    row.noJs = await np.evaluate(()=>({ h1: (document.querySelector('h1')?.getBoundingClientRect().height??0)>0,
      cta: (document.querySelector('a[href],button')?.getBoundingClientRect().width??0)>0,
      textLen: document.body.innerText.replace(/\s+/g,'').length }));
    await nj.close();
    // css bytes + arbitrary/escape (static analysis of source)
    let cssBytes = 0; for (const f of readdirSync(root, { recursive: true }).filter?.(x=>String(x).endsWith('.css')) ?? [])
      cssBytes += Buffer.byteLength(readFileSync(join(root, String(f)), 'utf8'));
    if (!cssBytes) { for (const f of readdirSync(root)) if (f.endsWith('.css')) cssBytes += Buffer.byteLength(readFileSync(join(root,f),'utf8'));
      const stylesDir = join(root,'styles'); if (existsSync(stylesDir)) for (const f of readdirSync(stylesDir)) if (f.endsWith('.css')) cssBytes += Buffer.byteLength(readFileSync(join(stylesDir,f),'utf8')); }
    row.cssBytes = cssBytes;
    const html = existsSync(join(root,'index.html')) ? readFileSync(join(root,'index.html'),'utf8') : '';
    row.arbitraryValues = (html.match(/[a-z-]+\[[^\]]+\]/g) ?? []).length;   // tailwind arbitrary
    row.inlineStyle = (html.match(/\bstyle="/g) ?? []).length;
    row.styleTags = (html.match(/<style/g) ?? []).length;
  } catch (e) { row.error = String(e.message).slice(0,100); }
  s.close();
  results[name] = row;
}
await browser.close();
mkdirSync('docs/results/raw', { recursive: true });
writeFileSync('docs/results/raw/surface-cinematic.json', JSON.stringify({ ranAt:new Date().toISOString(), results }, null, 2)+'\n');
console.table(Object.entries(results).map(([n,r])=>({ cond:n, heroVh:r.geom?.heroVh, h1px:r.geom?.h1px, sec:r.geom?.sections,
  fidelity: r.fidelity?Object.values(r.fidelity).filter(Boolean).length+'/4':'-', axe:r.axe, mOver:r.mobileOverflow,
  noJsH1:r.noJs?.h1, noJsCta:r.noJs?.cta, cssB:r.cssBytes, arb:r.arbitraryValues, inline:r.inlineStyle, err:r.error?'ERR':'' })));
