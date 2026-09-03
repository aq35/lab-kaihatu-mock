/**
 * 条件F の build アダプタ。
 * AI が編集してよいのは recipe.default.json だけ（E と同じ）。
 * CSS backend が Tailwind であること以外は E と共有。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync } from 'node:fs';
import { compileHtml, collectClassStrings } from './compiler.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const recipe = JSON.parse(readFileSync(join(HERE, 'recipe.default.json'), 'utf8'));

export function renderInbox(cards) {
  return compileHtml(cards, recipe).html;
}

/**
 * build 時: 全 fixture の完全な class 文字列を集めてから Tailwind をビルドする。
 * runtime 連結はしない（完全文字列を静的に列挙）。これが F の要点（HF5）。
 */
export function buildAssets({ outDir }) {
  const REPO = join(HERE, '..', '..');
  const fixturesDir = join(REPO, 'fixtures');
  const all = new Set();
  for (const f of readdirSync(fixturesDir).filter((x) => x.endsWith('.json'))) {
    const cards = JSON.parse(readFileSync(join(fixturesDir, f), 'utf8'));
    for (const c of collectClassStrings(cards, recipe)) all.add(c);
  }
  mkdirSync(join(outDir, 'styles'), { recursive: true });
  const classes = [...all].sort().join('\n') + '\n';
  // Tailwind が走査する「完全な class 文字列」の一覧（Compiler が build 前に生成した成果物）
  writeFileSync(join(outDir, 'styles', '_classes.txt'), classes);
  const bin = join(REPO, 'experiments', 'a-tailwind', 'node_modules', '.bin', 'tailwindcss');
  if (!existsSync(bin)) {
    writeFileSync(join(outDir, 'styles', 'tailwind.css'), '/* tailwind CLI not found; run npm install in experiments/a-tailwind */');
    return;
  }
  // @import "tailwindcss" は CSS ファイルの位置から node_modules を解決するため、
  // node_modules を持つ experiments/a-tailwind 配下の一時ディレクトリでビルドする。
  const tmp = join(REPO, 'experiments', 'a-tailwind', '_f-build');
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, '_classes.txt'), classes);
  writeFileSync(join(tmp, 'input.css'), `@import "tailwindcss";\n@source "./_classes.txt";\n`);
  try {
    execSync(`"${bin}" -i "${join(tmp, 'input.css')}" -o "${join(tmp, 'out.css')}" --minify`, { stdio: 'pipe' });
    writeFileSync(join(outDir, 'styles', 'tailwind.css'), readFileSync(join(tmp, 'out.css'), 'utf8'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export { recipe };
