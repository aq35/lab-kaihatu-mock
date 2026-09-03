/**
 * HO2: Tailwind の version drift を測る（§3）。
 *   node tools/version-drift.mjs 4.3.3 4.1.0
 *
 * 同じ F の入力（同じ完全 class 文字列一覧）を、異なる Tailwind version で build し、
 * 生成 CSS の bytes / hash / class sort / build 時間を比べる。
 * E(native) は外部 version を持たないので drift しない（対照）。
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { collectClassStrings } from '../experiments/f-recipe-tailwind/compiler.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const versions = process.argv.slice(2).length ? process.argv.slice(2) : ['4.3.3', '4.1.0'];
const recipe = JSON.parse(readFileSync('experiments/f-recipe-tailwind/recipe.default.json', 'utf8'));

// 全 fixture の完全 class 文字列（F の Compiler が生成する成果物。version 非依存）
const all = new Set();
for (const f of ['cards.happy', 'cards.edge', 'cards.hostile', 'cards.scale-100']) {
  const cards = JSON.parse(readFileSync(`fixtures/${f}.json`, 'utf8'));
  for (const c of collectClassStrings(cards, recipe)) all.add(c);
}
const classes = [...all].sort().join('\n') + '\n';

const WORK = '/tmp/kas-vdrift';
const rows = [];
for (const ver of versions) {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  writeFileSync(`${WORK}/package.json`, JSON.stringify({ name: 'vdrift', private: true }, null, 2));
  writeFileSync(`${WORK}/_classes.txt`, classes);
  writeFileSync(`${WORK}/input.css`, `@import "tailwindcss";\n@source "./_classes.txt";\n`);
  let installed = true, err = null;
  try {
    execSync(`cd ${WORK} && npm install tailwindcss@${ver} @tailwindcss/cli@${ver} --no-audit --no-fund`, { stdio: 'pipe', timeout: 180000 });
  } catch (e) { installed = false; err = String(e.message).slice(0, 120); }
  if (!installed) { rows.push({ version: ver, installed, err }); continue; }
  const t0 = Date.now();
  try { execSync(`cd ${WORK} && ./node_modules/.bin/tailwindcss -i input.css -o out.css --minify`, { stdio: 'pipe', timeout: 120000 }); }
  catch (e) { rows.push({ version: ver, installed, buildError: String(e.message).slice(0, 120) }); continue; }
  const buildMs = Date.now() - t0;
  const css = readFileSync(`${WORK}/out.css`, 'utf8');
  // class sort: 生成 CSS 中の .class 出現順（先頭 40 個）
  const order = [...css.matchAll(/\.([a-z][\w\\:.\-\[\]#/%]*)\s*\{/g)].map((m) => m[1].replace(/\\/g, '')).slice(0, 40);
  rows.push({ version: ver, installed, buildMs, cssBytes: Buffer.byteLength(css), cssHash: sha(css),
    hasPreflight: css.includes('*,::before,::after') || css.includes('*,:after,:before'), classOrderHead: order.slice(0, 12) });
}
rmSync(WORK, { recursive: true, force: true });

// drift 判定
const built = rows.filter((r) => r.cssHash);
const drift = built.length >= 2 ? {
  bytesDiffer: new Set(built.map((r) => r.cssBytes)).size > 1,
  hashDiffer: new Set(built.map((r) => r.cssHash)).size > 1,
  sortDiffer: JSON.stringify(built[0].classOrderHead) !== JSON.stringify(built[1].classOrderHead),
} : null;

mkdirSync('docs/results/raw', { recursive: true });
writeFileSync('docs/results/raw/version-drift.json', JSON.stringify({ ranAt: new Date().toISOString(), inputClassCount: all.size, rows, drift,
  note: 'F の入力(完全 class 文字列)は version 非依存。出力 CSS が version で変わるかを測る。E は外部 version が無く drift しない' }, null, 2) + '\n');
console.log(JSON.stringify({ rows: rows.map((r) => ({ version: r.version, installed: r.installed, cssBytes: r.cssBytes, cssHash: r.cssHash, buildMs: r.buildMs })), drift }, null, 2));
