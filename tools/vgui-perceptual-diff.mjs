// 生存案どうしが「見た目として」どれだけ違うかを実測する。
// パラメータ距離ではなく、同一ビューポートに描いたピクセルの差を測る（Owner が見るのは画素）。
// 各ペアで、閾値超えのピクセル割合(%)と平均差(0..1) を出す。
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';
const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--no-first-run','--disable-sync','--disable-background-networking','--disable-component-update','--disable-features=Translate,AutofillServerCommunication'];
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ['cand-01','cand-04','cand-07','cand-08'];
const W = 820, H = 1400;

const { server, port } = await startServer(0, 'dist');
const b = await chromium.launch({ executablePath: CHROME, args: ARGS });
const shots = {};
for (const id of IDS) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${port}/vgui/gen1/${id}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(250);
  const buf = await p.screenshot({ clip: { x: 0, y: 0, width: W, height: H } }); // 固定枠(スクロール無し)
  shots[id] = 'data:image/png;base64,' + buf.toString('base64');
  await ctx.close();
}

// ブラウザ内で decode → 同一グリッドで pairwise 差分
const page = await b.newContext({ viewport: { width: W, height: H } }).then(c => c.newPage());
const result = await page.evaluate(async ({ shots, ids, W, H }) => {
  const bmps = {};
  for (const id of ids) {
    const img = new Image(); img.src = shots[id];
    await img.decode();
    const c = new OffscreenCanvas(W, H); const g = c.getContext('2d');
    g.drawImage(img, 0, 0, W, H);
    bmps[id] = g.getImageData(0, 0, W, H).data;
  }
  const pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = bmps[ids[i]], d = bmps[ids[j]];
    let sum = 0, changed = 0; const n = a.length / 4;
    for (let k = 0; k < a.length; k += 4) {
      const dr = Math.abs(a[k]-d[k]), dg = Math.abs(a[k+1]-d[k+1]), db = Math.abs(a[k+2]-d[k+2]);
      const dp = (dr+dg+db)/3;
      sum += dp; if (dp > 24) changed++;   // 24/255 を超えたら「目に見える差」とみなす
    }
    pairs.push({ pair: ids[i]+' vs '+ids[j], meanDiff: +(sum/n/255).toFixed(4), changedPct: +(100*changed/n).toFixed(1) });
  }
  return pairs;
}, { shots, ids: IDS, W, H });

result.sort((a,b)=>a.changedPct-b.changedPct);
console.log('固定枠 '+W+'x'+H+' での pairwise 見た目差（changedPct=目に見える差のピクセル割合）:');
for (const r of result) console.log('  '+r.pair.padEnd(22), 'changed '+String(r.changedPct).padStart(5)+'%', ' meanDiff '+r.meanDiff);
await b.close(); server.close();
