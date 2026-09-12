/**
 * sunao doctor — プロジェクト全体を 1 発で **機械可読 JSON** 検診（AI の自己修正ループ）。
 *   node tools/doctor.mjs [--pretty]      # 既定は fixtures 配下 全 .sunao
 *   npm run doctor
 *
 * 出力: { ok, errors, warnings, files:[{file, diagnostics:[{severity,code,message,line,column,fix?}]}],
 *         contract:[{parent, tag, problem}] }
 * error（fail-closed）か contract 違反があれば exit 1。診断は fix ヒント付き（AI がそのまま直せる）。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { diagnose, analyze } from '../plugins/sunao/compile.mjs';

const pretty = process.argv.includes('--pretty');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'dist', '.git'].includes(e.name)) walk(p, out); }
    else if (p.endsWith('.sunao')) out.push(p);
  }
  return out;
}

const targets = args.length ? args : walk('fixtures');
const files = [];
const registry = new Map(); // tag -> props schema
const usages = [];
let errors = 0, warnings = 0;

for (const f of targets) {
  const src = readFileSync(f, 'utf8');
  const rel = relative('.', f);
  const { diagnostics } = diagnose(src, { filename: rel });
  for (const d of diagnostics) (d.severity === 'error' ? errors++ : warnings++, void 0);
  files.push({ file: rel, diagnostics });
  try {
    const meta = analyze(src);
    registry.set(basename(f).replace(/\.sunao$/, ''), meta.props);
    if (meta.name) registry.set(meta.name, meta.props);
    for (const u of meta.uses) usages.push({ parent: rel, ...u });
  } catch { /* diagnose 側で拾う */ }
}

// クロス契約: 子に無い prop / 必須 prop 欠落。
const contract = [];
for (const u of usages) {
  const schema = registry.get(u.tag);
  if (!schema) continue;
  const declared = Object.keys(schema);
  if (!declared.length) continue;
  for (const p of u.props) if (!declared.includes(p)) contract.push({ parent: u.parent, tag: u.tag, problem: `未知の prop "${p}"`, allowed: declared });
  for (const [k, spec] of Object.entries(schema)) if (spec.required && !u.props.includes(k)) contract.push({ parent: u.parent, tag: u.tag, problem: `必須 prop "${k}" 欠落` });
}

const ok = errors === 0 && contract.length === 0;
const report = { ok, errors, warnings, contractViolations: contract.length, files, contract };
process.stdout.write(JSON.stringify(report, null, pretty ? 2 : 0) + '\n');
process.exit(ok ? 0 : 1);
