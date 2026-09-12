/**
 * sunao diagnose — .sunao の診断を **機械可読 JSON** で出す（エディタ/LSP/CI が消費）。
 *   node cli/diagnose.mjs [file.sunao ...]        # 指定ファイル（無ければ fixtures 配下 全部）
 *   node cli/diagnose.mjs --pretty fixtures/seo/Landing.sunao
 *
 * 出力: [{ filename, diagnostics:[{severity, code, message, line, column, ...}] }]
 * error（fail-closed）が 1 件でもあれば exit 1。warning は exit に影響しない。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { diagnose } from '../sunao/compile.mjs';

const args = process.argv.slice(2);
const pretty = args.includes('--pretty');
const files = args.filter((a) => !a.startsWith('--'));

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.sunao')) out.push(p);
  }
  return out;
}

const targets = files.length ? files : walk('fixtures');
const report = targets.map((f) => diagnose(readFileSync(f, 'utf8'), { filename: relative('.', f) }));
const errors = report.reduce((n, r) => n + r.diagnostics.filter((d) => d.severity === 'error').length, 0);

process.stdout.write(JSON.stringify(report, null, pretty ? 2 : 0) + '\n');
process.exit(errors ? 1 : 0);
