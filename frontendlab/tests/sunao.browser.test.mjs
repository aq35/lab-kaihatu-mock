/**
 * ブラウザで sunao アプリが本当にリアクティブに動くかを確認する（Chromium）。
 * 自己完結: その場でバンドルして小さな http で配信し、クリックで DOM が更新されるか見る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync } from 'node:fs';
import esbuild from 'esbuild';
import { sunao } from '../plugins/sunao/esbuild-plugin.mjs';

const EXE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';
// 環境のブラウザは Playwright パッケージのリビジョンと異なるので実体を明示する。無ければ skip。
test('ブラウザ: クリックで count が増え、DOM が更新される', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const r = await esbuild.build({
    entryPoints: ['fixtures/app-ui/main.js'],
    bundle: true, minify: true, format: 'esm', write: false,
    plugins: [sunao()], logLevel: 'silent',
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

    // ① 細粒度更新の証拠: 更新しても <output> 要素は作り直されず同一ノードのまま。
    //   MutationObserver で「count 更新時に出る変化」を記録する。
    await page.evaluate(() => {
      const out = document.querySelector('output.value');
      out.__marked = true; // 同一ノードなら再構築後も残る
      window.__mutations = [];
      new MutationObserver((recs) => {
        for (const r of recs) window.__mutations.push(r.type + ':' + (r.target.nodeName || ''));
      }).observe(document.querySelector('.counter'), { childList: true, characterData: true, subtree: true });
    });

    await page.click('button.inc');
    await page.click('button.inc');
    await page.click('button.inc');
    assert.equal(await page.textContent('output.value'), '3', 'inc×3 で 3 になる');
    // <output> は同一ノード（render は 1 回・要素は再生成されない）
    assert.equal(await page.evaluate(() => !!document.querySelector('output.value').__marked), true,
      '細粒度: <output> 要素は作り直されていない');
    // 起きた変化は characterData 中心で、要素全再構築(childList で .counter 直下が総入れ替え)ではない
    const mut = await page.evaluate(() => window.__mutations);
    assert.ok(mut.some((m) => m.startsWith('characterData')), '値はテキストの in-place 更新で反映される');

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

test('ブラウザ: keyed 並び替え&DnD が node 同一性と in-item 状態を保つ', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const r = await esbuild.build({ entryPoints: ['fixtures/app-ui/sortable-main.js'], bundle: true, minify: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
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
    const order0 = await page.$$eval('.row .name', (ns) => ns.map((n) => n.textContent));
    assert.deepEqual(order0, ['設計を凍結する', '実測する', '受領書を書く', '公開する']);

    // 「実測する」の行: チェックを入れ、その li にマーカを付ける（keyed 再利用なら残る）
    const b = page.locator('.row', { hasText: '実測する' });
    await b.locator('.chk').check();
    await b.evaluate((li) => { li.dataset.marked = 'yes'; });

    // b を d（公開する）の位置へドラッグ&ドロップ（イベントを発火）
    await b.dispatchEvent('dragstart');
    const d = page.locator('.row', { hasText: '公開する' });
    await d.dispatchEvent('dragover');
    await d.dispatchEvent('drop');

    const order1 = await page.$$eval('.row .name', (ns) => ns.map((n) => n.textContent));
    assert.notDeepEqual(order1, order0, '並び順が変わる');
    // 「実測する」の行が: 同一ノード（マーカ残存）で・チェックも保持
    const b2 = page.locator('.row', { hasText: '実測する' });
    assert.equal(await b2.evaluate((li) => li.dataset.marked), 'yes', 'keyed: 同一ノードが移動（作り直しでない）');
    assert.equal(await b2.locator('.chk').isChecked(), true, 'in-item 状態（チェック）が保持される');
  } finally {
    await browser.close();
    server.close();
  }
});

test('ブラウザ: カレンダーが実機で動く（月移動・日付選択）', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const r = await esbuild.build({ entryPoints: ['fixtures/app-ui/calendar-main.js'], bundle: true, minify: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
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
    const label0 = await page.textContent('.label');
    await page.locator('button.nav', { hasText: '›' }).click();
    assert.notEqual(await page.textContent('.label'), label0, '次の月で label が変わる');
    await page.locator('button.nav', { hasText: '‹' }).click();
    assert.equal(await page.textContent('.label'), label0, '前の月で戻る');
    // 日セルをクリック → フロントエンドルーティングで詳細画面へ（URL hash も変わる）
    await page.locator('button.cell:not(.blank)').first().click();
    await page.waitForSelector('.day-view');
    assert.match(page.url(), /#\/day\//, 'URL hash がルートに同期する');
    // 予定を追加 → リストに反映
    await page.fill('input.inp', 'テスト予定 09:00');
    await page.click('button.add-btn');
    assert.match(await page.textContent('.ev-list'), /テスト予定 09:00/, '予定が追加される');
    // ブラウザの戻る → 月ビューへ（履歴が効く）
    await page.goBack();
    await page.waitForSelector('.month');
    assert.equal(await page.$('.day-view'), null, '戻るで月ビューに戻る');
  } finally {
    await browser.close();
    server.close();
  }
});
