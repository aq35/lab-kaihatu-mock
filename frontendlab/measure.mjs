/**
 * frontendlab build-and-weigh ハーネス。
 *   node measure.mjs --exp <transpiler-orders|bundle-orders|dependency-cost|minify-orders>
 *                    [--runs N] [--out results/raw/<name>.json]
 *
 * 立場: 絶対 ms は環境依存。主張するのは「桁」（相対比）だけ。測定環境も受領書に残す。
 * すべての実験は同じ受領書形式（env + provenance + results）で results/raw/ に落ちる。
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

import esbuild from 'esbuild';
import swc from '@swc/core';
import { transformSync as babelTransform } from '@babel/core';
import { transformSync as oxcTransform } from 'oxc-transform';
import { minifySync as oxcMinify } from 'oxc-minify';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const EXP = opt('--exp', 'transpiler-orders');
const RUNS = Number(opt('--runs', 40));

const NM = resolve('node_modules');
const pkgVer = (p) => require(`${p}/package.json`).version;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const gz = (s) => gzipSync(Buffer.from(s), { level: 9 }).length;
const bytes = (s) => Buffer.byteLength(s, 'utf8');
const median = (xs) => {
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const round = (n, d = 4) => Number(n.toFixed(d));

// 同期 fn を warmup 後 N 回測って中央値/最小を返す
function timeSync(fn) {
  for (let i = 0; i < 5; i++) fn();
  const t = [];
  for (let i = 0; i < RUNS; i++) {
    const a = performance.now();
    fn();
    t.push(performance.now() - a);
  }
  return { ms_median: round(median(t)), ms_min: round(Math.min(...t)) };
}
// 非同期 fn（esbuild.build 用）
async function timeAsync(fn) {
  for (let i = 0; i < 3; i++) await fn();
  const t = [];
  for (let i = 0; i < RUNS; i++) {
    const a = performance.now();
    await fn();
    t.push(performance.now() - a);
  }
  return { ms_median: round(median(t)), ms_min: round(Math.min(...t)) };
}

const ENV = {
  node: process.version,
  platform: `${os.platform()} ${os.release()}`,
  cpu: os.cpus()[0]?.model ?? 'unknown',
  cpu_count: os.cpus().length,
};

function writeReceipt(name, extra) {
  const out = opt('--out', `results/raw/${name}.json`);
  const receipt = {
    experiment: name,
    hypotheses_frozen: extra.frozen,
    measured_at: new Date().toISOString(),
    env: ENV,
    runs: RUNS,
    ...extra.body,
  };
  mkdirSync(out.split('/').slice(0, -1).join('/'), { recursive: true });
  writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
  return out;
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const rule = (n = 78) => '─'.repeat(n);

// ============================================================================
// EXP-1: transpiler-orders
// ============================================================================
function expTranspilerOrders() {
  const src = readFileSync('fixtures/app.tsx', 'utf8');
  const T = [
    {
      id: 'babel', lang: 'JavaScript',
      version: `@babel/core ${pkgVer('@babel/core')} / preset-ts ${pkgVer('@babel/preset-typescript')} / preset-react ${pkgVer('@babel/preset-react')}`,
      run: () => babelTransform(src, { filename: 'app.tsx', babelrc: false, configFile: false, presets: [['@babel/preset-typescript'], ['@babel/preset-react', { runtime: 'automatic' }]] }).code,
    },
    {
      id: 'swc', lang: 'Rust', version: `@swc/core ${pkgVer('@swc/core')}`,
      run: () => swc.transformSync(src, { filename: 'app.tsx', isModule: true, minify: false, jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'esnext', transform: { react: { runtime: 'automatic' } } } }).code,
    },
    {
      id: 'esbuild', lang: 'Go', version: `esbuild ${pkgVer('esbuild')}`,
      run: () => esbuild.transformSync(src, { loader: 'tsx', jsx: 'automatic', target: 'esnext' }).code,
    },
    {
      id: 'oxc', lang: 'Rust', version: `oxc-transform ${pkgVer('oxc-transform')}`,
      run: () => { const r = oxcTransform('app.tsx', src, { jsx: { runtime: 'automatic' } }); if (r.errors?.length) throw new Error(r.errors.join('; ')); return r.code; },
    },
  ];
  const results = T.map((t) => {
    const o1 = t.run(), o2 = t.run();
    return { id: t.id, lang: t.lang, version: t.version, bytes_raw: bytes(o1), bytes_gzip: gz(o1), ...timeSync(t.run), deterministic: sha(o1) === sha(o2), output_sha256: sha(o1) };
  });
  const fastest = Math.min(...results.map((r) => r.ms_median));
  console.log(`\nEXP-1 transpiler-orders  (fixture ${bytes(src)} B, runs=${RUNS}, node ${ENV.node})`);
  console.log(`env: ${ENV.cpu} ×${ENV.cpu_count}`);
  console.log(rule());
  console.log(`${pad('transpiler', 10)}${pad('lang', 6)}${padL('raw B', 8)}${padL('gzip B', 8)}${padL('ms(med)', 10)}${padL('×fastest', 10)}${padL('det?', 6)}`);
  console.log(rule());
  for (const r of results) console.log(`${pad(r.id, 10)}${pad(r.lang, 6)}${padL(r.bytes_raw, 8)}${padL(r.bytes_gzip, 8)}${padL(r.ms_median, 10)}${padL((r.ms_median / fastest).toFixed(1) + 'x', 10)}${padL(r.deterministic ? 'yes' : 'NO', 6)}`);
  console.log(rule());
  const out = writeReceipt('transpiler-orders', { frozen: 'frontendlab/docs/_hypotheses-transpiler-orders.md', body: { fixture: 'frontendlab/fixtures/app.tsx', fixture_bytes: bytes(src), common_ground: 'TS 型除去 + JSX automatic, target=esnext, downlevel なし, 非圧縮', results } });
  console.log(`受領書: ${out}\n`);
}

// ============================================================================
// EXP-2: bundle-orders — 単発 transform×N vs 1回 bundle。esbuild の IPC 床の償却を見る。
// ============================================================================
async function expBundleOrders() {
  const dir = mkdtempSync(join(NM, '..', '.exp2-'));
  try {
    const Ns = [5, 25, 100];
    const rows = [];
    for (const N of Ns) {
      let entry = '';
      const files = [];
      for (let i = 0; i < N; i++) {
        const f = join(dir, `m${i}.js`);
        writeFileSync(f, `export const v${i}=(x)=>x*${i}+${i};\n`);
        files.push(f);
        entry += `import {v${i}} from './m${i}.js';\n`;
      }
      entry += 'export const total=(x)=>' + Array.from({ length: N }, (_, i) => `v${i}(x)`).join('+') + ';\n';
      const entryPath = join(dir, 'entry.js');
      writeFileSync(entryPath, entry);
      const srcs = files.map((f) => readFileSync(f, 'utf8'));

      // A) esbuild 1 回 bundle
      const esbundle = await timeAsync(() => esbuild.build({ entryPoints: [entryPath], bundle: true, write: false, format: 'esm', logLevel: 'silent' }));
      // B) esbuild transformSync × N
      const estransform = timeSync(() => { for (const s of srcs) esbuild.transformSync(s, { loader: 'js', target: 'esnext' }); });
      // C) oxc transform × N（プロセス内）
      const oxc = timeSync(() => { for (const s of srcs) oxcTransform('m.js', s, {}); });
      // D) swc transform × N（プロセス内）
      const swcT = timeSync(() => { for (const s of srcs) swc.transformSync(s, { filename: 'm.js', isModule: true, jsc: { parser: { syntax: 'ecmascript' }, target: 'esnext' } }); });

      rows.push({
        N,
        esbuild_bundle_ms: esbundle.ms_median, esbuild_bundle_per_file: round(esbundle.ms_median / N),
        esbuild_transformN_ms: estransform.ms_median, esbuild_transformN_per_file: round(estransform.ms_median / N),
        oxc_transformN_ms: oxc.ms_median, oxc_transformN_per_file: round(oxc.ms_median / N),
        swc_transformN_ms: swcT.ms_median, swc_transformN_per_file: round(swcT.ms_median / N),
      });
    }
    console.log(`\nEXP-2 bundle-orders  (per-file ms, runs=${RUNS}, node ${ENV.node})`);
    console.log(rule(84));
    console.log(`${pad('N files', 9)}${padL('esbuild bundle', 16)}${padL('esbuild tf×N', 15)}${padL('oxc tf×N', 12)}${padL('swc tf×N', 12)}`);
    console.log(rule(84));
    for (const r of rows) console.log(`${pad(r.N, 9)}${padL(r.esbuild_bundle_per_file, 16)}${padL(r.esbuild_transformN_per_file, 15)}${padL(r.oxc_transformN_per_file, 12)}${padL(r.swc_transformN_per_file, 12)}`);
    console.log(rule(84));
    const big = rows[rows.length - 1];
    console.log(`N=${big.N} で: esbuild bundle は transform×N の ${(big.esbuild_transformN_per_file / big.esbuild_bundle_per_file).toFixed(1)}x 速い（IPC 償却）。oxc は esbuild-per-file の ${(big.esbuild_transformN_per_file / big.oxc_transformN_per_file).toFixed(0)}x。`);
    const out = writeReceipt('bundle-orders', { frozen: 'frontendlab/docs/_hypotheses-exp2-3-4.md', body: { note: 'per_file = median total ms / N。esbuild bundle は IPC 1回、transform×N は IPC N回。', versions: { esbuild: pkgVer('esbuild'), oxc: pkgVer('oxc-transform'), swc: pkgVer('@swc/core') }, rows } });
    console.log(`受領書: ${out}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ============================================================================
// EXP-3: dependency-cost — 梯子「足さない > 分割 > 全体依存」+「遅延」を bundle bytes で。
// ============================================================================
async function expDependencyCost() {
  const dir = mkdtempSync(join(NM, '..', '.exp3-'));
  const bundleBytes = async (code, splitting = false) => {
    const entryPath = join(dir, 'e.js');
    writeFileSync(entryPath, code);
    const r = await esbuild.build({ entryPoints: [entryPath], bundle: true, write: false, format: 'esm', minify: true, nodePaths: [NM], logLevel: 'silent', ...(splitting ? { splitting: true, outdir: join(dir, 'out') } : {}) });
    const outs = r.outputFiles.map((f) => ({ name: f.path.split('/').pop(), len: f.contents.length }));
    // entry chunk = e.js（splitting 時、遅延分は chunk-*.js になる）
    const entryOut = outs.find((o) => /^e\.js$/.test(o.name)) ?? outs[0];
    const total = outs.reduce((a, o) => a + o.len, 0);
    return { initial: entryOut.len, total, chunks: outs.length };
  };
  try {
    const cases = [
      { rung: '1 足さない(自作)', code: "export function f(fn,w){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),w);};}" },
      { rung: '2 分割(tree-shake)', code: "import {debounce} from 'lodash-es';export const f=debounce(()=>{},100);" },
      { rung: '3 全体依存', code: "import _ from 'lodash';export const f=_.debounce(()=>{},100);" },
      { rung: '4 遅延(dynamic)', code: "export const f=()=>import('lodash-es').then(m=>m.debounce(()=>{},100));", splitting: true },
    ];
    const results = [];
    for (const c of cases) {
      const b = await bundleBytes(c.code, c.splitting);
      results.push({ rung: c.rung, initial_bytes: b.initial, total_bytes: b.total, chunks: b.chunks });
    }
    const own = results[0].initial_bytes;
    console.log(`\nEXP-3 dependency-cost  (bundle+minify, esbuild ${pkgVer('esbuild')})`);
    console.log(`梯子: 依存を足さない > 共有 > 分割(tree-shake) > 遅延読込`);
    console.log(rule(72));
    console.log(`${pad('段', 22)}${padL('初期 bytes', 12)}${padL('総 bytes', 12)}${padL('×自作(初期)', 14)}`);
    console.log(rule(72));
    for (const r of results) console.log(`${pad(r.rung, 22)}${padL(r.initial_bytes, 12)}${padL(r.total_bytes, 12)}${padL((r.initial_bytes / own).toFixed(0) + 'x', 14)}`);
    console.log(rule(72));
    console.log(`全体依存は自作の ${(results[2].initial_bytes / own).toFixed(0)}x。遅延は初期を ${(results[3].initial_bytes / own).toFixed(1)}x に保つが総 bytes は ${results[3].total_bytes} B（消えず後ろへ移動）。`);
    const out = writeReceipt('dependency-cost', { frozen: 'frontendlab/docs/_hypotheses-exp2-3-4.md', body: { deps: { lodash: pkgVer('lodash'), 'lodash-es': pkgVer('lodash-es') }, note: 'initial=初期ロードされる entry chunk / total=全 chunk 合計。全て minify 済み。', results } });
    console.log(`受領書: ${out}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ============================================================================
// EXP-4: minify-orders — 単一入力を 3 native minifier で圧縮して桁を見る。
// ============================================================================
async function expMinifyOrders() {
  const raw = readFileSync('fixtures/app.tsx', 'utf8');
  // 公平のため単一入力: fixture を esbuild で型除去だけした JS（minify なし）を全 minifier に通す
  const stripped = esbuild.transformSync(raw, { loader: 'tsx', jsx: 'automatic', target: 'esnext' }).code;
  const M = [
    { id: 'esbuild', run: () => esbuild.transformSync(stripped, { minify: true }).code },
    { id: 'swc', run: () => swc.minifySync(stripped, { compress: true, mangle: true, module: true }).code },
    { id: 'oxc', run: () => { const r = oxcMinify('app.js', stripped, { mangle: true, compress: true }); if (r.errors?.length) throw new Error(r.errors.join('; ')); return r.code; } },
  ];
  const results = M.map((m) => {
    const o1 = m.run(), o2 = m.run();
    return { id: m.id, bytes_min: bytes(o1), bytes_min_gzip: gz(o1), ...timeSync(m.run), deterministic: sha(o1) === sha(o2), output_sha256: sha(o1) };
  });
  const strippedBytes = bytes(stripped);
  const smallest = Math.min(...results.map((r) => r.bytes_min));
  const smallestGz = Math.min(...results.map((r) => r.bytes_min_gzip));
  console.log(`\nEXP-4 minify-orders  (単一入力 ${strippedBytes} B = esbuild 型除去後, runs=${RUNS})`);
  console.log(rule(74));
  console.log(`${pad('minifier', 10)}${padL('min B', 9)}${padL('min gzip B', 12)}${padL('×最小', 8)}${padL('×最小gz', 9)}${padL('det?', 7)}`);
  console.log(rule(74));
  for (const r of results) console.log(`${pad(r.id, 10)}${padL(r.bytes_min, 9)}${padL(r.bytes_min_gzip, 12)}${padL((r.bytes_min / smallest).toFixed(2) + 'x', 8)}${padL((r.bytes_min_gzip / smallestGz).toFixed(2) + 'x', 9)}${padL(r.deterministic ? 'yes' : 'NO', 7)}`);
  console.log(rule(74));
  console.log(`型除去後 ${strippedBytes} B → minify で最小 ${smallest} B（${(strippedBytes / smallest).toFixed(2)}x 圧縮）。minifier 間の幅: raw ${(Math.max(...results.map((r) => r.bytes_min)) / smallest).toFixed(2)}x / gzip ${(Math.max(...results.map((r) => r.bytes_min_gzip)) / smallestGz).toFixed(2)}x。`);
  const out = writeReceipt('minify-orders', { frozen: 'frontendlab/docs/_hypotheses-exp2-3-4.md', body: { input: 'fixtures/app.tsx を esbuild で型除去した JS（単一入力）', input_bytes: strippedBytes, versions: { esbuild: pkgVer('esbuild'), swc: pkgVer('@swc/core'), 'oxc-minify': pkgVer('oxc-minify') }, results } });
  console.log(`受領書: ${out}\n`);
}

// ---- dispatch ----
const table = {
  'transpiler-orders': expTranspilerOrders,
  'bundle-orders': expBundleOrders,
  'dependency-cost': expDependencyCost,
  'minify-orders': expMinifyOrders,
};
const fn = table[EXP];
if (!fn) { console.error(`unknown --exp ${EXP}. one of: ${Object.keys(table).join(', ')}`); process.exit(1); }
await fn();
