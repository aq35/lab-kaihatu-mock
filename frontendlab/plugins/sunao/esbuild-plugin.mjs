/**
 * sunao の esbuild プラグイン。vite-plugin-vue と同じ発想:
 *   - bare import 'sunao' を runtime.mjs に解決する
 *   - *.ui ファイルを onLoad で compileSFC して JS として渡す
 * これで「Vue 風プラグイン」を既製の native bundler(esbuild) に載せる = ビルドツール側の統合。
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSFC } from './compile.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = resolve(HERE, 'runtime.mjs');

export function sunao() {
  return {
    name: 'sunao',
    setup(build) {
      // import { mount, signal } from 'sunao'
      build.onResolve({ filter: /^sunao$/ }, () => ({ path: RUNTIME }));
      // *.ui → コンパイル済み JS。runtime は 'sunao' として解決させる。
      build.onLoad({ filter: /\.ui$/ }, async (args) => {
        const src = await readFile(args.path, 'utf8');
        const contents = compileSFC(src, { runtime: 'sunao' });
        return { contents, loader: 'js', resolveDir: dirname(args.path) };
      });
    },
  };
}
