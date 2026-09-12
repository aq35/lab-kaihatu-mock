/**
 * sunao scaffolder — テンプレから新しい sunao アプリを出す（展開しやすく）。
 *   node cli/create.mjs <dir> [--template <name>]      # 既定 template = basic
 *   npm run new -- apps/todo
 *   npm run new -- apps/tube --template video
 *
 * テンプレは frontendlab/templates/<name>/ 配下（basic / video …）。
 * ファイル中の __APP_NAME__ / __APP_DIR__ を置換して <dir> に展開する。
 * ビルド: node cli/build.mjs --entry <dir>/main.js --out dist/<name>
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, '..', 'templates');
const TEXT_EXT = new Set(['.sunao', '.js', '.mjs', '.html', '.md', '.json', '.css', '.scss', '.txt']);

// ---- 引数 ----
const argv = process.argv.slice(2);
const tOpt = argv.indexOf('--template');
const tpl = tOpt >= 0 ? argv[tOpt + 1] : 'basic';
const dir = argv.find((a, i) => !a.startsWith('--') && !(tOpt >= 0 && i === tOpt + 1));

const available = () => (existsSync(TEMPLATES) ? readdirSync(TEMPLATES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
if (!dir) { console.error('使い方: node cli/create.mjs <dir> [--template <name>]\n  例) node cli/create.mjs apps/tube --template video\n  templates: ' + available().join(', ')); process.exit(1); }
if (!tpl || !existsSync(join(TEMPLATES, tpl))) { console.error(`不明な template: "${tpl}"（利用可能: ${available().join(', ')}）`); process.exit(1); }

// ---- パス/名前検証 ----
const norm = dir.replace(/\\/g, '/');
if (/(^|\/)\.\.(\/|$)/.test(norm)) { console.error(`不正なパス: "${dir}"（.. での脱出は不可）`); process.exit(1); }
const name = basename(norm.replace(/\/+$/, ''));
if (!/^[A-Za-z0-9._-]+$/.test(name)) { console.error(`不正な名前: "${name}"（英数と . _ - のみ）`); process.exit(1); }

// ---- テンプレのファイル一覧 ----
const tplDir = join(TEMPLATES, tpl);
function walk(d, out = []) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const srcFiles = walk(tplDir);

// ---- 上書きガード（展開先に 1 つでもあれば中止）----
const plan = srcFiles.map((src) => ({ src, rel: relative(tplDir, src), dest: join(dir, relative(tplDir, src)) }));
for (const f of plan) {
  if (existsSync(f.dest)) { console.error(`既に存在します: ${f.dest}（上書きしません）`); process.exit(1); }
}

// ---- 展開（テキストはトークン置換）----
const subst = (s) => s.replace(/__APP_NAME__/g, name).replace(/__APP_DIR__/g, norm);
for (const f of plan) {
  mkdirSync(dirname(f.dest), { recursive: true });
  const isText = TEXT_EXT.has('.' + f.rel.split('.').pop());
  if (isText) writeFileSync(f.dest, subst(readFileSync(f.src, 'utf8')));
  else writeFileSync(f.dest, readFileSync(f.src)); // バイナリはそのまま
}

console.log(`\n✓ sunao アプリ雛形を作成: ${dir}  (template: ${tpl})`);
console.log('─'.repeat(52));
console.log(`  開発:   node cli/dev.mjs --entry ${norm}/main.js`);
console.log(`  ビルド: node cli/build.mjs --entry ${norm}/main.js --out dist/${name}`);
console.log(`  中身:   ${plan.map((f) => f.rel).join(' / ')}\n`);
