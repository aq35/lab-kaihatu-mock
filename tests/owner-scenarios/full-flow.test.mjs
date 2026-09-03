/**
 * Owner Communication の最低シナリオを実際に通す。
 *
 *   KAS が Owner へ質問 → Owner が回答 → KAS が action 承認を依頼 →
 *   Owner が ALLOW_ONCE → action が進む → 結果が OUTCOME_UNKNOWN →
 *   Owner が状況を確認 → independent observation 後に RESULT_REVIEW
 *
 * 検査するのは「見た目」ではなく、Owner が取り違えないための構造。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { startMockServer } from '../../tools/mock-server.mjs';
import { build } from '../../tools/build-variants.mjs';

const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAUNCH_ARGS = ['--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--no-first-run', '--no-default-browser-check', '--metrics-recording-only',
  '--disable-features=Translate,OptimizationHints,MediaRouter,AutofillServerCommunication'];
const VARIANT = process.env.VARIANT ?? 'c-semantic-css';

let browser, server, port, state;
const cards = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'));

before(async () => {
  await build({ quiet: true });
  browser = await chromium.launch({ executablePath: CHROME, args: LAUNCH_ARGS });
  ({ server, port, state } = await startMockServer({ root: 'dist', cards }));
});
after(async () => { await browser?.close(); server?.close(); });

const open = async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/${VARIANT}/cards.happy.html`, { waitUntil: 'networkidle' });
  return page;
};

test('質問カードと承認カードが取り違えられない構造になっている', async () => {
  const page = await open();
  const shape = await page.evaluate(() => {
    const q = document.querySelector('[data-card-type="OWNER_QUESTION"]');
    const a = document.querySelector('[data-card-type="ACTION_APPROVAL"]');
    const semantics = (el) => [...el.querySelectorAll('[data-action-semantic]')].map((b) => b.dataset.actionSemantic);
    const text = (el) => el.textContent.replace(/\s+/g, ' ');
    return {
      questionActions: semantics(q), approvalActions: semantics(a),
      // 種別は色だけでなくテキストでも判別できるか
      questionHasKindText: /質問/.test(text(q)), approvalHasKindText: /承認/.test(text(a)),
      questionHeading: q.querySelector('h3')?.tagName, approvalHeading: a.querySelector('h3')?.tagName,
    };
  });
  await page.close();

  assert.ok(!shape.questionActions.includes('ALLOW_ONCE'), '質問カードに承認の action があってはならない');
  assert.ok(shape.approvalActions.includes('ALLOW_ONCE'));
  // 永続許可 (ALLOW_ALWAYS, ALLOW_FOR_SESSION ...) は契約上存在しない。
  // ALLOW_ONCE だけが許される。
  assert.deepEqual(
    shape.approvalActions.filter((s) => s.startsWith('ALLOW')), ['ALLOW_ONCE'],
    '永続許可があってはならない');
  assert.ok(shape.questionHasKindText && shape.approvalHasKindText, '種別を色だけで区別してはならない');
});

test('承認カードは effect / scope / risk / 期限 / one-shot / 拒否時の影響を初期表示で出す', async () => {
  const page = await open();
  const visible = await page.evaluate(() => {
    const a = document.querySelector('[data-card-type="ACTION_APPROVAL"]');
    const out = {};
    for (const f of ['effect', 'resourceScope', 'risk', 'expiresAt', 'oneShot', 'blockedIfRefused']) {
      const el = a.querySelector(`[data-field="${f}"]`);
      if (!el) { out[f] = 'missing'; continue; }
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const closedDetails = el.closest('details:not([open])');
      out[f] = (b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && !closedDetails)
        ? 'visible' : 'hidden';
    }
    return out;
  });
  await page.close();
  for (const [field, s] of Object.entries(visible)) {
    assert.equal(s, 'visible', `${field} が初期表示で見えていない（折り畳み・非表示は禁止）`);
  }
});

test('結果不明カードは retry を primary にしない', async () => {
  const page = await open();
  const r = await page.evaluate(() => {
    const c = document.querySelector('[data-card-type="OUTCOME_UNKNOWN_REVIEW"]');
    const btns = [...c.querySelectorAll('[data-action-semantic]')];
    return {
      primary: btns.filter((b) => b.dataset.primary === 'true').map((b) => b.dataset.actionSemantic),
      hasSteps: !!c.querySelector('[data-field="safeVerificationSteps"]'),
      dupRiskVisible: c.querySelector('[data-field="duplicateEffectRisk"]')?.getBoundingClientRect().height > 0,
    };
  });
  await page.close();
  assert.deepEqual(r.primary, ['VERIFY_MANUALLY'], 'primary は「安全に確認する」でなければならない');
  assert.ok(r.hasSteps, '安全に確認する方法が出ていない');
  assert.ok(r.dupRiskVisible, '二重 effect の可能性が見えていない');
});

test('evidence が無い結果を「検証済み」に見せない', async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/${VARIANT}/cards.edge.html`, { waitUntil: 'networkidle' });
  const r = await page.evaluate(() => {
    const out = [];
    for (const c of document.querySelectorAll('[data-card-type="RESULT_REVIEW"]')) {
      const lvl = c.querySelector('[data-evidence-level]')?.dataset.evidenceLevel;
      const text = c.textContent.replace(/\s+/g, '');
      out.push({ id: c.dataset.cardId, level: lvl,
        claimsVerified: /検証済み|verified/i.test(text),
        showsReceiptAbsence: /receipt はありません|receiptはありません/.test(text) });
    }
    return out;
  });
  await page.close();
  for (const c of r) {
    if (c.level !== 'RECEIPTED') {
      assert.ok(!c.claimsVerified, `${c.id}: evidence ${c.level} なのに「検証済み」と表示している`);
    }
  }
});

test('ALLOW_ONCE は 1 回だけ effect を発生させる（連打しても）', async () => {
  const before = state.dispatches.length;
  const page = await open();
  await page.evaluate(async () => {
    const btn = document.querySelector('[data-card-id="card_a1"] [data-action-semantic="ALLOW_ONCE"]');
    btn.click(); btn.click(); btn.click();
  });
  await page.waitForTimeout(500);
  await page.close();
  assert.equal(state.dispatches.length - before, 1, 'ALLOW_ONCE が複数回 dispatch された');
});

test('server が拒否したとき「実行された」と表示しない', async () => {
  const page = await open();
  // 同じカードを再度承認しようとする（server は already-decided で拒否する）
  const status = await page.evaluate(async () => {
    const form = document.querySelector('[data-card-id="card_a1"] form');
    const fd = new FormData(form);
    fd.set('decision', 'ALLOW_ONCE');
    const res = await fetch(form.action, { method: 'POST', body: fd });
    return { status: res.status, body: await res.json() };
  });
  await page.close();
  assert.equal(status.status, 409);
  assert.match(status.body.ownerVisibleMessage, /すでに/);
});

test('期限切れカードは live カードと見分けがつき、操作ボタンが出ない', async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/${VARIANT}/cards.edge.html`, { waitUntil: 'networkidle' });
  const r = await page.evaluate(() => {
    const expired = document.querySelector('[data-card-state="EXPIRED"]');
    const live = document.querySelector('[data-card-state="LIVE"]');
    const visibleButtons = (el) => [...el.querySelectorAll('[data-action-semantic]')]
      .filter((b) => b.getBoundingClientRect().height > 0).length;
    return {
      expiredStateText: expired?.querySelector('[data-field="state"]')?.textContent ?? null,
      expiredButtons: visibleButtons(expired), liveButtons: visibleButtons(live),
      borderDiffers: getComputedStyle(expired).borderTopStyle !== getComputedStyle(live).borderTopStyle,
    };
  });
  await page.close();
  assert.match(r.expiredStateText ?? '', /期限切れ/, '期限切れであることが文字で出ていない');
  assert.equal(r.expiredButtons, 0, '期限切れカードに操作ボタンが見えている');
  assert.ok(r.liveButtons > 0);
  assert.ok(r.borderDiffers, '期限切れと live が形状で区別できない（色だけに頼っている）');
});

test('キーボードだけで全 action に到達できる', async () => {
  const page = await open();
  const total = await page.evaluate(() => document.querySelectorAll('[data-action-semantic]').length);
  const reached = new Set();
  for (let i = 0; i < 60 && reached.size < total; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => document.activeElement?.dataset?.actionSemantic ?? null);
    if (s) reached.add(s + ':' + (await page.evaluate(() => document.activeElement.closest('[data-card-id]')?.dataset.cardId)));
  }
  await page.close();
  assert.equal(reached.size, total, `Tab で到達できた action: ${reached.size}/${total}`);
});
