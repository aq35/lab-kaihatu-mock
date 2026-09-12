import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import esbuild from 'esbuild';
import { signal, effect, computed, batch, component, validateProps, matchRoute, createRoot, useRoute, navigate, setRouteGuard, interval, debounce, resource, machine, store, decode, match, produce, boundary, provide, inject, windowed, windowedVar, renderComponentToString } from '../sunao/runtime.mjs';
import { recipeStyle } from '../sunao/theme.mjs';
import { RECIPE_PROPS, RECIPE_KINDS } from '../sunao/recipe-vocab.mjs';
import { compileSFC, compileTemplate, analyze, warningsOf, diagnose, CompileError } from '../sunao/compile.mjs';
import { formatSFC } from '../sunao/format.mjs';
import { manifest, autofix } from '../sunao/compile.mjs';
import { sunao } from '../sunao/esbuild-plugin.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const RUNTIME = resolve('sunao/runtime.mjs');

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
  const src = readFileSync('examples/app-ui/Counter.sunao', 'utf8');
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

test('audit(fmt): content 非破壊 — 属性/補間文字列/インライン混在/pre を壊さない', () => {
  const T = (inner) => formatSFC(`<template>${inner}</template>`);
  assert.match(T('<input value="a    b">'), /a    b/, '属性値の空白を保持');
  assert.match(T("<p>{{ label() || '  x  ' }}</p>"), /'  x  '/, '補間内の文字列を保持');
  assert.match(T('<span>$<b>5</b></span>'), /<span>\$<b>5<\/b><\/span>/, 'インライン混在に空白を足さない');
  const pre = T('<pre><code>a\nb</code></pre>');
  assert.doesNotMatch(pre, /\n\s+<code>/, 'pre は再インデントしない');
  const once = T('<div><ul><li>x</li></ul></div>');
  assert.equal(formatSFC(`<template>${'<div><ul><li>x</li></ul></div>'}</template>`), once, '冪等');
  // 壊れたテンプレは原文を保つ（throw しない）
  assert.doesNotThrow(() => formatSFC('<template><div><span></div></template>'));
});

test('scaffold: npm run new が雛形を出し、そのままビルドできる', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scaf-'));
  const app = join(dir, 'todo');
  try {
    execFileSync('node', ['cli/create.mjs', app], { stdio: 'ignore' });
    for (const f of ['App.sunao', 'main.js', 'index.html', 'README.md']) assert.ok(existsSync(join(app, f)), `${f} が生成される`);
    // 生成物がそのまま esbuild+sunao で通る（scss 含む）
    const r = await esbuild.build({ entryPoints: [join(app, 'main.js')], bundle: true, minify: true, format: 'iife', write: false, plugins: [sunao()], logLevel: 'silent' });
    assert.ok(r.outputFiles[0].contents.length > 0, 'バンドルできる');
    // 上書きガード: 2 回目は既存ファイルを検出して非ゼロ終了（App.sunao だけでなく全ファイル）
    assert.throws(() => execFileSync('node', ['cli/create.mjs', app], { stdio: 'ignore' }), '既存 dir は上書きしない');
    // .. 脱出は拒否
    assert.throws(() => execFileSync('node', ['cli/create.mjs', '../evil'], { stdio: 'ignore' }), '.. は拒否');
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
  const r = await esbuild.build({ entryPoints: ['examples/app-ui/OwnerCard.sunao'], bundle: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
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
  const page = await prerenderSFC('examples/seo/Landing.sunao');
  assert.match(page.html, /AI が好きそうなコンパイラ/, 'H1 の中身が HTML に焼かれる');
  assert.match(page.html, /fail-closed コンパイラ/, '特徴リストの中身が入る（クローラが JS 無しで読める）');
  assert.match(page.html, /<output[^>]*class="cval"[^>]*>0<\/output>/, '対話要素も初期値でサーバ描画');
  assert.match(page.styles, /\.lp\[data-s[0-9a-z]+\]/, 'scoped CSS を収集（compound scope）');
  assert.equal(page.meta.title, 'sunao — AI が好きそうなコンパイラ');
  assert.match(page.meta.description, /決定論/);
});

test('SSG: server モードで now/interval を使う部品も hang せず描画（タイマー漏れ無し）', async () => {
  // これ自体が「Node で prerender してもプロセスが固まらない」ことの回帰ガード。
  const page = await prerenderSFC('examples/app-ui/DeployConsole.sunao');
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

test('DX: autofix() は () 呼び忘れ（式全体が裸 signal）だけを name() に精密修正', () => {
  const src = '<template><b>{{ count }}</b><i :class="count">x</i><em>{{ count() + 1 }}</em></template>' +
    '<script>export default { setup(){ const count = signal(0); return { count }; } }</script>';
  const fixed = autofix(src);
  assert.match(fixed, /\{\{ count\(\) \}\}/, '{{ count }} を修正');
  assert.match(fixed, /:class="count\(\)"/, ':class を修正');
  assert.match(fixed, /count\(\) \+ 1/, '既に正しい部分式は二重修正しない');
  assert.equal(warningsOf(fixed).filter((w) => w.code === 'SUNAO_CALL_FORGOTTEN').length, 0, '警告が消える');
  // 修正不要なら原文をそのまま返す
  assert.equal(autofix('<template><b>{{ count() }}</b></template><script>export default { setup(){ const count = signal(0); return { count }; } }</script>').includes('count()()'), false, '二重付与しない');
});

test('DX: manifest() が部品契約を機械可読に（props/enum/slots/uses）', () => {
  const src = '<template><div><slot></slot><Child :name="a()"/></div></template>' +
    '<script>import Child from "./Child.sunao";\nexport default { name:"Host", props:{ palette:{ enum:["calm","editorial"], required:true }, size:{ type:"number" } }, setup(){ const a=signal(0); return { a }; } }</script>';
  const m = manifest(src, 'Host.sunao');
  assert.equal(m.name, 'Host');
  const pal = m.props.find((p) => p.name === 'palette');
  assert.deepEqual(pal.enum, ['calm', 'editorial'], 'enum を配列で');
  assert.equal(pal.required, true);
  assert.equal(m.props.find((p) => p.name === 'size').type, 'number');
  assert.equal(m.slots, true, '<slot> を検出');
  assert.ok(m.uses.some((u) => u.tag === 'Child'), '使用 component を列挙');
  assert.ok(m.signals.includes('a'), 'signal を列挙');
});

test('audit(compiler): 静的早道が directive/bind を漏らさない（v-if=false・:id）', () => {
  const a = compileSFC('<template><p v-if="false">SECRET</p></template>', { runtime: RUNTIME });
  assert.doesNotMatch(a, /static: true/, 'v-if は定数 HTML 化しない');
  assert.doesNotMatch(a, /v-if/, '生の v-if 属性が漏れない');
  const b = compileSFC('<template><div :id="\'main\'">hi</div></template>', { runtime: RUNTIME });
  assert.doesNotMatch(b, /:id=/, ':bind は属性としてリライト（生で漏れない）');
});

test('audit(compiler): setup return がネスト object でも未宣言参照を誤検出しない', () => {
  const src = '<template><p>{{ count() }}</p></template>' +
    '<script>export default { props:{title:{}}, setup(){ const count = signal(0); return { count, meta: { x: 1 } }; } }</script>';
  assert.doesNotThrow(() => compileSFC(src, { runtime: RUNTIME }));
});

test('audit(compiler): @keyframes の step は scope されない（animation が壊れない）', () => {
  const mod = compileSFC('<template><p class="a">x</p></template><style>@keyframes spin { 0% { opacity: 0 } 100% { opacity: 1 } }</style>', { runtime: RUNTIME });
  assert.match(mod, /0% \{/, 'step selector はそのまま');
  assert.doesNotMatch(mod, /0%\[data-s/, 'step に scope 属性を付けない');
  assert.match(mod, /@keyframes spin/);
});

test('audit(compiler): 補間の < と 文字列内 }} を正しく扱う', () => {
  assert.doesNotThrow(() => compileTemplate('<p>{{ n() < 10 ? "few" : "many" }}</p>', { signals: new Set(['n']) }), '< 比較');
  const r = compileTemplate('<p>{{ label() || "}}" }}</p>', { signals: new Set(['label']) });
  assert.match(r.render, /label\(\) \|\| "\}\}"/, '文字列内の }} を跨いで対応');
  const o = compileTemplate('<p>{{ ({a:1}).a }}</p>', {});
  assert.match(o.render, /\(\{a:1\}\)\.a/, 'ネスト波括弧を跨ぐ');
});

test('audit(compiler): 単引用符の属性値を保持', () => {
  const r = compileTemplate("<input type='text' class='big'>", {});
  assert.match(r.render, /"type": "text"/);
  assert.match(r.render, /"class": "big"/);
});

test('audit(compiler): arrow 既定値の外部参照は自由変数として拾う', () => {
  const r = compileTemplate('<p>{{ ((a = greeting) => a)() }}</p>', {});
  assert.ok(r.used.includes('greeting'), '既定値 greeting を ctx から destructure');
});

test('audit(compiler): member 呼び出しの object を「呼んだ」扱いにしない（誤 () 警告なし）', () => {
  // user.getName() があっても、{{ user() }} でなく {{ user.name }} なら user への呼び忘れ警告は出ない
  const r = compileTemplate('<div>{{ user.getName() }}<b>{{ user.name }}</b></div>', { signals: new Set() });
  assert.equal(r.warnings.length, 0);
});

test('audit(compiler): analyze の type は type: 以外の quoted 値を拾わない', () => {
  const a = analyze('<template><p>{{ msg() }}</p></template><script>export default { name:"X", props:{ msg:{ default:"hello" } }, setup(){return{}} }</script>');
  assert.equal(a.props.msg.type, null);
});

test('audit: 破棄済み effect は伝播中に復活しない（ゾンビ防止）', () => {
  const show = signal(true);
  let creates = 0, runs = 0;
  effect(() => { if (show()) { creates++; effect(() => { show(); runs++; }); } });
  show.set(false); show.set(true); show.set(false); show.set(true);
  assert.equal(runs, creates, '子 effect の実行回数=生成回数（復活・累積しない）');
});

test('audit: match/machine は prototype チェーンを歩かない', () => {
  assert.throws(() => match('toString', { ok: () => 1 }), /未対応/, 'toString は _ 無しで throw');
  assert.equal(match('toString', { ok: () => 1, _: () => 'fb' }), 'fb', '_ にフォールバック');
  const m = machine({ initial: 'idle', states: { idle: { on: { GO: 'run' } }, run: { on: {} } } });
  assert.equal(m.can('toString'), false, 'can(toString) は false');
  assert.throws(() => m.send('hasOwnProperty'), /未定義のイベント/, 'prototype キーは未定義イベント');
});

test('audit: windowedVar は length 変化で実測高さを捨てない（append で jump しない）', () => {
  const items = signal(Array.from({ length: 10 }, (_, i) => ({ id: i })));
  const vp = windowedVar(items, { estimate: 30, height: 200 });
  for (let i = 0; i < 10; i++) vp.measure(i, 100); // 全部 100px に実測
  assert.equal(vp.total(), 10 * 100, '実測反映');
  items.set([...items(), { id: 10 }]); // append 1
  assert.equal(vp.total(), 10 * 100 + 30, '既存 10 件の実測を保持＋新規のみ estimate（全捨てしない）');
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
  const ok = diagnose(readFileSync('examples/app-ui/Counter.sunao', 'utf8'));
  assert.equal(ok.diagnostics.filter((d) => d.severity === 'error').length, 0);
});

test('DX: diagnose の fix ヒント（() 呼び忘れ→name()・未知ディレクティブ→候補）', () => {
  const w = diagnose('<template><b>{{ count }}</b></template><script>export default { setup(){ const count = signal(0); return { count }; } }</script>');
  const cf = w.diagnostics.find((d) => d.code === 'SUNAO_CALL_FORGOTTEN');
  assert.equal(cf.fix, 'count()', 'signal 呼び忘れの fix は name()');
  const e = diagnose('<template><div v-bogus="x">y</div></template>');
  assert.equal(e.diagnostics.find((d) => d.severity === 'error').fix, 'v-if', '未知ディレクティブは最有力候補を fix に');
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
  const r = await esbuild.build({ entryPoints: ['examples/app-ui/Parent.sunao'], bundle: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
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
  const r = await esbuild.build({ entryPoints: ['examples/app-ui/SlotHost.sunao'], bundle: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
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

test('③ factory: node cli/check.mjs が全部品で通る（exit 0）', () => {
  // 失敗なら execFileSync が throw する
  execFileSync('node', ['cli/check.mjs'], { stdio: 'pipe' });
});

test('実例: カレンダーが作れる（コンパイル・描画・月移動・日付選択）', async () => {
  const r = await esbuild.build({ entryPoints: ['examples/app-ui/Calendar.sunao'], bundle: true, format: 'esm', write: false, plugins: [sunao()], logLevel: 'silent' });
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
  const src = readFileSync('examples/app-ui/Counter.sunao', 'utf8');
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
  const src = readFileSync('examples/app-ui/Counter.sunao', 'utf8');
  const mod = compileSFC(src, { runtime: RUNTIME });
  const dir = mkdtempSync(join(tmpdir(), 'mv-'));
  try {
    const f = join(dir, 'Counter.mjs');
    writeFileSync(f, mod);
    const comp = (await import(pathToFileURL(f).href)).default;
    const ctx = comp.setup();
    ctx.inc();
    ctx.inc();
    const { renderToString } = await import('../sunao/runtime.mjs');
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

// ---- v0.13: 依存ゼロの自前式パーサ expr.mjs（@babel/parser 置換）----
import { parseExpressionString, parseProgramString } from '../sunao/expr.mjs';

// テスト用に compile.mjs と同じ意味論の walker を最小再現し、free-var / call を確かめる。
const _META = new Set(['type', 'start', 'end', 'loc', 'range', 'extra']);
const _GLOB = new Set(['Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'console', 'window', 'document', '$event', 'event', 'parseInt', 'parseFloat', 'isNaN', 'NaN', 'Infinity', 'undefined']);
function _bind(node, set) {
  if (!node || typeof node !== 'object') return;
  switch (node.type) {
    case 'Identifier': set.add(node.name); return;
    case 'AssignmentPattern': _bind(node.left, set); return;
    case 'RestElement': _bind(node.argument, set); return;
    case 'ArrayPattern': for (const e of node.elements) _bind(e, set); return;
    case 'ObjectPattern': for (const p of node.properties) p.type === 'RestElement' ? _bind(p.argument, set) : _bind(p.value, set); return;
  }
}
function _walk(node, scopes, used, calls) {
  if (!node || typeof node !== 'object') return;
  const declared = (n) => scopes.some((s) => s.has(n));
  switch (node.type) {
    case 'Identifier': if (!declared(node.name) && !_GLOB.has(node.name)) used.add(node.name); return;
    case 'MemberExpression': case 'OptionalMemberExpression': _walk(node.object, scopes, used, calls); if (node.computed) _walk(node.property, scopes, used, calls); return;
    case 'ObjectProperty': case 'Property': if (node.computed) _walk(node.key, scopes, used, calls); _walk(node.value, scopes, used, calls); return;
    case 'ArrowFunctionExpression': case 'FunctionExpression': case 'ObjectMethod': case 'FunctionDeclaration': {
      const s = new Set(); for (const p of node.params || []) _bind(p, s); if (node.id && node.id.type === 'Identifier') s.add(node.id.name);
      scopes.push(s); for (const p of node.params || []) if (p && p.type === 'AssignmentPattern') _walk(p.right, scopes, used, calls);
      _walk(node.body, scopes, used, calls); scopes.pop(); return;
    }
    case 'CallExpression': case 'OptionalCallExpression': if (calls && node.callee && node.callee.type === 'Identifier') calls.add(node.callee.name); break;
  }
  for (const k in node) { if (_META.has(k)) continue; const v = node[k]; if (Array.isArray(v)) { for (const c of v) _walk(c, scopes, used, calls); } else if (v && typeof v === 'object' && typeof v.type === 'string') _walk(v, scopes, used, calls); }
}
function _an(src, bound = []) {
  let ast; try { ast = parseExpressionString(src); } catch { ast = parseProgramString(src); }
  const used = new Set(), calls = new Set(); _walk(ast, [new Set(bound)], used, calls);
  return { used: [...used].sort(), calls: [...calls].sort() };
}

test('v0.13 expr: member callee は call に記録しない（user.getName()）', () => {
  assert.deepEqual(_an('user.getName()'), { used: ['user'], calls: [] });
});
test('v0.13 expr: identifier callee のみ call 記録（label(t.prio())）', () => {
  assert.deepEqual(_an('label(t.prio())'), { used: ['label', 't'], calls: ['label'] });
});
test('v0.13 expr: object literal のキーは自由変数でない / shorthand は辿る', () => {
  assert.deepEqual(_an('{a:1}.a'), { used: [], calls: [] });
  assert.deepEqual(_an('{ x }'), { used: ['x'], calls: [] });
  assert.deepEqual(_an('{ [k]: v }'), { used: ['k', 'v'], calls: [] });
});
test('v0.13 expr: arrow 仮引数はスコープされ、既定値の外側参照は拾う', () => {
  assert.deepEqual(_an('items.map(x => x.n)'), { used: ['items'], calls: [] });
  assert.deepEqual(_an('(a = greeting) => a'), { used: ['greeting'], calls: [] });
});
test('v0.13 expr: optional chaining / テンプレリテラル / 文列', () => {
  assert.deepEqual(_an('a?.b?.c()'), { used: ['a'], calls: [] });
  assert.deepEqual(_an('`hi ${name()} ${x}`'), { used: ['name', 'x'], calls: ['name'] });
  assert.deepEqual(_an('a(); b()'), { used: ['a', 'b'], calls: ['a', 'b'] });
});
test('v0.13 expr: 解析不能な稀式は throw（呼び出し側は regex にフォールバック）', () => {
  assert.throws(() => parseExpressionString('@@@'));
});
test('v0.13 expr.mjs は第三者 import を一切持たない（依存ゼロ）', () => {
  const src = readFileSync(resolve('sunao/expr.mjs'), 'utf8');
  const imports = [...src.matchAll(/^\s*import\s.+?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(imports, [], 'expr.mjs は import を持たない');
  // compile.mjs も core は自前パーサ＋node標準のみ（@babel/parser 不使用）
  const csrc = readFileSync(resolve('sunao/compile.mjs'), 'utf8');
  assert.ok(!/@babel\/parser/.test(csrc.replace(/^.*依存ゼロ.*$/gm, '')), 'compile.mjs は @babel/parser を import しない');
});

// ---- v0.13: 文法ドリフト検出ガード（@babel/parser があるときだけ走る差分テスト）----
// core は依存ゼロ（@babel/parser 無しでも動く）。dev で babel が居れば「自前 vs Babel」を突き合わせ、
// 将来 JS 文法が増えて自前が Babel とズレた瞬間に赤くする。無ければ skip。
function _babelAnalyzerFrom(babel) {
  const opt = { plugins: ['optionalChaining', 'nullishCoalescingOperator'], errorRecovery: false };
  return (src) => {
    let a;
    try { a = babel.parseExpression(src, opt); }
    catch { try { a = babel.parseExpression(`(()=>{\n${src}\n})`, opt); } catch { return null; } }
    const u = new Set(), c = new Set(); _walk(a, [new Set()], u, c);
    return { used: [...u].sort(), calls: [...c].sort() };
  };
}
function _mineAnalyzer(src) {
  let a; try { a = parseExpressionString(src); } catch { try { a = parseProgramString(src); } catch { return null; } }
  const u = new Set(), c = new Set(); _walk(a, [new Set()], u, c);
  return { used: [...u].sort(), calls: [...c].sort() };
}

test('v0.13 差分ガード: 実 fixtures の全式で自前パーサ＝Babel（文法ドリフト検出）', async (t) => {
  let babel; try { babel = await import('@babel/parser'); } catch { t.skip('@babel/parser 未導入（core は依存ゼロ）'); return; }
  const { readdirSync } = await import('node:fs');
  const B = _babelAnalyzerFrom(babel);
  const walkDir = (d, out = []) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) { if (!['node_modules', 'dist', '.git'].includes(e.name)) walkDir(p, out); } else if (p.endsWith('.sunao')) out.push(p); } return out; };
  const exprs = new Set();
  for (const f of walkDir(resolve('examples'))) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\{\{([\s\S]*?)\}\}/g)) exprs.add(m[1].trim());
    for (const m of s.matchAll(/[:@][\w-]+\s*=\s*"([^"]*)"/g)) exprs.add(m[1].trim());
    for (const m of s.matchAll(/[:@][\w-]+\s*=\s*'([^']*)'/g)) exprs.add(m[1].trim());
    for (const m of s.matchAll(/v-(?:if|else-if|show|for)\s*=\s*"([^"]*)"/g)) { let e = m[1].trim(); e = e.replace(/^\(?[\w,\s]+\)?\s+in\s+/, ''); exprs.add(e); }
  }
  exprs.delete('');
  let checked = 0;
  for (const e of exprs) {
    const b = B(e); if (!b) continue; // Babel が式として解析できたものだけを ground truth に
    const m = _mineAnalyzer(e);
    assert.ok(m, `自前が解析不能（実 fixtures の式なのに regex 落ち）: ${e}`);
    assert.deepEqual(m.used, b.used, `used 不一致: ${e}`);
    assert.deepEqual(m.calls, b.calls, `calls 不一致: ${e}`);
    checked++;
  }
  assert.ok(checked >= 50, `突き合わせた式が少なすぎ（fixtures 変化？）: ${checked}`);
});

test('v0.13 差分ガード: 難式で自前は Babel と食い違わない（ズレるくらいなら安全に regex 落ち）', async (t) => {
  let babel; try { babel = await import('@babel/parser'); } catch { t.skip('@babel/parser 未導入'); return; }
  const B = _babelAnalyzerFrom(babel);
  const HARD = [
    'a + b * c - d / e % f', 'x ** y ** z', 'a < b && c > d || e === f', 'a ?? b',
    'cond ? f() : g()', 'a ? b ? c : d : e', 'obj?.a?.b?.c', 'arr?.[i]?.(x)',
    'items.filter(x => x.on).map(y => y.id)', '(a, b) => a + b(c)', '({x, y}) => x + y + z',
    '({a = def, b: {c = d}}) => a + c', 'fn(...args, last)', '[...xs, y]', '{ ...spread, k: v() }',
    '`${a}${b()}${c ? d : e}`', 'new Foo(bar, baz())', 'new ns.Cls().m()', 'typeof x === "s"',
    'void f()', 'delete o.k', '-x + +y - ~z', '!a && !!b', 'a instanceof B', '"k" in obj',
    'f(a)(b)(c)', 'a.b.c.d.e', 'arr[0][1][2]', 'list.reduce((acc, it) => acc + it.v, 0)',
    '$event.key === "Enter" && submit()', 'style({ color: c(), size: `${n()}px` })',
    'cond && arr.forEach(e => sink(e))', 's.split(",").map(t => t.trim()).filter(Boolean)',
    'async () => await save(x)', 'async (a, b) => a() + b',
  ];
  for (const e of HARD) {
    const b = B(e), m = _mineAnalyzer(e);
    if (b && m) { // 両方 AST が出たときだけ比較＝silent-wrong を検出。片方 regex 落ちは安全側なので許容
      assert.deepEqual(m.used, b.used, `used 不一致: ${e}`);
      assert.deepEqual(m.calls, b.calls, `calls 不一致: ${e}`);
    }
  }
  // async/await は v0.13 で AST 対応済み（regex に落ちない）
  assert.ok(_mineAnalyzer('async () => await save(x)'), 'async アローは AST 解析される');
  assert.deepEqual(_mineAnalyzer('async () => await save(x)'), { used: ['save', 'x'], calls: ['save'] });
});
