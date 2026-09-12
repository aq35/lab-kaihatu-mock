/**
 * ランタイム計測: 同じ操作を sunao / Vue で実行し、**commit までの ms**（JS + DOM 変更、
 * paint 前）を測る。両者とも paint は除外＝フレームワーク仕事の公平比較。中央値（warmup 後）。
 *   node bench/run-bench.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';
const OPS = ['create1k', 'create10k', 'updateEvery10', 'selectRandom', 'swap', 'removeFirst', 'append1k'];

async function benchFile(browser, file) {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  const timeOp = (n) => page.evaluate(async (name) => { const t0 = performance.now(); await window.runOp(name); return performance.now() - t0; }, n);
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const run = async (name, { perRun, runs = 5 } = {}) => {
    const ts = [];
    for (let i = 0; i < runs; i++) { if (perRun) await timeOp(perRun); ts.push(await timeOp(name)); }
    return +med(ts).toFixed(2);
  };
  // warmup（JIT）
  for (const w of ['create1k', 'updateEvery10', 'selectRandom', 'swap', 'removeFirst', 'clear']) await timeOp(w);

  const r = {};
  r.create1k = await run('create1k', { perRun: 'clear' });
  r.create10k = await run('create10k', { perRun: 'clear' });
  await timeOp('create10k'); // 以降は 10k を前提に
  const rowN = await page.evaluate(() => window.rowCount());
  r.updateEvery10 = await run('updateEvery10');
  r.selectRandom = await run('selectRandom');
  r.swap = await run('swap');
  r.removeFirst = await run('removeFirst');
  await timeOp('clear');
  r.append1k = await run('append1k', { perRun: 'create1k' });
  await page.close();
  return { rows10k: rowN, ms: r };
}

if (!existsSync(EXE)) { console.log('Chromium 不在: skip'); process.exit(0); }
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
try {
  const sunao = await benchFile(browser, resolve(HERE, 'dist/sunao.html'));
  const vue = await benchFile(browser, resolve(HERE, 'dist/vue.html'));
  const sizes = JSON.parse(readFileSync(resolve(HERE, 'dist/sizes.json'), 'utf8'));

  const pad = (s, n) => String(s).padStart(n);
  console.log(`\ncommit time ms（中央値・小さいほど速い）  sunao 検証 ${sunao.rows10k} 行 / vue ${vue.rows10k} 行`);
  console.log('─'.repeat(58));
  console.log(`  ${pad('op', 14)} ${pad('sunao', 9)} ${pad('vue', 9)} ${pad('速い方', 12)}`);
  console.log('─'.repeat(58));
  for (const op of OPS) {
    const s = sunao.ms[op], v = vue.ms[op];
    const win = s < v ? `sunao ${(v / s).toFixed(1)}x` : `vue ${(s / v).toFixed(1)}x`;
    console.log(`  ${pad(op, 14)} ${pad(s, 9)} ${pad(v, 9)} ${pad(win, 12)}`);
  }
  console.log('─'.repeat(58));
  console.log(`  bundle gzip    ${pad(sizes.sunao.gzip, 9)} ${pad(sizes.vue.gzip, 9)} ${pad('sunao ' + (sizes.vue.gzip / sizes.sunao.gzip).toFixed(1) + 'x', 12)}`);
  console.log('');
  writeFileSync(resolve(HERE, 'dist/results.json'), JSON.stringify({ sizes, sunao, vue, measured_at: new Date().toISOString(), env: { node: process.version } }, null, 2));
} finally {
  await browser.close();
}
