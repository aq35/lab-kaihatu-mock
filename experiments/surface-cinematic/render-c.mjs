/** 条件C: Cinematic を Recipe → Native CSS で生成。AI は recipe.json だけ編集。 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderCinematicDom } from './semantic-dom.mjs';
import { cinematicCss } from './native-backend.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export function loadRecipe(dir = HERE) { return JSON.parse(readFileSync(join(dir, 'recipe.json'), 'utf8')); }

export function renderPage(data, recipe) {
  const dom = renderCinematicDom(data).replace('__LAYOUT__', recipe.heroLayout);
  return { html: dom, css: cinematicCss(recipe), backend: 'native-css' };
}
