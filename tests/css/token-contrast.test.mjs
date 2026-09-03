/**
 * design token のコントラストを WCAG 2.2 AA 基準で検査する。
 *
 * 追加理由（実測 receipt）:
 *   docs/results/ui-1-comparison.md — 条件C の初回計測で axe が color-contrast 違反 40 件。
 *   原因は --text-quiet が 3.83:1 だったこと。token を定義しただけでは AA は満たされない。
 *   theme を増やすたびに同じ事故が起きるため、theme 総当たりで検査する。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, readTokens, resolve, parseColor, toHex } from '../../tools/color.mjs';

const STYLES = 'experiments/c-semantic-css/styles';
const baseCss = readFileSync(join(STYLES, 'tokens.css'), 'utf8');
const baseTokens = readTokens(baseCss, /:root/);

const themeFiles = readdirSync(join(STYLES, 'themes')).filter((f) => f.endsWith('.css'));

/** [前景, 背景, 必要比, 用途] */
const TEXT_PAIRS = [
  ['--text-primary', '--surface-card', 4.5, 'カード本文'],
  ['--text-primary', '--surface-page', 4.5, 'ページ本文'],
  ['--text-secondary', '--surface-card', 4.5, 'fact の値'],
  ['--text-secondary', '--surface-sunken', 4.5, 'sunken 上の値'],
  ['--text-quiet', '--surface-card', 4.5, 'fact のラベル'],
  ['--text-quiet', '--surface-page', 4.5, 'ページ上の補助文'],
  ['--text-quiet', '--surface-sunken', 4.5, '選択肢の補足'],
  ['--accent', '--surface-card', 4.5, '質問カードの種別ラベル'],
  ['--danger', '--surface-card', 4.5, 'リスクあり表示 / 承認カードの種別ラベル'],
  ['--danger', '--surface-sunken', 4.5, 'sunken 上の警告'],
  ['--positive', '--surface-card', 4.5, 'RECEIPTED 表示'],
  ['--unknown', '--surface-card', 4.5, '結果不明の種別ラベル'],
  ['--accent-contrast', '--accent', 4.5, 'primary ボタンの文字'],
];
const NON_TEXT_PAIRS = [
  ['--border-strong', '--surface-card', 3.0, 'ボタン枠'],
  ['--accent', '--surface-card', 3.0, 'focus ring'],
];

function tokensFor(themeFile) {
  if (!themeFile) return baseTokens;
  const css = readFileSync(join(STYLES, 'themes', themeFile), 'utf8');
  // theme は :root[data-theme=...] か :root:not([data-theme]) を書く
  return { ...baseTokens, ...readTokens(css, /\[data-theme|:root/) };
}

function check(tokens, pairs, label) {
  const failures = [];
  for (const [fgName, bgName, min, use] of pairs) {
    const fg = resolve(tokens, fgName);
    const bg = resolve(tokens, bgName);
    if (!fg || !bg) continue;
    if (!parseColor(fg) || !parseColor(bg)) continue;
    const ratio = contrastRatio(fg, bg);
    if (ratio < min) {
      failures.push(
        `${label}: ${fgName} (${toHex(parseColor(fg))}) on ${bgName} (${toHex(parseColor(bg))}) = ` +
        `${ratio.toFixed(2)}:1 < ${min}:1 — ${use}`);
    }
  }
  return failures;
}

test('既定 token が WCAG 2.2 AA のコントラストを満たす', () => {
  const f = [...check(baseTokens, TEXT_PAIRS, 'default'), ...check(baseTokens, NON_TEXT_PAIRS, 'default')];
  assert.deepEqual(f, [], '\n' + f.join('\n'));
});

test('すべての theme が WCAG 2.2 AA のコントラストを満たす', () => {
  const all = [];
  for (const tf of themeFiles) {
    const tokens = tokensFor(tf);
    all.push(...check(tokens, TEXT_PAIRS, tf), ...check(tokens, NON_TEXT_PAIRS, tf));
  }
  assert.deepEqual(all, [], '\n' + all.join('\n'));
});
