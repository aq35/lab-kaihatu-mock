/**
 * shadow DOM 越しに渡る token の名前ズレを検出する。
 *
 * 追加理由（実測 receipt）:
 *   条件D の shadow CSS は `var(--kind-information, oklch(60% .012 250))` を参照していたが、
 *   共有 token 側の名前は `--kind-accent-information` だった。
 *   名前が違っても CSS はエラーにならず、**黙って fallback 値を使う**。
 *   その fallback は token コントラスト検査の対象外なので、
 *   token 側を WCAG AA に直しても条件D だけ古い値のまま残り、axe 違反が 1 件残った。
 *
 *   Shadow DOM は「外の CSS が届かない」だけでなく「名前が合っているかを誰も検査しない」。
 *   これは条件D 固有のコストとして docs/results/ui-1-comparison.md に記録してある。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readTokens, parseColor, contrastRatio } from '../../tools/color.mjs';

const TOKENS_CSS = 'experiments/c-semantic-css/styles/tokens.css';
const defined = new Set(Object.keys(readTokens(readFileSync(TOKENS_CSS, 'utf8'), /:root/)));

/** そのファイル自身が定義する custom property も参照先として認める */
const collect = (files) => {
  const out = [];
  for (const f of files) {
    const css = readFileSync(f, 'utf8');
    const local = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    for (const m of css.matchAll(/var\(\s*(--[\w-]+)\s*(,([^()]|\([^()]*\))*)?\)/g)) {
      out.push({ file: f, name: m[1], fallback: (m[2] ?? '').replace(/^,\s*/, '').trim(), local });
    }
  }
  return out;
};

const shadowFiles = ['experiments/d-web-components/components/kas-card.css'].filter(existsSync);

test('shadow DOM の CSS が参照する token 名は、共有 token 側に実在する', () => {
  const missing = [];
  for (const u of collect(shadowFiles)) {
    if (defined.has(u.name) || u.local.has(u.name)) continue;
    missing.push(`${u.file}: var(${u.name}) は ${TOKENS_CSS} に無い` +
      (u.fallback ? `（fallback "${u.fallback}" が黙って使われる）` : ''));
  }
  assert.deepEqual(missing, [], '\n' + missing.join('\n'));
});

test('fallback 値は、それ自体が WCAG AA を満たす色である', () => {
  // 名前が合っていても、theme を持たない環境では fallback が使われる。
  // fallback は token 検査の外側にあるので、ここで別途検査する。
  const bad = [];
  const CARD_BG = '#ffffff';   // shadow の中で最も明るい背景（--surface-card の実値上限）
  for (const u of collect(shadowFiles)) {
    if (!u.fallback) continue;
    const rgb = parseColor(u.fallback);
    if (!rgb) continue;                       // 色でない fallback（長さなど）は対象外
    // --*-contrast は「accent の上に載る前景色」なので、白地との比較は意味を持たない。
    // これは accent 側とペアで tests/css/token-contrast.test.mjs が検査している。
    if (/-contrast$/.test(u.name)) continue;
    if (!/color|kind|text|accent|danger|caution|positive|unknown/.test(u.name)) continue;
    const ratio = contrastRatio(u.fallback, CARD_BG);
    if (ratio < 4.5) bad.push(`${u.file}: var(${u.name}) の fallback ${u.fallback} は白地で ${ratio.toFixed(2)}:1`);
  }
  assert.deepEqual(bad, [], '\n' + bad.join('\n'));
});
