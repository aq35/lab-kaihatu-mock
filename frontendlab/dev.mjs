/**
 * sunao dev server — 保存→自動リビルド→ブラウザ自動リロード（esbuild watch + serve）。
 *   node dev.mjs [--entry fixtures/app-ui/board-main.js] [--port 8000]
 *
 * EXP の結論どおり bundler は esbuild に任せ、dev は「反復ループを速く」だけを足す薄い層。
 * source map は inline（実行時エラーが .sunao の <script> 行へ戻る）。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import esbuild from 'esbuild';
import { sunao } from './plugins/sunao/esbuild-plugin.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const ENTRY = opt('--entry', 'fixtures/app-ui/board-main.js');
const PORT = Number(opt('--port', '8000'));
const SERVEDIR = 'dist/dev';

// livereload: esbuild は watch 時に /esbuild へ SSE(change) を流す。受けて location.reload()。
const INDEX = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>sunao dev — ${ENTRY}</title>
<style>html,body{margin:0}#app{min-height:100vh}</style>
<div id="app"></div>
<script type="module" src="/main.js"></script>
<script>new EventSource('/esbuild').addEventListener('change', () => location.reload());</script>
`;

mkdirSync(SERVEDIR, { recursive: true });
writeFileSync(`${SERVEDIR}/index.html`, INDEX);

const ctx = await esbuild.context({
  entryPoints: [ENTRY],
  outfile: `${SERVEDIR}/main.js`,
  bundle: true,
  format: 'esm',
  sourcemap: 'inline', // 実行時エラーを元ソースへ（.sunao の script 行は line-level で対応）
  logLevel: 'info',
  plugins: [sunao()],
});

await ctx.watch(); // 保存で自動リビルド＋/esbuild へ change 通知
const srv = await ctx.serve({ servedir: SERVEDIR, port: PORT });
const h = (srv.hosts && srv.hosts[0]) || srv.host || '127.0.0.1';
const shown = h === '0.0.0.0' || h === '::' ? 'localhost' : h;
console.log(`\nsunao dev  entry=${ENTRY}`);
console.log('─'.repeat(56));
console.log(`  http://${shown}:${srv.port}/  （保存で自動リロード）`);
console.log(`  servedir=${SERVEDIR}  sourcemap=inline`);
console.log('─'.repeat(56));
console.log('Ctrl+C で終了。\n');
