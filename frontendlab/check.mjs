/**
 * sunao factory ガードレール — 量産の安全装置（レバレッジ地図 ③）。
 *   node check.mjs
 *
 * 「作りまくる」を安全にするため、全部品を一括で機械検査する:
 *   1. compile-check: すべての *.sunao が **コンパイルできる**（fail-closed。未宣言参照・未知ディレクティブ等を検出）
 *   2. build-check: すべての main.js（アプリ入口）を bundle し、**決定論(2回 sha 一致)** と **予算(bytes)** を検査
 * どれか 1 つでも落ちれば exit 1。CI に置けば「壊れた部品」を増やせない。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import esbuild from 'esbuild';
import { compileSFC, CompileError } from './plugins/sunao/compile.mjs';
import { sunao } from './plugins/sunao/esbuild-plugin.mjs';

const ROOT = 'fixtures';
const BUDGET = { raw: 8192, gzip: 4096 }; // 入口ごとの既定予算
const sha = (s) => createHash('sha256').update(s).digest('hex');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const sfcs = files.filter((f) => f.endsWith('.sunao'));
const entries = files.filter((f) => f.endsWith('main.js'));
const failures = [];
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log(`\nsunao factory check  (${sfcs.length} components, ${entries.length} entries)`);
console.log('─'.repeat(66));

// 1. compile-check
for (const f of sfcs) {
  try {
    compileSFC(readFileSync(f, 'utf8'), { runtime: 'sunao' });
    console.log(`  compile  ${pad(relative(ROOT, f), 40)} ok`);
  } catch (e) {
    const kind = e instanceof CompileError ? 'CompileError' : 'Error';
    console.log(`  compile  ${pad(relative(ROOT, f), 40)} ✗ ${kind}`);
    failures.push(`${f}: ${e.message}`);
  }
}

// 2. build-check（決定論 + 予算）
for (const entry of entries) {
  try {
    const build = async () => {
      const r = await esbuild.build({ entryPoints: [entry], bundle: true, minify: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
      return Buffer.from(r.outputFiles[0].contents);
    };
    const a = await build();
    const b = await build();
    const det = sha(a) === sha(b);
    const raw = a.length, gz = gzipSync(a, { level: 9 }).length;
    const over = raw > BUDGET.raw || gz > BUDGET.gzip;
    const ok = det && !over;
    console.log(`  build    ${pad(relative(ROOT, entry), 40)} ${padL(raw + 'B/' + gz + 'gz', 14)} ${ok ? 'ok' : '✗'}${det ? '' : ' 非決定論'}${over ? ' 予算超過' : ''}`);
    if (!det) failures.push(`${entry}: 非決定論（2 回ビルドで sha 不一致）`);
    if (over) failures.push(`${entry}: 予算超過 raw ${raw}>${BUDGET.raw} or gzip ${gz}>${BUDGET.gzip}`);
  } catch (e) {
    console.log(`  build    ${pad(relative(ROOT, entry), 40)} ✗ ${e.message.split('\n')[0]}`);
    failures.push(`${entry}: ${e.message.split('\n')[0]}`);
  }
}

console.log('─'.repeat(66));
if (failures.length) {
  console.log(`✗ ${failures.length} 件の不合格:`);
  for (const f of failures) console.log(`  - ${f}`);
  console.log('');
  process.exit(1);
}
console.log(`✓ 全 ${sfcs.length} 部品 compile / 全 ${entries.length} 入口 build（決定論・予算内）。\n`);
