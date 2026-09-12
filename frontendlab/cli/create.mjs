/**
 * sunao scaffolder — 新しい sunao アプリの雛形を出す（展開しやすく）。
 *   node create.mjs <dir>            # 例: node create.mjs apps/todo
 *   npm run new -- apps/todo
 *
 * 出す物: <dir>/App.sunao ・ main.js ・ index.html ・ README.md
 * ビルドは既存ツールで: node build.mjs --entry <dir>/main.js --out dist/<name>
 * dev は: node dev.mjs --entry <dir>/main.js
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('使い方: node create.mjs <dir>   例) node create.mjs apps/todo'); process.exit(1); }
// パス検証: `..` による脱出は拒否（絶対パスは明示的な意図として許可）。
const norm = dir.replace(/\\/g, '/');
if (/(^|\/)\.\.(\/|$)/.test(norm)) { console.error(`不正なパス: "${dir}"（.. での脱出は不可）`); process.exit(1); }
const name = basename(norm.replace(/\/+$/, ''));
if (!/^[A-Za-z0-9._-]+$/.test(name)) { console.error(`不正な名前: "${name}"（英数と . _ - のみ）`); process.exit(1); }
// 上書きガード: 4 ファイルのいずれかが既にあれば中止（App.sunao だけでなく全部を見る）。
for (const f of ['App.sunao', 'main.js', 'index.html', 'README.md']) {
  if (existsSync(join(dir, f))) { console.error(`既に存在します: ${dir}/${f}（上書きしません）`); process.exit(1); }
}

const APP = `<template>
  <main class="app">
    <h1>{{ title }}</h1>
    <div class="row">
      <button class="btn" @click="dec()">−</button>
      <output class="val">{{ count() }}</output>
      <button class="btn primary" @click="inc()">＋</button>
    </div>
    <p class="hint" v-if="count() > 4">いい感じ！</p>
  </main>
</template>

<script>
export default {
  name: ${JSON.stringify(name)},
  setup() {
    const title = ${JSON.stringify(name)};        // 静的（呼ばない）
    const count = signal(0);                        // signal は「呼んで読む」→ count()
    const inc = () => count.update((v) => v + 1);
    const dec = () => count.update((v) => v - 1);
    return { title, count, inc, dec };
  },
};
</script>

<style lang="scss">
$accent: oklch(55% 0.18 250);
.app { max-width: 32rem; margin: 3rem auto; font-family: system-ui, "Noto Sans JP", sans-serif; text-align: center; }
.row { display: flex; gap: .75rem; justify-content: center; align-items: center; margin-top: 1rem; }
.val { min-width: 3rem; font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.btn {
  font: inherit; font-weight: 600; padding: .5rem 1rem; border-radius: 10px; border: 1px solid #ccd;
  background: #fff; cursor: pointer;
  &.primary { background: $accent; border-color: $accent; color: #fff; }
}
.hint { color: $accent; margin-top: 1rem; }
</style>
`;

const MAIN = `import { mount } from 'sunao';
import App from './App.sunao';
mount(App, document.getElementById('app'));
`;

const HTML = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<div id="app"></div>
<script type="module" src="./main.js"></script>
`;

const README = `# ${name}

sunao アプリ。

\`\`\`
開発（保存で自動リロード）: node dev.mjs --entry ${dir}/main.js
ビルド:                     node build.mjs --entry ${dir}/main.js --out dist/${name}
チェック（決定論・予算）:   node check.mjs
\`\`\`

- 状態は \`signal\`（\`count()\` で読む・\`count.set()/update()\` で書く）。
- スタイルは \`<style lang="scss">\`（この部品だけに効く scoped）。
- 巨大リストは \`windowed\` / \`windowedVar\`、通信は \`resource\`。詳細は docs/reference.md。
`;

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'App.sunao'), APP);
writeFileSync(join(dir, 'main.js'), MAIN);
writeFileSync(join(dir, 'index.html'), HTML);
writeFileSync(join(dir, 'README.md'), README);

console.log(`\n✓ sunao アプリ雛形を作成: ${dir}`);
console.log('─'.repeat(48));
console.log(`  開発:   node dev.mjs --entry ${dir}/main.js`);
console.log(`  ビルド: node build.mjs --entry ${dir}/main.js --out dist/${name}`);
console.log(`  中身:   App.sunao / main.js / index.html / README.md\n`);
