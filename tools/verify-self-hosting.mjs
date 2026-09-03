/**
 * HO1/HO3: 「生成済み CSS で起動」と「新 UI を build」を分けて検証する。
 *   node tools/verify-self-hosting.mjs
 *
 * production を模す: dist/<variant> を node_modules も npm も無いクリーンな場所へコピーし、
 * そこを静的配信して「必須情報が読めるか」を確認する。
 * これが通れば、その条件の RUNTIME は build 依存を必要としない。
 */
import { chromium } from 'playwright';
import { cpSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--disable-background-networking','--no-first-run','--disable-sync','--disable-component-update','--disable-features=Translate,AutofillServerCommunication'];
const CLEAN = '/tmp/kas-selfhost';   // node_modules も package.json も置かない
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };

function serveStatic(root) {
  const server = createServer(async (req, res) => {
    try {
      let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
      let f = join(root, p); const s = await stat(f).catch(() => null); if (s?.isDirectory()) f = join(f, 'index.html');
      const buf = await readFile(f);
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:" });
      res.end(buf);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

const variants = process.argv.slice(2).length ? process.argv.slice(2) : ['e-compiler', 'f-recipe-tailwind', 'a-tailwind', 'c-semantic-css'];
const browser = await chromium.launch({ executablePath: CHROME, args: ARGS });
const results = {};
for (const v of variants) {
  if (!existsSync(`dist/${v}`)) { results[v] = { error: 'not built' }; continue; }
  rmSync(CLEAN, { recursive: true, force: true });
  mkdirSync(CLEAN, { recursive: true });
  cpSync(`dist/${v}`, CLEAN, { recursive: true });   // 生成物だけ。node_modules は持ち込まない
  const hasNodeModules = existsSync(join(CLEAN, 'node_modules'));
  const { server, port } = await serveStatic(CLEAN);
  // JS あり / JS なし の両方で必須情報が読めるか
  const check = async (js) => {
    const ctx = await browser.newContext({ javaScriptEnabled: js });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/cards.happy.html`, { waitUntil: 'load' });
    const fields = await page.evaluate(() => {
      const collect = (r) => r.querySelectorAll('[data-field]').length;
      let n = collect(document);
      for (const e of document.querySelectorAll('*')) if (e.shadowRoot) n += collect(e.shadowRoot);
      return n;
    });
    await ctx.close(); return fields;
  };
  const withJs = await check(true), noJs = await check(false);
  server.close();
  results[v] = { runtimeNeedsNodeModules: hasNodeModules, requiredFieldsWithJs: withJs, requiredFieldsNoJs: noJs,
    servesWithoutBuildDeps: withJs > 10 && noJs > 10 && !hasNodeModules };
}
await browser.close();
rmSync(CLEAN, { recursive: true, force: true });
const { writeFileSync } = await import('node:fs');
writeFileSync('docs/results/raw/self-hosting.json', JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2) + '\n');
console.table(Object.entries(results).map(([v, r]) => ({ variant: v, needsNodeModules: r.runtimeNeedsNodeModules, fieldsJS: r.requiredFieldsWithJs, fieldsNoJS: r.requiredFieldsNoJs, selfHosting: r.servesWithoutBuildDeps })));
