/**
 * Recipe → sunao props のコード生成（単一の真実）。
 *   node tools/gen-recipe-vocab.mjs
 * repo の contracts/{presentation-recipe,cards}.schema.json を読み、
 * plugins/sunao/recipe-vocab.mjs（RECIPE_PROPS / RECIPE_KINDS）を書き出す。
 * → 語彙を手でコピーしないので drift が原理的に起きない。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const RECIPE = '../contracts/presentation-recipe.schema.json';
const CARDS = '../contracts/cards.schema.json';
if (!existsSync(RECIPE)) { console.error(`repo schema が見つかりません: ${RECIPE}（repo 内で実行してください）`); process.exit(1); }

const recipe = JSON.parse(readFileSync(RECIPE, 'utf8'));
const props = {};
for (const [key, def] of Object.entries(recipe.properties)) {
  if (Array.isArray(def.enum)) props[key] = { enum: def.enum };
}

let kinds = [];
if (existsSync(CARDS)) {
  const cards = JSON.parse(readFileSync(CARDS, 'utf8'));
  for (const ref of cards.oneOf || []) {
    const name = ref.$ref.split('/').pop();
    const def = cards.$defs?.[name];
    const c = def?.properties?.type?.const;
    if (c) kinds.push(c);
  }
}

const out =
  `// 自動生成: node tools/gen-recipe-vocab.mjs（手で編集しない）。\n` +
  `// 出典: contracts/presentation-recipe.schema.json / contracts/cards.schema.json\n` +
  `export const RECIPE_PROPS = ${JSON.stringify(props, null, 2)};\n\n` +
  `export const RECIPE_KINDS = ${JSON.stringify(kinds)};\n`;
writeFileSync('plugins/sunao/recipe-vocab.mjs', out);
console.log(`generated plugins/sunao/recipe-vocab.mjs  (${Object.keys(props).length} recipe props, ${kinds.length} card kinds)`);
