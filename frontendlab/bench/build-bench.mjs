/**
 * ベンチのビルド: sunao と Vue3 で同じアプリを **本番・minify** でバンドルし、bytes を出す。
 * Vue はテンプレを @vue/compiler-dom で **事前コンパイル**（patch flag 等の compile 時最適化を得る）＋
 * runtime-only の本番ビルドにエイリアス＝公平な比較。
 */
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { compile } from '@vue/compiler-dom';
import { sunao } from '../sunao/esbuild-plugin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const gz = (b) => gzipSync(b, { level: 9 }).length;

// Vue テンプレ（sunao と等価）。
const VUE_TEMPLATE = `<table class="t"><tbody>
  <tr v-for="row in rows" :key="row.id" :class="{ selected: row.id === selected }">
    <td class="id">{{ row.id }}</td>
    <td class="lbl"><a>{{ row.label }}</a></td>
  </tr>
</tbody></table>`;

// 1) Vue テンプレを事前コンパイル → render.mjs（module モード＝最適化つき）。
const { code } = compile(VUE_TEMPLATE, { mode: 'module', hoistStatic: true, prefixIdentifiers: true, runtimeModuleName: 'vue' });
writeFileSync(resolve(HERE, 'vue/render.mjs'), code);

const CSS = `body{font:14px system-ui;margin:0;padding:12px}.t{border-collapse:collapse;width:100%}
.t td{padding:2px 8px;border-bottom:1px solid #eee}.id{color:#888;width:5rem}.selected{background:#ffe89a}
a{color:#1a3ea0;text-decoration:none}`;

async function bundle(entry, opts = {}) {
  const r = await esbuild.build({
    entryPoints: [entry], bundle: true, minify: true, format: 'iife', write: false,
    define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'false', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
    logLevel: 'silent', ...opts,
  });
  return Buffer.from(r.outputFiles[0].contents);
}

// 2) sunao バンドル。
const sunaoJs = await bundle(resolve(HERE, 'sunao/main.js'), { plugins: [sunao()] });
// 3) Vue バンドル（runtime-only の本番ビルドに alias）。
const vueRuntimeProd = require.resolve('vue/dist/vue.runtime.esm-browser.prod.js');
const vueJs = await bundle(resolve(HERE, 'vue/main.js'), { alias: { vue: vueRuntimeProd } });

// sunao 仮想化版（同じ 10k を windowed で描画）。
const winJs = await bundle(resolve(HERE, 'windowed/main.js'), { plugins: [sunao()] });

const page = (title, js) => `<!doctype html><meta charset="utf-8"><title>${title}</title><style>${CSS}</style><div id="app"></div><script>${js}</script>`;
writeFileSync(resolve(HERE, 'dist/sunao.html'), page('sunao bench', sunaoJs.toString('utf8')));
writeFileSync(resolve(HERE, 'dist/vue.html'), page('vue bench', vueJs.toString('utf8')));
writeFileSync(resolve(HERE, 'dist/windowed.html'), page('sunao windowed', winJs.toString('utf8')));

const row = (name, b) => `  ${name.padEnd(8)} raw ${String(b.length).padStart(7)} B   gzip ${String(gz(b)).padStart(6)} B`;
console.log('\nbundle sizes (app + framework runtime, production, minified)');
console.log('─'.repeat(56));
console.log(row('sunao', sunaoJs));
console.log(row('vue', vueJs));
console.log('─'.repeat(56));
const sizes = { sunao: { raw: sunaoJs.length, gzip: gz(sunaoJs) }, vue: { raw: vueJs.length, gzip: gz(vueJs) } };
writeFileSync(resolve(HERE, 'dist/sizes.json'), JSON.stringify(sizes, null, 2));
console.log(`ratio(raw)  vue/sunao = ${(vueJs.length / sunaoJs.length).toFixed(1)}x   (gzip) = ${(gz(vueJs) / gz(sunaoJs)).toFixed(1)}x\n`);
