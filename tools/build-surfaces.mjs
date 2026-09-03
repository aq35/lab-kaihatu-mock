/**
 * Cinematic surface の C/D を生成する。
 *   node tools/build-surfaces.mjs
 * 出力: dist/surfaces/<cond>/index.html (+ CSS)
 * A/B は AI 生成物を後から dist/surfaces/a|b/ に置く。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const SRC = 'experiments/surface-cinematic';
const shell = readFileSync(join(SRC, 'shell.html'), 'utf8');
const data = JSON.parse(readFileSync('fixtures/surfaces/cinematic.json', 'utf8'));

export async function buildCinematic({ outRoot = 'dist/surfaces', recipeDir = SRC } = {}) {
  const C = await import(new URL(`../${SRC}/render-c.mjs`, import.meta.url).href);
  const D = await import(new URL(`../${SRC}/render-d.mjs`, import.meta.url).href);
  const recipe = C.loadRecipe(recipeDir);
  const built = [];

  // C: native
  {
    const out = join(outRoot, 'c'); mkdirSync(join(out, 'styles'), { recursive: true });
    const { html, css } = C.renderPage(data, recipe);
    writeFileSync(join(out, 'styles', 'app.css'), css);
    const page = shell.replaceAll('{{TITLE}}', 'Aurora — C (Recipe→Native)')
      .replace('{{STYLES}}', '<link rel="stylesheet" href="./styles/app.css">').replace('{{PAGE}}', html);
    writeFileSync(join(out, 'index.html'), page);
    built.push({ cond: 'c', bytesHtml: Buffer.byteLength(page), bytesCss: Buffer.byteLength(css) });
  }

  // D: tailwind (collect complete classes → real Tailwind build)
  {
    const out = join(outRoot, 'd'); mkdirSync(join(out, 'styles'), { recursive: true });
    const { html, customCss } = D.renderPage(data, recipe);
    const classes = new Set();
    for (const m of html.matchAll(/class="([^"]*)"/g)) for (const t of m[1].split(/\s+/)) if (t) classes.add(t);
    const bin = 'experiments/a-tailwind/node_modules/.bin/tailwindcss';
    let twcss = '/* tailwind cli missing */';
    if (existsSync(bin)) {
      const tmp = 'experiments/a-tailwind/_surf-build'; mkdirSync(tmp, { recursive: true });
      writeFileSync(join(tmp, '_c.txt'), [...classes].sort().join('\n') + '\n');
      writeFileSync(join(tmp, 'in.css'), `@import "tailwindcss";\n@source "./_c.txt";\n`);
      try { execSync(`"${bin}" -i "${join(tmp, 'in.css')}" -o "${join(tmp, 'out.css')}" --minify`, { stdio: 'pipe' });
        twcss = readFileSync(join(tmp, 'out.css'), 'utf8'); } finally { rmSync(tmp, { recursive: true, force: true }); }
    }
    writeFileSync(join(out, 'styles', 'tailwind.css'), twcss);
    writeFileSync(join(out, 'styles', 'custom.css'), customCss);
    const page = shell.replaceAll('{{TITLE}}', 'Aurora — D (Recipe→Tailwind)')
      .replace('{{STYLES}}', '<link rel="stylesheet" href="./styles/tailwind.css">\n<link rel="stylesheet" href="./styles/custom.css">')
      .replace('{{PAGE}}', html);
    writeFileSync(join(out, 'index.html'), page);
    built.push({ cond: 'd', bytesHtml: Buffer.byteLength(page), bytesCss: Buffer.byteLength(twcss) + Buffer.byteLength(customCss) });
  }
  return built;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const b = await buildCinematic();
  for (const x of b) console.log(`${x.cond}: html ${x.bytesHtml}  css ${x.bytesCss}`);
}
