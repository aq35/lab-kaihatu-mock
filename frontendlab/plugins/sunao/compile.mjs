/**
 * sunao compiler v0.2 — SFC(.sunao) を build 時に決定論的な JS モジュールへコンパイル。
 *
 * v0.2 で足した「いいところ取り」（docs/framework-cherrypick.md のロードマップ）:
 *   ① 細粒度更新: 動的な式は **thunk（() => expr）** で出力。runtime が箇所ごとに effect を張る。
 *      静的な部分はリテラルのまま＝一度だけ生成。
 *   ② 既定 static: 動的束縛もイベントも無いコンポーネントは **定数 HTML 文字列**へコンパイルし
 *      runtime を import しない（Astro islands 的。tree-shake で reactivity が落ちる）。
 *   ③ computed: runtime に追加（ここでは import して setup から使える）。
 *   ④ 宣言必須(fail-closed): `<script>` に `expose:[...]` があれば、テンプレが参照する識別子は
 *      すべて宣言済みでなければ CompileError（未宣言参照＝typo を build 時に止める）。
 *   ⑤ v-model 糖衣 / scoped styles（最小）。
 *
 * サポート文法: {{ }} / :bind / @event / v-if / v-for="x in expr" / v-model / 静的属性 / <style>(scoped)。
 * それ以外の v-* は CompileError（fail-closed）。
 */

export class CompileError extends Error {
  constructor(msg) { super(msg); this.name = 'CompileError'; }
}

const ALLOWED_DIRECTIVES = new Set(['v-if', 'v-for', 'v-model']);
const GLOBALS = new Set([
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'String', 'Number', 'Boolean',
  'Array', 'Object', 'Math', 'JSON', 'Date', 'this', 'new', 'typeof', 'void', 'e',
]);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// ---- SFC のブロック抽出 ----
export function extractBlocks(source) {
  const tpl = /<template>([\s\S]*?)<\/template>/.exec(source);
  const scr = /<script>([\s\S]*?)<\/script>/.exec(source);
  const sty = /<style[^>]*>([\s\S]*?)<\/style>/.exec(source);
  if (!tpl) throw new CompileError('SFC に <template> がありません。');
  return { template: tpl[1].trim(), script: scr ? scr[1].trim() : '', style: sty ? sty[1].trim() : '' };
}

// ---- テンプレート parser ----
function parseTemplate(html) {
  let i = 0;
  const root = { type: 'el', tag: '#root', attrs: [], children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];

  const pushText = (raw) => {
    let last = 0;
    const re = /\{\{([\s\S]*?)\}\}/g;
    let m;
    while ((m = re.exec(raw))) {
      const before = raw.slice(last, m.index);
      if (before.trim()) top().children.push({ type: 'text', value: before.replace(/\s+/g, ' ') });
      const expr = m[1].trim();
      if (!expr) throw new CompileError('空の補間 {{ }} は書けません。');
      top().children.push({ type: 'interp', expr });
      last = m.index + m[0].length;
    }
    const rest = raw.slice(last);
    if (rest.trim()) top().children.push({ type: 'text', value: rest.replace(/\s+/g, ' ') });
  };

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { pushText(html.slice(i)); break; }
    if (lt > i) pushText(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      if (end === -1) throw new CompileError('コメントが閉じていません。');
      i = end + 3;
      continue;
    }
    if (html[lt + 1] === '/') {
      const gt = html.indexOf('>', lt);
      if (gt === -1) throw new CompileError('閉じタグが壊れています。');
      const tag = html.slice(lt + 2, gt).trim();
      if (top().tag !== tag) throw new CompileError(`タグの対応が合いません: </${tag}> に対する開きタグは <${top().tag}>。`);
      stack.pop();
      i = gt + 1;
      continue;
    }
    const gt = html.indexOf('>', lt);
    if (gt === -1) throw new CompileError('開きタグが閉じていません。');
    let inner = html.slice(lt + 1, gt).trim();
    const selfClose = inner.endsWith('/');
    if (selfClose) inner = inner.slice(0, -1).trim();
    const sp = inner.search(/\s/);
    const tag = (sp === -1 ? inner : inner.slice(0, sp)).trim();
    const attrStr = sp === -1 ? '' : inner.slice(sp).trim();
    if (!/^[a-zA-Z][\w-]*$/.test(tag)) throw new CompileError(`タグ名が不正です: "${tag}"`);
    const node = { type: 'el', tag, attrs: parseAttrs(attrStr, tag), children: [] };
    top().children.push(node);
    if (!selfClose && !VOID.has(tag)) stack.push(node);
    i = gt + 1;
  }
  if (stack.length !== 1) throw new CompileError(`閉じていない要素があります: <${top().tag}>`);
  return root.children;
}

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

// ---- 式解析ヘルパ ----
function collectIdents(expr, bound, used) {
  const re = /(\.)?\b([A-Za-z_$][\w$]*)\b(\s*:(?!:))?/g;
  let m;
  while ((m = re.exec(expr))) {
    const [, dot, name, colon] = m;
    if (dot || colon) continue;
    if (GLOBALS.has(name) || bound.has(name)) continue;
    used.add(name);
  }
}
function refsCtx(expr, bound) {
  const s = new Set();
  collectIdents(expr, bound, s);
  return s.size > 0;
}
const isLiteral = (expr) => /^(['"]).*\1$/s.test(expr.trim()) || /^-?\d+(\.\d+)?$/.test(expr.trim());

// ---- codegen ----
function genChildren(children, bound, ctx) {
  return children.map((c) => genNode(c, bound, ctx)).filter(Boolean);
}

function genNode(node, bound, ctx) {
  if (node.type === 'text') return JSON.stringify(node.value);
  if (node.type === 'interp') {
    collectIdents(node.expr, bound, ctx.used);
    if (refsCtx(node.expr, bound)) { ctx.hasDynamic = true; return `() => String(${node.expr})`; }
    if (!isLiteral(node.expr)) ctx.staticSerializable = false;
    return `String(${node.expr})`;
  }
  // element or component（大文字始まり = コンポーネント）
  const isComponent = /^[A-Z]/.test(node.tag);
  const vIf = node.attrs.find((a) => a.name === 'v-if');
  const vFor = node.attrs.find((a) => a.name === 'v-for');
  const vModel = node.attrs.find((a) => a.name === 'v-model');
  let innerBound = bound;
  let forHead = null;
  if (vFor) {
    const mm = /^\s*([A-Za-z_$][\w$]*)\s+in\s+([\s\S]+)$/.exec(vFor.value);
    if (!mm) throw new CompileError(`v-for は "x in expr" の形で書いてください: "${vFor.value}"`);
    collectIdents(mm[2], bound, ctx.used);
    innerBound = new Set([...bound, mm[1]]);
    forHead = { item: mm[1], listExpr: mm[2] };
  }

  if (isComponent) {
    // ④ コンポーネント合成: <Child :prop="expr"/>。import 必須（fail-closed）。
    if (!ctx.components.has(node.tag)) {
      throw new CompileError(`<${node.tag}> は import されていません。<script> に import ${node.tag} from './${node.tag}.sunao' を書いてください（大文字始まり = コンポーネント）。`);
    }
    if (node.children.some((c) => c.type !== 'text' || c.value.trim())) {
      throw new CompileError(`<${node.tag}>: スロット（子要素）は未対応です（v0.3）。props で渡してください。`);
    }
    ctx.hasDynamic = true; // 子は reactive になりうる
    const cprops = [];
    for (const a of node.attrs) {
      if (a.name === 'v-if' || a.name === 'v-for') continue;
      if (a.name === 'v-model' || a.name.startsWith('@')) {
        throw new CompileError(`<${node.tag}>: コンポーネントへの ${a.name} は未対応です（v0.3, props のみ）。`);
      }
      if (a.name.startsWith(':')) {
        const key = a.name.slice(1);
        collectIdents(a.value, innerBound, ctx.used);
        cprops.push(`${JSON.stringify(key)}: () => (${a.value})`); // accessor で渡す（reactive）
      } else {
        // 静的属性も accessor に揃える（子は常に prop() で読む）。
        cprops.push(`${JSON.stringify(a.name)}: () => (${JSON.stringify(a.value)})`);
      }
    }
    let expr = `component(${node.tag}, {${cprops.join(', ')}})`;
    if (vIf) { collectIdents(vIf.value, innerBound, ctx.used); expr = refsCtx(vIf.value, innerBound) && !vFor ? `() => (${vIf.value}) ? ${expr} : null` : `((${vIf.value}) ? ${expr} : null)`; }
    if (forHead) { const inner = `(${forHead.listExpr}).map((${forHead.item}) => ${expr})`; expr = refsCtx(forHead.listExpr, bound) ? `() => ${inner}` : inner; }
    return expr;
  }

  const props = [];
  if (ctx.scopeAttr) props.push(`${JSON.stringify(ctx.scopeAttr)}: true`);
  for (const a of node.attrs) {
    if (a.name === 'v-if' || a.name === 'v-for' || a.name === 'v-model') continue;
    if (a.name.startsWith(':')) {
      const key = a.name.slice(1);
      collectIdents(a.value, innerBound, ctx.used);
      if (refsCtx(a.value, innerBound)) { ctx.hasDynamic = true; props.push(`${JSON.stringify(key)}: () => (${a.value})`); }
      else props.push(`${JSON.stringify(key)}: (${a.value})`);
    } else if (a.name.startsWith('@')) {
      const ev = a.name.slice(1);
      const on = 'on' + ev.charAt(0).toUpperCase() + ev.slice(1);
      collectIdents(a.value, innerBound, ctx.used);
      ctx.hasEvent = true;
      props.push(`${JSON.stringify(on)}: (${a.value})`);
    } else {
      props.push(`${JSON.stringify(a.name)}: ${JSON.stringify(a.value)}`);
    }
  }
  if (vModel) {
    // 純粋な糖衣: :value + @input（signal 前提）。魔法を runtime に持ち込まない。
    collectIdents(vModel.value, innerBound, ctx.used);
    ctx.hasDynamic = true; ctx.hasEvent = true;
    props.push(`"value": () => (${vModel.value})()`);
    props.push(`"onInput": (e) => (${vModel.value}).set(e.target.value)`);
  }
  const propsObj = `{${props.join(', ')}}`;
  const kids = genChildren(node.children, innerBound, ctx);
  let expr = `h(${JSON.stringify(node.tag)}, ${propsObj}, [${kids.join(', ')}])`;

  if (vIf) {
    collectIdents(vIf.value, innerBound, ctx.used);
    if (refsCtx(vIf.value, innerBound) && !vFor) { ctx.hasDynamic = true; expr = `() => (${vIf.value}) ? ${expr} : null`; }
    else expr = `((${vIf.value}) ? ${expr} : null)`;
  }
  if (forHead) {
    const inner = `(${forHead.listExpr}).map((${forHead.item}) => ${expr})`;
    if (refsCtx(forHead.listExpr, bound)) { ctx.hasDynamic = true; expr = `() => ${inner}`; }
    else expr = inner;
  }
  return expr;
}

// 静的 AST → 定数 HTML 文字列（既定 static 用）。
function serializeStatic(nodes, scopeAttr) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attrEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const one = (n) => {
    if (n.type === 'text') return esc(n.value);
    if (n.type === 'interp') return esc(n.expr.trim().replace(/^(['"])(.*)\1$/s, '$2'));
    let attrs = scopeAttr ? ` ${scopeAttr}` : '';
    for (const a of n.attrs) attrs += ` ${a.name}="${attrEsc(a.value)}"`;
    if (VOID.has(n.tag)) return `<${n.tag}${attrs}>`;
    return `<${n.tag}${attrs}>${n.children.map(one).join('')}</${n.tag}>`;
  };
  return nodes.map(one).join('');
}

// 診断用: 近い宣言名を提案（Levenshtein）。
function nearest(name, candidates) {
  const lev = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  let best = null, bestD = Infinity;
  for (const c of candidates) { const d = lev(name, c); if (d < bestD) { bestD = d; best = c; } }
  return best && bestD <= Math.max(2, Math.ceil(name.length / 3)) ? best : null;
}

/** テンプレート → render ソース + メタ。 */
export function compileTemplate(template, { scopeAttr = null, components = new Set() } = {}) {
  const nodes = parseTemplate(template);
  const ctx = { used: new Set(), hasDynamic: false, hasEvent: false, staticSerializable: true, scopeAttr, components };
  const roots = genChildren(nodes, new Set(), ctx);
  const body = roots.length === 1 ? roots[0] : `[${roots.join(', ')}]`;
  const destructure = ctx.used.size ? `const { ${[...ctx.used].join(', ')} } = ctx;\n  ` : '';
  const render = `function render(ctx) {\n  ${destructure}return ${body};\n}`;
  const isStatic = !ctx.hasDynamic && !ctx.hasEvent && ctx.staticSerializable;
  return {
    render,
    used: [...ctx.used],
    hasDynamic: ctx.hasDynamic || ctx.hasEvent,
    static: isStatic,
    staticHTML: isStatic ? serializeStatic(nodes, scopeAttr) : null,
  };
}

// scoped styles（最小）: content から短い hash、selector を [scopeAttr] で descendant 限定。
function scopeStyles(css, scopeAttr) {
  let h = 5381;
  for (let i = 0; i < css.length; i++) h = ((h << 5) + h + css.charCodeAt(i)) >>> 0;
  const attr = `data-s${h.toString(36)}`;
  const scoped = css.replace(/([^{}]+)\{/g, (_, sel) =>
    sel.split(',').map((s) => `[${attr}] ${s.trim()}`).join(', ') + ' {');
  return { attr, scoped };
}

/** SFC → ES モジュール文字列。 */
export function compileSFC(source, { runtime = './runtime.mjs' } = {}) {
  const { template, script, style } = extractBlocks(source);

  let scopeAttr = null, scopedCss = null;
  if (style) { const s = scopeStyles(style, ''); scopeAttr = s.attr; scopedCss = s.scoped; }

  // ④ import されたコンポーネント（大文字始まり）を把握。
  const components = new Set();
  for (const m of script.matchAll(/import\s+([A-Z]\w*)\s+from/g)) components.add(m[1]);

  const compiled = compileTemplate(template, { scopeAttr, components });

  // ④ 宣言必須（fail-closed）: 宣言集合が判れば、テンプレの未宣言参照を止める（診断つき）。
  //    宣言集合 = props のキー ∪ expose:[...] ∪ setup の `return { ... }` で返した名前。
  const declared = new Set();
  const exposeM = /expose\s*:\s*\[([^\]]*)\]/.exec(script);
  if (exposeM) exposeM[1].split(',').forEach((s) => { const n = s.trim().replace(/^['"]|['"]$/g, ''); if (n) declared.add(n); });
  const propsM = /props\s*:\s*\{([\s\S]*?)\}/.exec(script);
  if (propsM) for (const m of propsM[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) declared.add(m[1]);
  const returnM = /return\s*\{([^{}]*)\}/.exec(script);
  if (returnM) for (const m of returnM[1].matchAll(/([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);

  if (declared.size) {
    const unknown = compiled.used.filter((u) => !declared.has(u));
    if (unknown.length) {
      const hints = unknown.map((u) => { const s = nearest(u, [...declared]); return s ? `${u}（もしかして: ${s}？）` : u; });
      throw new CompileError(`テンプレが未宣言の識別子を参照: ${hints.join(', ')}。setup の return / props / expose に宣言してください（declared: ${[...declared].join(', ')}）。`);
    }
  }

  // ② 既定 static: 動的もイベントも無ければ定数 HTML。runtime を import しない。
  if (compiled.static && !/\bsetup\b/.test(script)) {
    const stylesLine = scopedCss ? ` __component.styles = ${JSON.stringify(scopedCss)};\n` : '';
    return (
      `const __component = { static: true, render: () => (${JSON.stringify(compiled.staticHTML)}) };\n` +
      stylesLine +
      `export default __component;\n`
    );
  }

  if (!/export\s+default/.test(script)) {
    throw new CompileError('<script> は `export default { setup() {...} }` を持つ必要があります（静的コンポーネントは <script> 省略可）。');
  }
  const scriptBody = script.replace(/export\s+default/, 'const __component =');
  const stylesLine = scopedCss ? `__component.styles = ${JSON.stringify(scopedCss)};\n` : '';
  return (
    `import { h, signal, effect, computed, component } from ${JSON.stringify(runtime)};\n` +
    `${scriptBody}\n` +
    `__component.${compiled.render.replace(/^function /, 'render = function ')};\n` +
    stylesLine +
    `export default __component;\n`
  );
}
