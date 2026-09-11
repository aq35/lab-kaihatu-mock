/**
 * sunao ビルドツール — 既製 native bundler を「作り直さず束ねる」オーケストレータ。
 *   node build.mjs [--entry fixtures/app-ui/main.js] [--out dist/app-ui]
 *
 * やること（EXP の結論どおり: transpiler/bundler は native に任せ、fail-closed とレシートを足す）:
 *   1. esbuild + sunao プラグインで .ui をコンパイルしつつ bundle+minify
 *   2. 決定論チェック: 2 回ビルドして出力 sha256 が一致するか
 *   3. 予算ゲート(P1): 出力 bytes/gzip が予算超過なら exit 1（fail-closed）
 *   4. 決定論レシート(P2): bytes/gzip/sha256 + 道具バージョン + 環境 を results/raw に残す
 *   5. ブラウザ確認用に dist へ index.html + main.js を書く
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { createRequire } from 'node:module';
import esbuild from 'esbuild';
import { sunao } from './plugins/sunao/esbuild-plugin.mjs';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const ENTRY = opt('--entry', 'fixtures/app-ui/main.js');
const OUT = opt('--out', 'dist/app-ui');

// アプリの初期ロード予算（fail-closed の閾値）。sunao runtime を含めても小さく保つ。
const BUDGET = { initial_bytes: 4096, initial_gzip: 2048 };

const sha = (s) => createHash('sha256').update(s).digest('hex');
const SUNAO_VERSION = '0.1.0-exp';

async function buildOnce() {
  const r = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    metafile: true,
    plugins: [sunao()],
    logLevel: 'silent',
  });
  return Buffer.from(r.outputFiles[0].contents);
}

const out1 = await buildOnce();
const out2 = await buildOnce();
const deterministic = sha(out1) === sha(out2);

const bytes_raw = out1.length;
const bytes_gzip = gzipSync(out1, { level: 9 }).length;
const overBytes = bytes_raw > BUDGET.initial_bytes;
const overGzip = bytes_gzip > BUDGET.initial_gzip;

// dist へ書く（ブラウザ確認用）
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/main.js`, out1);
writeFileSync(
  `${OUT}/index.html`,
  `<!doctype html><meta charset="utf-8"><title>sunao app</title>\n<div id="app"></div>\n<script type="module" src="./main.js"></script>\n`,
);

// レシート(P2)
const receipt = {
  tool: 'sunao build',
  entry: ENTRY,
  measured_at: new Date().toISOString(),
  env: { node: process.version, platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? 'unknown' },
  versions: { esbuild: require('esbuild/package.json').version, 'sunao': SUNAO_VERSION },
  bytes_raw,
  bytes_gzip,
  output_sha256: sha(out1),
  deterministic,
  budget: BUDGET,
};
mkdirSync('results/raw', { recursive: true });
writeFileSync('results/raw/build-app-ui.json', JSON.stringify(receipt, null, 2) + '\n');

// 表示
const padL = (s, n) => String(s).padStart(n);
console.log(`\nsunao build  entry=${ENTRY}`);
console.log('─'.repeat(56));
console.log(`${padL('raw B', 12)}${padL('gzip B', 10)}${padL('予算(raw)', 12)}${padL('決定論', 10)}`);
console.log('─'.repeat(56));
console.log(`${padL(bytes_raw, 12)}${padL(bytes_gzip, 10)}${padL(BUDGET.initial_bytes, 12)}${padL(deterministic ? 'yes' : 'NO', 10)}`);
console.log('─'.repeat(56));
console.log(`出力: ${OUT}/main.js  レシート: results/raw/build-app-ui.json`);

const violations = [];
if (overBytes) violations.push(`raw ${bytes_raw} B > 予算 ${BUDGET.initial_bytes} B`);
if (overGzip) violations.push(`gzip ${bytes_gzip} B > 予算 ${BUDGET.initial_gzip} B`);
if (!deterministic) violations.push('出力が非決定論的（2 回のビルドで sha256 不一致）');

if (violations.length) {
  console.log(`\n✗ fail-closed:`);
  for (const v of violations) console.log(`  - ${v}`);
  console.log('');
  process.exit(1);
}
console.log(`✓ 予算内・決定論的。\n`);
