/**
 * theme が「表現」を超えて「意味」を壊していないかを静的に検査する。
 * これは方式選択では防げない事故 (H7) を防ぐための唯一の手段。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const THEME_DIR = 'experiments/c-semantic-css/styles/themes';
const themeFiles = readdirSync(THEME_DIR).filter((f) => f.endsWith('.css'));

const HIDE_PATTERNS = [
  /display\s*:\s*none/i,
  /visibility\s*:\s*hidden/i,
  /opacity\s*:\s*0(?!\.)/i,
  /font-size\s*:\s*0(?:px|rem|em)?\s*[;}]/i,
  /content-visibility\s*:\s*hidden/i,
  /clip-path\s*:\s*inset\(\s*100%/i,
  /(max-)?(height|block-size)\s*:\s*0(?:px)?\s*[;}]/i,
];

test('theme は required field を隠していない', () => {
  for (const f of themeFiles) {
    const css = readFileSync(join(THEME_DIR, f), 'utf8');
    // [data-field] を含むセレクタのブロックだけ抜き出して検査する
    for (const m of css.matchAll(/([^{}]*\[data-field\][^{}]*)\{([^}]*)\}/g)) {
      for (const p of HIDE_PATTERNS) {
        assert.ok(!p.test(m[2]), `${f}: [data-field] を隠している → ${m[1].trim()} { ${m[2].trim()} }`);
      }
    }
  }
});

test('theme は !important を使っていない', () => {
  for (const f of themeFiles) {
    const css = readFileSync(join(THEME_DIR, f), 'utf8');
    assert.ok(!/!\s*important/i.test(css), `${f} が !important を使っている`);
  }
});

test('theme は focus ring を消していない', () => {
  for (const f of themeFiles) {
    const css = readFileSync(join(THEME_DIR, f), 'utf8');
    for (const m of css.matchAll(/:focus(?:-visible|-within)?[^{]*\{([^}]*)\}/g)) {
      assert.ok(!/outline\s*:\s*(none|0)/i.test(m[1]), `${f} が focus outline を消している`);
    }
  }
});

test('theme は cascade layer の中に閉じている', () => {
  for (const f of themeFiles) {
    const css = readFileSync(join(THEME_DIR, f), 'utf8');
    assert.match(css, /@layer\s+themes\s*\{/, `${f} が @layer themes の外に規則を書いている`);
  }
});

test('component は primitive token を直接参照していない', () => {
  const dir = 'experiments/c-semantic-css/styles/components';
  for (const f of readdirSync(dir)) {
    const css = readFileSync(join(dir, f), 'utf8');
    const raw = [...css.matchAll(/var\(\s*(--p-[\w-]+)/g)].map((m) => m[1]);
    assert.deepEqual(raw, [], `${f} が primitive token を直接参照している: ${raw.join(', ')}`);
  }
});

test('component は生の色リテラルを持たない', () => {
  const dir = 'experiments/c-semantic-css/styles/components';
  for (const f of readdirSync(dir)) {
    const css = readFileSync(join(dir, f), 'utf8');
    const colors = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g)].map((m) => m[0]);
    assert.deepEqual(colors, [], `${f} が生の色を直接書いている: ${colors.join(', ')}`);
  }
});

test('cascade layer の順序が 1 箇所で固定されている', () => {
  const layers = readFileSync('experiments/c-semantic-css/styles/layers.css', 'utf8');
  assert.match(layers, /@layer\s+reset\s*,\s*tokens\s*,\s*base\s*,\s*layout\s*,\s*components\s*,\s*states\s*,\s*themes\s*,\s*overrides\s*;/);
});

test('root の package.json は Tailwind に依存していない', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of Object.keys(all)) {
    assert.ok(!/tailwind/i.test(name), `root が ${name} に依存している`);
  }
  assert.deepEqual(pkg.dependencies, {}, 'production dependency を持たない');
});

test('条件A の Tailwind 依存は experiments 配下に隔離されている', () => {
  const p = 'experiments/a-tailwind/package.json';
  assert.ok(existsSync(p));
  const pkg = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(pkg.devDependencies.tailwindcss, '比較条件としては存在してよい');
  assert.equal(pkg.dependencies, undefined);
});
