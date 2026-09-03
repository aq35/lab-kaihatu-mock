import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nativeBackend, isValidBackend, provenanceOf, COMPILER_VERSION } from '../../experiments/g-minimal-owned/backend.mjs';

const cards = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'));

test('native backend は interface に適合する', () => {
  assert.ok(isValidBackend(nativeBackend));
  assert.equal(nativeBackend.kind, 'native-css');
});

test('backend は provenance(recipe/compiler hash) を返す', () => {
  const out = nativeBackend.styleCards(cards, { palette: 'calm' });
  assert.ok(out.provenance.recipeHash);
  assert.ok(out.provenance.cssHash);
  assert.equal(out.provenance.compilerVersion, COMPILER_VERSION);
  assert.equal(out.provenance.backend, 'native-css');
});

test('同じ recipe は同じ provenance hash（決定論・再現性）', () => {
  const a = provenanceOf({ palette: 'editorial' }, 'x', 'native-css');
  const b = provenanceOf({ palette: 'editorial' }, 'x', 'native-css');
  assert.deepEqual(a, b);
});

test('G の core は 1,500 行以内（budget）', () => {
  const files = ['experiments/e-compiler/semantic-dom.mjs', 'experiments/e-compiler/compiler.mjs', 'experiments/g-minimal-owned/backend.mjs'];
  const lines = files.reduce((n, f) => n + readFileSync(f, 'utf8').split('\n').length, 0);
  assert.ok(lines <= 1500, `core ${lines} 行 > 1500`);
});

test('root package.json の production dependency は 0（framework 依存なし）', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.deepEqual(pkg.dependencies, {});
});
