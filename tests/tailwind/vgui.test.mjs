import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate, nextGeneration } from '../../experiments/vgui/generator.mjs';
import { renderCandidatePage, candidateCss } from '../../experiments/vgui/compiler.mjs';

const grammar = { intent: { primary_emotion: 'quiet anticipation', attention_path: ['identity','evidence','action'], reading_rhythm: 'slow_then_decisive' },
  constraints: { protected_meaning: true, minimum_contrast: 4.5, maximum_lcp_ms: 2500, reduced_motion_required: true } };
const cards = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'));

test('V5 決定論: 同じ seed から同じ生成', () => {
  assert.equal(JSON.stringify(generate(grammar,{n:12,seed:7})), JSON.stringify(generate(grammar,{n:12,seed:7})));
});

test('V2 意味 DOM は全候補で一致（class を除く）', () => {
  const gen = generate(grammar, { n: 8, seed: 3 });
  const strip = (h) => h.replace(/\sclass="[^"]*"/g, '').replace(/\s+/g, ' ');
  const doms = new Set(gen.experiments.map(e => strip(renderCandidatePage(cards, e.parameters).html)));
  assert.equal(doms.size, 1, '候補間で意味 DOM が異なる');
});

test('候補は連続パラメータで CSS が異なる（enum でない）', () => {
  const a = candidateCss({ density:0.2,hierarchy:0.5,contrastEmphasis:0.7,motionIntensity:0.1,whitespace:0.5,riskProminence:0.6,radius:0.4,ruleWeight:0.5,accentHue:250,accentChroma:0.4 });
  const b = candidateCss({ density:0.21,hierarchy:0.5,contrastEmphasis:0.7,motionIntensity:0.1,whitespace:0.5,riskProminence:0.6,radius:0.4,ruleWeight:0.5,accentHue:250,accentChroma:0.4 });
  assert.notEqual(a, b, 'density 0.2 と 0.21 で CSS が同一（連続でない）');
});

test('compiler は reduced-motion を常に honor する', () => {
  const css = candidateCss({ density:0.5,hierarchy:0.5,contrastEmphasis:0.7,motionIntensity:1,whitespace:0.5,riskProminence:0.6,radius:0.4,ruleWeight:0.5,accentHue:250,accentChroma:0.4 });
  // motion があるときは必ず prefers-reduced-motion ガード内
  if (css.includes('vg-rise')) assert.ok(css.includes('prefers-reduced-motion: no-preference'), 'motion が reduced-motion ガードの外にある');
});

test('V7 成長文法は self-eval で ENABLED にしない（PROPOSED のみ）', () => {
  const p = JSON.parse(readFileSync('docs/results/raw/vgui-pipeline.json', 'utf8'));
  for (const r of p.grownGrammar.proposedRules) {
    assert.equal(r.status, 'PROPOSED', `${r.id} が PROPOSED でない`);
    assert.ok(r.promoteRequires.length > 0, `${r.id} に昇格条件が無い`);
  }
});

test('compiler は required field を隠す経路を持たない', () => {
  const css = candidateCss({ density:1,hierarchy:0,contrastEmphasis:0,motionIntensity:0,whitespace:0,riskProminence:0,radius:0,ruleWeight:0,accentHue:0,accentChroma:0 });
  assert.ok(!/\[data-field[^\]]*\][^{]*\{[^}]*(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?!\.))/i.test(css));
});
