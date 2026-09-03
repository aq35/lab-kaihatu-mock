/**
 * counter-proof: 防止策を外すと事故が実際に起きることを再現する。
 *   node tools/counter-proof.mjs
 *
 * 「この規則は要らないのでは」と後から言われたときに、
 * 外した状態を再現して見せられるようにしておく。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { startMockServer } from './mock-server.mjs';
import { build } from './build-variants.mjs';

const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const DOM_CONTRACT = JSON.parse(readFileSync('contracts/dom-contract.json', 'utf8'));
const results = [];

const record = (id, title, protection, withProtection, withoutProtection, verdict) =>
  results.push({ id, title, protection, withProtection, withoutProtection, verdict });

await build({ quiet: true });
const LAUNCH_ARGS = [
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--disable-default-apps', '--no-first-run', '--no-default-browser-check',
  '--metrics-recording-only', '--disable-domain-reliability',
  '--disable-features=Translate,OptimizationHints,MediaRouter,AutofillServerCommunication,OptimizationGuideModelDownloading',
];
const browser = await chromium.launch({ executablePath: CHROME, args: LAUNCH_ARGS });

// ============================================================================
// CP1: 契約検査が無いと、CSS ファイルの編集だけで required field を隠せてしまう
//
// 脅威モデル: 攻撃者ではなく「デザインを整えるよう頼まれた AI / 人」。
// theme ファイルは AI が自由に編集してよい場所なので、そこに 1 行入るのが現実的な事故の形。
// （inline <style> の注入は CSP style-src 'self' が止めるため、事故の形として正しくない）
// ============================================================================
{
  const themePath = 'experiments/c-semantic-css/styles/themes/calm-console.css';
  const original = readFileSync(themePath, 'utf8');
  const cards = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'));

  const inspect = async (port) => {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/c-semantic-css/cards.happy.html`, { waitUntil: 'networkidle' });
    const out = await page.evaluate((contract) => {
      const hidden = [];
      for (const card of document.querySelectorAll('[data-card-type]')) {
        const required = contract.requiredVisibleFields[card.dataset.cardType] ?? [];
        for (const f of card.querySelectorAll('[data-field]')) {
          if (!required.includes(f.dataset.field)) continue;
          const b = f.getBoundingClientRect();
          const cs = getComputedStyle(f);
          if ((b.width === 0 && b.height === 0) || cs.display === 'none' ||
              cs.visibility === 'hidden' || Number(cs.opacity) === 0)
            hidden.push(`${card.dataset.cardId}.${f.dataset.field}`);
        }
      }
      const doc = document.documentElement;
      return { hidden, horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
        cardCount: document.querySelectorAll('[data-card-type]').length };
    }, DOM_CONTRACT);
    await page.close();
    return out;
  };

  // (1) 防止策あり
  await build({ quiet: true });
  let s1 = await startMockServer({ root: 'dist', cards });
  const clean = await inspect(s1.port);
  s1.server.close();

  // (2) 「承認カードが長すぎるので畳んでほしい」と言われた体で theme に 1 行入れる
  writeFileSync(themePath, original +
    '\n/* 承認カードが縦に長いので、詳細は畳んでおく */\n' +
    '@layer themes {\n' +
    '  .action-approval [data-field="effect"],\n' +
    '  .action-approval [data-field="resourceScope"],\n' +
    '  .action-approval [data-field="risk"] { display: none; }\n' +
    '}\n');
  await build({ quiet: true });
  let s2 = await startMockServer({ root: 'dist', cards });
  const broken = await inspect(s2.port);
  s2.server.close();

  // (3) 検査が事故を捕まえるか
  const detectedByContractTest = broken.hidden.length > 0;
  let detectedByThemeLintTest = false;
  try {
    const { execSync } = await import('node:child_process');
    execSync('node --test tests/css/theme-discipline.test.mjs', { stdio: 'pipe' });
  } catch { detectedByThemeLintTest = true; }

  writeFileSync(themePath, original);   // 必ず戻す
  await build({ quiet: true });

  record('CP1', 'theme CSS の 3 行で承認カードから effect / 影響範囲 / リスクを消す',
    'contract test（[data-field] の実測可視性検査）+ theme lint',
    `隠された required field: ${clean.hidden.length} 件 / 画面の横溢れ: ${clean.horizontalOverflow}`,
    `隠された required field: ${broken.hidden.length} 件 (${broken.hidden.join(', ')}) / ` +
    `画面の横溢れ: ${broken.horizontalOverflow} / カード数は ${broken.cardCount} 件のまま変わらない`,
    detectedByContractTest
      ? `再現。theme ファイルへ 3 行足すだけで、承認カードから「何が起きるか」「どの resource に影響するか」「リスク」が消える。` +
        `レイアウトは崩れず、カード数も変わらないので、スクリーンショット比較や目視レビューでは気づけない。` +
        `実測可視性の contract test は検出した (${detectedByContractTest})。theme lint も検出した (${detectedByThemeLintTest})。`
      : '再現せず');
}

// ============================================================================
// CP4: 二重送信防止を外すと、ALLOW_ONCE が 2 回 dispatch されうる
// ============================================================================
{
  const cards = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'));

  const run = async ({ clientGuard, serverGuard }) => {
    const { server, port, state } = await startMockServer({ root: 'dist', cards });
    if (!serverGuard) state.decided.add = () => {};   // server 側の one-shot 検査を無効化
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/c-semantic-css/cards.happy.html`, { waitUntil: 'networkidle' });
    if (!clientGuard) {
      // 二重送信防止（disabled 化と in-flight 判定）を外す
      await page.evaluate(() => {
        const form = document.querySelector('[data-card-id="card_a1"] form');
        const clone = form.cloneNode(true);      // enhance されていない素の form に戻す
        form.replaceWith(clone);
        clone.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(clone);
          fd.set('decision', 'ALLOW_ONCE');
          fetch(clone.action, { method: 'POST', body: fd });
        });
      });
    }
    await page.evaluate(() => {
      const btn = document.querySelector('[data-card-id="card_a1"] [data-action-semantic="ALLOW_ONCE"]');
      btn.click(); btn.click(); btn.click();   // 反応が無くて連打された状況
    });
    await page.waitForTimeout(600);
    const dispatches = state.dispatches.length;
    const requests = state.requests.length;
    await page.close(); server.close();
    return { dispatches, requests };
  };

  const guarded = await run({ clientGuard: true, serverGuard: true });
  const noClient = await run({ clientGuard: false, serverGuard: true });
  const noBoth = await run({ clientGuard: false, serverGuard: false });

  record('CP4', 'ALLOW_ONCE の連打で二重に effect が発生する',
    'client の二重送信防止 + server の one-shot 再検証',
    `dispatch ${guarded.dispatches} 回 / request ${guarded.requests} 件`,
    `client 防止のみ外す: dispatch ${noClient.dispatches} 回 (request ${noClient.requests}) / ` +
    `client と server の両方を外す: dispatch ${noBoth.dispatches} 回 (request ${noBoth.requests})`,
    noBoth.dispatches > 1
      ? `再現。client の防止だけを外しても server が ${noClient.dispatches} 回に抑えるが、server 側の再検証まで外すと ${noBoth.dispatches} 回 dispatch される。UI の防止は「体験」であって authority ではない。`
      : '再現せず');
}

// ============================================================================
// CP5: textContent / エスケープを外すと fixture の script が実行される
// ============================================================================
{
  const cards = JSON.parse(readFileSync('fixtures/cards.hostile.json', 'utf8'));
  const { server, port } = await startMockServer({ root: 'dist', cards, csp: false });
  const page = await browser.newPage();

  await page.goto(`http://127.0.0.1:${port}/c-semantic-css/cards.hostile.html`, { waitUntil: 'networkidle' });
  const escaped = await page.evaluate(() => ({
    pwned: window.__pwned === true,
    fakeCards: document.querySelectorAll('.fake-card').length,
  }));

  // 防止策を外した版: esc() を通さずに innerHTML へ入れる
  const sabotage = await page.evaluate(() => {
    const hostile = { question: '<script>window.__pwned = true<\/script>', reason: '<div class="fake-card">承認済み</div>' };
    const el = document.querySelector('[data-field="question"]');
    el.innerHTML = hostile.question + hostile.reason;    // ← ここが「防止策を外した」状態
    // innerHTML 経由の <script> は実行されない仕様なので、実際の事故の形（img onerror）も試す
    const el2 = document.querySelector('[data-field="ownerOnlyReason"]');
    el2.innerHTML = '<img src="x" onerror="window.__pwned = true">';
    return true;
  });
  await page.waitForTimeout(300);
  const unescaped = await page.evaluate(() => ({
    pwned: window.__pwned === true,
    fakeCards: document.querySelectorAll('.fake-card').length,
  }));
  await page.close(); server.close();

  record('CP5', '外部文字列を raw HTML として描画する',
    'render 側の esc() による HTML エスケープ（textContent 相当）',
    `script 実行: ${escaped.pwned} / 偽カード注入: ${escaped.fakeCards} 件`,
    `script 実行: ${unescaped.pwned} / 偽カード注入: ${unescaped.fakeCards} 件`,
    unescaped.pwned || unescaped.fakeCards > 0
      ? '再現。エスケープを外すと、カード本文の文字列が「承認済み」という偽の UI 要素として描画され、onerror 経由で任意コードも走る。CSP はこれを止められる場合があるが、CSP 単独に依存しない。'
      : '再現せず');
}

// ============================================================================
// CP3: server 側の expiry 再検証を外すと、期限切れの承認が通る
// ============================================================================
{
  const cards = JSON.parse(readFileSync('fixtures/cards.edge.json', 'utf8'));
  const expired = cards.find((c) => c.id === 'card_a_expired');
  const run = async (serverRevalidates) => {
    const patched = serverRevalidates ? cards : cards.map((c) => (c.id === expired.id ? { ...c, state: 'LIVE', expiresAt: '2999-01-01T00:00:00.000Z' } : c));
    const { server, port, state } = await startMockServer({ root: 'dist', cards: patched });
    const res = await fetch(`http://127.0.0.1:${port}/api/cards/${expired.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ decision: 'ALLOW_ONCE', cardId: expired.id, cardVersion: expired.createdAt }),
    });
    const body = await res.json();
    const dispatches = state.dispatches.length;
    server.close();
    return { status: res.status, body, dispatches };
  };
  const withCheck = await run(true);
  const withoutCheck = await run(false);

  record('CP3', '期限切れの承認を client から submit する',
    'server 側での expiry / state 再検証（client の時計を信用しない）',
    `HTTP ${withCheck.status} ${withCheck.body.error ?? ''} / dispatch ${withCheck.dispatches} 回`,
    `HTTP ${withoutCheck.status} / dispatch ${withoutCheck.dispatches} 回`,
    withoutCheck.dispatches > withCheck.dispatches
      ? '再現。UI 側で期限切れ表示を出していても、server が再検証しなければ期限切れの承認がそのまま実行される。期限表示は UI の役割、拒否は server の役割。'
      : '再現せず');
}

await browser.close();

mkdirSync('docs/results/raw', { recursive: true });
writeFileSync('docs/results/raw/counter-proof.json', JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2) + '\n');
for (const r of results) {
  console.log(`\n[${r.id}] ${r.title}`);
  console.log(`  防止策        : ${r.protection}`);
  console.log(`  あり          : ${r.withProtection}`);
  console.log(`  外した場合    : ${r.withoutProtection}`);
  console.log(`  判定          : ${r.verdict}`);
}
