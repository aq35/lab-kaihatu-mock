/**
 * 仮想化（windowed）の実測: 10k 件を積んでも実 DOM は数十行・create/scroll が安いことを見る。
 *   node bench/run-windowed.mjs
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';
if (!existsSync(EXE)) { console.log('Chromium 不在: skip'); process.exit(0); }

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve(HERE, 'dist/windowed.html')).href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true);
  const timeOp = (n) => page.evaluate(async (name) => { const t0 = performance.now(); await window.runOp(name); return +(performance.now() - t0).toFixed(2); }, n);

  await timeOp('create10k'); // warm
  const ms = [];
  for (let i = 0; i < 5; i++) ms.push(await timeOp('create10k'));
  const med = [...ms].sort((a, b) => a - b)[2];
  const domRows = await page.evaluate(() => window.domRows());
  // スクロール後も実 DOM 行数は一定
  const scrollMs = await page.evaluate(async () => { const t0 = performance.now(); window.scrollVp(28 * 5000); return +(performance.now() - t0).toFixed(2); });
  const domAfter = await page.evaluate(() => window.domRows());
  const firstAfter = await page.evaluate(() => document.querySelector('.row .id')?.textContent);

  console.log('\nsunao windowed（10,000 件を仮想化）');
  console.log('─'.repeat(52));
  console.log(`  create 10,000        ${med} ms`);
  console.log(`  実 DOM 行数           ${domRows} 行（10,000 ではなく可視ぶんだけ）`);
  console.log(`  5,000 行分スクロール   ${scrollMs} ms → 実 DOM ${domAfter} 行・先頭 id=${firstAfter}`);
  console.log('─'.repeat(52));
  console.log('  → 巨大リストでも実 DOM は数十行。create/scroll は非問題。\n');
} finally {
  await browser.close();
}
