// 1 つの material を Exploration と Baseline へ inline する（同じ証拠・同じ情報量にするため）。
//   node experiments/product-desire/build.mjs → dist/product/{explore,baseline}.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const material = readFileSync(join(here, 'material3.json'), 'utf8').trim();
const injected = material.replace(/<\//g, '<\\/');
mkdirSync('dist/product', { recursive: true });
for (const name of ['explore', 'baseline']) {
  const tpl = readFileSync(join(here, `${name}.html`), 'utf8');
  if (!tpl.includes('__FIXTURE__')) throw new Error(`${name}: __FIXTURE__ が無い`);
  writeFileSync(`dist/product/${name}.html`, tpl.replace('__FIXTURE__', () => injected));
  console.log(`dist/product/${name}.html`);
}
console.log('同一 material を 2 画面へ inline 完了。');
