/**
 * sunao manifest — 全 .sunao の **契約を JSON** で出す（AI/ツールが子の使い方を低 context で掴む）。
 *   node tools/manifest.mjs [file ...] [--pretty]   # 無指定なら examples 配下
 *   npm run manifest -- --pretty
 * 出力: [{ file, name, props:[{name,type,required,enum}], slots, uses, signals }]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { manifest } from '../sunao/compile.mjs';

const args = process.argv.slice(2);
const pretty = args.includes('--pretty');
const files = args.filter((a) => !a.startsWith('--'));

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'dist', '.git'].includes(e.name)) walk(p, out); }
    else if (p.endsWith('.sunao')) out.push(p);
  }
  return out;
}

const targets = files.length ? files : walk('examples');
const report = targets.map((f) => manifest(readFileSync(f, 'utf8'), relative('.', f)));
process.stdout.write(JSON.stringify(report, null, pretty ? 2 : 0) + '\n');
