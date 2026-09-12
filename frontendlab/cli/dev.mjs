/**
 * sunao dev server — 保存→自動リビルド→ブラウザ自動リロード（esbuild watch + serve）。
 *   node dev.mjs [--entry examples/app-ui/board-main.js] [--port 8000]
 *
 * EXP の結論どおり bundler は esbuild に任せ、dev は「反復ループを速く」だけを足す薄い層。
 * source map は inline（実行時エラーが .sunao の <script> 行へ戻る）。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import esbuild from 'esbuild';
import { sunao } from '../sunao/esbuild-plugin.mjs';

const args = process.argv.slice(2);
// フラグの値が欠落 / 次が別フラグなら既定に戻す（--entry を末尾に置いても壊れない）。
const opt = (n, d) => { const i = args.indexOf(n); if (i === -1) return d; const v = args[i + 1]; return v == null || v.startsWith('--') ? d : v; };
const ENTRY = opt('--entry', 'examples/app-ui/board-main.js');
const _port = Number(opt('--port', '8000'));
const PORT = Number.isInteger(_port) && _port > 0 && _port < 65536 ? _port : 8000; // 不正 port は既定に
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
