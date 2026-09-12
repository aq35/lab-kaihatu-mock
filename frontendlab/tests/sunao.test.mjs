import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import esbuild from 'esbuild';
import { signal, effect, computed, batch, component, validateProps, matchRoute, createRoot, useRoute, navigate, setRouteGuard, interval, debounce, resource, machine, store, decode, match, produce, boundary, provide, inject, windowed, windowedVar, renderComponentToString } from '../plugins/sunao/runtime.mjs';
import { recipeStyle } from '../plugins/sunao/theme.mjs';
import { RECIPE_PROPS, RECIPE_KINDS } from '../plugins/sunao/recipe-vocab.mjs';
import { compileSFC, compileTemplate, analyze, warningsOf, diagnose, CompileError } from '../plugins/sunao/compile.mjs';
import { formatSFC } from '../plugins/sunao/format.mjs';
import { sunao } from '../plugins/sunao/esbuild-plugin.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const RUNTIME = resolve('plugins/sunao/runtime.mjs');

test('reactivity: effect re-runs on signal change', () => {
  const n = signal(1);
  let seen = [];
  effect(() => seen.push(n()));
  n.set(2);
  n.set(2); // 同値は通知しない
  n.set(3);
  assert.deepEqual(seen, [1, 2, 3]);
});

test('compile はテンプレートを決定論的に出力する（同入力→同 hash）', () => {
  const src = readFileSync('fixtures/app-ui/Counter.sunao', 'utf8');
  const a = compileSFC(src, { runtime: RUNTIME });
  const b = compileSFC(src, { runtime: RUNTIME });
  assert.equal(sha(a), sha(b));
});

test('compile: 未知ディレクティブは fail-closed で止まる', () => {
  assert.throws(() => compileTemplate('<div v-show="x"></div>'), CompileError);
  assert.throws(() => compileTemplate('<div v-html="x"></div>'), CompileError);
  assert.throws(() => compileTemplate('<div>{{ }}</div>'), CompileError); // 空補間
  assert.throws(() => compileTemplate('<div><span></div>'), CompileError); // タグ不整合
});

test('③ computed: 依存が変わると派生値が更新される', () => {
  const n = signal(2);
  const double = computed(() => n() * 2);
  const seen = [];
  effect(() => seen.push(double()));
  n.set(3);
  n.set(5);
  assert.deepEqual(seen, [4, 6, 10]);
});

test('② 既定 static: 動的もイベントも無い → 定数 HTML・runtime を import しない', () => {
  const mod = compileSFC('<template><footer class="f"><small>© 2026</small></footer></template>', { runtime: RUNTIME });
  assert.doesNotMatch(mod, /\bimport\b/, '静的コンポーネントは import を持たない（tree-shake で reactivity が落ちる）');
  assert.match(mod, /static: true/);
  assert.match(mod, /© 2026/);
});

test('⑤ v-model: :value + @input へ純粋 desugar される', () => {
  const r = compileTemplate('<input v-model="name">');
  assert.match(r.render, /"value": \(\) => \(name\)\(\)/);
  assert.match(r.render, /"onInput": \(e\) => \(name\)\.set\(e\.target\.value\)/);
  assert.ok(r.used.includes('name'));
});

test('fmt: formatSFC は冪等・content 非破壊・整形後もコンパイルできる', () => {
  const messy = `<template>\n<div class="a"  >\n<!-- c -->\n<b>{{  x()  }}</b>\n<ul><li v-for="r in rows()" :key="r.id"><span>{{ r.n }}</span></li></ul>\n</div>\n</template>\n<script>\nexport default { setup(){ const x = signal(0); const rows = signal([]); return { x, rows }; } }\n</script>\n<style lang="scss">.a{ .b{color:red} }</style>`;
  const once = formatSFC(messy);
  assert.equal(formatSFC(once), once, '冪等');
  assert.match(once, /<b>\{\{ x\(\) \}\}<\/b>/, '要素を含まない子は 1 行 inline');
  assert.match(once, /<!-- c -->/, 'コメント保持');
  assert.match(once, /:key="r\.id"/, '属性保持');
  assert.match(once, /<style lang="scss">/, 'style lang 保持');
  assert.doesNotThrow(() => compileSFC(once, { runtime: RUNTIME }), '整形後もコンパイルできる');
});

test('scaffold: npm run new が雛形を出し、そのままビルドできる', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scaf-'));
  const app = join(dir, 'todo');
  try {
    execFileSync('node', ['create.mjs', app], { stdio: 'ignore' });
    for (const f of ['App.sunao', 'main.js', 'index.html', 'README.md']) assert.ok(existsSync(join(app, f)), `${f} が生成される`);
    // 生成物がそのまま esbuild+sunao で通る（scss 含む）
    const r = await esbuild.build({ entryPoints: [join(app, 'main.js')], bundle: true, minify: true, format: 'iife', write: false, plugins: [sunao()], logLevel: 'silent' });
    assert.ok(r.outputFiles[0].contents.length > 0, 'バンドルできる');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SCSS: <style lang="scss"> がネスト/変数/& を CSS 化して scope される', () => {
  const src = '<template><div class="card"><b class="t">hi</b></div></template>' +
    '<style lang="scss">$c: red; .card { padding: 8px; .t { color: $c; &:hover { color: blue } } }</style>';
  const mod = compileSFC(src, { runtime: RUNTIME });
  assert.match(mod, /\.card \.t\[data-s[0-9a-z]+\]/, 'ネストが展開され scope される');
  assert.match(mod, /color: red/, '$変数が解決される');
  assert.match(mod, /\.t\[data-s[0-9a-z]+\]:hover/, '& が展開される');
  // 未対応 lang は fail-closed
  assert.throws(() => compileSFC('<template><p>x</p></template><style lang="less">.a{}</style>', { runtime: RUNTIME }), /未対応/);
});

test('⑤ scoped styles: 要素に scope 属性、CSS が scope 限定される（最小）', () => {
  const mod = compileSFC('<template><p class="x">hi</p></template><style>.x { color: red }</style>', { runtime: RUNTIME });
  assert.match(mod, /data-s[0-9a-z]+/, 'scope 属性が付く');
  assert.match(mod, /\.x\[data-s[0-9a-z]+\]/, 'CSS が compound [scope] で限定される（ルート要素にも効く）');
});

test('⑤ scoped styles: ルート要素・疑似・combinator も正しく scope される', () => {
  const { render } = compileTemplate('<div class="root">x</div>'); // ダミー（scope 抽出は compileSFC）
  const mod = compileSFC('<template><div class="root"><a class="c">y</a></div></template>' +
    '<style>.root { color: red } .a:hover { color: blue } .p .c::after { content: "" }</style>', { runtime: RUNTIME });
  const attr = (/data-s[0-9a-z]+/.exec(mod) || [])[0];
  assert.ok(attr);
  assert.ok(mod.includes(`.root[${attr}]`), 'ルート要素の compound');
  assert.ok(mod.includes(`.a[${attr}]:hover`), '疑似クラスの前に挿入');
  assert.ok(mod.includes(`.c[${attr}]::after`), '疑似要素の前に挿入（最後の compound のみ）');
  assert.ok(!mod.includes(`.p[${attr}]`), '先頭 compound には付けない（最後だけ）');
});

test('④ 宣言必須(fail-closed): expose に無い識別子の参照は止まる', () => {
  const bad = `<template><b>{{ taipo() }}</b></template><script>export default { expose: ['count'], setup(){ const count = signal(0); return { count }; } }</script>`;
  assert.throws(() => compileSFC(bad, { runtime: RUNTIME }), CompileError);
  const good = `<template><b>{{ count() }}</b></template><script>export default { expose: ['count'], setup(){ const count = signal(0); return { count }; } }</script>`;
  assert.doesNotThrow(() => compileSFC(good, { runtime: RUNTIME }));
});

test('② 診断: 未宣言参照は「もしかして」提案つきで止まる', () => {
  const src = `<template><b>{{ cont() }}</b></template><script>export default { setup(){ const count = signal(0); return { count }; } }</script>`;
  assert.throws(() => compileSFC(src, { runtime: RUNTIME }), /もしかして.*count/);
});

test('A 構造化診断: エラーは code/loc/frame/suggestions を機械可読に持つ', () => {
  // 未知ディレクティブ（位置つき）
  try {
    compileTemplate('<div>\n  <span v-shwo="x"></span>\n</div>');
    assert.fail('should throw');
  } catch (e) {
    assert.ok(e instanceof CompileError);
    const d = e.diagnostic;
    assert.equal(d.code, 'SUNAO_UNKNOWN_DIRECTIVE');
    assert.deepEqual(d.loc, { line: 2, column: 3 });
    assert.match(d.frame, /\^/); // キャレットを含むコードフレーム
    assert.ok(d.suggestions.includes('v-if'));
  }
  // 未宣言参照（提案つき）
  try {
    compileSFC('<template><b>{{ cont() }}</b></template><script>export default { setup(){ const count = signal(0); return { count }; } }</script>', { runtime: RUNTIME });
    assert.fail('should throw');
  } catch (e) {
    assert.equal(e.diagnostic.code, 'SUNAO_UNDECLARED_REF');
    assert.deepEqual(e.diagnostic.suggestions, ['count']);
    assert.equal(e.diagnostic.loc.line, 1);
  }
});

test('④ 型付き props: 必須欠落・未知・型不一致は fail-closed', () => {
  const Greeting = { name: 'Greeting', props: { name: { type: 'string', required: true }, count: 'number' }, setup: () => ({}), render: () => null };
  assert.throws(() => validateProps(Greeting, { count: () => 1 }), /必須 prop "name"/);
  assert.throws(() => validateProps(Greeting, { name: () => 'a', count: () => 1, extra: () => 9 }), /未知の prop "extra"/);
  assert.throws(() => validateProps(Greeting, { name: () => 'a', count: () => 'NaN' }), /prop "count" は number 期待/);
  assert.doesNotThrow(() => validateProps(Greeting, { name: () => 'a', count: () => 1 }));
});

test('④ build時の契約: analyze で子の props と親の渡し prop を取り、不一致を検出', () => {
  const child = analyze(`<template><p>{{ name() }}</p></template><script>export default { name:'X', props:{ name:{type:'string',required:true} }, setup(){ return {}; } }</script>`);
  assert.deepEqual(Object.keys(child.props), ['name']);
  assert.equal(child.props.name.required, true);
  const host = analyze(`<template><X :name="a()" :bad="b()"/></template><script>import X from './X.sunao'; export default { setup(){ return {}; } }</script>`);
  assert.deepEqual(host.uses, [{ tag: 'X', props: ['name', 'bad'] }]);
  const declared = Object.keys(child.props);
  assert.deepEqual(host.uses[0].props.filter((p) => !declared.includes(p)), ['bad'], '子に無い prop を検出');
});

test('B bridge: 閉じた語彙 prop（enum）は Recipe 同様 fail-closed', () => {
  const Comp = { name: 'X', props: { palette: { enum: ['calm', 'editorial'] } }, setup: () => ({}), render: () => null };
  assert.throws(() => validateProps(Comp, { palette: () => 'neon' }), /閉じた語彙/);
  assert.doesNotThrow(() => validateProps(Comp, { palette: () => 'calm' }));
});

test('B bridge: OwnerCard の閉じた語彙が repo の presentation-recipe.schema と一致（drift 検査）', async () => {
  const SCHEMA = '../contracts/presentation-recipe.schema.json';
  if (!existsSync(SCHEMA)) { return; } // repo 外では skip（接続は repo 内でのみ意味を持つ）
  const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'));
  const r = await esbuild.build({ entryPoints: ['fixtures/app-ui/OwnerCard.sunao'], bundle: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
  const dir = mkdtempSync(join(tmpdir(), 'oc-'));
  try {
    const f = join(dir, 'OC.mjs');
    writeFileSync(f, r.outputFiles[0].contents);
    const OC = (await import(pathToFileURL(f).href)).default;
    for (const key of ['palette', 'density', 'cardShape']) {
      assert.deepEqual(OC.props[key].enum, schema.properties[key].enum, `${key} の語彙が repo schema と一致`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// SSG prerender を「そのバンドル自身の runtime」で実行して {html,styles,meta} を得る。
async function prerenderSFC(sfcPath) {
  const dir = mkdtempSync(join(tmpdir(), 'pr-'));
  try {
    const gen = join(dir, 'e.mjs');
    writeFileSync(gen, `import { prerender } from 'sunao';\nimport C from ${JSON.stringify(resolve(sfcPath))};\nexport const page = prerender(C);\n`);
    const r = await esbuild.build({ entryPoints: [gen], bundle: true, format: 'esm', platform: 'node', write: false, plugins: [sunao()], logLevel: 'silent' });
    const out = join(dir, 'o.mjs');
    writeFileSync(out, r.outputFiles[0].contents);
    return (await import(pathToFileURL(out).href)).page;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('SSG: prerender が中身入り HTML・収集 CSS・meta を返す（SEO）', async () => {
  const page = await prerenderSFC('fixtures/seo/Landing.sunao');
  assert.match(page.html, /AI が好きそうなコンパイラ/, 'H1 の中身が HTML に焼かれる');
  assert.match(page.html, /fail-closed コンパイラ/, '特徴リストの中身が入る（クローラが JS 無しで読める）');
  assert.match(page.html, /<output[^>]*class="cval"[^>]*>0<\/output>/, '対話要素も初期値でサーバ描画');
  assert.match(page.styles, /\.lp\[data-s[0-9a-z]+\]/, 'scoped CSS を収集（compound scope）');
  assert.equal(page.meta.title, 'sunao — AI が好きそうなコンパイラ');
  assert.match(page.meta.description, /決定論/);
});

test('SSG: server モードで now/interval を使う部品も hang せず描画（タイマー漏れ無し）', async () => {
  // これ自体が「Node で prerender してもプロセスが固まらない」ことの回帰ガード。
  const page = await prerenderSFC('fixtures/app-ui/DeployConsole.sunao');
  assert.ok(page.html.length > 0, 'DeployConsole が文字列描画される');
});

test('reactivity: per-item signal 読み（bound な item の呼び出し）は thunk 化＝更新が反映される', () => {
  // 以前は「ctx を参照しない＝静的」と誤判定し、{{ r.label() }} が更新漏れしていた回帰ガード。
  const r = compileTemplate('<li v-for="r in rows()" :key="r.id">{{ r.label() }}</li>', { signals: new Set(['rows']) });
  assert.match(r.render, /\(\) => String\(r\.label\(\)\)/, 'call を含む式は reactive');
  const cls = compileTemplate('<li v-for="r in rows()" :key="r.id" :class="r.on() ? \'a\' : \'\'">x</li>', { signals: new Set(['rows']) });
  assert.match(cls.render, /"class": \(\) => \(r\.on\(\)/, ':class の per-item signal も reactive');
  const s = compileTemplate('<li v-for="r in rows()" :key="r.id">{{ r.id }}</li>', { signals: new Set(['rows']) });
  assert.doesNotMatch(s.render, /\(\) => String\(r\.id\)/, 'call 無しは静的のまま（過剰 effect を作らない）');
});

test('④ batch(): 複数 set を 1 回の effect 実行に畳む（既定は同期・都度実行）', () => {
  const a = signal(1), b = signal(2);
  let runs = 0;
  effect(() => { a(); b(); runs++; });
  assert.equal(runs, 1, '初回');
  a.set(10); b.set(20);
  assert.equal(runs, 3, '既定は set ごとに実行（2回）');
  batch(() => { a.set(100); b.set(200); });
  assert.equal(runs, 4, 'batch 内の 2 set は 1 回に畳む');
  assert.equal(a(), 100);
  assert.equal(b(), 200);
  // 同値 set は畳んでも通知しない
  batch(() => { a.set(100); });
  assert.equal(runs, 4);
});

test('② 仮想化 windowed(): 可視 slice・offsetY・total、スクロールで窓が動く', () => {
  const items = signal(Array.from({ length: 10000 }, (_, i) => ({ id: i })));
  const vp = windowed(items, { rowHeight: 20, height: 400, overscan: 2 }); // count = 20 + 4 = 24
  assert.equal(vp.total(), 10000 * 20, '総高さ = 件数 × rowHeight');
  assert.equal(vp.offsetY(), 0);
  assert.equal(vp.visible().length, 24, '描画は可視ぶん（数十件）だけ＝実 DOM を抑える');
  assert.equal(vp.visible()[0].id, 0);
  // 5000 行分スクロール → 窓がそこへ移動
  vp.onScroll({ target: { scrollTop: 5000 * 20 } });
  assert.equal(vp.visible()[0].id, 5000 - 2, 'overscan ぶん手前から');
  assert.equal(vp.offsetY(), (5000 - 2) * 20);
  assert.equal(vp.visible().length, 24, '窓の大きさは一定');
  // 末尾へスクロールしても範囲外にはみ出ない
  vp.onScroll({ target: { scrollTop: 1e9 } });
  assert.equal(vp.visible()[vp.visible().length - 1].id, 9999, '末尾で clamp');
  assert.throws(() => windowed(items, { rowHeight: 20 }), /height/, 'height 必須（fail-closed）');
});

test('② 可変高仮想化 windowedVar(): estimate→実測補正で total/visible/top が正しく動く', () => {
  const items = signal(Array.from({ length: 1000 }, (_, i) => ({ id: i })));
  const vp = windowedVar(items, { estimate: 50, height: 200, overscan: 1 });
  assert.equal(vp.total(), 1000 * 50, '初期は estimate 総和');
  let v = vp.visible();
  assert.equal(v[0].index, 0);
  assert.equal(v[0].top, 0);
  assert.ok(v.length >= 4 && v.length <= 8, '可視ぶん（数件）だけ');
  // 実測補正: 先頭 10 件を 100px に（推定 50 の倍）
  for (let i = 0; i < 10; i++) vp.measure(i, 100);
  assert.equal(vp.total(), 10 * 100 + 990 * 50, '実測ぶんが total に反映');
  // 120px スクロール → 実測(100px)基準で index 1 付近から
  vp.onScroll({ target: { scrollTop: 120 } });
  v = vp.visible();
  assert.equal(v[0].index, 0, 'overscan=1 で 1 手前（index1 の 1 手前=0）');
  // top が実測の累積（index 2 の top = 100+100 = 200）
  const two = v.find((x) => x.index === 2);
  assert.equal(two.top, 200, 'top は実測高さの累積オフセット');
  assert.throws(() => windowedVar(items, {}), /height/);
});

test('式パーサ(AST): arrow/分割の仮引数は ctx 参照にしない・shorthand は拾う（regex の誤収集を修正）', () => {
  const a = compileTemplate('<button @click="rows().forEach(r => pick(r))">x</button>');
  assert.ok(a.used.includes('rows') && a.used.includes('pick'), '自由変数は集める');
  assert.ok(!a.used.includes('r'), 'arrow 仮引数 r は束縛済み扱い（regex は誤収集していた）');
  const b = compileTemplate('<b>{{ items().map(({id}) => id).join(",") }}</b>');
  assert.ok(b.used.includes('items') && !b.used.includes('id'), '分割仮引数 id も束縛済み');
  const c = compileTemplate('<div :data-x="{ n }">y</div>');
  assert.ok(c.used.includes('n'), 'object shorthand は参照として拾う');
  const d = compileTemplate('<b>{{ a.b.c }}</b>');
  assert.ok(d.used.includes('a') && !d.used.includes('b') && !d.used.includes('c'), 'member の非computed プロパティは参照でない');
  const e = compileTemplate('<b>{{ arr[i] }}</b>');
  assert.ok(e.used.includes('arr') && e.used.includes('i'), 'computed member の添字は参照');
});

test('式パーサ(AST): arrow 仮引数を未宣言参照と誤検出しない（fail-closed の誤爆修正）', () => {
  // regex 版は x を ctx 参照として集め → 未宣言(SUNAO_UNDECLARED_REF)で誤爆していた。AST は x を束縛扱い。
  const src = `<template><button @click="list().forEach(x => pick(x))">go</button></template>` +
    `<script>export default { setup(){ const list = signal([]); const pick = (x)=>x; return { list, pick }; } }</script>`;
  assert.doesNotThrow(() => compileSFC(src, { runtime: RUNTIME }));
});

test('エディタ支援: diagnose() は error/warning を throw せず LSP 風に返す', () => {
  // error（fail-closed）: 未知ディレクティブ。line/column/suggestions つき、throw しない。
  const bad = diagnose('<template><div v-bogus="x">y</div></template>', { filename: 'B.sunao' });
  assert.equal(bad.filename, 'B.sunao');
  const err = bad.diagnostics.find((d) => d.severity === 'error');
  assert.ok(err && err.code === 'SUNAO_UNKNOWN_DIRECTIVE');
  assert.ok(err.suggestions.includes('v-if'));
  assert.equal(typeof err.line, 'number');
  // warning（非致命）: () 呼び忘れ。error と別severity で載る。
  const warnSrc = `<template><b>{{ count }}</b></template><script>export default { setup(){ const count = signal(0); return { count }; } }</script>`;
  const w = diagnose(warnSrc);
  assert.ok(w.diagnostics.some((d) => d.severity === 'warning' && d.code === 'SUNAO_CALL_FORGOTTEN'));
  assert.ok(!w.diagnostics.some((d) => d.severity === 'error'), '正しい SFC に error は無い');
  // 正常な SFC: 診断ゼロ
  const ok = diagnose(readFileSync('fixtures/app-ui/Counter.sunao', 'utf8'));
  assert.equal(ok.diagnostics.filter((d) => d.severity === 'error').length, 0);
});

test('④ source map: sourcemap:true で inline map が付き、script 行へ対応する', () => {
  const src = `<template><b>{{ n() }}</b></template>\n<script>\nexport default {\n  setup() {\n    const n = signal(0);\n    return { n };\n  },\n};\n</script>\n`;
  assert.doesNotMatch(compileSFC(src, { runtime: RUNTIME }), /sourceMappingURL/, '既定では map 無し（予算に載せない）');
  const withMap = compileSFC(src, { runtime: RUNTIME, sourcemap: true, filename: 'X.sunao' });
  const m = /sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)/.exec(withMap);
  assert.ok(m, 'inline map が付く');
  const map = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
  assert.equal(map.version, 3);
  assert.deepEqual(map.sources, ['X.sunao']);
  assert.equal(map.sourcesContent[0], src, 'ソース本文を同梱（.sunao が無くても解決）');
  assert.ok(map.mappings.length > 0);
});

test('① 静的 v-for 最適化: 裸の非 signal リストは thunk 化しない（hydrate で adopt 可）', () => {
  // features は const 配列（非 signal）→ 依存が無く thunk は無意味 → 静的 map
  const rStatic = compileTemplate('<li v-for="f in features">{{ f.title }}</li>', { signals: new Set() });
  assert.doesNotMatch(rStatic.render, /\(\) => \(features\)\.map/, '非 signal リストは thunk 化しない');
  assert.match(rStatic.render, /\(features\)\.map/);
  // signal リスト（tasks()）は従来どおり reactive thunk
  const rDyn = compileTemplate('<li v-for="t in tasks()" :key="t.id">{{ t.id }}</li>', { signals: new Set(['tasks']) });
  assert.match(rDyn.render, /\(\) => keyed\(/, 'keyed は reactive thunk のまま');
});

test('time: interval は発火し stop で止まる / debounce は最後の一回に畳む', async () => {
  let ticks = 0;
  const stop = interval(20, () => ticks++);
  await new Promise((r) => setTimeout(r, 75));
  stop();
  const after = ticks;
  assert.ok(ticks >= 2, 'interval が複数回発火');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(ticks, after, 'stop 後は増えない');

  let calls = 0;
  const d = debounce(() => calls++, 30);
  d(); d(); d();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls, 1, 'debounce は最後の一回だけ');
});

test('async: resource は loading→data、失敗は error（Go の context 相当で abort 可能）', async () => {
  const res = resource(() => new Promise((r) => setTimeout(() => r(42), 20)));
  assert.equal(res.loading(), true);
  assert.equal(res(), null);
  await new Promise((r) => setTimeout(r, 45));
  assert.equal(res.loading(), false);
  assert.equal(res(), 42);
  const bad = resource(() => Promise.reject(new Error('boom')));
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(bad.error(), 'error に入る');
});

test('CSS/Recipe: recipeStyle が閉じた語彙 → CSS トークンを返す / vocab は schema 由来', () => {
  const s = recipeStyle({ palette: 'command-center', density: 'comfortable' });
  assert.match(s, /--k-accent:oklch/);
  assert.match(s, /--k-ink:oklch/);
  assert.deepEqual(RECIPE_KINDS, ['OWNER_QUESTION', 'ACTION_APPROVAL', 'OUTCOME_UNKNOWN_REVIEW', 'RESULT_REVIEW', 'INFORMATION']);
  assert.ok(RECIPE_PROPS.palette.enum.includes('command-center'));
});

test('借用: machine（状態機械）宣言外の遷移は fail-closed', () => {
  const m = machine({ initial: 'idle', states: { idle: { on: { START: 'run' } }, run: { on: { STOP: 'idle' } } } });
  assert.equal(m(), 'idle');
  m.send('START'); assert.equal(m(), 'run');
  assert.equal(m.can('STOP'), true);
  assert.throws(() => m.send('START'), /未定義のイベント/); // run 状態に START は無い
  m.send('STOP'); assert.equal(m(), 'idle');
});

test('借用: store（Elm/Redux）純 update とタイムトラベル', () => {
  const s = store(0, (n, msg) => (msg === 'inc' ? n + 1 : msg === 'dec' ? n - 1 : n));
  s.dispatch('inc'); s.dispatch('inc'); assert.equal(s(), 2);
  s.undo(); assert.equal(s(), 1);
  s.redo(); assert.equal(s(), 2);
  assert.deepEqual(s.history(), [0, 1, 2]);
});

test('借用: decode（Zod/Elm）不正データは path つきで fail-closed', () => {
  const schema = { id: 'number', name: 'string', tags: ['array', 'string'] };
  assert.deepEqual(decode(schema, { id: 1, name: 'a', tags: ['x'] }), { id: 1, name: 'a', tags: ['x'] });
  assert.throws(() => decode(schema, { id: '1', name: 'a', tags: [] }), /\$\.id は number/);
  assert.throws(() => decode(schema, { id: 1, name: 'a', tags: [3] }), /\$\.tags\[0\] は string/);
});

test('借用: match（Rust 網羅）未対応は fail-closed', () => {
  assert.equal(match('A', { A: () => 1, B: 2 }), 1);
  assert.equal(match('B', { A: 1, B: 2 }), 2);
  assert.equal(match('Z', { A: 1, _: 9 }), 9);
  assert.throws(() => match('Z', { A: 1, B: 2 }), /未対応の値/);
});

test('借用: produce（Immer）は元を壊さず新オブジェクトを返す', () => {
  const base = { a: 1, nested: { b: 2 } };
  const next = produce(base, (d) => { d.a = 9; d.nested.b = 3; });
  assert.equal(base.a, 1); assert.equal(base.nested.b, 2);
  assert.equal(next.a, 9); assert.equal(next.nested.b, 3);
});

test('借用: boundary（let it crash + 復帰）子の例外を fallback に置換', () => {
  const ok = boundary(() => 'fine', (e) => 'err:' + e.message);
  assert.equal(ok(), 'fine');
  const bad = boundary(() => { throw new Error('boom'); }, (e) => 'err:' + e.message);
  assert.equal(bad(), 'err:boom');
});

test('借用: provide/inject（context）親→子へ prop drilling 無しで伝播', () => {
  const Child = { name: 'C', props: {}, setup: () => ({ got: inject('k', 'def') }), render: (ctx) => ctx.got };
  const Parent = { name: 'P', props: {}, setup: () => { provide('k', 'V'); return {}; }, render: () => component(Child, {}) };
  assert.equal(component(Parent, {}), 'V');
});

test('④ 合成: import されていないコンポーネント参照は止まる', () => {
  const src = `<template><div><Foo :x="1"/></div></template><script>export default { setup(){ return {}; } }</script>`;
  assert.throws(() => compileSFC(src, { runtime: RUNTIME }), /import されていません/);
});

test('④ 合成(e2e): 親が子を型付き props で描画する', async () => {
  const r = await esbuild.build({ entryPoints: ['fixtures/app-ui/Parent.sunao'], bundle: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const dir = mkdtempSync(join(tmpdir(), 'cx-'));
  try {
    const f = join(dir, 'Parent.mjs');
    writeFileSync(f, r.outputFiles[0].contents);
    const Parent = (await import(pathToFileURL(f).href)).default;
    const html = renderComponentToString(Parent);
    assert.match(html, /こんにちは、Alice さん（1 回目）/);
    assert.match(html, /こんにちは、Bob さん（1 回目）/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('① keyed v-for: :key は keyed() を生成する', () => {
  const r = compileTemplate('<ul><li v-for="t in xs()" :key="t.id">{{ t.id }}</li></ul>');
  assert.match(r.render, /keyed\(/);
  assert.doesNotMatch(r.render, /"key":/); // :key は DOM 属性として出さない
});

test('② router: matchRoute がパターンとパスを照合する（末尾 * は前方一致）', () => {
  assert.deepEqual(matchRoute('/day/:date', '/day/2026-9-15'), { date: '2026-9-15' });
  assert.deepEqual(matchRoute('/', '/'), {});
  assert.equal(matchRoute('/day/:date', '/other'), null);
  assert.deepEqual(matchRoute('/settings/*', '/settings/a/b'), { '*': 'a/b' });
  assert.equal(matchRoute('/settings/*', '/other'), null);
});

test('② router: ガードで遷移を中止/リダイレクトできる', () => {
  const route = useRoute();
  navigate('/base');
  setRouteGuard((to) => (to === '/blocked' ? false : to === '/redir' ? '/ok' : true));
  navigate('/allowed'); assert.equal(route.peek(), '/allowed');
  navigate('/blocked'); assert.equal(route.peek(), '/allowed', 'ガードで中止');
  navigate('/redir'); assert.equal(route.peek(), '/ok', 'リダイレクト');
  setRouteGuard(null);
});

test('unmount: createRoot dispose で内部 effect が止まる（keyed の一括破棄基盤）', () => {
  const n = signal(0);
  let runs = 0;
  const root = createRoot(() => { effect(() => { n(); runs++; }); });
  assert.equal(runs, 1);
  n.set(1); assert.equal(runs, 2);
  root.dispose();
  n.set(2); assert.equal(runs, 2, 'dispose 後は再実行しない');
});

test('slots: 親の子要素が子の <slot> に差し込まれる', async () => {
  const r = await esbuild.build({ entryPoints: ['fixtures/app-ui/SlotHost.sunao'], bundle: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const dir = mkdtempSync(join(tmpdir(), 'sl-'));
  try {
    const f = join(dir, 'S.mjs');
    writeFileSync(f, r.outputFiles[0].contents);
    const Host = (await import(pathToFileURL(f).href)).default;
    const html = renderComponentToString(Host);
    assert.match(html, /<div class="card-body"><p class="slotted">スロット差し込み: こんにちは<\/p><\/div>/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('③ factory: node check.mjs が全部品で通る（exit 0）', () => {
  // 失敗なら execFileSync が throw する
  execFileSync('node', ['check.mjs'], { stdio: 'pipe' });
});

test('実例: カレンダーが作れる（コンパイル・描画・月移動・日付選択）', async () => {
  const r = await esbuild.build({ entryPoints: ['fixtures/app-ui/Calendar.sunao'], bundle: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const dir = mkdtempSync(join(tmpdir(), 'cal-'));
  try {
    const f = join(dir, 'Cal.mjs');
    writeFileSync(f, r.outputFiles[0].contents);
    const Cal = (await import(pathToFileURL(f).href)).default;
    const html = renderComponentToString(Cal);
    assert.match(html, /class="dow"/); // 曜日ヘッダ
    assert.equal((html.match(/class="cell/g) || []).length >= 28, true); // 日セル
    // ロジック: 月移動 / ルーティングで日詳細へ / 予定追加
    const ctx = Cal.setup();
    const before = ctx.label();
    ctx.next();
    assert.notEqual(ctx.label(), before, '次の月へ');
    const someDay = ctx.cells().find((c) => !c.blank);
    ctx.pick(someDay); // navigate('/day/...') → route が変わる
    assert.match(ctx.dayParam(), /\d+-\d+-\d+/, 'ルーティングで日詳細パラメータが立つ');
    ctx.draft.set('打合せ 14:00');
    ctx.add();
    assert.deepEqual(ctx.dayEvents(), ['打合せ 14:00'], '予定が追加される');
    ctx.back(); // navigate('/')
    assert.equal(ctx.dayParam(), '', '月ビューへ戻る');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('compile: 許可された文法は通る', () => {
  const r = compileTemplate('<ul><li v-for="x in xs()" v-if="x">{{ x }}</li></ul>');
  assert.match(r.render, /\.map\(\(x\)/);
  assert.ok(r.used.includes('xs'));
});

test('renderToString: 状態スナップショットで正しい HTML（決定論）', async () => {
  // コンパイル済みモジュールを一時ファイルに書いて import して描画
  const src = readFileSync('fixtures/app-ui/Counter.sunao', 'utf8');
  const mod = compileSFC(src, { runtime: RUNTIME });
  const dir = mkdtempSync(join(tmpdir(), 'mv-'));
  try {
    const f = join(dir, 'Counter.mjs');
    writeFileSync(f, mod);
    const comp = (await import(pathToFileURL(f).href)).default;
    const html1 = renderComponentToString(comp);
    const html2 = renderComponentToString(comp);
    assert.equal(html1, html2, '同状態→同 HTML');
    assert.match(html1, /<h1>sunao カウンタ<\/h1>/);
    assert.match(html1, /<output class="value">0<\/output>/);
    // count()===0 なので v-if は描画されない
    assert.doesNotMatch(html1, /現在値は/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reactivity + render: setup 経由で状態を進めると HTML が変わる', async () => {
  const src = readFileSync('fixtures/app-ui/Counter.sunao', 'utf8');
  const mod = compileSFC(src, { runtime: RUNTIME });
  const dir = mkdtempSync(join(tmpdir(), 'mv-'));
  try {
    const f = join(dir, 'Counter.mjs');
    writeFileSync(f, mod);
    const comp = (await import(pathToFileURL(f).href)).default;
    const ctx = comp.setup();
    ctx.inc();
    ctx.inc();
    const { renderToString } = await import('../plugins/sunao/runtime.mjs');
    const html = renderToString(comp.render(ctx));
    assert.match(html, /<output class="value">2<\/output>/);
    assert.match(html, /現在値は 2 です/); // v-if 真
    assert.match(html, /<li>1<\/li><li>2<\/li>/); // v-for（history=[1,2]）
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('① v-for: "(item, i) in list" で index が束縛される', () => {
  const r = compileTemplate('<li v-for="(row, i) in rows()" :key="row.id">{{ i }}:{{ row.name }}</li>');
  assert.match(r.render, /\(row, i\) =>/, 'index パラメータが出る');
  assert.match(r.render, /keyed\(/, ':key があれば keyed');
  assert.ok(r.used.includes('rows'), 'list 式の自由識別子は ctx から取る');
  assert.ok(!r.used.includes('i'), 'index は束縛済み（未宣言参照にならない）');
  assert.ok(!r.used.includes('row'), 'item は束縛済み');
});

test('① keyed component: <Child :key> は keyed() で再利用される', () => {
  const src = `<template><Row v-for="r in rows()" :key="r.id" :name="r.name"/></template>` +
    `<script>import Row from './Row.sunao';\nexport default { setup(){ const rows = signal([]); return { rows }; } }</script>`;
  const mod = compileSFC(src, { runtime: RUNTIME });
  assert.match(mod, /keyed\(/, 'component + :key は keyed 経路');
  assert.match(mod, /component\(Row/, 'Row を component() で描画');
});

test('① flip 属性: keyed v-for に FLIP フラグ（第4引数 true）が付く', () => {
  const r = compileTemplate('<li v-for="x in xs()" :key="x.id" flip>{{ x.n }}</li>');
  assert.match(r.render, /keyed\([^;]*,\s*true\)/, 'flip で keyed(..., true)');
  assert.doesNotMatch(r.render, /flip=/, 'flip は DOM 属性として出さない');
});

test('① () 呼び忘れ警告: 値位置の裸 signal を別所で呼んでいれば警告（非致命）', () => {
  // count は {{ count }} で裸、@click で count() と呼ばれている → 呼び忘れ濃厚
  const r = compileTemplate('<button @click="count()">{{ count }}</button>');
  assert.ok(r.warnings.length >= 1, '警告が出る');
  assert.equal(r.warnings[0].code, 'SUNAO_CALL_FORGOTTEN');
  assert.equal(r.warnings[0].ident, 'count');
});

test('① () 呼び忘れ警告: 正しく count() と書けば警告なし', () => {
  const r = compileTemplate('<button @click="count()">{{ count() }}</button>');
  assert.equal(r.warnings.length, 0, '両方 () なら警告なし');
});

test('① () 呼び忘れ穴埋め: 一度も呼んでいない裸 signal でも script 走査で警告', () => {
  // {{ count }} だけ・どこでも count() と呼んでいない silent ケース（従来は見逃していた穴）
  const src = `<template><b>{{ count }}</b></template>` +
    `<script>export default { setup(){ const count = signal(0); return { count }; } }</script>`;
  const ws = warningsOf(src);
  assert.ok(ws.some((w) => w.ident === 'count' && w.code === 'SUNAO_CALL_FORGOTTEN'), 'signal 束縛の裸参照を検出');
  // props も accessor＝裸参照は呼び忘れ
  const src2 = `<template><b>{{ title }}</b></template>` +
    `<script>export default { props:{ title:{type:'string'} }, setup(){ return {}; } }</script>`;
  assert.ok(warningsOf(src2).some((w) => w.ident === 'title'), 'props の裸参照も検出');
  // 正しく呼べば警告なし
  assert.equal(warningsOf(`<template><b>{{ count() }}</b></template><script>export default { setup(){ const count = signal(0); return { count }; } }</script>`).length, 0);
});

test('① warningsOf: SFC 全体から警告を非致命で取り出す', () => {
  const src = `<template><b @click="n.update(v=>v+1)" :class="n() > 3 ? 'hot' : ''">{{ n }}</b></template>` +
    `<script>export default { setup(){ const n = signal(0); return { n }; } }</script>`;
  const ws = warningsOf(src);
  assert.ok(ws.some((w) => w.ident === 'n' && w.code === 'SUNAO_CALL_FORGOTTEN'));
  // コンパイルエラーになる SFC でも警告取得は throw しない（ベストエフォート）
  assert.deepEqual(warningsOf('<template><div v-bogus="x"></div></template>'), []);
});
