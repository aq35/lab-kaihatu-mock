/**
 * sunao SSG prerender — 部品を **実 HTML** へ焼く（SEO 用）。
 *   node prerender.mjs --entry fixtures/seo/Landing.sunao --out dist/seo/index.html [--client fixtures/seo/landing-main.js]
 *
 * やること:
 *   1. server モードで部品を renderComponentToString → 中身入りの HTML 文字列＋収集した scoped CSS＋meta
 *   2. <head> に title / description / canonical / OG、<style> に scoped CSS を inline
 *   3. <div id="app"> に描画済み HTML を焼く（= クローラが JS 実行なしで中身を読める）
 *   4. --client があれば browser bundle を書き、hydrate 用に <script> を差す（対話が戻る）
 *
 * EXP の結論どおり bundler は esbuild に任せ、prerender は「決定論・中身入り HTML」だけを足す薄い層。
 */
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import { sunao } from '../sunao/esbuild-plugin.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const ENTRY = opt('--entry', 'fixtures/seo/Landing.sunao');
const OUT = opt('--out', 'dist/seo/index.html');
const CLIENT = opt('--client', null);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// 1) server 描画: 生成した node エントリを bundle → import して {html, styles, meta} を得る。
export async function renderPage(entrySfc) {
  const dir = mkdtempSync(join(tmpdir(), 'sunao-pr-'));
  try {
    const gen = join(dir, 'entry.mjs');
    writeFileSync(gen, `import { prerender } from 'sunao';\nimport C from ${JSON.stringify(resolve(entrySfc))};\nexport const page = prerender(C);\n`);
    const r = await esbuild.build({ entryPoints: [gen], bundle: true, format: 'esm', platform: 'node', write: false, plugins: [sunao()], logLevel: 'silent' });
    const out = join(dir, 'out.mjs');
    writeFileSync(out, r.outputFiles[0].contents);
    const { page } = await import(pathToFileURL(out).href);
    return page; // { html, styles, meta }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 2) client bundle（hydrate 用）。あれば page.js として out の隣に書く。
async function buildClient(clientEntry, outDir) {
  const r = await esbuild.build({ entryPoints: [clientEntry], bundle: true, minify: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
  const js = Buffer.from(r.outputFiles[0].contents);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'page.js'), js);
  return js.length;
}

// 3) HTML 組み立て。
export function assembleHTML({ html, styles, meta }, { client = false } = {}) {
  const m = meta || {};
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    m.title ? `<title>${esc(m.title)}</title>` : '',
    m.description ? `<meta name="description" content="${attr(m.description)}">` : '',
    m.canonical ? `<link rel="canonical" href="${attr(m.canonical)}">` : '',
    m.title ? `<meta property="og:title" content="${attr(m.title)}">` : '',
    m.description ? `<meta property="og:description" content="${attr(m.description)}">` : '',
    m.image ? `<meta property="og:image" content="${attr(m.image)}">` : '',
    '<meta property="og:type" content="website">',
    styles ? `<style>${styles}</style>` : '',
  ].filter(Boolean).join('\n  ');
  const script = client ? `\n<script type="module" src="./page.js"></script>` : '';
  return `<!doctype html>\n<html lang="ja">\n<head>\n  ${head}\n</head>\n<body>\n<div id="app">${html}</div>${script}\n</body>\n</html>\n`;
}

// CLI として実行されたときだけ書き出す（import 時は関数だけ提供）。
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const page = await renderPage(ENTRY);
  const outDir = dirname(OUT);
  let clientBytes = 0;
  if (CLIENT) clientBytes = await buildClient(CLIENT, outDir);
  mkdirSync(outDir, { recursive: true });
  const finalHTML = assembleHTML(page, { client: !!CLIENT });
  writeFileSync(OUT, finalHTML);

  const padL = (s, n) => String(s).padStart(n);
  console.log(`\nsunao prerender  ${ENTRY}`);
  console.log('─'.repeat(60));
  console.log(`  html(中身入り)  ${padL(finalHTML.length + ' B', 12)}   #app 内 ${page.html.length} B`);
  console.log(`  scoped CSS      ${padL(page.styles.length + ' B', 12)}`);
  console.log(`  client(hydrate) ${padL(CLIENT ? clientBytes + ' B' : '—', 12)}`);
  console.log(`  title           ${page.meta.title || '(なし)'}`);
  console.log('─'.repeat(60));
  console.log(`出力: ${OUT}\n`);
}
