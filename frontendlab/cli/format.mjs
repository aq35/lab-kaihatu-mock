/**
 * sunao fmt — .sunao を決定論的に整形（冪等）。
 *   node format.mjs --check [files...]   # 差分があれば列挙して exit 1（既定・全 .sunao）
 *   node format.mjs --write <file...>    # 実際に書き換える
 *   npm run fmt                          # = --check（全 fixtures/bench）
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { formatSFC } from '../sunao/format.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const files = args.filter((a) => !a.startsWith('--'));

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'dist', '.git'].includes(e.name)) walk(p, out); }
    else if (p.endsWith('.sunao')) out.push(p);
  }
  return out;
}

const targets = files.length ? files : [...walk('fixtures'), ...walk('bench')];
let changed = 0;
for (const f of targets) {
  const src = readFileSync(f, 'utf8');
  let out;
  try { out = formatSFC(src); } catch (e) { console.error(`  skip ${relative('.', f)}: ${e.message}`); continue; }
  if (out === src) continue;
  changed++;
  if (write) { writeFileSync(f, out); console.log(`  formatted ${relative('.', f)}`); }
  else console.log(`  needs format: ${relative('.', f)}`);
}

if (!changed) { console.log(`✓ ${targets.length} 件すべて整形済み`); process.exit(0); }
if (write) { console.log(`\n✓ ${changed} 件を整形`); process.exit(0); }
console.log(`\n✗ ${changed} 件が未整形（node format.mjs --write で修正）`);
process.exit(1);
