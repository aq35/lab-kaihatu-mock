/**
 * 多様性測定器の校正。 node tools/vgui-diversity-meter.mjs
 *
 * 既知の対照（負: identical/color-only/spacing-only, 被験: current-vgui, 正: structural=ui-11）を
 * 同一の意味 DOM 上で描き、指標を分離して（pixel/ssim/geometry/typography/emphasis/grouping）
 * 全ペア平均の多様性を出す。凍結した順序を復元できるかで測定器の合否を決める。
 *   docs/research/_diversity-meter-calibration.md（測定前に凍結）
 *
 * geometry/typography 等は共有の data-* 契約（[data-card-type]/[data-field]/[data-action-semantic]）から
 * 測るので、VGUI の k* markup でも condition-C markup でも同じに効く（測定器は描画結果だけを見る）。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { renderCandidatePage } from '../experiments/vgui/compiler.mjs';
import { startServer } from './serve.mjs';

const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--no-first-run','--disable-sync','--disable-background-networking','--disable-component-update','--disable-features=Translate,AutofillServerCommunication'];
const W = 820, H = 1400;
const cards = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'));
const g1 = JSON.parse(readFileSync('docs/results/raw/vgui-gen1.json', 'utf8'));
const base = g1.results.find(r => r.id === 'cand-01').params;    // 対照の基準 params（実在の生存案）

// CSS は外部 app.css にする（dev server の CSP style-src 'self' は inline <style> を止めるため。
// 外部参照なら 'self' で許可され、対照ページも structural ページも同条件で styled に描かれる）。
const shell = (body) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./app.css"></head><body>${body}</body></html>`;
const writePage = (dir, params, mutateCss) => {
  const { html, css } = renderCandidatePage(cards, params);
  mkdirSync(`dist/vgui/controls/${dir}`, { recursive: true });
  writeFileSync(`dist/vgui/controls/${dir}/app.css`, mutateCss ? mutateCss(css) : css);
  writeFileSync(`dist/vgui/controls/${dir}/index.html`, shell(html));
  return `/vgui/controls/${dir}/index.html`;
};
const scaleSpacing = (factor) => (css) => css.replace(/--pad:([\d.]+)rem;--gap:([\d.]+)rem;--feed:([\d.]+)rem;/,
  (_, p, g, f) => `--pad:${(p*factor).toFixed(2)}rem;--gap:${(g*factor).toFixed(2)}rem;--feed:${(f*factor).toFixed(2)}rem;`);

// --- 対照の URL を組み立てる（すべて同一の意味 DOM） ---
// build-variants は dist を rmSync で全消しするので、先に走らせてから対照ページを書く。
execSync('node tools/build-variants.mjs >/dev/null 2>&1 && node tools/build-catalog.mjs >/dev/null 2>&1', { stdio: 'ignore' });

const survT = ['cand-01','cand-04','cand-07','cand-08'].map(id => g1.results.find(r => r.id === id).params);
const conditions = {
  'N1-identical': [0,1,2].map(i => writePage(`n1/${i}`, base)),                                   // byte 同一 ×3
  'N2-color-only': [210,250,290,330].map((hue,i) => writePage(`n2/${i}`, { ...base, accentHue: hue })), // 色だけ
  'N3-spacing-only': [0.6,0.9,1.2,1.5].map((f,i) => writePage(`n3/${i}`, base, scaleSpacing(f))),  // 間隔だけ
  'T-current-vgui': survT.map((p,i) => writePage(`t/${i}`, p)),                                    // gen1 生存 4 案を params から再描画
  'P-structural': ['cards.happy'].map(()=>'/c-semantic-css/cards.happy.html')                      // standard
    .concat(['calm-console','editorial','command-center','conversational','timeline'].map(t => `/catalog/${t}.html`)),
};

// --- ページごとの特徴抽出（幾何・書体・強調・grouping）を DOM から ---
const extract = () => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const box = (el) => { const r = el.getBoundingClientRect(); return { x:r.x/vw, y:r.y/vh, w:r.width/vw, h:r.height/vh, area:(r.width*r.height)/(vw*vh) }; };
  const cardsEl = [...document.querySelectorAll('[data-card-type]')];
  const boxes = cardsEl.map(box);
  // 列数: カード左端を 0.06 単位でクラスタ
  const lefts = boxes.map(b => Math.round(b.x/0.06));
  const nColumns = new Set(lefts).size;
  const meanW = boxes.reduce((s,b)=>s+b.w,0)/(boxes.length||1);
  const meanH = boxes.reduce((s,b)=>s+b.h,0)/(boxes.length||1);
  const maxIndent = Math.max(...boxes.map(b=>b.x), 0);                     // timeline 等の字下げ
  // カード間隔（縦方向の隙間の平均）
  const sorted = boxes.slice().sort((a,b)=>a.y-b.y);
  let gaps=[]; for(let i=1;i<sorted.length;i++){ gaps.push(Math.max(0, sorted[i].y-(sorted[i-1].y+sorted[i-1].h))); }
  const meanGap = gaps.length? gaps.reduce((s,x)=>s+x,0)/gaps.length : 0;
  // 承認カードのフィールド配置
  const appr = document.querySelector('[data-card-type="ACTION_APPROVAL"]');
  const fEls = appr ? [...appr.querySelectorAll('[data-field]')] : [];
  const fb = fEls.map(box);
  const fY = fb.map(b=>b.y).sort((a,b)=>a-b);
  const fieldYspread = fY.length? (fY[fY.length-1]-fY[0]) : 0;
  // 横並び（同じ行にある field ペア数）
  let sideBySide=0; for(let i=0;i<fb.length;i++)for(let j=i+1;j<fb.length;j++){ if(Math.abs(fb[i].y-fb[j].y)<0.01 && Math.abs(fb[i].x-fb[j].x)>0.02) sideBySide++; }
  // grouping: 承認カードの field を「見た目」で塊に分ける（DOM でなく幾何で。同一 DOM でも配置で変わる）。
  // y でソートし、隣接 field の縦隙間が中央値の 2 倍を超えたら別の塊とみなす → 塊数。
  const fys = fb.slice().sort((a,b)=>a.y-b.y);
  const dys = []; for(let i=1;i<fys.length;i++) dys.push(fys[i].y-(fys[i-1].y+fys[i-1].h));
  const med = dys.length? dys.slice().sort((a,b)=>a-b)[Math.floor(dys.length/2)] : 0;
  let groupBlocks = fys.length? 1 : 0; for(const d of dys){ if(d > Math.max(0.012, med*2)) groupBlocks++; }
  // typography
  const cs = (el, prop) => el? getComputedStyle(el)[prop] : '';
  const bodyEl = document.querySelector('[data-field]') || document.body;
  const titleEl = document.querySelector('h1,h2,h3,[class*="title"],[class*="lead"],[data-field="action"],[data-field="question"]');
  const labelEl = document.querySelector('[class*="label"],dt,legend');
  const famRaw = (cs(titleEl,'fontFamily')+' '+cs(bodyEl,'fontFamily')).toLowerCase();
  const fam = /mono/.test(famRaw) ? 2 : (/serif/.test(famRaw) && !/sans-serif/.test(famRaw) ? 1 : 0); // 0 sans /1 serif /2 mono
  const px = (el)=> parseFloat(cs(el,'fontSize'))||0;
  const wt = (el)=> parseFloat(cs(el,'fontWeight'))||400;
  const lh = parseFloat(cs(bodyEl,'lineHeight'))|| (px(bodyEl)*1.4);
  // emphasis: 面積×太さ×字sizeが最大のテキスト要素の役割と位置
  let best=null,bestScore=-1;
  for(const el of document.querySelectorAll('h1,h2,h3,p,dt,dd,button,legend,span,li')){
    const r=el.getBoundingClientRect(); if(r.width<2||r.height<2) continue;
    const s=(r.width*r.height)*(parseFloat(getComputedStyle(el).fontWeight)||400)*(parseFloat(getComputedStyle(el).fontSize)||10);
    if(s>bestScore){bestScore=s; best=el;}
  }
  const emphCard = best? (best.closest('[data-card-type]')?.getAttribute('data-card-type')||'none') : 'none';
  const emphTop = best? (best.getBoundingClientRect().y/vh < 0.5 ? 1:0) : 0;
  const emphType = ['OWNER_QUESTION','ACTION_APPROVAL','OUTCOME_UNKNOWN_REVIEW','RESULT_REVIEW','INFORMATION','none'].indexOf(emphCard);

  // geometry = カード配置(構造)だけ。絶対的な大きさ/間隔(スカラー)は pixel/ssim 側に任せ、ここには入れない。
  //   nColumns(段組) / maxIndent(timeline 等の字下げ) / sideBySide(横並び field 数)。同一 DOM でも配置で変わる。
  // grouping = 承認カード内の視覚的な塊の数(スケール不変)。
  // typography は family(書体)を主にした専用距離で測る(下)。ここでは素の値を返す。
  return {
    geometry: [nColumns, maxIndent, sideBySide],
    grouping: [groupBlocks],
    typographyRaw: { fam, body: px(bodyEl), title: px(titleEl), tw: wt(titleEl), lw: wt(labelEl) },
    emphasis: [emphType, emphTop],
  };
};

// --- 描画・撮影・特徴抽出 ---
const { server, port } = await startServer(0, 'dist');
const b = await chromium.launch({ executablePath: CHROME, args: ARGS });
const pages = {}; // cond -> [{img, feats}]
for (const [cond, urls] of Object.entries(conditions)) {
  pages[cond] = [];
  for (const u of urls) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${port}${u}`, { waitUntil: 'load' });
    await p.waitForTimeout(200);
    const feats = await p.evaluate(extract);
    const img = 'data:image/png;base64,' + (await p.screenshot({ clip: { x:0,y:0,width:W,height:H } })).toString('base64');
    pages[cond].push({ feats, img });
    await ctx.close();
  }
}

// --- 特徴を全ページで正規化（min-max, 次元ごと） ---
const allPages = Object.values(pages).flat();
const groups = ['geometry','emphasis','grouping'];
const ranges = {};
for (const gname of groups) {
  const dim = allPages[0].feats[gname].length; ranges[gname] = [];
  for (let d=0; d<dim; d++){ const vals = allPages.map(pp=>pp.feats[gname][d]); const mn=Math.min(...vals),mx=Math.max(...vals); ranges[gname].push([mn, mx>mn?mx:mn+1]); }
}
const normVec = (gname, v) => v.map((x,d)=>{ const [mn,mx]=ranges[gname][d]; return (x-mn)/(mx-mn); });
const featDist = (gname, a, b) => { const na=normVec(gname,a.feats[gname]), nb=normVec(gname,b.feats[gname]);
  return Math.sqrt(na.reduce((s,_,d)=>s+(na[d]-nb[d])**2,0))/Math.sqrt(na.length); };
// typography は知覚的重みで測る: 書体 family の入れ替えが支配的で、px/weight の差は相対的に小さい。
// min-max 正規化だと VGUI の ±数px が family 交換と同格に膨らむので、絶対スケールで測る。
const typoDist = (a, b) => {
  const A=a.feats.typographyRaw, B=b.feats.typographyRaw;
  const fam = A.fam !== B.fam ? 1 : 0;
  const size = Math.min(1, ((Math.abs(A.body-B.body)/Math.max(A.body,1)) + (Math.abs(A.title-B.title)/Math.max(A.title,1)))/2 * 2);
  const wt = Math.min(1, (Math.abs(A.tw-B.tw)+Math.abs(A.lw-B.lw))/300);
  return +(0.55*fam + 0.30*size + 0.15*wt).toFixed(4);
};

// --- 画像指標（pixel, ssim）をブラウザ内で pairwise ---
const meas = await b.newContext({ viewport:{width:W,height:H} }).then(c=>c.newPage());
async function imgMetrics(imgs){ return meas.evaluate(async ({imgs,W,H})=>{
  const gray=[];
  for(const src of imgs){ const im=new Image(); im.src=src; await im.decode();
    const c=new OffscreenCanvas(W,H); const g=c.getContext('2d'); g.drawImage(im,0,0,W,H);
    const d=g.getImageData(0,0,W,H).data; const arr=new Float64Array(W*H);
    for(let k=0,j=0;k<d.length;k+=4,j++) arr[j]=0.299*d[k]+0.587*d[k+1]+0.114*d[k+2];
    gray.push({d, arr}); }
  const px=(a,b)=>{ let s=0,n=a.d.length/4; for(let k=0;k<a.d.length;k+=4){ s+=(Math.abs(a.d[k]-b.d[k])+Math.abs(a.d[k+1]-b.d[k+1])+Math.abs(a.d[k+2]-b.d[k+2]))/3; } return s/n/255; };
  const ssim=(a,b)=>{ // 窓 8x8 非重複の平均 SSIM を距離化(1-SSIM)
    const win=8,C1=6.5025,C2=58.5225; let acc=0,cnt=0;
    for(let y=0;y+win<=H;y+=win)for(let x=0;x+win<=W;x+=win){
      let ma=0,mb=0; for(let j=0;j<win;j++)for(let i=0;i<win;i++){const idx=(y+j)*W+(x+i); ma+=a.arr[idx]; mb+=b.arr[idx];}
      const nwin=win*win; ma/=nwin; mb/=nwin; let va=0,vb=0,cov=0;
      for(let j=0;j<win;j++)for(let i=0;i<win;i++){const idx=(y+j)*W+(x+i); const da=a.arr[idx]-ma,db=b.arr[idx]-mb; va+=da*da; vb+=db*db; cov+=da*db;}
      va/=nwin-1; vb/=nwin-1; cov/=nwin-1;
      const s=((2*ma*mb+C1)*(2*cov+C2))/((ma*ma+mb*mb+C1)*(va+vb+C2)); acc+=s; cnt++;
    }
    return 1-(acc/cnt);
  };
  const out=[]; for(let i=0;i<imgs.length;i++)for(let j=i+1;j<imgs.length;j++) out.push({ pixel:px(gray[i],gray[j]), ssim:ssim(gray[i],gray[j]) });
  return out;
}, {imgs, W, H}); }

// --- 条件ごとに全ペア平均 ---
const metrics = ['pixel','ssim','geometry','typography','emphasis','grouping'];
const perCond = {};
for (const [cond, arr] of Object.entries(pages)) {
  const im = await imgMetrics(arr.map(a=>a.img));
  const acc = Object.fromEntries(metrics.map(m=>[m,[]])); let idx=0;
  for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
    acc.pixel.push(im[idx].pixel); acc.ssim.push(im[idx].ssim);
    acc.geometry.push(featDist('geometry',arr[i],arr[j]));
    acc.typography.push(typoDist(arr[i],arr[j]));
    acc.emphasis.push(featDist('emphasis',arr[i],arr[j]));
    acc.grouping.push(featDist('grouping',arr[i],arr[j]));
    idx++;
  }
  const mean = a => a.reduce((s,x)=>s+x,0)/(a.length||1);
  perCond[cond] = Object.fromEntries(metrics.map(m=>[m, +mean(acc[m]).toFixed(4)]));
}

// --- composite: 各指標を条件間で min-max 正規化してから平均 ---
const condOrder = ['N1-identical','N2-color-only','N3-spacing-only','T-current-vgui','P-structural'];
const normM = {};
for (const m of metrics){ const vals=condOrder.map(c=>perCond[c][m]); const mn=Math.min(...vals),mx=Math.max(...vals);
  normM[m]=Object.fromEntries(condOrder.map(c=>[c,(perCond[c][m]-mn)/((mx-mn)||1)])); }
const composite = Object.fromEntries(condOrder.map(c=>[c, +(metrics.reduce((s,m)=>s+normM[m][c],0)/metrics.length).toFixed(4)]));

// --- 合否: 凍結順序 identical < scalar(N2,N3) < current-vgui < structural ---
const scalarTier = (o)=> (o['N2-color-only']+o['N3-spacing-only'])/2;
const recovers = (o)=> o['N1-identical'] < scalarTier(o) && scalarTier(o) < o['T-current-vgui'] && o['T-current-vgui'] < o['P-structural'];
const structAboveVgui = (m)=> perCond['P-structural'][m] > perCond['T-current-vgui'][m];
const compositePass = recovers(composite);
const structuralMetricsPass = structAboveVgui('geometry') && structAboveVgui('typography');
const verdict = compositePass && structuralMetricsPass ? 'PASS' : 'FAIL';

const out = { ranAt:new Date().toISOString(), frozenOrder:'identical < scalar-only < current-vgui < structural',
  conditions:Object.fromEntries(Object.entries(conditions).map(([k,v])=>[k,v.length])),
  perConditionRaw: perCond, compositeNormalized: composite,
  metricOrderRecovered: Object.fromEntries(metrics.map(m=>[m, recovers(Object.fromEntries(condOrder.map(c=>[c,perCond[c][m]])))])),
  structuralAboveVgui: Object.fromEntries(metrics.map(m=>[m, structAboveVgui(m)])),
  gate:{ compositeRecoversOrder:compositePass, geometryTypographySeparate:structuralMetricsPass, verdict } };
mkdirSync('docs/results/raw',{recursive:true});
writeFileSync('docs/results/raw/vgui-diversity-calibration.json', JSON.stringify(out,null,2));

// --- 表示 ---
console.log('\n多様性測定器 校正 — 全ペア平均（0=同一, 大=多様）');
console.log('metric'.padEnd(12)+condOrder.map(c=>c.replace(/^..-/,'').padStart(13)).join(''));
for(const m of metrics) console.log(m.padEnd(12)+condOrder.map(c=>String(perCond[c][m]).padStart(13)).join(''));
console.log('composite'.padEnd(12)+condOrder.map(c=>String(composite[c]).padStart(13)).join(''));
console.log('\n順序復元(各指標):', out.metricOrderRecovered);
console.log('structural>vgui:', out.structuralAboveVgui);
console.log(`\n合否: composite順序=${compositePass} / geometry・typographyでstructural>vgui=${structuralMetricsPass} → ${verdict}`);
await b.close(); server.close();
