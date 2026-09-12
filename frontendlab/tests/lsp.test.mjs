/**
 * sunao LSP をプロトコル（stdio JSON-RPC）で直接叩いて検証（エディタ不要）。
 * 「中身（診断・補完・ホバー）」はエディタ無しで検証できる、を実証。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

// 最小 LSP クライアント: フレーミング・id 応答待ち・通知バッファ。
function makeClient() {
  const child = spawn('node', [resolve('tools/lsp.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = Buffer.alloc(0);
  const waiters = new Map(); // id -> resolve
  const notes = []; // {method, params}
  const noteWaiters = []; // {method, resolve}
  child.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const sep = buf.indexOf('\r\n\r\n');
      if (sep === -1) return;
      const m = /Content-Length:\s*(\d+)/i.exec(buf.slice(0, sep).toString());
      if (!m) { buf = buf.slice(sep + 4); continue; }
      const len = +m[1], start = sep + 4;
      if (buf.length < start + len) return;
      const msg = JSON.parse(buf.slice(start, start + len).toString());
      buf = buf.slice(start + len);
      if (msg.id != null && waiters.has(msg.id)) { waiters.get(msg.id)(msg.result); waiters.delete(msg.id); }
      else if (msg.method) {
        notes.push(msg);
        const wi = noteWaiters.findIndex((w) => w.method === msg.method && (!w.pred || w.pred(msg)));
        if (wi >= 0) { noteWaiters[wi].resolve(msg); noteWaiters.splice(wi, 1); }
      }
    }
  });
  let seq = 0;
  const write = (msg) => { const s = JSON.stringify(msg); child.stdin.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`); };
  return {
    request: (method, params) => new Promise((res) => { const id = ++seq; waiters.set(id, res); write({ jsonrpc: '2.0', id, method, params }); }),
    notify: (method, params) => write({ jsonrpc: '2.0', method, params }),
    waitNote: (method) => new Promise((res) => { const hit = notes.find((n) => n.method === method); if (hit) res(hit); else noteWaiters.push({ method, resolve: res }); }),
    waitNote2: (uri) => new Promise((res) => { const pred = (n) => n.params && n.params.uri === uri; const hit = notes.find((n) => n.method === 'textDocument/publishDiagnostics' && pred(n)); if (hit) res(hit); else noteWaiters.push({ method: 'textDocument/publishDiagnostics', pred, resolve: res }); }),
    kill: () => child.kill(),
  };
}

const SFC = `<template>
  <div>
    <b>{{ count }}</b>
    <button @click="inc()">+</button>
  </div>
</template>
<script>
export default {
  props: { title: { type: 'string' } },
  setup() {
    const count = signal(0);
    const inc = () => count.update((v) => v + 1);
    return { count, inc };
  },
};
</script>`;

test('LSP: initialize が capabilities を返す', async () => {
  const c = makeClient();
  try {
    const r = await c.request('initialize', { capabilities: {} });
    assert.ok(r.capabilities.completionProvider, 'completion 提供');
    assert.equal(r.capabilities.hoverProvider, true, 'hover 提供');
    assert.equal(r.capabilities.textDocumentSync, 1, 'Full 同期');
    assert.equal(r.serverInfo.name, 'sunao-lsp');
  } finally { c.kill(); }
});

test('LSP: didOpen で診断を publish（error=fail-closed / warning=()呼び忘れ）', async () => {
  const c = makeClient();
  try {
    await c.request('initialize', { capabilities: {} });
    // 1) v-bogus（未知ディレクティブ=error）。テンプレが壊れるので警告は別docで。
    const bad = SFC.replace('<div>', '<div v-bogus="x">');
    c.notify('textDocument/didOpen', { textDocument: { uri: 'file:///a.sunao', text: bad } });
    const n1 = await c.waitNote('textDocument/publishDiagnostics');
    const e = n1.params.diagnostics.find((d) => d.severity === 1);
    assert.ok(e && e.code === 'SUNAO_UNKNOWN_DIRECTIVE', 'error 診断');
    assert.ok(e.source === 'sunao' && e.range && e.range.start, 'range/source つき');
    // 2) 正常だが {{ count }} が () 呼び忘れ = warning・error は無し
    c.notify('textDocument/didOpen', { textDocument: { uri: 'file:///a2.sunao', text: SFC } });
    let ds;
    do { ds = (await c.waitNote2('file:///a2.sunao')).params.diagnostics; } while (false);
    assert.ok(ds.some((d) => d.severity === 2 && d.code === 'SUNAO_CALL_FORGOTTEN'), 'warning 診断');
    assert.ok(!ds.some((d) => d.severity === 1), '正常 SFC に error 無し');
  } finally { c.kill(); }
});

test('LSP: 式位置の補完は signal/prop を name() で挿入（()呼び忘れ防止）', async () => {
  const c = makeClient();
  try {
    await c.request('initialize', { capabilities: {} });
    c.notify('textDocument/didOpen', { textDocument: { uri: 'file:///b.sunao', text: SFC } });
    // {{ count }} の中（3行目、"{{ " の後）にカーソル
    const pos = { line: 2, character: 9 }; // <b>{{ | count }}
    const r = await c.request('textDocument/completion', { textDocument: { uri: 'file:///b.sunao' }, position: pos });
    const labels = r.items.map((i) => i.label);
    assert.ok(labels.includes('count') && labels.includes('inc'), 'signal/関数 を候補に');
    const cItem = r.items.find((i) => i.label === 'count');
    assert.equal(cItem.insertText, 'count()', 'signal は count() を挿入＝()呼び忘れ防止');
    assert.equal(cItem.kind, 3, 'Function 種別');
    const tItem = r.items.find((i) => i.label === 'title');
    assert.equal(tItem.insertText, 'title()', 'prop も accessor＝title()');
  } finally { c.kill(); }
});

test('LSP: manifest 連携 — 子部品の props / enum 値を補完', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const dir = mkdtempSync(join(tmpdir(), 'lspm-'));
  const c = makeClient();
  try {
    // 子: enum prop を持つ Card
    writeFileSync(join(dir, 'Card.sunao'), '<template><div>{{ kind() }}</div></template><script>export default { name:"Card", props:{ kind:{ enum:["a","b"], required:true }, title:{ type:"string" } }, setup(){return{}} }</script>');
    const hostPath = join(dir, 'Host.sunao');
    const hostText = '<template>\n  <Card />\n  <Card :kind="" />\n</template>\n<script>\nimport Card from "./Card.sunao";\nexport default { setup(){ return {}; } }\n</script>';
    writeFileSync(hostPath, hostText);
    const uri = pathToFileURL(hostPath).href;
    await c.request('initialize', { capabilities: {} });
    c.notify('textDocument/didOpen', { textDocument: { uri, text: hostText } });
    // (1) `<Card |/>` 属性位置 → 子 props を候補に
    const attrPos = { line: 1, character: 8 }; // "  <Card |/>"
    const r1 = await c.request('textDocument/completion', { textDocument: { uri }, position: attrPos });
    const labels1 = r1.items.map((i) => i.label);
    assert.ok(labels1.includes('kind') && labels1.includes('title'), '子 Card の props を候補に');
    // (2) `<Card :kind="|" />` 値位置 → enum 値を候補に
    const valPos = { line: 2, character: hostText.split('\n')[2].indexOf('="') + 2 }; // 開き " の直後
    const r2 = await c.request('textDocument/completion', { textDocument: { uri }, position: valPos });
    const labels2 = r2.items.map((i) => i.label);
    assert.ok(labels2.includes('a') && labels2.includes('b'), 'enum 値 a/b を候補に');
  } finally { c.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('LSP: hover が signal を「呼んで読む」と説明', async () => {
  const c = makeClient();
  try {
    await c.request('initialize', { capabilities: {} });
    c.notify('textDocument/didOpen', { textDocument: { uri: 'file:///d.sunao', text: SFC } });
    const pos = { line: 2, character: 11 }; // {{ count }} の count の上
    const r = await c.request('textDocument/hover', { textDocument: { uri: 'file:///d.sunao' }, position: pos });
    assert.ok(r && r.contents && /signal/.test(r.contents.value), 'signal と説明');
    assert.match(r.contents.value, /count\(\)/, '呼んで読む例');
  } finally { c.kill(); }
});

test('LSP: 定義ジャンプ — count の使用位置から <script> の宣言へ', async () => {
  const c = makeClient();
  try {
    await c.request('initialize', { capabilities: {} });
    c.notify('textDocument/didOpen', { textDocument: { uri: 'file:///f.sunao', text: SFC } });
    const pos = { line: 2, character: 11 }; // {{ count }} の count
    const loc = await c.request('textDocument/definition', { textDocument: { uri: 'file:///f.sunao' }, position: pos });
    assert.ok(loc && loc.uri === 'file:///f.sunao', 'Location を返す');
    // 宣言 `const count = signal(0)` の行を指す
    const declLine = SFC.split('\n').findIndex((l) => /const count = signal/.test(l));
    assert.equal(loc.range.start.line, declLine, '宣言行にジャンプ');
  } finally { c.kill(); }
});

test('LSP: 定義ジャンプは三項の参照を宣言と誤認しない（findDecl 修正）', async () => {
  const c = makeClient();
  try {
    await c.request('initialize', { capabilities: {} });
    const src = `<template><p>{{ pick() }}</p></template>\n<script>\nexport default { setup(){ const big=1, small=2; const pick = () => (true ? big : small); return { pick }; } }\n</script>`;
    c.notify('textDocument/didOpen', { textDocument: { uri: 'file:///t.sunao', text: src } });
    // 'big' の宣言は `const big=1`。三項の ` big :` に飛ばないこと。
    const bigDeclLine = src.split('\n').findIndex((l) => /const big=1/.test(l));
    // definition on the ternary 'big' (in the arrow body) should resolve to the const line, not itself
    const lines = src.split('\n');
    const arrowLine = lines.findIndex((l) => l.includes('true ? big'));
    const col = lines[arrowLine].indexOf('big', lines[arrowLine].indexOf('?'));
    const loc = await c.request('textDocument/definition', { textDocument: { uri: 'file:///t.sunao' }, position: { line: arrowLine, character: col + 1 } });
    assert.ok(loc, 'Location を返す');
    assert.equal(loc.range.start.line, bigDeclLine, '三項の参照でなく const 宣言に飛ぶ');
  } finally { c.kill(); }
});

test('LSP: documentSymbol — signal/prop/component を宣言位置つきで列挙', async () => {
  const c = makeClient();
  try {
    await c.request('initialize', { capabilities: {} });
    c.notify('textDocument/didOpen', { textDocument: { uri: 'file:///g.sunao', text: SFC } });
    const syms = await c.request('textDocument/documentSymbol', { textDocument: { uri: 'file:///g.sunao' } });
    const byName = Object.fromEntries(syms.map((s) => [s.name, s]));
    assert.ok(byName.count && byName.count.kind === 12, 'count は signal(Function)');
    assert.ok(byName.title && byName.title.kind === 8, 'title は prop(Field)');
    assert.ok(byName.count.range && byName.count.range.start, 'range つき');
  } finally { c.kill(); }
});

test('LSP: タグ位置の補完は component/HTML 要素', async () => {
  const c = makeClient();
  try {
    await c.request('initialize', { capabilities: {} });
    const withImport = SFC.replace("export default {", "import Card from './Card.sunao';\nexport default {");
    const text = withImport.replace('<div>', '<div>\n    <C');
    c.notify('textDocument/didOpen', { textDocument: { uri: 'file:///e.sunao', text } });
    // "<C" の直後
    const line = text.split('\n').findIndex((l) => l.includes('<C') && !l.includes('<div'));
    const r = await c.request('textDocument/completion', { textDocument: { uri: 'file:///e.sunao' }, position: { line, character: 6 } });
    const labels = r.items.map((i) => i.label);
    assert.ok(labels.includes('Card'), 'import 済み component を候補に');
    assert.ok(labels.includes('div'), 'HTML 要素も候補に');
  } finally { c.kill(); }
});
