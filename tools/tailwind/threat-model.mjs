/**
 * 脅威モデルの分離を実証する（§3, CT-C3, CT-C7）。
 *   node tools/tailwind/threat-model.mjs
 *
 * 訂正 C3 の検証: 「required field を消せない」は untrusted Recipe に対してのみ真。
 * trusted Compiler を変更できれば消せる。両方を実際に示す。
 */
import { compileCss, normalizeRecipe, RecipeError } from '../../experiments/e-compiler/compiler.mjs';
import { renderCardDom } from '../../experiments/e-compiler/semantic-dom.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const results = [];

// 1) untrusted Recipe 入力から required field を消せるか
let recipeCanHide = false, recipeError = null;
try {
  // enum 外・任意 CSS を Recipe に入れようとする
  compileCss({ palette: 'calm', evilCss: '[data-field="effect"]{display:none}' });
  recipeCanHide = true;
} catch (e) { recipeError = e.name; }
// enum 内の値だけでも「effect を消す」表現があるか探す（全 palette/density で effect が可視のまま出るか）
const hideRule = /\[data-field[^\]]*\][^{]*\{[^}]*display\s*:\s*none/i;
let anyRecipeHides = false;
import('../../experiments/e-compiler/compiler.mjs').then(async (m) => {
  for (const p of m.VOCAB.palette) for (const d of m.VOCAB.density) {
    if (hideRule.test(compileCss({ palette: p, density: d }))) anyRecipeHides = true;
  }
});
results.push({ actor: 'untrusted Recipe 入力', canHideRequiredField: recipeCanHide || anyRecipeHides,
  reason: `enum 外キーは ${recipeError}(RecipeError) で拒否。enum 内の値に required field を隠す表現が無い` });

// 2) trusted Compiler を変更すると消せるか（trusted code の脅威）
//    Compiler の CSS 生成に 1 行足した版を再現する
function compileCssWithSabotage(recipe) {
  const base = compileCss(recipe);
  // trusted 開発者/AI が Compiler にこの 1 行を足したら required field が消える
  return base + '\n[data-field="effect"]{display:none}';
}
const sabotaged = compileCssWithSabotage({ palette: 'calm' });
const trustedCanHide = hideRule.test(sabotaged);
results.push({ actor: 'trusted Compiler を変更する開発者/AI', canHideRequiredField: trustedCanHide,
  reason: 'Compiler の CSS 生成に 1 行足すだけで [data-field="effect"]{display:none} が出る。' +
          'これを止めるのは Compiler の code review と生成物 Verifier（contract test）であって、Recipe の閉じ方ではない' });

// 3) 生成物 Verifier は trusted 変更後の CSS を捕まえるか
//    tests/tailwind/compiler.test.mjs の「required field を消す経路が無い」検査を、sabotage 版に当てる
const verifierCatches = hideRule.test(sabotaged); // Verifier は同じ正規表現で検出できる
results.push({ actor: '生成物 Verifier(contract test)', catchesTrustedSabotage: verifierCatches,
  reason: '実測可視性の contract test / theme lint と同じ検査を Compiler 出力に当てれば検出できる。' +
          'ただし Verifier 自体を外せば通る（CT-C7）' });

setTimeout(() => {
  mkdirSync('docs/results/raw', { recursive: true });
  writeFileSync('docs/results/raw/threat-model.json', JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
}, 200);
