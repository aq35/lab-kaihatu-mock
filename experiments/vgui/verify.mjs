/**
 * ブラウザ観測による淘汰。生成された候補を実描画し、hard 制約で survivor/culled を判定する。
 * これが VGUI の「検証」部分。自己申告でなく実測で落とす。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { renderCandidatePage } from './compiler.mjs';

const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const DOM_CONTRACT = JSON.parse(readFileSync('contracts/dom-contract.json', 'utf8'));
const shell = (css, body) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>c</title><link rel="stylesheet" href="./app.css"></head><body>${body}</body></html>`;

export async function verifyGeneration(browser, generation, { cards, hostile, constraints, outDir }) {
  rmSync(outDir, { recursive: true, force: true }); mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < generation.experiments.length; i++) {
    const p = generation.experiments[i].parameters;
    const d = `${outDir}/cand-${String(i).padStart(2, '0')}`; mkdirSync(d, { recursive: true });
    const happy = renderCandidatePage(cards, p), host = renderCandidatePage(hostile, p);
    writeFileSync(`${d}/app.css`, happy.css);
    writeFileSync(`${d}/index.html`, shell(happy.css, happy.html));
    writeFileSync(`${d}/hostile.html`, shell(happy.css, host.html));
  }
  const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8' };
  const srv = createServer(async (req, res) => {
    try { const pth = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
      const fs = await import('node:fs/promises'); res.writeHead(200, { 'content-type': TYPES[pth.split('.').pop()] ?? 'text/plain' }); res.end(await fs.readFile(`${outDir}/${pth}`)); }
    catch { if (!res.headersSent) res.writeHead(404); res.end('nf'); }
  });
  const port = await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
  const results = [];
  for (let i = 0; i < generation.experiments.length; i++) {
    const id = `cand-${String(i).padStart(2, '0')}`;
    const p = generation.experiments[i].parameters;
    const o = { id, params: p };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    await pg.goto(`http://127.0.0.1:${port}/${id}/index.html`, { waitUntil: 'load' });
    o.contract = await pg.evaluate((c) => { const hidden = [];
      for (const card of document.querySelectorAll('[data-card-type]')) { const req = c.requiredVisibleFields[card.dataset.cardType] ?? [];
        for (const f of card.querySelectorAll('[data-field]')) { if (!req.includes(f.dataset.field)) continue; const b = f.getBoundingClientRect(), cs = getComputedStyle(f);
          if ((b.width===0&&b.height===0)||cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0) hidden.push(`${card.dataset.cardId}.${f.dataset.field}`); } }
      return { hidden }; }, DOM_CONTRACT);
    o.targetTooSmall = await pg.evaluate(() => { let n=0; for (const b of document.querySelectorAll('button,a[href],input,select,textarea')) { const r=b.getBoundingClientRect(); if(r.width===0&&r.height===0)continue; if(r.width<24||r.height<24)n++; } return n; });
    await pg.evaluate(AXE);
    o.contrastViolations = await pg.evaluate(async () => { const r = await window.axe.run(document, { runOnly: ['color-contrast'] }); return r.violations.reduce((n, v) => n + v.nodes.length, 0); });
    o.cssBytes = (await (await import('node:fs/promises')).readFile(`${outDir}/${id}/app.css`)).length;
    await ctx.close();
    const rm = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
    const rp = await rm.newPage(); await rp.goto(`http://127.0.0.1:${port}/${id}/index.html`, { waitUntil: 'load' });
    o.reducedMotionOk = await rp.evaluate(() => { const s = document.querySelector('.kslot'); if (!s) return true; const cs = getComputedStyle(s); return cs.animationName === 'none' || cs.animationDuration === '0s' || Number(cs.opacity) === 1; });
    await rm.close();
    const h = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const hp = await h.newPage(); await hp.goto(`http://127.0.0.1:${port}/${id}/hostile.html`, { waitUntil: 'load' });
    o.hostileOverflow = await hp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await h.close();
    const fails = [];
    if (o.contract.hidden.length) fails.push('protected_meaning');
    if (o.contrastViolations > 0) fails.push('min_contrast');
    if (o.targetTooSmall > 0) fails.push('target_px');
    if (!o.reducedMotionOk) fails.push('reduced_motion');
    if (o.hostileOverflow > 1) fails.push('hostile_overflow');
    if (o.cssBytes > constraints.max_css_bytes) fails.push('css_bytes');
    o.survived = fails.length === 0; o.fails = fails;
    results.push(o);
  }
  srv.close();
  return results;
}
