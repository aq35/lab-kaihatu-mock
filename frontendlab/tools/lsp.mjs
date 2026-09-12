#!/usr/bin/env node
/**
 * sunao LSP — 依存ゼロの Language Server（stdio JSON-RPC）。
 * 「巨大な依存に頼らない」思想の体現: プロトコルは手書き、頭脳は compiler（diagnose/symbols）。
 *
 * 提供:
 *   - publishDiagnostics: 保存/編集ごとに diagnose()（error=fail-closed / warning=()呼び忘れ）
 *   - completion: 文脈で候補（式位置=signal/prop/return・タグ位置=component・属性位置=ディレクティブ）。
 *                 signal/prop は `name()` を挿入して **() 呼び忘れを未然に防ぐ**。
 *   - hover: 識別子が signal / prop / component / local のどれかを説明
 *
 * これ単体で「Cargo 並みの思想」= 統合・決定論・fail-closed・エラーが教える、を LSP でも通す。
 */
import { diagnose, symbols } from '../plugins/sunao/compile.mjs';

const docs = new Map(); // uri -> text
const COMMON_TAGS = ['div', 'span', 'p', 'a', 'button', 'input', 'ul', 'li', 'ol', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'section', 'header', 'footer', 'nav', 'main', 'form', 'label', 'img', 'h1', 'h2', 'h3', 'small', 'strong', 'em', 'slot'];
const DIRECTIVES = [
  { label: 'v-if', detail: '条件描画（式が真なら描画）' },
  { label: 'v-for', detail: '反復（"item in list" / "(item, i) in list"）' },
  { label: 'v-model', detail: '双方向糖衣（:value + @input、signal 前提）' },
  { label: 'flip', detail: 'keyed v-for に付けて並び替え/enter/leave を FLIP アニメ' },
  { label: ':', detail: '属性バインド（:attr="式"）' },
  { label: '@', detail: 'イベント（@click="式"）' },
];
const GLOBALS = ['true', 'false', 'null', 'undefined', 'Math', 'JSON', 'String', 'Number', 'Boolean', 'Array', 'Object', 'Date', '$event'];

// ---- JSON-RPC over stdio（Content-Length フレーミング） ----
let buf = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  for (;;) {
    const sep = buf.indexOf('\r\n\r\n');
    if (sep === -1) return;
    const header = buf.slice(0, sep).toString('utf8');
    const m = /Content-Length:\s*(\d+)/i.exec(header);
    if (!m) { buf = buf.slice(sep + 4); continue; }
    const len = +m[1];
    const start = sep + 4;
    if (buf.length < start + len) return; // 本文がまだ揃っていない
    const body = buf.slice(start, start + len).toString('utf8');
    buf = buf.slice(start + len);
    try { handle(JSON.parse(body)); } catch (e) { /* 壊れたメッセージは無視 */ }
  }
});
function send(msg) {
  const s = JSON.stringify(msg);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(s, 'utf8')}\r\n\r\n${s}`);
}
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const notify = (method, params) => send({ jsonrpc: '2.0', method, params });

// ---- 位置ユーティリティ ----
function offsetAt(text, pos) {
  const lines = text.split('\n');
  let off = 0;
  for (let i = 0; i < pos.line && i < lines.length; i++) off += lines[i].length + 1;
  return off + pos.character;
}
function posAt(text, offset) {
  let line = 0, last = 0;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') { line++; last = i + 1; }
  return { line, character: offset - last };
}

// ---- ディスパッチ ----
function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      return reply(id, {
        capabilities: {
          textDocumentSync: 1, // Full
          completionProvider: { triggerCharacters: ['.', ':', '@', '{', '<', ' ', '"'] },
          hoverProvider: true,
        },
        serverInfo: { name: 'sunao-lsp', version: '0.1.0' },
      });
    case 'initialized': return;
    case 'shutdown': return reply(id, null);
    case 'exit': process.exit(0); return;
    case 'textDocument/didOpen': {
      const { uri, text } = params.textDocument;
      docs.set(uri, text); publish(uri); return;
    }
    case 'textDocument/didChange': {
      const uri = params.textDocument.uri;
      const text = params.contentChanges[params.contentChanges.length - 1].text; // Full sync
      docs.set(uri, text); publish(uri); return;
    }
    case 'textDocument/didClose': docs.delete(params.textDocument.uri); return;
    case 'textDocument/completion': return reply(id, complete(params));
    case 'textDocument/hover': return reply(id, hover(params));
    default: if (id != null) reply(id, null);
  }
}

// ---- 診断 ----
function publish(uri) {
  const text = docs.get(uri) || '';
  const { diagnostics } = diagnose(text, { filename: uri });
  const out = diagnostics.map((d) => {
    const line = Math.max(0, (d.line || 1) - 1), ch = Math.max(0, (d.column || 1) - 1);
    const len = (d.ident || '').length || 1;
    return {
      range: { start: { line, character: ch }, end: { line, character: ch + len } },
      severity: d.severity === 'error' ? 1 : 2,
      code: d.code, source: 'sunao', message: d.message,
    };
  });
  notify('textDocument/publishDiagnostics', { uri, diagnostics: out });
}

// ---- 文脈判定 ----
function contextAt(text, offset) {
  // template 内か
  const t = /<template>/.exec(text);
  const tEnd = text.indexOf('</template>');
  const inTemplate = t && offset > t.index + t[0].length && (tEnd === -1 || offset <= tEnd);
  const before = text.slice(0, offset);
  const line = before.slice(before.lastIndexOf('\n') + 1);
  // {{ ... }} 内（最後の {{ が最後の }} より後）
  const lastOpen = before.lastIndexOf('{{'), lastClose = before.lastIndexOf('}}');
  if (inTemplate && lastOpen > lastClose) return { kind: 'expr' };
  // 属性値の式内: :x=" / @x=" / v-*=" の未閉じ引用符
  const attrOpen = /([:@][\w-]+|v-[\w-]+)\s*=\s*"([^"]*)$/.exec(line);
  if (inTemplate && attrOpen) return { kind: 'expr' };
  // タグ名入力中: <word
  const tag = /<([A-Za-z][\w-]*)?$/.exec(line);
  if (inTemplate && tag) return { kind: 'tag', prefix: tag[1] || '' };
  // タグ内の属性名位置: 直前に開きタグがあり、まだ > で閉じていない
  const openLt = line.lastIndexOf('<'), openGt = line.lastIndexOf('>');
  if (inTemplate && openLt > openGt && !/^<\//.test(line.slice(openLt))) return { kind: 'attr' };
  return { kind: inTemplate ? 'text' : 'other' };
}

// ---- 補完 ----
function complete(params) {
  const uri = params.textDocument.uri;
  const text = docs.get(uri) || '';
  const offset = offsetAt(text, params.position);
  const ctx = contextAt(text, offset);
  const sy = symbols(text);
  const items = [];
  const push = (label, kind, detail, insertText) => items.push({ label, kind, detail, insertText: insertText || label });

  if (ctx.kind === 'tag') {
    for (const c of sy.components) push(c, 7 /*Class*/, 'component（import 済み）');
    for (const tg of COMMON_TAGS) push(tg, 10 /*Property*/, 'HTML 要素');
  } else if (ctx.kind === 'attr') {
    for (const d of DIRECTIVES) push(d.label, 14 /*Keyword*/, d.detail);
  } else if (ctx.kind === 'expr') {
    const sig = new Set(sy.signals);
    const prop = new Set(sy.props);
    // signal/prop は「呼んで読む」→ name() を挿入して () 呼び忘れを防ぐ
    for (const n of sy.signals) push(n, 3 /*Function*/, 'signal — 呼んで読む', `${n}()`);
    for (const n of sy.props) if (!sig.has(n)) push(n, 5 /*Field*/, 'prop（accessor）— 呼んで読む', `${n}()`);
    for (const n of sy.returns) if (!sig.has(n) && !prop.has(n)) push(n, 6 /*Variable*/, 'setup の return');
    for (const n of sy.exposed) if (!sig.has(n) && !prop.has(n)) push(n, 6, 'expose');
    for (const g of GLOBALS) push(g, 12 /*Value*/, 'グローバル');
  }
  return { isIncomplete: false, items };
}

// ---- ホバー ----
function wordAt(text, offset) {
  let s = offset, e = offset;
  while (s > 0 && /[\w$]/.test(text[s - 1])) s--;
  while (e < text.length && /[\w$]/.test(text[e])) e++;
  return { word: text.slice(s, e), start: s, end: e };
}
function hover(params) {
  const uri = params.textDocument.uri;
  const text = docs.get(uri) || '';
  const offset = offsetAt(text, params.position);
  const { word, start, end } = wordAt(text, offset);
  if (!word) return null;
  const sy = symbols(text);
  let md = null;
  if (sy.signals.includes(word)) md = `**${word}** — signal\n\n値は \`${word}()\`（呼んで読む）。更新は \`${word}.set(...)\` / \`${word}.update(fn)\`。`;
  else if (sy.props.includes(word)) md = `**${word}** — prop（accessor）\n\n値は \`${word}()\`。型/必須/enum は宣言で fail-closed。`;
  else if (sy.components.includes(word)) md = `**${word}** — component（import 済み）\n\n\`<${word} :prop="式"/>\` で合成。`;
  else if (sy.returns.includes(word) || sy.exposed.includes(word)) md = `**${word}** — setup が公開した値/関数。`;
  else return null;
  return { contents: { kind: 'markdown', value: md }, range: { start: posAt(text, start), end: posAt(text, end) } };
}
