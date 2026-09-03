/**
 * T5 — 静的クラス検出と動的 AI 生成の不一致。
 *   node tools/tailwind/dynamic-class.mjs
 *
 * Tailwind はソースを「コードとして」ではなく「テキストとして」走査し、
 * class 名は完全な文字列として存在しないと検出されない（公式仕様）。
 * KAS は Python/Go や plugin、DB 由来の role から動的に表現を組む。
 * 動的に組んだ class が build 後の CSS に含まれるかを実際にビルドして確かめる。
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';

const WORK = 'experiments/a-tailwind';
const results = [];
const cssHas = (css, cls) => {
  // Tailwind は . をエスケープするので \. も見る
  const esc = cls.replace(/[[\]().%/]/g, (m) => '\\' + m);
  return css.includes('.' + cls) || css.includes('.' + esc) || new RegExp('\\.' + cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(css);
};

// 攻撃 fixture: 動的に組み立てた class の作り方いろいろ
const cases = [
  { id: 'static-baseline', desc: '完全な文字列で書く（正常系）', markup: `<div class="bg-teal-500 p-7"></div>`, probe: ['bg-teal-500', 'p-7'] },
  { id: 'runtime-concat', desc: 'runtime で連結（`bg-${c}-500`）', markup: '<div class="bg-${color}-600"></div>'.replace('${color}', '${color}'), probe: ['bg-rose-600'], note: 'JS が bg- と rose-600 を連結。ソースに完全文字列が無い' },
  { id: 'recipe-map', desc: 'JSON Recipe から map', markup: `const M={danger:'bg-fuchsia-700'};/* M[role] */`, probe: ['bg-fuchsia-700'], note: 'plugin/DB の role→class マップ。値はデータ側にある' },
  { id: 'py-go-output', desc: 'Python/Go が出力する class', markup: `<!-- server renders: text-lime-700 -->`, probe: ['text-lime-700'], note: 'テンプレートエンジン外で生成' },
];

// baseline を既存 render.mjs に足さず、隔離した source ファイルで検出だけ試す
mkdirSync(`${WORK}/src/_t5`, { recursive: true });
for (const c of cases) {
  writeFileSync(`${WORK}/src/_t5/${c.id}.txt`, c.markup);
}
// _t5 を source に含める input を作る
const inputBak = readFileSync(`${WORK}/src/input.css`, 'utf8');
writeFileSync(`${WORK}/src/input.t5.css`, `@import "tailwindcss";\n@source "./_t5";\n`);
try {
  execSync(`cd ${WORK} && npx tailwindcss -i src/input.t5.css -o dist/_t5.css`, { stdio: 'pipe' });
  const css = readFileSync(`${WORK}/dist/_t5.css`, 'utf8');
  for (const c of cases) {
    const found = c.probe.map((p) => ({ class: p, inCss: cssHas(css, p) }));
    results.push({ id: c.id, desc: c.desc, note: c.note ?? '',
      allFound: found.every((f) => f.inCss), found });
  }
} finally {
  rmSync(`${WORK}/src/_t5`, { recursive: true, force: true });
  rmSync(`${WORK}/src/input.t5.css`, { force: true });
  rmSync(`${WORK}/dist/_t5.css`, { force: true });
}

// safelist で救えるか（回避コスト）
mkdirSync(`${WORK}/src/_t5b`, { recursive: true });
writeFileSync(`${WORK}/src/input.t5b.css`, `@import "tailwindcss";\n@source inline("bg-rose-600 bg-fuchsia-700 text-lime-700");\n`);
let safelistRescued = false;
try {
  execSync(`cd ${WORK} && npx tailwindcss -i src/input.t5b.css -o dist/_t5b.css`, { stdio: 'pipe' });
  const css = readFileSync(`${WORK}/dist/_t5b.css`, 'utf8');
  safelistRescued = ['bg-rose-600', 'bg-fuchsia-700', 'text-lime-700'].every((p) => cssHas(css, p));
} catch (e) { safelistRescued = 'error: ' + String(e.message).slice(0, 80); }
finally {
  rmSync(`${WORK}/src/_t5b`, { recursive: true, force: true });
  rmSync(`${WORK}/src/input.t5b.css`, { force: true });
  rmSync(`${WORK}/dist/_t5b.css`, { force: true });
}

// E は「未知の表現」を安全に扱えるか: recipe に無い値を渡すと？
const { normalizeRecipe, compileCss } = await import('../../experiments/e-compiler/compiler.mjs');
let eUnknownValue;
try {
  const css = compileCss({ palette: 'neon-cyberpunk' });   // enum に無い値
  // normalizeRecipe は既定へフォールバックする。未知値は PALETTE[undefined] で落ちるはず
  eUnknownValue = css.includes('undefined') ? 'undefined が CSS に漏れた' : '既定へフォールバック';
} catch (e) {
  eUnknownValue = 'Compiler が拒否/例外: ' + String(e.message).slice(0, 60);
}

mkdirSync('docs/results/raw', { recursive: true });
writeFileSync('docs/results/raw/dynamic-class.json',
  JSON.stringify({ ranAt: new Date().toISOString(), tailwind: results, safelistRescued, eUnknownValue }, null, 2) + '\n');

console.log('=== T5: Tailwind は動的生成 class を build 後 CSS に含めるか ===');
console.table(results.map((r) => ({ case: r.id, desc: r.desc.slice(0, 30), 'CSSに含まれた': r.allFound })));
console.log('\nsafelist (@source inline) で救えるか:', safelistRescued);
console.log('E に enum 外の値を渡すと:', eUnknownValue);
