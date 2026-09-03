/**
 * T8 — utility 競合の最終結果が意図から離れている。
 *   node tools/tailwind/conflict.mjs
 *
 * 同じ property を変える複数 utility を並べたとき、ソース上の「最後に書いた意図」と
 * 実際の computed style が一致するか。build green を「意図どおり」と扱わない。
 *
 * Tailwind は CSS の詳細度が同じなので、勝つのは「生成 CSS 上の順序」であって
 * 「ソース上の順序」ではない。AI が末尾に足した修正が効かないことがある。
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const WORK = 'experiments/a-tailwind';

// 競合ケース: AI が「あとから p-8 で余白を広げた」つもり
const cases = [
  { id: 'padding', html: '<div class="p-2 p-8" data-t8>x</div>', prop: 'paddingTop', intent: 'p-8 (2rem)', intentPx: 32 },
  { id: 'bg', html: '<div class="bg-red-500 bg-blue-500" data-t8>x</div>', prop: 'backgroundColor', intent: 'bg-blue-500 (後)', intentToken: 'blue' },
  { id: 'text-size', html: '<div class="text-sm text-2xl" data-t8>x</div>', prop: 'fontSize', intent: 'text-2xl (後)', intentPx: 24 },
];

mkdirSync(`${WORK}/src/_t8`, { recursive: true });
writeFileSync(`${WORK}/src/_t8/markup.txt`, cases.map((c) => c.html).join('\n'));
writeFileSync(`${WORK}/src/input.t8.css`, `@import "tailwindcss";\n@source "./_t8";\n`);
execSync(`cd ${WORK} && npx tailwindcss -i src/input.t8.css -o dist/_t8.css`, { stdio: 'pipe' });
const css = readFileSync(`${WORK}/dist/_t8.css`, 'utf8');

// 生成 CSS 上での各 utility の出現位置（先に定義された方が「弱い」＝後勝ち）
const orderInCss = (cls) => { const i = css.indexOf('.' + cls.replace(/([.:])/g, '\\$1')); return i < 0 ? css.indexOf(cls) : i; };

const page = `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="_t8.css"></head><body>${cases.map((c) => c.html).join('')}</body></html>`;
writeFileSync(`${WORK}/dist/_t8.html`, page);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-background-networking', '--no-first-run', '--disable-sync', '--disable-component-update'] });
const p = await browser.newPage();
await p.goto('file://' + process.cwd() + `/${WORK}/dist/_t8.html`, { waitUntil: 'load' });
const computed = await p.evaluate((props) => {
  const els = [...document.querySelectorAll('[data-t8]')];
  return els.map((el, i) => { const cs = getComputedStyle(el); return { i, value: cs[props[i]] }; });
}, cases.map((c) => c.prop));
await browser.close();

const results = cases.map((c, i) => {
  const [a, b] = c.html.match(/class="([^"]*)"/)[1].split(' ');
  return { id: c.id, sourceLast: b, sourceOrder: `${a} then ${b}`,
    cssOrder: orderInCss(a) < orderInCss(b) ? `${a} before ${b} (${b} wins)` : `${b} before ${a} (${a} wins)`,
    computed: computed[i].value, intent: c.intent };
});

execSync(`rm -rf ${WORK}/src/_t8 ${WORK}/src/input.t8.css ${WORK}/dist/_t8.css ${WORK}/dist/_t8.html`);
mkdirSync('docs/results/raw', { recursive: true });
writeFileSync('docs/results/raw/conflict.json', JSON.stringify({ ranAt: new Date().toISOString(), note: 'Tailwind は同詳細度。勝者は生成CSS順であってソース順ではない', results }, null, 2) + '\n');
console.table(results);
