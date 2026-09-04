// 1 つの fixture を 3 案へ inline して自己完結 HTML を出す（内容を必ず同一にするため）。
//   node experiments/creativity-goal-experience/build.mjs → dist/creativity/{voyage,ledger,dialogue}.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, 'fixture.json'), 'utf8').trim();
// </script> 等で親 script を閉じないよう退避（JSON 上は等価）
const injected = fixture.replace(/<\//g, '<\\/');
mkdirSync('dist/creativity', { recursive: true });

for (const name of ['voyage', 'ledger', 'dialogue']) {
  const tpl = readFileSync(join(here, `${name}.html`), 'utf8');
  if (!tpl.includes('__FIXTURE__')) throw new Error(`${name}: __FIXTURE__ プレースホルダが無い`);
  writeFileSync(`dist/creativity/${name}.html`, tpl.replace('__FIXTURE__', () => injected));
  console.log(`dist/creativity/${name}.html`);
}
console.log('同一 fixture を 3 案へ inline 完了。');
