import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { signal, effect, renderComponentToString } from '../plugins/mini-vue/runtime.mjs';
import { compileSFC, compileTemplate, CompileError } from '../plugins/mini-vue/compile.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const RUNTIME = resolve('plugins/mini-vue/runtime.mjs');

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
  const src = readFileSync('fixtures/app-ui/Counter.ui', 'utf8');
  const a = compileSFC(src, { runtime: RUNTIME });
  const b = compileSFC(src, { runtime: RUNTIME });
  assert.equal(sha(a), sha(b));
});

test('compile: 未知ディレクティブは fail-closed で止まる', () => {
  assert.throws(() => compileTemplate('<div v-model="x"></div>'), CompileError);
  assert.throws(() => compileTemplate('<div v-show="x"></div>'), CompileError);
  assert.throws(() => compileTemplate('<div>{{ }}</div>'), CompileError); // 空補間
  assert.throws(() => compileTemplate('<div><span></div>'), CompileError); // タグ不整合
});

test('compile: 許可された文法は通る', () => {
  const r = compileTemplate('<ul><li v-for="x in xs()" v-if="x">{{ x }}</li></ul>');
  assert.match(r.render, /\.map\(\(x\)/);
  assert.ok(r.used.includes('xs'));
});

test('renderToString: 状態スナップショットで正しい HTML（決定論）', async () => {
  // コンパイル済みモジュールを一時ファイルに書いて import して描画
  const src = readFileSync('fixtures/app-ui/Counter.ui', 'utf8');
  const mod = compileSFC(src, { runtime: RUNTIME });
  const dir = mkdtempSync(join(tmpdir(), 'mv-'));
  try {
    const f = join(dir, 'Counter.mjs');
    writeFileSync(f, mod);
    const comp = (await import(pathToFileURL(f).href)).default;
    const html1 = renderComponentToString(comp);
    const html2 = renderComponentToString(comp);
    assert.equal(html1, html2, '同状態→同 HTML');
    assert.match(html1, /<h1>mini-vue カウンタ<\/h1>/);
    assert.match(html1, /<output class="value">0<\/output>/);
    // count()===0 なので v-if は描画されない
    assert.doesNotMatch(html1, /現在値は/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reactivity + render: setup 経由で状態を進めると HTML が変わる', async () => {
  const src = readFileSync('fixtures/app-ui/Counter.ui', 'utf8');
  const mod = compileSFC(src, { runtime: RUNTIME });
  const dir = mkdtempSync(join(tmpdir(), 'mv-'));
  try {
    const f = join(dir, 'Counter.mjs');
    writeFileSync(f, mod);
    const comp = (await import(pathToFileURL(f).href)).default;
    const ctx = comp.setup();
    ctx.inc();
    ctx.inc();
    const { renderToString } = await import('../plugins/mini-vue/runtime.mjs');
    const html = renderToString(comp.render(ctx));
    assert.match(html, /<output class="value">2<\/output>/);
    assert.match(html, /現在値は 2 です/); // v-if 真
    assert.match(html, /<li>1<\/li><li>2<\/li>/); // v-for（history=[1,2]）
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
