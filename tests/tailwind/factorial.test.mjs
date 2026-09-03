/**
 * 2×2 の共有性を検査する。E と F は「CSS backend 以外」を共有していなければ、
 * Compiler 効果と backend 効果を分離できない。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderInbox as renderE } from '../../experiments/e-compiler/render.mjs';
import { renderInbox as renderF } from '../../experiments/f-recipe-tailwind/render.mjs';
import { compileHtml } from '../../experiments/f-recipe-tailwind/compiler.mjs';
import { RecipeError } from '../../experiments/e-compiler/compiler.mjs';

const cards = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'));
const stripClass = (h) => h.replace(/\sclass="[^"]*"/g, '').replace(/\s+/g, ' ').trim();

test('E と F の意味 DOM は class を除いて 1 バイト一致する', () => {
  assert.equal(stripClass(renderE(cards)), stripClass(renderF(cards)));
});

test('E と F は同じ contract 属性を出す', () => {
  const attrs = (h) => [...h.matchAll(/data-(card-type|field|action-semantic|card-state|evidence-level)="[^"]*"/g)].map((m) => m[0]).sort().join('|');
  assert.equal(attrs(renderE(cards)), attrs(renderF(cards)));
});

test('F も fail-closed: enum 外の recipe を RecipeError で拒否する（E と同一経路）', () => {
  assert.throws(() => compileHtml(cards, { palette: 'neon' }), RecipeError);
  assert.throws(() => compileHtml(cards, { density: '13px' }), RecipeError);
});

test('F は決定論的: 同じ recipe から同じ HTML bytes', () => {
  const a = compileHtml(cards, { palette: 'editorial' });
  const b = compileHtml(cards, { palette: 'editorial' });
  assert.equal(a.html, b.html);
  assert.equal(a.htmlHash, b.htmlHash);
});

test('F の class 文字列は完全な静的文字列（runtime 連結の痕跡が無い）', () => {
  const { html } = compileHtml(cards, { palette: 'calm' });
  // ${...} や連結演算子が class 属性に残っていない
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    assert.ok(!/\$\{|\+|`/.test(m[1]), `class に動的連結の痕跡: ${m[1]}`);
  }
});
