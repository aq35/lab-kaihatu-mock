import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import esbuild from 'esbuild';
import { signal, effect, computed, component, validateProps, matchRoute, createRoot, useRoute, navigate, setRouteGuard, renderComponentToString } from '../plugins/sunao/runtime.mjs';
import { compileSFC, compileTemplate, analyze, CompileError } from '../plugins/sunao/compile.mjs';
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

test('⑤ scoped styles: 要素に scope 属性、CSS が scope 限定される（最小）', () => {
  const mod = compileSFC('<template><p class="x">hi</p></template><style>.x { color: red }</style>', { runtime: RUNTIME });
  assert.match(mod, /data-s[0-9a-z]+/, 'scope 属性が付く');
  assert.match(mod, /\[data-s[0-9a-z]+\] \.x/, 'CSS が [scope] で限定される');
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
