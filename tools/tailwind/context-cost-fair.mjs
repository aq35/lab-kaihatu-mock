/**
 * 公平化した context コスト（§6, 訂正 C5）。
 *   node tools/tailwind/context-cost-fair.mjs
 * 変更を 3 種類に分け、各条件で「AI が最低限読む/書く source」を LLM tokenizer で測る。
 * E の新語彙追加は recipe だけでなく schema+compiler+tests+docs を含める。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { encode } from 'gpt-tokenizer';
const tok = (s) => encode(s).length;
const read = (p) => existsSync(p) ? readFileSync(p, 'utf8') : '';

const rows = [];

// (1) 既存語彙内の変更（例: density=compact）
rows.push({ changeClass: '(1) 既存語彙内の変更（density=compact）',
  A: tok(read('experiments/a-tailwind/render.mjs')),           // A: どこに density があるか探すため renderer を読む
  C: tok(read('experiments/c-semantic-css/styles/tokens.css')),// C: token を読む
  E: tok(read('experiments/e-compiler/recipe.default.json')),  // E: recipe 1 field
  F: tok(read('experiments/f-recipe-tailwind/recipe.default.json')), // F: 同じ recipe
  note: 'E/F は recipe の 1 値変更。A は utility の在処を探す' });

// (2) 既存語彙の組合せ変更（例: 承認カードだけ effect 強調）— T2 の実測より
rows.push({ changeClass: '(2) 組合せ変更（承認カードだけ強調）',
  A: tok(read('experiments/a-tailwind/render.mjs')),
  C: tok(read('experiments/c-semantic-css/styles/components/action-approval.css') || 'n/a'),
  E: tok(read('experiments/e-compiler/recipe.default.json')),
  F: tok(read('experiments/f-recipe-tailwind/recipe.default.json')),
  note: 'E/F は per-card 不可。palette 全体を変える（T2）。粒度が粗い' });

// (3) 新しい表現軸の追加（例: unverifiedEmphasis）— T10 の E 実測を反映
//     E/F では recipe だけでなく schema + compiler + tests + docs を触る
const eVocabAdd = tok(read('contracts/presentation-recipe.schema.json')) * 0.15   // schema の該当部
  + tok(read('experiments/e-compiler/compiler.mjs')) * 0.15                        // compiler の該当部
  + tok(read('tests/tailwind/compiler.test.mjs')) * 0.10                           // test
  + 200;                                                                            // recipe + docs
rows.push({ changeClass: '(3) 新しい表現軸の追加（unverifiedEmphasis）',
  A: tok(read('experiments/a-tailwind/render.mjs')),   // A: renderer に条件式を足す
  C: tok(read('experiments/c-semantic-css/styles/components/card.css')), // C: :has() を 1 規則
  E: Math.round(eVocabAdd),   // E: schema+compiler+tests+docs（recipe だけではない）
  F: Math.round(eVocabAdd),   // F: 同様に compiler(tw-map)+schema+tests
  note: '訂正 C5: E/F の新語彙追加は recipe だけでない。schema+compiler+tests+docs を含む' });

mkdirSync('docs/results/raw', { recursive: true });
writeFileSync('docs/results/raw/context-cost-fair.json', JSON.stringify({ ranAt: new Date().toISOString(),
  tokenizer: 'gpt-tokenizer (GPT; Claude の代理指標)', note: '「AI が最低限読む source」の下限見積り。実際に AI が読んだ量は agent ログで別途', rows }, null, 2) + '\n');
console.table(rows.map((r) => ({ change: r.changeClass.slice(0, 34), A: r.A, C: r.C, E: r.E, F: r.F })));
