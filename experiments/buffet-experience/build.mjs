// 1 つの material を Baseline と Exploration へ inline（同じ根拠・同情報量）。
//   node experiments/buffet-experience/build.mjs → dist/buffet/{explore,baseline}.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const material = readFileSync(join(here, 'material4.json'), 'utf8').trim();
const injected = material.replace(/<\//g, '<\\/');
mkdirSync('dist/buffet', { recursive: true });
for (const name of ['explore', 'baseline']) {
  const tpl = readFileSync(join(here, `${name}.html`), 'utf8');
  if (!tpl.includes('__FIXTURE__')) throw new Error(`${name}: __FIXTURE__ が無い`);
  writeFileSync(`dist/buffet/${name}.html`, tpl.replace('__FIXTURE__', () => injected));
  console.log(`dist/buffet/${name}.html`);
}
console.log('同一 material を 2 画面へ inline 完了。');
