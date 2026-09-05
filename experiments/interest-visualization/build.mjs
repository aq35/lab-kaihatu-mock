// 1 つの material を 3 入口へ inline する（内容を必ず同一にするため）。
//   node experiments/interest-visualization/build.mjs → dist/interest/{verify,terrain,claim}.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const material = readFileSync(join(here, 'material.json'), 'utf8').trim();
const injected = material.replace(/<\//g, '<\\/');
mkdirSync('dist/interest', { recursive: true });
for (const name of ['verify', 'terrain', 'claim']) {
  const tpl = readFileSync(join(here, `${name}.html`), 'utf8');
  if (!tpl.includes('__FIXTURE__')) throw new Error(`${name}: __FIXTURE__ が無い`);
  writeFileSync(`dist/interest/${name}.html`, tpl.replace('__FIXTURE__', () => injected));
  console.log(`dist/interest/${name}.html`);
}
console.log('同一 material を 3 入口へ inline 完了。');
