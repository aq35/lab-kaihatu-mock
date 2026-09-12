/**
 * sunao の esbuild プラグイン。vite-plugin-vue と同じ発想:
 *   - bare import 'sunao' を runtime.mjs に解決する
 *   - *.sunao ファイルを onLoad で compileSFC して JS として渡す
 * これで「Vue 風プラグイン」を既製の native bundler(esbuild) に載せる = ビルドツール側の統合。
 */
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSFC } from './compile.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = resolve(HERE, 'runtime.mjs');
const THEME = resolve(HERE, 'theme.mjs');
const VOCAB = resolve(HERE, 'recipe-vocab.mjs');

export function sunao() {
  return {
    name: 'sunao',
    setup(build) {
      // import { mount, signal } from 'sunao'
      build.onResolve({ filter: /^sunao$/ }, () => ({ path: RUNTIME }));
      // import { recipeStyle, themeCSS } from 'sunao/theme'（使わなければ tree-shake）
      build.onResolve({ filter: /^sunao\/theme$/ }, () => ({ path: THEME }));
      // import { RECIPE_PROPS, RECIPE_KINDS } from 'sunao/recipe'（schema から自動生成された語彙）
      build.onResolve({ filter: /^sunao\/recipe$/ }, () => ({ path: VOCAB }));
      // *.sunao → コンパイル済み JS。runtime は 'sunao' として解決させる。
      // build が sourcemap を出す時だけ inline line-level map を付ける（本番の予算計測には載せない）。
      const wantMap = !!build.initialOptions.sourcemap;
      build.onLoad({ filter: /\.sunao$/ }, async (args) => {
        const src = await readFile(args.path, 'utf8');
        const contents = compileSFC(src, { runtime: 'sunao', sourcemap: wantMap, filename: basename(args.path) });
        return { contents, loader: 'js', resolveDir: dirname(args.path) };
      });
    },
  };
}
