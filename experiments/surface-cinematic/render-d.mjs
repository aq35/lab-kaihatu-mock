/** 条件D: Cinematic を同じ Recipe → Tailwind で生成。意味 DOM は C と同一。 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderCinematicDom } from './semantic-dom.mjs';
import { applyTwClasses, twCustomCss, twClassMap, escapes } from './tw-backend.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export function loadRecipe(dir = HERE) { return JSON.parse(readFileSync(join(dir, 'recipe.json'), 'utf8')); }

export function renderPage(data, recipe) {
  const baseDom = renderCinematicDom(data).replace('__LAYOUT__', recipe.heroLayout);
  const dom = applyTwClasses(baseDom, recipe);
  return { html: dom, customCss: twCustomCss(recipe), backend: 'tailwind', classMap: twClassMap(recipe), escapes };
}
