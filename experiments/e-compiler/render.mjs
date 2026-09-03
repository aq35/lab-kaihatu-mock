/**
 * 条件E: Semantic UI Compiler の variant アダプタ。
 *
 * AI がこのリポジトリで生成してよいのは recipe.default.json（PresentationRecipe）だけ。
 * class 名も CSS も書かない。ここは compiler を呼ぶだけの薄い層。
 *
 * build-variants は renderInbox() で HTML を、buildAssets() で CSS を得る。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compile, compileCss } from './compiler.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const recipe = JSON.parse(readFileSync(join(HERE, 'recipe.default.json'), 'utf8'));

export function renderInbox(cards) {
  return compile(cards, recipe).html;
}

/** build 時に呼ばれ、recipe から決定論的に CSS を書き出す */
export function buildAssets({ outDir, writeFileSync, mkdirSync }) {
  mkdirSync(join(outDir, 'styles'), { recursive: true });
  writeFileSync(join(outDir, 'styles', 'generated.css'), compileCss(recipe));
}

export { recipe };
