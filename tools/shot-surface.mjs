import { chromium } from 'playwright';
import { startServer } from './serve.mjs';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--no-first-run','--disable-sync','--disable-background-networking','--disable-component-update','--disable-features=Translate,AutofillServerCommunication'];
const { server, port } = await startServer(0, 'dist');
const b = await chromium.launch({ executablePath: CHROME, args: ARGS });
for (const c of (process.argv.slice(2).length ? process.argv.slice(2) : ['c','d'])) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${port}/surfaces/${c}/index.html`, { waitUntil: 'load' });
  await p.screenshot({ path: `dist/surfaces/${c}/shot-desktop.png`, fullPage: true });
  // metrics
  const g = await p.evaluate(() => {
    const hero = document.querySelector('[data-section="hero"]');
    const h1 = document.querySelector('[data-field="headline"]');
    const cta = document.querySelector('[data-cta="PRIMARY"]');
    return { heroVh: hero ? Math.round(hero.getBoundingClientRect().height / window.innerHeight * 100) : 0,
      h1px: h1 ? Math.round(parseFloat(getComputedStyle(h1).fontSize)) : 0,
      sections: document.querySelectorAll('[data-section]').length,
      ctaVisible: cta ? cta.getBoundingClientRect().width > 0 : false,
      hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  // no-JS readable
  const ctx2 = await b.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto(`http://127.0.0.1:${port}/surfaces/${c}/index.html`, { waitUntil: 'load' });
  const noJs = await p2.evaluate(() => ({ fields: document.querySelectorAll('[data-field]').length,
    headlineVisible: (document.querySelector('[data-field="headline"]')?.getBoundingClientRect().height ?? 0) > 0,
    ctaVisible: (document.querySelector('[data-cta="PRIMARY"]')?.getBoundingClientRect().width ?? 0) > 0 }));
  console.log(c, '| heroVh', g.heroVh, 'h1px', g.h1px, 'sections', g.sections, 'ctaVis', g.ctaVisible, 'hOverflow', g.hOverflow, '| no-JS fields', noJs.fields, 'headline', noJs.headlineVisible, 'cta', noJs.ctaVisible);
  await ctx.close(); await ctx2.close();
}
await b.close(); server.close();
