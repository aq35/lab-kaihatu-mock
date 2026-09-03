/**
 * 全 variant × 全 fixture を静的 HTML へ書き出す。
 *   node tools/build-variants.mjs
 * 出力: dist/<variant>/<fixture>.html
 * server-rendered を模す（＝JS なしでも中身が読める状態を作る）。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const VARIANTS = [
  { id: 'a-tailwind', label: 'A: Tailwind' },
  { id: 'b-raw-css', label: 'B: 無規律な素のCSS' },
  { id: 'c-semantic-css', label: 'C: Semantic CSS' },
  { id: 'd-web-components', label: 'D: Web Components' },
];

const FIXTURES = readdirSync('fixtures').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));

export async function build({ outDir = 'dist', quiet = false } = {}) {
  rmSync(outDir, { recursive: true, force: true });
  const built = [];

  for (const v of VARIANTS) {
    const src = join('experiments', v.id);
    const out = join(outDir, v.id);
    mkdirSync(out, { recursive: true });

    // 実行時に必要な資産をコピー（相対パスを変えないため構造を保つ）
    for (const dir of ['styles', 'scripts', 'components', 'dist']) {
      if (existsSync(join(src, dir))) cpSync(join(src, dir), join(out, dir), { recursive: true });
    }
    for (const file of ['style.css', 'page.css']) {
      if (existsSync(join(src, file))) cpSync(join(src, file), join(out, file));
    }
    // D は条件C の token / theme をそのまま使う（H5 の検証点）
    if (v.id === 'd-web-components') {
      cpSync(join('experiments', 'c-semantic-css', 'styles'), join(out, 'shared', 'styles'), { recursive: true });
    }

    const { renderInbox } = await import(new URL(`../${src}/render.mjs`, import.meta.url).href);
    const shell = readFileSync(join(src, 'shell.html'), 'utf8');

    for (const fx of FIXTURES) {
      const cards = JSON.parse(readFileSync(join('fixtures', `${fx}.json`), 'utf8'));
      const html = shell
        .replaceAll('{{TITLE}}', fx)
        .replaceAll('{{SHARED}}', 'shared/')
        .replaceAll('{{BASE}}', './')
        .replace('{{CARDS}}', renderInbox(cards, { base: './' }));
      writeFileSync(join(out, `${fx}.html`), html);
      built.push({ variant: v.id, fixture: fx, bytes: Buffer.byteLength(html) });
    }
    // 索引
    writeFileSync(join(out, 'index.html'),
      `<!doctype html><meta charset="utf-8"><title>${v.label}</title><h1>${v.label}</h1><ul>` +
      FIXTURES.map((f) => `<li><a href="./${f}.html">${f}</a></li>`).join('') + '</ul>');
  }

  writeFileSync(join(outDir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>variants</title><h1>variants</h1><ul>` +
    VARIANTS.map((v) => `<li><a href="./${v.id}/">${v.label}</a></li>`).join('') + '</ul>');

  if (!quiet) {
    for (const b of built.filter((b) => b.fixture === 'cards.happy')) {
      console.log(`${b.variant.padEnd(18)} cards.happy  ${String(b.bytes).padStart(7)} bytes`);
    }
  }
  return built;
}

if (import.meta.url === `file://${process.argv[1]}`) await build();
