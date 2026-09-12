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
import { compileSFC, analyze, warningsOf, CompileError } from '../sunao/compile.mjs';
import { basename } from 'node:path';
import { sunao } from '../sunao/esbuild-plugin.mjs';

const ROOT = 'fixtures';
const BUDGET = { raw: 8192, gzip: 4096 }; // 入口ごとの既定予算
// 入口ごとの上書き（リッチな画面は個別に予算を持つ）。
const BUDGET_OVERRIDE = {
  'app-ui/owner-main.js': { raw: 20000, gzip: 8000 },
  'app-ui/deploy-main.js': { raw: 24000, gzip: 9000 },
  'app-ui/board-main.js': { raw: 20000, gzip: 7000 },
  'app-ui/calendar-main.js': { raw: 10000, gzip: 4096 }, // 月グリッド全体（リッチ画面）
  'seo/landing-main.js': { raw: 16000, gzip: 6000 }, // SEO ページ（hydrate runtime 込み）
};
const budgetFor = (entry) => BUDGET_OVERRIDE[entry] || BUDGET;
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
// 入口は `main.js` か `*-main.js` のみ（domain.js / remain.js を誤って入口扱いしない）。
const entries = files.filter((f) => { const b = basename(f); return b === 'main.js' || b.endsWith('-main.js'); });
const failures = [];
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log(`\nsunao factory check  (${sfcs.length} components, ${entries.length} entries)`);
console.log('─'.repeat(66));

// 1. compile-check（＋ クロスコンポーネント契約用メタを収集）
const registry = new Map(); // tag(=basename or name) -> props schema
const usages = []; // { parent, tag, props }
const warns = []; // 非致命の警告（() 呼び忘れ等）。落とさず表示だけ。
for (const f of sfcs) {
  try {
    const src = readFileSync(f, 'utf8');
    compileSFC(src, { runtime: 'sunao' });
    const meta = analyze(src);
    const bn = basename(f).replace(/\.sunao$/, '');
    // basename 重複はクロス契約検査を曖昧にする → 黙って上書きせず失敗として surface（M6）。
    if (registry.has(bn) && JSON.stringify(registry.get(bn)) !== JSON.stringify(meta.props))
      failures.push(`${relative(ROOT, f)}: コンポーネント basename 重複 "${bn}"（契約検査が別部品と混ざる）`);
    registry.set(bn, meta.props);
    if (meta.name) registry.set(meta.name, meta.props);
    for (const u of meta.uses) usages.push({ parent: relative(ROOT, f), ...u });
    const w = warningsOf(src);
    for (const x of w) warns.push(`${relative(ROOT, f)}: ${x.message}`);
    console.log(`  compile  ${pad(relative(ROOT, f), 40)} ok${w.length ? ` ⚠ ${w.length}` : ''}`);
  } catch (e) {
    const kind = e instanceof CompileError ? 'CompileError' : 'Error';
    console.log(`  compile  ${pad(relative(ROOT, f), 40)} ✗ ${kind}`);
    failures.push(`${f}: ${e.message}`);
  }
}

// 1b. 契約チェック（ビルド時）: 子に無い prop / 必須 prop 欠落を止める（型そのものは runtime 境界）。
for (const u of usages) {
  const schema = registry.get(u.tag);
  if (!schema) continue; // 未知コンポーネントは import-check（compile 時）が担当
  const declared = Object.keys(schema);
  if (declared.length === 0) continue; // props 宣言なしの子はスキップ
  for (const p of u.props) if (!declared.includes(p)) failures.push(`${u.parent}: <${u.tag}> に無い prop "${p}"（許可: ${declared.join(', ') || 'なし'}）`);
  for (const [k, spec] of Object.entries(schema)) if (spec.required && !u.props.includes(k)) failures.push(`${u.parent}: <${u.tag}> 必須 prop "${k}" が渡されていません`);
}
console.log(`  contract ${pad('cross-component props', 40)} ${usages.length} 箇所検査`);

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
    const bud = budgetFor(relative(ROOT, entry));
    const over = raw > bud.raw || gz > bud.gzip;
    const ok = det && !over;
    console.log(`  build    ${pad(relative(ROOT, entry), 40)} ${padL(raw + 'B/' + gz + 'gz', 14)} ${ok ? 'ok' : '✗'}${det ? '' : ' 非決定論'}${over ? ' 予算超過' : ''}`);
    if (!det) failures.push(`${entry}: 非決定論（2 回ビルドで sha 不一致）`);
    if (over) failures.push(`${entry}: 予算超過 raw ${raw}>${bud.raw} or gzip ${gz}>${bud.gzip}`);
  } catch (e) {
    console.log(`  build    ${pad(relative(ROOT, entry), 40)} ✗ ${e.message.split('\n')[0]}`);
    failures.push(`${entry}: ${e.message.split('\n')[0]}`);
  }
}

console.log('─'.repeat(66));
if (warns.length) {
  console.log(`⚠ ${warns.length} 件の警告（非致命・意図的なら無視可）:`);
  for (const w of warns) console.log(`  - ${w}`);
  console.log('');
}
if (failures.length) {
  console.log(`✗ ${failures.length} 件の不合格:`);
  for (const f of failures) console.log(`  - ${f}`);
  console.log('');
  process.exit(1);
}
console.log(`✓ 全 ${sfcs.length} 部品 compile / 全 ${entries.length} 入口 build（決定論・予算内）。\n`);
