/**
 * ブラウザで mini-vue アプリが本当にリアクティブに動くかを確認する（Chromium）。
 * 自己完結: その場でバンドルして小さな http で配信し、クリックで DOM が更新されるか見る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync } from 'node:fs';
import esbuild from 'esbuild';
import { miniVue } from '../plugins/mini-vue/esbuild-plugin.mjs';

const EXE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';
// 環境のブラウザは Playwright パッケージのリビジョンと異なるので実体を明示する。無ければ skip。
test('ブラウザ: クリックで count が増え、DOM が更新される', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const r = await esbuild.build({
    entryPoints: ['fixtures/app-ui/main.js'],
    bundle: true, minify: true, format: 'esm', write: false,
    plugins: [miniVue()], logLevel: 'silent',
  });
  const js = Buffer.from(r.outputFiles[0].contents);
  const html = `<!doctype html><meta charset="utf-8"><div id="app"></div><script type="module" src="/main.js"></script>`;

  const server = http.createServer((req, res) => {
    if (req.url === '/main.js') { res.setHeader('content-type', 'text/javascript'); res.end(js); }
    else { res.setHeader('content-type', 'text/html'); res.end(html); }
  });
  await new Promise((ok) => server.listen(0, ok));
  const port = server.address().port;

  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    assert.equal(await page.textContent('output.value'), '0');
    await page.click('button.inc');
    await page.click('button.inc');
    await page.click('button.inc');
    assert.equal(await page.textContent('output.value'), '3', 'inc×3 で 3 になる');
    await page.click('button.dec');
    assert.equal(await page.textContent('output.value'), '2', 'dec で 2 に戻る');
    // v-for のログが 4 要素（1,2,3,2）
    assert.equal(await page.locator('ul.log li').count(), 4);
    // v-if: count()!==0 なので表示
    assert.match(await page.textContent('.counter'), /現在値は 2 です/);
  } finally {
    await browser.close();
    server.close();
  }
});
