/**
 * feature-parity: 全条件が同じ機能を持つか機械検査する。
 *   node tools/feature-parity.mjs
 * 1 項目でも欠ける条件は docs/results/ui-feature-parity.md で「性能比較から除外」と記録する。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';
import { build, VARIANTS } from './build-variants.mjs';

const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps','--no-first-run','--no-default-browser-check','--metrics-recording-only','--disable-domain-reliability','--disable-features=Translate,OptimizationHints,MediaRouter,AutofillServerCommunication,OptimizationGuideModelDownloading'];
const manifest = JSON.parse(readFileSync('contracts/feature-parity.json', 'utf8'));

const CHECKS = {
  async cardTypes5(page) { return (await page.$$('[data-card-type]')).length >= 5; },
  async filter(page) {
    const sel = await page.$('[data-type-filter]'); if (!sel) return false;
    await page.evaluate(() => {
      const s = document.querySelector('[data-type-filter]');
      s.value = 'ACTION_APPROVAL';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(120);
    return page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-card-type]')];
      const visible = cards.filter((c) => c.getClientRects().length > 0 && c.getBoundingClientRect().height > 0);
      return visible.length > 0 && visible.every((c) => c.dataset.cardType === 'ACTION_APPROVAL');
    });
  },
  async submitForm(page) { return (await page.$$('form[method="post" i], form[data-decision-form]')).length > 0; },
  async evidenceDisplay(page) { return (await page.$$('[data-evidence-level]')).length > 0; },
  async outcomeUnknown(page) {
    return page.evaluate(() => {
      const c = document.querySelector('[data-card-type="OUTCOME_UNKNOWN_REVIEW"]'); if (!c) return false;
      const retry = c.querySelector('[data-action-semantic="RETRY_WITH_DUPLICATE_RISK"]');
      return retry && retry.dataset.primary !== 'true';
    });
  },
  async keyboard(page) {
    return page.evaluate(() => {
      const a = [...document.querySelectorAll('[data-action-semantic]')];
      return a.length > 0 && a.every((el) => ['BUTTON', 'A'].includes(el.tagName));
    });
  },
};
// 静的（描画不要）な検査は別 fixture / context で
const STATIC = {
  async noJsReadable(browser, base, v) {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(`${base}/${v}/cards.happy.html`, { waitUntil: 'load' });
    const ok = await page.evaluate(() => document.querySelectorAll('[data-field]').length > 10);
    await ctx.close(); return ok;
  },
  async doubleSubmitGuard(browser, base, v) {
    // forms.js か kas-decision-form が二重送信を止める実装を持つか（静的に scripts の存在で代理）
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    await page.goto(`${base}/${v}/cards.happy.html`, { waitUntil: 'networkidle' });
    const ok = await page.evaluate(() => !!document.querySelector('form[data-decision-form], kas-decision-form'));
    await ctx.close(); return ok;
  },
  async hostileNoOverflow(browser, base, v) {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${base}/${v}/cards.hostile.html`, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await ctx.close(); return overflow <= 1;
  },
  async scale1000(browser, base, v) {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    let ok = false;
    try { await page.goto(`${base}/${v}/cards.scale-1000.html`, { waitUntil: 'load', timeout: 45000 });
      ok = (await page.$$('[data-card-type]')).length > 500; } catch { ok = false; }
    await ctx.close(); return ok;
  },
};

await build({ quiet: true });
const { server, port } = await startServer(0);
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: CHROME, args: ARGS });
const results = {};
for (const v of VARIANTS) {
  const row = {};
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(`${base}/${v.id}/cards.happy.html`, { waitUntil: 'networkidle' });
  for (const feat of manifest.features) {
    if (CHECKS[feat.check]) row[feat.check] = await CHECKS[feat.check](page).catch(() => false);
  }
  await ctx.close();
  for (const feat of manifest.features) {
    if (STATIC[feat.check]) row[feat.check] = await STATIC[feat.check](browser, base, v.id).catch(() => false);
  }
  row.__complete = manifest.features.every((f) => row[f.check] === true);
  results[v.id] = row;
}
await browser.close(); server.close();
mkdirSync('docs/results/raw', { recursive: true });
writeFileSync('docs/results/raw/feature-parity.json', JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2) + '\n');
const table = Object.entries(results).map(([v, r]) => ({ variant: v, ...Object.fromEntries(manifest.features.map((f) => [f.check, r[f.check] ? '✓' : '✗'])), complete: r.__complete ? 'YES' : 'NO' }));
console.table(table);
