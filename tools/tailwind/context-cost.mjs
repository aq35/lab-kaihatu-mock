/**
 * T7 — utility class 列が AI の context を消費する。
 *   node tools/tailwind/context-cost.mjs
 *
 * 同じ意味・同じ描画結果の 1 カードについて、AI が読み書きする source を
 * 実際の LLM tokenizer で測る。gpt-tokenizer は GPT の tokenizer なので
 * Claude の正確な token 数ではないが、方式間の相対比較の代理指標になる。
 *
 * 測るのは「描画された HTML」ではなく「AI が編集する source」:
 *   A: render.mjs の 1 カード分テンプレート（utility 文字列を含む）
 *   C: render.mjs の 1 カード分 + そのカードに効く CSS
 *   E: recipe（AI が生成する全て）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { encode } from 'gpt-tokenizer';

const tok = (s) => encode(s).length;

// A/C の render.mjs から ACTION_APPROVAL の body 生成部分を切り出す（AI が編集する単位）
function sliceFn(src, name) {
  const i = src.indexOf(name);
  if (i < 0) return '';
  let depth = 0, started = false, out = '';
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const ch = src[k];
    out += ch;
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) break; }
  }
  return out;
}

const results = [];

// --- A: Tailwind。utility 文字列は render.mjs の markup にある ---
{
  const src = readFileSync('experiments/a-tailwind/render.mjs', 'utf8');
  const body = sliceFn(src, 'ACTION_APPROVAL(c)');
  // utility 指定に使われる token と、意味に使われる token の比を概算する
  const utilityStrings = [...src.matchAll(/class="([^"]*)"/g)].map((m) => m[1]).join(' ') +
    [...src.matchAll(/\b(BTN|BTN_[A-Z]+|LABEL_CLS|VALUE_CLS|ACCENT)\b/g)].map((m) => m[0]).join(' ');
  results.push({ variant: 'A: Tailwind', unit: 'render.mjs の ACTION_APPROVAL body',
    sourceTokens: tok(body), classTokensInFile: tok(utilityStrings) });
}

// --- C: Semantic CSS。body 生成 + そのカードに効く CSS ---
{
  const src = readFileSync('experiments/c-semantic-css/render.mjs', 'utf8');
  const body = sliceFn(src, 'ACTION_APPROVAL(card)');
  const css = readFileSync('experiments/c-semantic-css/styles/components/card.css', 'utf8') +
    readFileSync('experiments/c-semantic-css/styles/components/risk.css', 'utf8');
  results.push({ variant: 'C: Semantic CSS', unit: 'render.mjs の ACTION_APPROVAL body + card/risk CSS',
    sourceTokens: tok(body), cssTokens: tok(css) });
}

// --- E: Compiler。AI が生成するのは recipe だけ ---
{
  const recipe = readFileSync('experiments/e-compiler/recipe.default.json', 'utf8');
  results.push({ variant: 'E: Compiler', unit: 'recipe.default.json（AI 生成物の全て）',
    sourceTokens: tok(recipe), classTokensInFile: 0 });
}

// --- 「見た目を少し変える」1 回の変更で AI が読む必要のある source token（下限） ---
// A: 該当 utility を含む markup 全体を読む必要がある / E: recipe だけ
const changeContext = {
  'A: Tailwind': tok(readFileSync('experiments/a-tailwind/render.mjs', 'utf8')),
  'C: Semantic CSS': tok(readFileSync('experiments/c-semantic-css/styles/tokens.css', 'utf8')),
  'E: Compiler': tok(readFileSync('experiments/e-compiler/recipe.default.json', 'utf8')),
};

mkdirSync('docs/results/raw', { recursive: true });
const out = { ranAt: new Date().toISOString(), tokenizer: 'gpt-tokenizer (GPT; Claude の代理指標)',
  perCardSource: results, changeContextTokens: changeContext };
writeFileSync('docs/results/raw/context-cost.json', JSON.stringify(out, null, 2) + '\n');
console.table(results.map((r) => ({ variant: r.variant, unit: r.unit.slice(0, 40),
  sourceTokens: r.sourceTokens, cssTokens: r.cssTokens ?? '-', classTokens: r.classTokensInFile ?? '-' })));
console.log('\n「色を少し変える」1 変更で AI が最低限読む source の token 数:');
console.table(changeContext);
