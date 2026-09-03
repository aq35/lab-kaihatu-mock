/**
 * 全 variant を同一条件で計測する。
 *   node tools/measure.mjs [--out docs/results/raw/<name>.json]
 *
 * 測るもの:
 *   bytes (HTML/CSS/JS) / request 数 / DOM node 数
 *   CSS: rule 数・重複宣言・specificity・!important・未使用・layer・container query
 *   性能: LCP / CLS / 描画時間（1,000 カード）/ theme 切替 / filter 応答
 *   アクセシビリティ: axe-core violations / keyboard 到達性 / target size
 *   敵対的 content: 横スクロール・はみ出し
 *   no-JS: required information が読めるか
 *   security: XSS fixture が実行されないか
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';
import { COLLECT } from './browser-metrics.js';
import { build, VARIANTS } from './build-variants.mjs';

const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const DOM_CONTRACT = JSON.parse(readFileSync('contracts/dom-contract.json', 'utf8'));
const CPU_THROTTLE = Number(process.env.CPU_THROTTLE ?? 4);

const args = process.argv.slice(2);
const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'docs/results/raw/measurements.json';

async function measureVariant(browser, base, variant) {
  const r = { variant: variant.id, label: variant.label };

  // ---------- 1. bytes / requests / CSS 指標 / DOM -----------------------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const bytes = { html: 0, css: 0, js: 0, other: 0 };
    let requests = 0;
    page.on('response', async (res) => {
      requests++;
      const ct = res.headers()['content-type'] ?? '';
      const len = (await res.body().catch(() => Buffer.alloc(0))).length;
      if (ct.includes('html')) bytes.html += len;
      else if (ct.includes('css')) bytes.css += len;
      else if (ct.includes('javascript')) bytes.js += len;
      else bytes.other += len;
    });
    await page.goto(`${base}/${variant.id}/cards.happy.html`, { waitUntil: 'networkidle' });
    r.bytes = bytes;
    r.requests = requests;
    r.css = await page.evaluate(COLLECT);
    await ctx.close();
  }

  // ---------- 2. アクセシビリティ ----------------------------------------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${base}/${variant.id}/cards.happy.html`, { waitUntil: 'networkidle' });
    // CSP (script-src 'self') を弱めずに axe を読み込む。
    // <script> 要素の注入は CSP に阻まれるので、CDP 経由の evaluate で入れる。
    await page.evaluate(AXE);
    const axe = await page.evaluate(async () => {
      const res = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      });
      return res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
    });
    r.axe = { violations: axe, total: axe.reduce((n, v) => n + v.nodes, 0) };

    // keyboard: Tab だけで全 action に到達できるか
    r.keyboard = await page.evaluate(() => {
      const actions = [...document.querySelectorAll('[data-action-semantic]')];
      const shadowActions = [...document.querySelectorAll('*')]
        .filter((e) => e.shadowRoot)
        .flatMap((e) => [...e.shadowRoot.querySelectorAll('[data-action-semantic]')]);
      const all = [...actions, ...shadowActions];
      const focusable = all.filter((el) => {
        const tag = el.tagName.toLowerCase();
        return (tag === 'button' || tag === 'a') && !el.hasAttribute('disabled') && el.tabIndex >= 0;
      });
      return { actions: all.length, keyboardReachable: focusable.length,
        clickableDivs: all.filter((e) => !['BUTTON', 'A'].includes(e.tagName)).length };
    });

    // WCAG 2.2 target size (24x24 CSS px 以上)
    r.targetSize = await page.evaluate(() => {
      const collect = (root) => [...root.querySelectorAll('button, a[href], input, select, textarea')];
      const els = [...collect(document), ...[...document.querySelectorAll('*')].filter((e) => e.shadowRoot).flatMap((e) => collect(e.shadowRoot))];
      let tooSmall = 0;
      for (const el of els) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) continue;
        if (b.width < 24 || b.height < 24) tooSmall++;
      }
      return { checked: els.length, tooSmall };
    });

    // focus ring が見えるか（outline が消されていないか）
    r.focusVisible = await page.evaluate(() => {
      const btn = document.querySelector('[data-action-semantic]') ??
        [...document.querySelectorAll('*')].find((e) => e.shadowRoot)?.shadowRoot?.querySelector('[data-action-semantic]');
      if (!btn) return { ok: false, reason: 'no action found' };
      btn.focus();
      const cs = getComputedStyle(btn);
      const hasOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      return { ok: hasOutline || cs.boxShadow !== 'none', outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle };
    });
    await ctx.close();
  }

  // ---------- 3. 契約: required information が可視か ---------------------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${base}/${variant.id}/cards.happy.html`, { waitUntil: 'networkidle' });
    r.contract = await page.evaluate((contract) => {
      const cards = [...document.querySelectorAll('[data-card-type]')];
      const missing = [], hidden = [];
      const findFields = (card) => {
        const root = card.shadowRoot ?? card;
        return [...root.querySelectorAll('[data-field]')];
      };
      for (const card of cards) {
        const type = card.dataset.cardType;
        const required = contract.requiredVisibleFields[type] ?? [];
        const fields = findFields(card);
        const present = new Set(fields.map((f) => f.dataset.field));
        for (const req of required) if (!present.has(req)) missing.push({ card: card.dataset.cardId, field: req });
        for (const f of fields) {
          const b = f.getBoundingClientRect();
          const cs = getComputedStyle(f);
          const invisible = (b.width === 0 && b.height === 0) || cs.display === 'none' ||
            cs.visibility === 'hidden' || Number(cs.opacity) === 0 || cs.fontSize === '0px';
          if (invisible && required.includes(f.dataset.field)) hidden.push({ card: card.dataset.cardId, field: f.dataset.field });
        }
      }
      return { cards: cards.length, missing, hidden };
    }, DOM_CONTRACT);
    await ctx.close();
  }

  // ---------- 4. no-JS: 必須情報が読めるか -------------------------------------
  {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(`${base}/${variant.id}/cards.happy.html`, { waitUntil: 'load' });
    r.noJs = await page.evaluate((contract) => {
      const cards = [...document.querySelectorAll('[data-card-type]')];
      let readable = 0, unreadable = 0;
      const missingText = [];
      for (const card of cards) {
        const root = card.shadowRoot ?? card;
        const required = contract.requiredVisibleFields[card.dataset.cardType] ?? [];
        const present = new Set([...root.querySelectorAll('[data-field]')].map((f) => f.dataset.field));
        const missing = required.filter((f) => !present.has(f));
        if (missing.length) { unreadable++; missingText.push({ card: card.dataset.cardId, missing }); }
        else readable++;
      }
      return { cards: cards.length, readable, unreadable, missingText,
        formsSubmittable: [...document.querySelectorAll('form[method="post" i]')].length +
          [...document.querySelectorAll('*')].filter((e) => e.shadowRoot)
            .reduce((n, e) => n + e.shadowRoot.querySelectorAll('form[method="post" i]').length, 0) };
    }, DOM_CONTRACT);
    await ctx.close();
  }

  // ---------- 5. 敵対的 content: はみ出し --------------------------------------
  {
    for (const [key, width] of [['mobile320', 320], ['desktop1280', 1280]]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(`${base}/${variant.id}/cards.hostile.html`, { waitUntil: 'networkidle' });
      r.hostile ??= {};
      r.hostile[key] = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflowingElements = [];
        const check = (root) => {
          for (const el of root.querySelectorAll('*')) {
            const b = el.getBoundingClientRect();
            if (b.width === 0) continue;
            if (b.right > window.innerWidth + 1 || b.left < -1) overflowingElements.push(el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
            if (el.shadowRoot) check(el.shadowRoot);
          }
        };
        check(document);
        return {
          pageScrollsHorizontally: doc.scrollWidth > doc.clientWidth + 1,
          horizontalOverflowPx: Math.max(0, doc.scrollWidth - doc.clientWidth),
          overflowingElementCount: overflowingElements.length,
          samples: [...new Set(overflowingElements)].slice(0, 5),
        };
      });
      await ctx.close();
    }
  }

  // ---------- 6. security: XSS fixture が実行されないか -------------------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${base}/${variant.id}/cards.hostile.html`, { waitUntil: 'networkidle' });
    r.security = await page.evaluate(() => ({
      scriptExecuted: window.__pwned === true,
      injectedElements: document.querySelectorAll('.fake-card').length,
      inlineScriptTags: [...document.querySelectorAll('script')].filter((s) => !s.src && s.textContent.includes('__pwned')).length,
    }));
    await ctx.close();
  }

  // ---------- 7. 性能 ------------------------------------------------------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
    await page.goto(`${base}/${variant.id}/cards.scale-100.html`, { waitUntil: 'networkidle' });
    const vitals = await page.evaluate(() => new Promise((resolve) => {
      const out = { lcp: 0, cls: 0 };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) out.lcp = Math.max(out.lcp, e.startTime); })
        .observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) out.cls += e.value; })
        .observe({ type: 'layout-shift', buffered: true });
      setTimeout(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        resolve({ ...out, domContentLoaded: nav?.domContentLoadedEventEnd ?? 0, load: nav?.loadEventEnd ?? 0 });
      }, 900);
    }));
    r.perf = { cpuThrottle: CPU_THROTTLE, cards100: vitals };

    // 1,000 カード。networkidle は方式によって到達しないため 'load' で測り、
    // 到達しなかった場合も落とさずに記録する（それ自体が結果である）。
    let requests1000 = 0;
    page.on('request', () => { requests1000++; });
    const t0 = Date.now();
    let loadOutcome = 'load';
    try {
      await page.goto(`${base}/${variant.id}/cards.scale-1000.html`, { waitUntil: 'load', timeout: 60_000 });
    } catch (e) {
      loadOutcome = 'timeout-60s';
    }
    const loadMs = Date.now() - t0;
    let idleOutcome = 'networkidle';
    try {
      await page.waitForLoadState('networkidle', { timeout: 20_000 });
    } catch { idleOutcome = 'never-idle-20s'; }
    r.perf.cards1000 = {
      loadOutcome, loadMs, idleOutcome, requests: requests1000,
      ...(await page.evaluate(() => {
        const t = performance.now();
        const countAll = (root) => {
          let n = root.querySelectorAll('*').length;
          for (const el of root.querySelectorAll('*')) if (el.shadowRoot) n += countAll(el.shadowRoot);
          return n;
        };
        const nodes = countAll(document);
        return { domNodes: nodes, traverseMs: Math.round((performance.now() - t) * 10) / 10,
          domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? 0 };
      })),
    };
    const sel = await page.$('[data-type-filter]');
    if (sel) {
      const t = await page.evaluate(async () => {
        const s = document.querySelector('[data-type-filter]');
        const t0 = performance.now();
        s.value = 'ACTION_APPROVAL';
        s.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return performance.now() - t0;
      });
      r.perf.filter1000Ms = Math.round(t * 10) / 10;
    }
    // theme 切替の応答時間
    const themeSel = await page.$('[data-theme-select]');
    if (themeSel) {
      r.perf.themeSwitchMs = await page.evaluate(async () => {
        const s = document.querySelector('[data-theme-select]');
        const t0 = performance.now();
        s.value = 'command-center';
        s.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return Math.round((performance.now() - t0) * 10) / 10;
      });
    }
    await ctx.close();
  }

  // ---------- 8. theme が意味DOM なしで効くか（H2 / H5） ------------------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${base}/${variant.id}/cards.happy.html`, { waitUntil: 'networkidle' });
    const themes = ['calm-console', 'editorial', 'command-center', 'conversational', 'timeline'];
    r.themes = {};
    for (const t of themes) {
      r.themes[t] = await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        const card = document.querySelector('[data-card-type]');
        const inner = card?.shadowRoot?.querySelector('.card') ?? card;
        const cs = getComputedStyle(inner);
        const body = getComputedStyle(document.body);
        return {
          cardBackground: cs.backgroundColor, cardPadding: cs.paddingTop,
          cardRadius: cs.borderTopLeftRadius, fontFamily: cs.fontFamily.split(',')[0],
          fontSize: cs.fontSize, pageBackground: body.backgroundColor,
          borderStyle: cs.borderLeftStyle, borderColor: cs.borderLeftColor,
        };
      }, t);
    }
    await ctx.close();
  }

  return r;
}

const built = await build({ quiet: true });
const { server, port } = await startServer(0);
const base = `http://127.0.0.1:${port}`;
const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// 通常の計測は外部ネットワークへ出ない。fixture だけで完結させる。
export const LAUNCH_ARGS = [
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--disable-default-apps', '--no-first-run', '--no-default-browser-check',
  '--metrics-recording-only', '--disable-domain-reliability',
  '--disable-features=Translate,OptimizationHints,MediaRouter,AutofillServerCommunication,OptimizationGuideModelDownloading',
];
const browser = await chromium.launch({ executablePath: CHROME, args: LAUNCH_ARGS });

const results = { measuredAt: new Date().toISOString(), env: {
  node: process.version, cpuThrottle: CPU_THROTTLE,
  chromium: browser.version(), platform: process.platform,
}, variants: [] };

for (const v of VARIANTS) {
  process.stderr.write(`measuring ${v.id}...\n`);
  const r = await measureVariant(browser, base, v);
  r.staticBytes = built.filter((b) => b.variant === v.id && b.fixture === 'cards.happy')[0]?.bytes ?? 0;
  results.variants.push(r);
}

await browser.close();
server.close();

mkdirSync(outPath.split('/').slice(0, -1).join('/'), { recursive: true });
writeFileSync(outPath, JSON.stringify(results, null, 2) + '\n');
console.log(`\nwrote ${outPath}`);
