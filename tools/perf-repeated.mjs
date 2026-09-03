/**
 * 反復性能測定（§5）。単一試行を使わない。
 *   node tools/perf-repeated.mjs
 * feature-parity complete=YES の条件のみ対象。順序をランダム化し、各回独立 context。
 * 記録: median / p95 / min / max / stddev、bytes / requests / domNodes。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';
import { build } from './build-variants.mjs';

const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps','--no-first-run','--no-default-browser-check','--metrics-recording-only','--disable-domain-reliability','--disable-features=Translate,OptimizationHints,MediaRouter,AutofillServerCommunication,OptimizationGuideModelDownloading'];
const CPU = Number(process.env.CPU_THROTTLE ?? 4);
const parity = JSON.parse(readFileSync('docs/results/raw/feature-parity.json', 'utf8')).results;
const CONDITIONS = ['a-tailwind', 'c-semantic-css', 'c-bundled', 'e-compiler', 'f-recipe-tailwind']
  .filter((v) => parity[v]?.__complete);
const N_1000 = 8, N_100 = 20;

const stat = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length;
  const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const mean = s.reduce((x, y) => x + y, 0) / n;
  const sd = Math.sqrt(s.reduce((x, y) => x + (y - mean) ** 2, 0) / n);
  return { median: +med.toFixed(1), p95: +s[Math.min(n - 1, Math.ceil(0.95 * n) - 1)].toFixed(1),
    min: +s[0].toFixed(1), max: +s[n - 1].toFixed(1), stddev: +sd.toFixed(1), n }; };

await build({ quiet: true });
const { server, port } = await startServer(0);
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: CHROME, args: ARGS });

// 静的サイズ（1 回）
const sizes = {};
for (const v of CONDITIONS) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const bytes = { html: 0, css: 0, js: 0 }; let req = 0;
  page.on('response', async (r) => { req++; const ct = r.headers()['content-type'] ?? '';
    const len = (await r.body().catch(() => Buffer.alloc(0))).length;
    if (ct.includes('html')) bytes.html += len; else if (ct.includes('css')) bytes.css += len; else if (ct.includes('javascript')) bytes.js += len; });
  await page.goto(`${base}/${v}/cards.happy.html`, { waitUntil: 'networkidle' });
  const nodes = await page.evaluate(() => { const c = (r) => { let n = r.querySelectorAll('*').length; for (const e of r.querySelectorAll('*')) if (e.shadowRoot) n += c(e.shadowRoot); return n; }; return c(document); });
  sizes[v] = { ...bytes, requests: req, domNodesHappy: nodes };
  await ctx.close();
}

// ランダム順序の測定計画
const plan = [];
for (const v of CONDITIONS) { for (let i = 0; i < N_1000; i++) plan.push({ v, kind: '1000' }); for (let i = 0; i < N_100; i++) plan.push({ v, kind: '100' }); }
for (let i = plan.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [plan[i], plan[j]] = [plan[j], plan[i]]; }

const raw = Object.fromEntries(CONDITIONS.map((v) => [v, { load1000: [], filter100: [] }]));
for (const { v, kind } of plan) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  if (kind === '1000') {
    const t0 = Date.now();
    try { await page.goto(`${base}/${v}/cards.scale-1000.html`, { waitUntil: 'load', timeout: 60000 });
      raw[v].load1000.push(Date.now() - t0); } catch { raw[v].load1000.push(60000); }
  } else {
    try {
      await page.goto(`${base}/${v}/cards.scale-100.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(100); // boot.js が listener を張る猶予
      const t = await page.evaluate(async () => { const s = document.querySelector('[data-type-filter]'); if (!s) return -1;
        const t0 = performance.now(); s.value = 'ACTION_APPROVAL'; s.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t0; });
      if (t >= 0) raw[v].filter100.push(t);
    } catch { /* skip this sample */ }
  }
  await ctx.close();
}
await browser.close(); server.close();

const summary = {};
for (const v of CONDITIONS) summary[v] = { size: sizes[v],
  load1000ms: stat(raw[v].load1000), filter100ms: raw[v].filter100.length ? stat(raw[v].filter100) : null };
mkdirSync('docs/results/raw', { recursive: true });
writeFileSync('docs/results/raw/perf-repeated.json', JSON.stringify({ ranAt: new Date().toISOString(),
  env: { node: process.version, chromium: browser.version?.() ?? 'chromium', cpuThrottle: CPU }, conditions: CONDITIONS,
  N_1000, N_100, summary }, null, 2) + '\n');
console.table(CONDITIONS.map((v) => ({ variant: v, cssB: sizes[v].css, req: sizes[v].requests,
  load1000_med: summary[v].load1000ms.median, load1000_p95: summary[v].load1000ms.p95, load1000_sd: summary[v].load1000ms.stddev,
  filter_med: summary[v].filter100ms?.median ?? '-' })));
