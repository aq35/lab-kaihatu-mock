/**
 * frontendlab build-and-weigh ハーネス。
 *   node measure.mjs --exp transpiler-orders [--runs 40] [--out results/raw/<name>.json]
 *
 * 測るもの（同じ土俵: TS 型除去 + JSX automatic、target=esnext、downlevel なし、非圧縮）:
 *   - 出力バイト数 raw / gzip
 *   - 変換時間の中央値（warmup 後 N 回）
 *   - 出力 sha256（決定論: 2 回変換して一致するか）
 *   - provenance: transpiler version / Node version / CPU / platform
 *
 * 立場: 絶対 ms は環境依存。主張するのは「桁」（相対比）だけ。測定環境も受領書に残す。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const RUNS = Number(opt('--runs', 40));
const OUT = opt('--out', 'results/raw/transpiler-orders.json');

const src = readFileSync('fixtures/app.tsx', 'utf8');
const pkgVer = (p) => require(`${p}/package.json`).version;

// --- 変換器の定義（すべて「型除去 + JSX automatic + esnext + 非圧縮」に揃える）------------
import esbuild from 'esbuild';
import swc from '@swc/core';
import { transformSync as babelTransform } from '@babel/core';
import { transform as oxcTransform } from 'oxc-transform';

const TRANSPILERS = [
  {
    id: 'babel',
    lang: 'JavaScript',
    version: `@babel/core ${pkgVer('@babel/core')} / preset-typescript ${pkgVer('@babel/preset-typescript')} / preset-react ${pkgVer('@babel/preset-react')}`,
    run: () =>
      babelTransform(src, {
        filename: 'app.tsx',
        babelrc: false,
        configFile: false,
        presets: [['@babel/preset-typescript'], ['@babel/preset-react', { runtime: 'automatic' }]],
      }).code,
  },
  {
    id: 'swc',
    lang: 'Rust',
    version: `@swc/core ${pkgVer('@swc/core')}`,
    run: () =>
      swc.transformSync(src, {
        filename: 'app.tsx',
        isModule: true,
        minify: false,
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          target: 'esnext',
          transform: { react: { runtime: 'automatic' } },
        },
      }).code,
  },
  {
    id: 'esbuild',
    lang: 'Go',
    version: `esbuild ${pkgVer('esbuild')}`,
    run: () => esbuild.transformSync(src, { loader: 'tsx', jsx: 'automatic', target: 'esnext' }).code,
  },
  {
    id: 'oxc',
    lang: 'Rust',
    version: `oxc-transform ${pkgVer('oxc-transform')}`,
    run: () => {
      const r = oxcTransform('app.tsx', src, { jsx: { runtime: 'automatic' } });
      if (r.errors?.length) throw new Error(`oxc errors: ${r.errors.join('; ')}`);
      return r.code;
    },
  },
];

const sha = (s) => createHash('sha256').update(s).digest('hex');
const median = (xs) => {
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

function measure(t) {
  const out1 = t.run();
  const out2 = t.run(); // 決定論チェック
  const deterministic = sha(out1) === sha(out2);

  for (let i = 0; i < 5; i++) t.run(); // warmup（JIT/キャッシュ）
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const a = performance.now();
    t.run();
    times.push(performance.now() - a);
  }
  const raw = Buffer.byteLength(out1, 'utf8');
  const gz = gzipSync(out1, { level: 9 }).length;
  return {
    id: t.id,
    lang: t.lang,
    version: t.version,
    bytes_raw: raw,
    bytes_gzip: gz,
    ms_median: Number(median(times).toFixed(4)),
    ms_min: Number(Math.min(...times).toFixed(4)),
    deterministic,
    output_sha256: sha(out1),
  };
}

const results = TRANSPILERS.map(measure);

const receipt = {
  experiment: 'transpiler-orders',
  hypotheses_frozen: 'frontendlab/docs/_hypotheses-transpiler-orders.md',
  fixture: 'frontendlab/fixtures/app.tsx',
  fixture_bytes: Buffer.byteLength(src, 'utf8'),
  common_ground: 'TS 型除去 + JSX automatic runtime, target=esnext, downlevel なし, 非圧縮',
  runs: RUNS,
  measured_at: new Date().toISOString(),
  env: {
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cpu_count: os.cpus().length,
  },
  results,
};

mkdirSync(OUT.split('/').slice(0, -1).join('/'), { recursive: true });
writeFileSync(OUT, JSON.stringify(receipt, null, 2) + '\n');

// --- 桁で語る要約表 -----------------------------------------------------------------
const fastest = Math.min(...results.map((r) => r.ms_median));
const smallest = Math.min(...results.map((r) => r.bytes_raw));
const smallestGz = Math.min(...results.map((r) => r.bytes_gzip));
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log(`\nEXP-1 transpiler-orders  (fixture ${receipt.fixture_bytes} B, runs=${RUNS}, node ${process.version})`);
console.log(`env: ${receipt.env.cpu} ×${receipt.env.cpu_count}`);
console.log('─'.repeat(78));
console.log(
  `${pad('transpiler', 10)}${pad('lang', 6)}${padL('raw B', 8)}${padL('gzip B', 8)}${padL('ms(med)', 10)}${padL('×fastest', 10)}${padL('det?', 6)}`,
);
console.log('─'.repeat(78));
for (const r of results) {
  console.log(
    `${pad(r.id, 10)}${pad(r.lang, 6)}${padL(r.bytes_raw, 8)}${padL(r.bytes_gzip, 8)}${padL(r.ms_median, 10)}${padL((r.ms_median / fastest).toFixed(1) + 'x', 10)}${padL(r.deterministic ? 'yes' : 'NO', 6)}`,
  );
}
console.log('─'.repeat(78));
console.log(
  `桁: 速度 ${(Math.max(...results.map((r) => r.ms_median)) / fastest).toFixed(0)}x 幅 / raw ${(Math.max(...results.map((r) => r.bytes_raw)) / smallest).toFixed(2)}x 幅 / gzip ${(Math.max(...results.map((r) => r.bytes_gzip)) / smallestGz).toFixed(2)}x 幅`,
);
console.log(`受領書: ${OUT}\n`);
