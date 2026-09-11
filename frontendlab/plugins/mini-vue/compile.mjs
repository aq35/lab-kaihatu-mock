/**
 * mini-vue compiler — SFC(.ui) を build 時に決定論的な JS モジュールへコンパイルする。
 *
 * サポートするテンプレート文法（意図的に小さく・fail-closed）:
 *   {{ expr }}          テキスト補間
 *   :name="expr"        属性バインド
 *   @event="expr"       イベント（onEvent に）
 *   v-if="expr"         条件（要素ごと）
 *   v-for="x in expr"   繰り返し（x はループ内ローカル）
 *   name="literal"      静的属性
 * 上記以外の v- ディレクティブ・未知構文は CompileError で **止める**（黙って落とさない）。
 *
 * 設計（AIが好きそうなコンパイラ）:
 *   - 決定論: 同じ .ui → 同じ出力文字列（テストで hash 一致を確認）。
 *   - 低マジック: 式は verbatim で埋め込む。値が欲しい所は自分で signal を呼ぶ（count()）。
 *   - 低 context: エラーは「どこで・何が・許可集合は何か」を必ず言う。
 */

export class CompileError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'CompileError';
  }
}

const ALLOWED_DIRECTIVES = new Set(['v-if', 'v-for']);
const GLOBALS = new Set([
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'String', 'Number', 'Boolean',
  'Array', 'Object', 'Math', 'JSON', 'Date', 'this', 'new', 'typeof', 'void',
]);

// ---- SFC のブロック抽出 ----
export function extractBlocks(source) {
  const tpl = /<template>([\s\S]*?)<\/template>/.exec(source);
  const scr = /<script>([\s\S]*?)<\/script>/.exec(source);
  if (!tpl) throw new CompileError('SFC に <template> がありません。');
  if (!scr) throw new CompileError('SFC に <script> がありません（export default { setup } が必要）。');
  return { template: tpl[1].trim(), script: scr[1].trim() };
}

// ---- テンプレート parser（小さな AST を作る） ----
// node: {type:'el', tag, attrs:[{name,value}], children:[]} | {type:'text', value} | {type:'interp', expr}
function parseTemplate(html) {
  let i = 0;
  const root = { type: 'el', tag: '#root', attrs: [], children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];

  const pushText = (raw) => {
    // {{ }} を分割して text / interp に
    let last = 0;
    const re = /\{\{([\s\S]*?)\}\}/g;
    let m;
    while ((m = re.exec(raw))) {
      const before = raw.slice(last, m.index);
      if (before.trim()) top().children.push({ type: 'text', value: before });
      const expr = m[1].trim();
      if (!expr) throw new CompileError('空の補間 {{ }} は書けません。');
      top().children.push({ type: 'interp', expr });
      last = m.index + m[0].length;
    }
    const rest = raw.slice(last);
    if (rest.trim()) top().children.push({ type: 'text', value: rest });
  };

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      pushText(html.slice(i));
      break;
    }
    if (lt > i) pushText(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      if (end === -1) throw new CompileError('コメントが閉じていません。');
      i = end + 3;
      continue;
    }
    if (html[lt + 1] === '/') {
      // close tag
      const gt = html.indexOf('>', lt);
      if (gt === -1) throw new CompileError('閉じタグが壊れています。');
      const tag = html.slice(lt + 2, gt).trim();
      if (top().tag !== tag) throw new CompileError(`タグの対応が合いません: </${tag}> に対する開きタグは <${top().tag}>。`);
      stack.pop();
      i = gt + 1;
      continue;
    }
    // open tag
    const gt = html.indexOf('>', lt);
    if (gt === -1) throw new CompileError('開きタグが閉じていません。');
    let inner = html.slice(lt + 1, gt).trim();
    const selfClose = inner.endsWith('/');
    if (selfClose) inner = inner.slice(0, -1).trim();
    const sp = inner.search(/\s/);
    const tag = (sp === -1 ? inner : inner.slice(0, sp)).trim();
    const attrStr = sp === -1 ? '' : inner.slice(sp).trim();
    if (!/^[a-zA-Z][\w-]*$/.test(tag)) throw new CompileError(`タグ名が不正です: "${tag}"`);
    const attrs = parseAttrs(attrStr, tag);
    const node = { type: 'el', tag, attrs, children: [] };
    top().children.push(node);
    if (!selfClose && !VOID.has(tag)) stack.push(node);
    i = gt + 1;
  }
  if (stack.length !== 1) throw new CompileError(`閉じていない要素があります: <${top().tag}>`);
  return root.children;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function parseAttrs(str, tag) {
  const attrs = [];
  const re = /([:@]?[\w-]+)(?:\s*=\s*"([^"]*)")?/g;
  let m;
  while ((m = re.exec(str))) {
    if (!m[0].trim()) continue;
    const name = m[1];
    const value = m[2] ?? '';
    if (name.startsWith('v-') && !ALLOWED_DIRECTIVES.has(name)) {
      throw new CompileError(`<${tag}> の未知ディレクティブ "${name}"。許可: ${[...ALLOWED_DIRECTIVES].join(', ')}（:bind / @event も可）。`);
    }
    attrs.push({ name, value });
  }
  return attrs;
}

// ---- codegen ----
function collectIdents(expr, bound, used) {
  const re = /(\.)?\b([A-Za-z_$][\w$]*)\b(\s*:(?!:))?/g;
  let m;
  while ((m = re.exec(expr))) {
    const [, dot, name, colon] = m;
    if (dot || colon) continue; // .prop / object-key
    if (GLOBALS.has(name) || bound.has(name)) continue;
    used.add(name);
  }
}

function genChildren(children, bound, used) {
  const parts = children.map((c) => genNode(c, bound, used)).filter(Boolean);
  return `[${parts.join(', ')}]`;
}

function genNode(node, bound, used) {
  if (node.type === 'text') return JSON.stringify(node.value);
  if (node.type === 'interp') {
    collectIdents(node.expr, bound, used);
    return `String(${node.expr})`;
  }
  // element
  const vIf = node.attrs.find((a) => a.name === 'v-if');
  const vFor = node.attrs.find((a) => a.name === 'v-for');
  let innerBound = bound;
  let forHead = null;
  if (vFor) {
    const mm = /^\s*([A-Za-z_$][\w$]*)\s+in\s+([\s\S]+)$/.exec(vFor.value);
    if (!mm) throw new CompileError(`v-for は "x in expr" の形で書いてください: "${vFor.value}"`);
    const [, item, listExpr] = mm;
    collectIdents(listExpr, bound, used);
    innerBound = new Set([...bound, item]);
    forHead = { item, listExpr };
  }

  const props = [];
  for (const a of node.attrs) {
    if (a.name === 'v-if' || a.name === 'v-for') continue;
    if (a.name.startsWith(':')) {
      const key = a.name.slice(1);
      collectIdents(a.value, innerBound, used);
      props.push(`${JSON.stringify(key)}: (${a.value})`);
    } else if (a.name.startsWith('@')) {
      const ev = a.name.slice(1);
      const on = 'on' + ev.charAt(0).toUpperCase() + ev.slice(1);
      collectIdents(a.value, innerBound, used);
      props.push(`${JSON.stringify(on)}: (${a.value})`);
    } else {
      props.push(`${JSON.stringify(a.name)}: ${JSON.stringify(a.value)}`);
    }
  }
  const propsObj = `{${props.join(', ')}}`;
  const kids = genChildren(node.children, innerBound, used);
  let expr = `h(${JSON.stringify(node.tag)}, ${propsObj}, ${kids})`;

  if (vIf) {
    collectIdents(vIf.value, innerBound, used);
    expr = `((${vIf.value}) ? ${expr} : null)`;
  }
  if (forHead) {
    expr = `...(${forHead.listExpr}).map((${forHead.item}) => ${expr})`;
  }
  return expr;
}

/** テンプレート文字列 → render 関数のソース + 使用した ctx キー。 */
export function compileTemplate(template) {
  const nodes = parseTemplate(template);
  const used = new Set();
  const roots = nodes.map((n) => genNode(n, new Set(), used)).filter(Boolean);
  const body = roots.length === 1 ? roots[0].replace(/^\.\.\./, '') : `[${roots.join(', ')}]`;
  const destructure = used.size ? `const { ${[...used].join(', ')} } = ctx;\n  ` : '';
  const render = `function render(ctx) {\n  ${destructure}return ${body};\n}`;
  return { render, used: [...used] };
}

/** SFC 全体 → ES モジュール文字列（runtime を import、setup + render を持つ default export）。 */
export function compileSFC(source, { runtime = './runtime.mjs' } = {}) {
  const { template, script } = extractBlocks(source);
  if (!/export\s+default/.test(script)) {
    throw new CompileError('<script> は `export default { setup() {...} }` を持つ必要があります。');
  }
  const { render } = compileTemplate(template);
  const scriptBody = script.replace(/export\s+default/, 'const __component =');
  return (
    `import { h, signal, effect } from ${JSON.stringify(runtime)};\n` +
    `${scriptBody}\n` +
    `__component.${render.replace(/^function /, 'render = function ')};\n` +
    `export default __component;\n`
  );
}
