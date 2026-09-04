// 計測器の妥当性チェック（計測系の検証）: クリック→カード種別/フィールド取得、フェーズ遷移、
// 誤認・見落としの記録が正しく動くかを、正しいクリックと誤ったクリックの両方で確かめる。
// これは Owner の代理選択ではない（判断内容は測らない）。器械が正しく測れるかだけを見る。
// 計測器は Artifact として公開する。Artifact runtime は inline script/style を許可するため、
// プロジェクトの厳格 dev server(script-src 'self') ではなく、それに等しい file://（CSP ヘッダ無し）で検証する。
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--no-first-run','--disable-sync','--disable-background-networking','--disable-component-update','--disable-features=Translate,AutofillServerCommunication'];
const b = await chromium.launch({ executablePath: CHROME, args: ARGS });
const p = await b.newContext({ viewport: { width: 1100, height: 900 } }).then(c => c.newPage());
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + resolve('dist/vgui/owner-study.html'), { waitUntil: 'load' });

const ok = [];
const assert = (name, cond) => ok.push(`${cond ? 'PASS' : 'FAIL'}  ${name}`);

await p.click('#start');
// 4 案を、案ごとに「危険カード → リスク」で正しくクリックし、遷移するか確認。
// 最後の案だけ、危険識別で "わざと別カード" を押して誤認が記録されるか確認。
for (let i = 0; i < 4; i++) {
  await p.waitForFunction(() => { const f = document.getElementById('frame'); return f && f.contentDocument && f.contentDocument.querySelector('[data-card-type]'); });
  const frame = p.frameLocator('#frame');
  if (i < 3) {
    // 正しい危険カード(card_a1)をクリック
    await frame.locator('[data-card-id="card_a1"]').first().click();
  } else {
    // わざと別カード(OWNER_QUESTION)をクリック → 誤認になるはず
    await frame.locator('[data-card-type="OWNER_QUESTION"]').first().click();
    // 誤認後もフェーズ2(リスク)へ進む設計。card_a1 のリスクは別カードなので、
    // ここでは OWNER_QUESTION 内の [data-field] を押して見落とし(risk 以外)を記録させる。
  }
  // フェーズ2: リスク箇所（正しい案では kfact--risk、誤認案では question フィールド）
  await p.waitForFunction(() => document.getElementById('prompt').textContent.includes('リスク'));
  if (i < 3) {
    await frame.locator('.kfact--risk').first().click();
  } else {
    await frame.locator('[data-field="question"]').first().click();
  }
}
// 最終選択画面
await p.waitForSelector('#final:not([hidden])');
await p.click('#pickSafe input[value="A"]');
await p.fill('#reason', 'selftest');
await p.click('#finish');
await p.waitForSelector('#result:not([hidden])');
const out = JSON.parse(await p.textContent('#json'));

assert('4 案すべて計測された', out.perCandidate.length === 4);
assert('正しい 3 案は危険カードを正解', out.perCandidate.slice(0,3).every(r => r.identifyCorrect === true));
assert('4 案目(誤クリック)は誤認として記録', out.perCandidate[3].identifyCorrect === false);
assert('誤認集計 = 1', out.summary.dangerousMisID === 1);
assert('正しい 3 案はリスク発見 true', out.perCandidate.slice(0,3).every(r => r.riskFound === true));
assert('4 案目はリスク未発見(見落とし)', out.perCandidate[3].riskFound === false);
assert('見落とし集計 = 1', out.summary.riskMissed === 1);
assert('識別時間が正の値', out.perCandidate.every(r => r.identifySeconds > 0));
assert('order に candId が入る', out.order.length === 4 && out.order.every(o => /^cand-\d+/.test(o.candId)));
assert('chosenSafest に candId 復号', /^cand-\d+/.test(out.chosenSafest.candId || ''));
assert('pageerror なし', errs.length === 0);

console.log(ok.join('\n'));
console.log(errs.length ? '\nERRORS:\n'+errs.join('\n') : '');
await b.close();
process.exit(ok.some(l => l.startsWith('FAIL')) ? 1 : 0);
