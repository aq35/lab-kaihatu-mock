// VGUI の視覚成果物を撮る: Owner gallery（blind 比較）と、最も遠い生存 2 案。
// 再現: node tools/vgui-pipeline.mjs && node tools/shot-vgui.mjs
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--no-first-run','--disable-sync','--disable-background-networking','--disable-component-update','--disable-features=Translate,AutofillServerCommunication'];
const { server, port } = await startServer(0, 'dist');
const b = await chromium.launch({ executablePath: CHROME, args: ARGS });

const shots = [
  { url: `vgui/gallery.html`, out: `dist/vgui/shot-gallery.png`, full: true, w: 1280, h: 1000 },
  { url: `vgui/gen1/cand-01/index.html`, out: `dist/vgui/shot-cand-01.png`, full: true, w: 900, h: 1100 }, // density 0.12（余白広）
  { url: `vgui/gen1/cand-08/index.html`, out: `dist/vgui/shot-cand-08.png`, full: true, w: 900, h: 1100 }, // density 0.73（高密度）
];
for (const s of shots) {
  const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${port}/${s.url}`, { waitUntil: 'load' });
  await p.waitForTimeout(300);
  await p.screenshot({ path: s.out, fullPage: s.full });
  console.log('shot', s.out);
  await ctx.close();
}
await b.close(); server.close();
