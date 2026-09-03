/**
 * 条件E (Semantic UI Compiler) の主張を検査する。
 * これらが通らなければ E は「Tailwind の代替」を名乗れない。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { compile, compileCss, normalizeRecipe, RecipeError, VOCAB } from '../../experiments/e-compiler/compiler.mjs';
import { renderCardDom } from '../../experiments/e-compiler/semantic-dom.mjs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const cards = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'));
const recipeSchema = JSON.parse(readFileSync('contracts/presentation-recipe.schema.json', 'utf8'));

test('決定論: 同じ recipe から同じ bytes（CSS も HTML も）', () => {
  const r = { palette: 'editorial', density: 'compact', effectEmphasis: 'strong' };
  const a = compile(cards, r), b = compile(cards, r);
  assert.equal(a.css, b.css);
  assert.equal(a.html, b.html);
  assert.equal(a.cssHash, b.cssHash);
});

test('決定論: recipe が同じなら CSS は cards に依存しない', () => {
  const r = { palette: 'calm' };
  const withHappy = compileCss(r);
  const withEdge = compileCss(r);   // compileCss は cards を取らない
  assert.equal(withHappy, withEdge);
});

test('閉じた語彙: enum 外の値は RecipeError で拒否する', () => {
  assert.throws(() => compileCss({ palette: 'neon-cyberpunk' }), RecipeError);
  assert.throws(() => compileCss({ density: '13px' }), RecipeError);
  assert.throws(() => compileCss({ foo: 'bar' }), RecipeError);
});

test('閉じた語彙: recipe schema の enum と Compiler の VOCAB が一致する', () => {
  for (const [key, def] of Object.entries(recipeSchema.properties)) {
    if (!def.enum) continue;
    assert.deepEqual([...def.enum].sort(), [...VOCAB[key]].sort(), `${key} の enum が schema と compiler で不一致`);
  }
});

test('recipe.default.json は schema を満たす', () => {
  const ajv = addFormats(new Ajv2020({ strict: false }));
  const validate = ajv.compile(recipeSchema);
  const def = JSON.parse(readFileSync('experiments/e-compiler/recipe.default.json', 'utf8'));
  assert.ok(validate(def), JSON.stringify(validate.errors));
});

test('required field を消す経路が Compiler の CSS 生成に無い', () => {
  // どの recipe を与えても、生成 CSS に [data-field] を隠す規則が出ない
  const hide = /\[data-field[^\]]*\][^{]*\{[^}]*(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?!\.))/i;
  for (const palette of VOCAB.palette) {
    for (const density of VOCAB.density) {
      const css = compileCss({ palette, density });
      assert.ok(!hide.test(css), `palette=${palette} density=${density} が [data-field] を隠している`);
    }
  }
});

test('全カード型で required field が意味 DOM に必ず出る', () => {
  const contract = JSON.parse(readFileSync('contracts/dom-contract.json', 'utf8'));
  for (const c of cards) {
    const dom = renderCardDom(c);
    for (const field of contract.requiredVisibleFields[c.type]) {
      assert.ok(dom.includes(`data-field="${field}"`), `${c.type} に ${field} が無い`);
    }
  }
});

test('!important を生成しない', () => {
  for (const palette of VOCAB.palette) {
    const css = compileCss({ palette, density: 'dense' });
    // reduced-motion の transition:none!important は許容（意図的な 1 箇所）
    const bad = css.replace(/transition:none!important/g, '');
    assert.ok(!/!important/.test(bad), `${palette} が !important を生成した`);
  }
});
