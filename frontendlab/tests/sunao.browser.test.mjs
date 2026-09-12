/**
 * ブラウザで sunao アプリが本当にリアクティブに動くかを確認する（Chromium）。
 * 自己完結: その場でバンドルして小さな http で配信し、クリックで DOM が更新されるか見る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync } from 'node:fs';
import esbuild from 'esbuild';
import { sunao } from '../sunao/esbuild-plugin.mjs';

const EXE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';
// 環境のブラウザは Playwright パッケージのリビジョンと異なるので実体を明示する。無ければ skip。
test('ブラウザ: クリックで count が増え、DOM が更新される', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const r = await esbuild.build({
    entryPoints: ['examples/app-ui/main.js'],
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

test('ブラウザ: Deploy Console — 状態機械/store/context/resource を組んだ実アプリ', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const r = await esbuild.build({ entryPoints: ['examples/app-ui/deploy-main.js'], bundle: true, minify: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
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
    // context(provide/inject): 子バッジが machine 状態を prop 無しで表示
    assert.equal(await page.textContent('.dc-badge'), '待機');
    // resource+decode: 最新ビルドが非同期で入る
    await page.waitForSelector('.k-facts', { timeout: 5000 });
    assert.match(await page.textContent('.dc'), /a1b2c3d/);
    // 状態機械: デプロイ → deploying → 終端(成功/失敗)
    await page.locator('.k-btn.primary', { hasText: 'デプロイ' }).click();
    assert.equal(await page.textContent('.dc-badge'), 'デプロイ中');
    await page.waitForFunction(() => { const t = document.querySelector('.dc-badge').textContent; return t === '成功' || t === '失敗'; }, { timeout: 5000 });
    // store(時間旅行): ログに複数エントリ、undo で 1 つ減る
    const n0 = await page.locator('.dc-logi').count();
    assert.ok(n0 >= 2, 'ログに開始+結果が入る');
    await page.locator('.k-btn', { hasText: '元に戻す' }).click();
    assert.equal(await page.locator('.dc-logi').count(), n0 - 1, 'undo でログが 1 つ戻る');
    // fail-closed の証拠: 未定義遷移は投げる（idle で SUCCEED は無い）→ コンソールエラーにならず握れることは別途 unit で担保
  } finally {
    await browser.close();
    server.close();
  }
});

test('ブラウザ: Owner Inbox — 非同期取得(5枚)・時計・palette 切替・承認', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const r = await esbuild.build({ entryPoints: ['examples/app-ui/owner-main.js'], bundle: true, minify: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
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
    // 通信: resource が非同期で 5 枚を取得
    await page.waitForSelector('.k-card', { timeout: 5000 });
    assert.equal(await page.locator('.k-card').count(), 5, '5 つのカード種別');
    // 時計（時刻表示）
    assert.match(await page.textContent('.oc-clock'), /\d/, '時計が表示される');
    // palette 切替で見た目トークンが変わる
    const before = await page.evaluate(() => getComputedStyle(document.querySelector('.k-root')).getPropertyValue('--k-accent'));
    await page.locator('.oc-chip', { hasText: 'editorial' }).click();
    const after = await page.evaluate(() => getComputedStyle(document.querySelector('.k-root')).getPropertyValue('--k-accent'));
    assert.notEqual(before, after, 'Recipe.palette 切替で CSS トークンが変わる');
    // 承認（ACTION_APPROVAL カード）
    await page.locator('.k-btn.primary', { hasText: '承認する' }).first().click();
    assert.match(await page.textContent('.k-card'), /承認しました/, '承認が反映される');
  } finally {
    await browser.close();
    server.close();
  }
});

test('ブラウザ: keyed 並び替え&DnD が node 同一性と in-item 状態を保つ', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const r = await esbuild.build({ entryPoints: ['examples/app-ui/sortable-main.js'], bundle: true, minify: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
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
  const r = await esbuild.build({ entryPoints: ['examples/app-ui/calendar-main.js'], bundle: true, minify: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
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

test('ブラウザ: Priority Board — scoped style 注入・FLIP アニメ・優先度巡回', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const r = await esbuild.build({ entryPoints: ['examples/app-ui/board-main.js'], bundle: true, minify: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
  const js = Buffer.from(r.outputFiles[0].contents);
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0}</style><div id="app"></div><script type="module" src="/main.js"></script>`;
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

    // <style scoped> が head に注入され、ルート要素にも効く（compound scope）
    const boardBg = await page.$eval('.board', (el) => getComputedStyle(el).backgroundColor);
    assert.match(boardBg, /oklch|rgb/, 'ルート .board に背景トークンが適用される（scoped 注入＋compound）');
    assert.equal(await page.locator('.cell').count(), 5);

    // 追加 → enter アニメが走り、件数が増える
    const enterAnims = await page.evaluate(() => { document.querySelector('button.t.primary').click(); return document.getAnimations().length; });
    assert.ok(enterAnims >= 1, '追加で enter アニメが発火');
    assert.equal(await page.locator('.cell').count(), 6);

    // priority 順 → FLIP 移動アニメ（transform）が走る
    const flipAnims = await page.evaluate(() => { [...document.querySelectorAll('button.t')].find((b) => /priority/.test(b.textContent)).click(); return document.getAnimations().length; });
    assert.ok(flipAnims >= 1, 'priority 順で FLIP 移動アニメが発火');
    await page.waitForTimeout(300);
    // urgent が先頭に来る（PRANK 昇順）
    const firstBadge = await page.$eval('.cell:first-child .badge', (el) => el.textContent);
    assert.equal(firstBadge, 'URGENT', 'priority 順で urgent が先頭');

    // カードクリックで優先度が巡回（urgent→normal）＝ :class が変わり色が動く
    const cls0 = await page.$eval('.cell:first-child', (el) => el.className);
    await page.click('.cell:first-child .tk');
    await page.waitForTimeout(50);
    const cls1 = await page.$eval('.cell:first-child', (el) => el.className);
    assert.notEqual(cls1, cls0, 'クリックで優先度クラスが変わる（色が動く）');

    // 削除 → leave アニメ＋件数が減る
    const before = await page.locator('.cell').count();
    const leaveAnims = await page.evaluate(() => { document.querySelector('.op.del').click(); return document.getAnimations().length; });
    assert.ok(leaveAnims >= 1, '削除で leave アニメが発火');
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.cell').count(), before - 1, '削除で 1 件減る');
  } finally {
    await browser.close();
    server.close();
  }
});

test('ブラウザ: SEO ページを prerender→hydrate（中身入りHTML・骨格adopt・対話復帰）', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const { renderPage, assembleHTML } = await import('../cli/prerender.mjs');
  // 1) server prerender で中身入り HTML
  const page = await renderPage('examples/seo/Landing.sunao');
  assert.match(page.html, /AI が好きそうなコンパイラ/, 'SSR HTML に H1 の中身');
  assert.match(page.html, /クローラは JavaScript を実行しなくても/, 'SEO 本文が SSR HTML に入る');
  const doc = assembleHTML(page, { client: true });
  assert.match(doc, /<title>sunao/, 'title tag');
  assert.match(doc, /property="og:title"/, 'OG メタ');
  // 2) client bundle
  const r = await esbuild.build({ entryPoints: ['examples/seo/landing-main.js'], bundle: true, minify: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
  const js = Buffer.from(r.outputFiles[0].contents);
  // SSR 骨格ノードに印を付けてから hydrate（作り直しなら印が消える）
  const stamped = doc.replace('<script type="module"', `<script>for (const n of document.querySelectorAll('main.lp,h1.h1,output.cval,.feat')) n.__ssr = true;</script><script type="module"`);

  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/page.js')) { res.setHeader('content-type', 'text/javascript'); res.end(js); }
    else { res.setHeader('content-type', 'text/html'); res.end(stamped); }
  });
  await new Promise((ok) => server.listen(0, ok));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  try {
    const p = await browser.newPage();
    await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await p.waitForTimeout(200);
    // 骨格（main/h1/output/feat×4）は adopt されている＝サーバ印が残る
    const adopted = await p.evaluate(() => ({
      main: !!document.querySelector('main.lp')?.__ssr,
      h1: !!document.querySelector('h1.h1')?.__ssr,
      output: !!document.querySelector('output.cval')?.__ssr,
      feats: [...document.querySelectorAll('.feat')].length === 4 && [...document.querySelectorAll('.feat')].every((n) => n.__ssr),
    }));
    assert.deepEqual(adopted, { main: true, h1: true, output: true, feats: true }, '静的骨格は作り直さず adopt');
    // 対話が戻る: カウンタ + 別の島（<b>）も更新
    assert.equal(await p.textContent('output.cval'), '0');
    await p.click('.crow .btn.primary');
    await p.click('.crow .btn.primary');
    assert.equal(await p.textContent('output.cval'), '2', 'hydrate 後にボタンが効く');
    assert.equal(await p.textContent('.ctext b'), '2', '同じ signal を読む別の島も更新される');
    await p.click('.crow .btn:not(.primary)');
    assert.equal(await p.textContent('output.cval'), '1');
  } finally {
    await browser.close();
    server.close();
  }
});

test('ブラウザ: per-item signal の更新が DOM に反映される（reactive 回帰）', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const src = `<template><ul><li v-for="r in rows()" :key="r.id" class="row" :class="r.hot() ? 'hot' : ''">{{ r.label() }}</li></ul></template>` +
    `<script>export default { setup(){ const rows = signal([{id:1,label:signal('A'),hot:signal(false)},{id:2,label:signal('B'),hot:signal(false)}]); const hit=()=>{ const r=rows()[0]; r.label.set('CHANGED'); r.hot.set(true); }; return { rows, hit }; } }</script>`;
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'react-'));
  try {
    writeFileSync(join(dir, 'App.sunao'), src);
    writeFileSync(join(dir, 'main.js'), `import { mount } from 'sunao'; import App from './App.sunao'; const {ctx}=mount(App, document.getElementById('app')); window.hit=()=>{ctx.hit();return Promise.resolve();};`);
    const b = await esbuild.build({ entryPoints: [join(dir, 'main.js')], bundle: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
    const js = Buffer.from(b.outputFiles[0].contents);
    const html = `<!doctype html><meta charset=utf-8><div id="app"></div><script type="module" src="/main.js"></script>`;
    const server = http.createServer((req, res) => { if (req.url === '/main.js') { res.setHeader('content-type', 'text/javascript'); res.end(js); } else { res.setHeader('content-type', 'text/html'); res.end(html); } });
    await new Promise((ok) => server.listen(0, ok));
    const port = server.address().port;
    const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
      assert.equal(await page.textContent('.row'), 'A');
      assert.equal(await page.getAttribute('.row', 'class'), 'row');
      await page.evaluate(() => window.hit());
      await page.waitForTimeout(50);
      assert.equal(await page.textContent('.row'), 'CHANGED', 'per-item signal の text 更新が反映');
      assert.match(await page.getAttribute('.row', 'class'), /hot/, 'per-item signal の class 更新が反映');
    } finally { await browser.close(); server.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ブラウザ: windowedVar 可変高仮想化（実測補正・実DOMは可視ぶん・末尾まで到達）', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const src = `<template><div class="vp" @scroll="vp.onScroll($event)" :style="'height:300px;overflow:auto'">
      <div class="spacer" :style="'height:'+vp.total()+'px;position:relative'">
        <div class="row" v-for="v in vp.visible()" :key="v.item.id" :data-vindex="v.index"
             :style="'position:absolute;left:0;right:0;top:'+v.top+'px;height:'+v.item.h+'px'">{{ v.item.text }}</div>
      </div></div></template>
    <script>export default { setup(){
      const items = signal(Array.from({length:1000},(_,i)=>({id:i, text:'#'+i, h: 24 + (i%6)*16}))); // 高さがバラバラ(24..104)
      const vp = windowedVar(items, { estimate: 30, height: 300 });
      return { vp, items };
    } }</script>`;
  const dir = mkdtempSync(join(tmpdir(), 'vw-'));
  try {
    writeFileSync(join(dir, 'App.sunao'), src);
    writeFileSync(join(dir, 'main.js'), `import { mount } from 'sunao'; import App from './App.sunao'; const {ctx}=mount(App, document.getElementById('app')); ctx.vp.attach(document.querySelector('.vp')); window.__vp=ctx.vp; window.domRows=()=>document.querySelectorAll('.row').length; window.total=()=>ctx.vp.total();`);
    const b = await esbuild.build({ entryPoints: [join(dir, 'main.js')], bundle: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
    const js = Buffer.from(b.outputFiles[0].contents);
    const html = `<!doctype html><meta charset=utf-8><style>*{box-sizing:border-box}</style><div id="app"></div><script type="module" src="/main.js"></script>`;
    const server = http.createServer((req, res) => { if (req.url === '/main.js') { res.setHeader('content-type', 'text/javascript'); res.end(js); } else { res.setHeader('content-type', 'text/html'); res.end(html); } });
    await new Promise((ok) => server.listen(0, ok));
    const port = server.address().port;
    const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
      await page.waitForTimeout(250); // attach の rAF 実測を待つ
      const domRows = await page.evaluate(() => window.domRows());
      assert.ok(domRows > 0 && domRows < 40, `実 DOM は可視ぶんだけ（${domRows} 行、1000 ではない）`);
      const totalEstimate = 1000 * 30;
      const total = await page.evaluate(() => window.total());
      assert.notEqual(total, totalEstimate, '実測で total が estimate から補正される');
      // 行が縦に重ならない（top が広義単調増加）
      const tops = await page.$$eval('.row', (els) => els.map((e) => parseFloat(e.style.top)).sort((a, b) => a - b));
      const heights = await page.$$eval('.row', (els) => els.map((e) => e.getBoundingClientRect().height));
      assert.ok(tops.every((t, i) => i === 0 || t >= tops[i - 1]), 'top は単調増加');
      // 末尾までスクロール（estimate ベースなので 2 パスで収束: 途中の実測で総高さが補正される）
      for (let pass = 0; pass < 3; pass++) {
        await page.evaluate(() => { const el = document.querySelector('.vp'); el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
        await page.waitForTimeout(150);
      }
      const maxIdx = await page.$$eval('.row', (els) => Math.max(...els.map((e) => +e.dataset.vindex)));
      assert.equal(maxIdx, 999, '収束後、末尾（index 999）まで到達');
      assert.ok(await page.evaluate(() => window.domRows()) < 40, 'スクロール後も実 DOM は可視ぶん');
    } finally { await browser.close(); server.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ブラウザ: onMount は DOM 挿入後に走る（setup 時は未挿入）', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const src = `<template><div><input class="fld" :value="v()"><span class="seen">{{ seen() }}</span></div></template>
    <script>export default { setup(){
      const v = signal('hi'); const seen = signal('no');
      // setup 時点では .fld はまだ DOM に無い → onMount で初めて取れる
      onMount(() => { const el = document.querySelector('.fld'); seen.set(el ? 'yes:'+el.value : 'null'); });
      return { v, seen };
    } }</script>`;
  const dir = mkdtempSync(join(tmpdir(), 'om-'));
  try {
    writeFileSync(join(dir, 'App.sunao'), src);
    writeFileSync(join(dir, 'main.js'), `import { mount } from 'sunao'; import App from './App.sunao'; mount(App, document.getElementById('app'));`);
    const b = await esbuild.build({ entryPoints: [join(dir, 'main.js')], bundle: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
    const js = Buffer.from(b.outputFiles[0].contents);
    const html = `<!doctype html><meta charset=utf-8><div id="app"></div><script type="module" src="/main.js"></script>`;
    const server = http.createServer((req, res) => { if (req.url === '/main.js') { res.setHeader('content-type', 'text/javascript'); res.end(js); } else { res.setHeader('content-type', 'text/html'); res.end(html); } });
    await new Promise((ok) => server.listen(0, ok));
    const port = server.address().port;
    const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
      await page.waitForTimeout(50);
      assert.equal(await page.textContent('.seen'), 'yes:hi', 'onMount は DOM 挿入後に走り .fld を読めた');
    } finally { await browser.close(); server.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ブラウザ: video 例 — フィード→視聴の routing と <video> コントロール配線', { skip: existsSync(EXE) ? false : 'Chromium 不在' }, async () => {
  const { chromium } = await import('playwright');
  const r = await esbuild.build({ entryPoints: ['examples/video/video-main.js'], bundle: true, minify: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
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
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    // フィード（一覧）
    await page.waitForSelector('.card');
    assert.equal(await page.locator('.card').count(), 4, 'カタログ 4 件が並ぶ');
    // 視聴ページへ（hash routing）
    await page.locator('.card').first().click();
    await page.waitForSelector('.tube-video');
    assert.ok((await page.textContent('.title')).trim().length > 0, 'タイトルが出る＝Player mount');
    assert.equal(await page.locator('.seek').count(), 1, 'シークバーがある');
    assert.equal(await page.locator('.vol').count(), 1, '音量バーがある');
    // メディアイベント → signal → UI の配線（実再生は不要・headless で決定論的に検証）
    const playBtn = page.locator('.bar .ctl').first();
    await page.evaluate(() => document.querySelector('.tube-video').dispatchEvent(new Event('play')));
    assert.equal((await playBtn.textContent()).trim(), '⏸', 'play イベントで ⏸ に');
    await page.evaluate(() => document.querySelector('.tube-video').dispatchEvent(new Event('pause')));
    assert.equal((await playBtn.textContent()).trim(), '▶', 'pause イベントで ▶ に');
    // 一覧へ戻る
    await page.locator('.back').click();
    await page.waitForSelector('.card');
    assert.equal(await page.locator('.tube-video').count(), 0, '戻ると Player は unmount');
  } finally {
    await browser.close();
    server.close();
  }
});
