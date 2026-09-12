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

// 式の自由変数解析に使う（build 時のみ・アプリ bundle には入らない）。@babel/core の推移依存。
import { parseExpression as _babelParseExpression } from '@babel/parser';
import { createRequire } from 'node:module'; // sass を lazy require するため（build 時のみ）

/**
 * 構造化診断つきコンパイルエラー。文字列でも診断オブジェクトでも作れる（後方互換）。
 * .diagnostic = { code, message, loc:{line,column}|null, frame|null, suggestions:[] } を機械可読に持つ。
 * AI/ツールは e.diagnostic を parse して自己修正できる。
 */
export class CompileError extends Error {
  constructor(arg) {
    const d = typeof arg === 'string' ? { code: 'SUNAO_COMPILE', message: arg } : arg;
    super(d.message);
    this.name = 'CompileError';
    this.code = d.code || 'SUNAO_COMPILE';
    this.loc = d.loc || null;
    this.frame = d.frame || null;
    this.suggestions = d.suggestions || [];
    this.diagnostic = { code: this.code, message: d.message, loc: this.loc, frame: this.frame, suggestions: this.suggestions };
  }
}

// index → {line, column}（1 始まり）
function posAt(src, index) {
  if (src == null || index == null || index < 0) return null;
  let line = 1, col = 1;
  for (let i = 0; i < index && i < src.length; i++) {
    if (src[i] === '\n') { line++; col = 1; } else col++;
  }
  return { line, column: col };
}
// 該当行＋キャレットのコードフレーム
function frameAt(src, index) {
  const loc = posAt(src, index);
  if (!loc) return null;
  const lines = src.split('\n');
  const ln = lines[loc.line - 1] ?? '';
  return `  ${loc.line} | ${ln}\n    | ${' '.repeat(Math.max(0, loc.column - 1))}^`;
}
// 診断つきで throw するヘルパ
function fail(code, message, { src = null, index = null, suggestions = [] } = {}) {
  throw new CompileError({ code, message, loc: posAt(src, index), frame: frameAt(src, index), suggestions });
}

const ALLOWED_DIRECTIVES = new Set(['v-if', 'v-for', 'v-model']);
const GLOBALS = new Set([
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'String', 'Number', 'Boolean',
  'Array', 'Object', 'Math', 'JSON', 'Date', 'this', 'new', 'typeof', 'void', 'e', '$event',
]);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// ---- SFC のブロック抽出 ----
export function extractBlocks(source) {
  const tpl = /<template>([\s\S]*?)<\/template>/.exec(source);
  const scr = /<script>([\s\S]*?)<\/script>/.exec(source);
  const sty = /<style([^>]*)>([\s\S]*?)<\/style>/.exec(source);
  if (!tpl) throw new CompileError({ code: 'SUNAO_NO_TEMPLATE', message: 'SFC に <template> がありません。' });
  const styleAttrs = sty ? sty[1] : '';
  const langM = /\blang\s*=\s*["']?([\w-]+)/.exec(styleAttrs);
  return { template: tpl[1].trim(), script: scr ? scr[1].trim() : '', style: sty ? sty[2].trim() : '', styleLang: langM ? langM[1].toLowerCase() : null };
}

// SCSS/SASS を CSS に（sass は build 時のみ・lazy require＝使わない SFC には読み込まない）。
let _sass = null;
function compileStyleLang(src, lang, template) {
  if (!lang || lang === 'css') return src;
  if (lang !== 'scss' && lang !== 'sass') fail('SUNAO_STYLE_LANG', `<style lang="${lang}"> は未対応です（css / scss / sass）。`, {});
  if (!_sass) { const require = createRequire(import.meta.url); _sass = require('sass'); }
  try {
    return _sass.compileString(src, { syntax: lang === 'sass' ? 'indented' : 'scss' }).css;
  } catch (e) {
    fail('SUNAO_SCSS_ERROR', `${lang.toUpperCase()} のコンパイルに失敗: ${e.message.split('\n')[0]}`, {});
  }
}

// 補間 {{ の対応する }} を探す（文字列/テンプレートリテラルとネストした波括弧を跨ぐ）。
// 例: {{ label || '}}' }} や {{ {a:1}.a }} を正しく閉じる。from は '{{' の直後。
function findInterpEnd(html, from) {
  let q = null, depth = 0;
  for (let j = from; j < html.length; j++) {
    const ch = html[j];
    if (q) { if (ch === '\\') j++; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { if (depth === 0 && html[j + 1] === '}') return j; depth--; }
  }
  return -1;
}

// 開きタグの終端 '>' を、引用符内を無視して探す（属性値の => や a > b で誤爆しない）。
function findTagEnd(html, from) {
  let q = null;
  for (let j = from; j < html.length; j++) {
    const ch = html[j];
    if (q) { if (ch === q) q = null; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '>') return j;
  }
  return -1;
}

// ---- テンプレート parser ----
function parseTemplate(html) {
  let i = 0;
  const root = { type: 'el', tag: '#root', attrs: [], children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];

  const pushPlain = (raw) => { if (raw.trim()) top().children.push({ type: 'text', value: raw.replace(/\s+/g, ' ') }); };

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    const mustache = html.indexOf('{{', i);
    // {{ が < より先なら補間を先に消費（式中の `<`（比較）を tag と誤認しない・M2）。
    if (mustache !== -1 && (lt === -1 || mustache < lt)) {
      if (mustache > i) pushPlain(html.slice(i, mustache));
      const end = findInterpEnd(html, mustache + 2); // 文字列/ネスト波括弧を跨いで対応する }} を探す（M1）
      if (end === -1) fail('SUNAO_INTERP_UNCLOSED', '補間 {{ が閉じていません（}} がありません）。', { src: html, index: mustache });
      const expr = html.slice(mustache + 2, end).trim();
      if (!expr) fail('SUNAO_EMPTY_INTERP', '空の補間 {{ }} は書けません。式を入れてください。', { src: html, index: mustache });
      top().children.push({ type: 'interp', expr, start: mustache });
      i = end + 2;
      continue;
    }
    if (lt === -1) { pushPlain(html.slice(i)); break; }
    if (lt > i) pushPlain(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      if (end === -1) fail('SUNAO_COMMENT_UNCLOSED', 'コメントが閉じていません（--> がありません）。', { src: html, index: lt });
      i = end + 3;
      continue;
    }
    if (html[lt + 1] === '/') {
      const gt = html.indexOf('>', lt);
      if (gt === -1) fail('SUNAO_BAD_CLOSE_TAG', '閉じタグが壊れています（> がありません）。', { src: html, index: lt });
      const tag = html.slice(lt + 2, gt).trim();
      if (top().tag !== tag) fail('SUNAO_TAG_MISMATCH', `タグの対応が合いません: </${tag}> に対する開きタグは <${top().tag}>。`, { src: html, index: lt, suggestions: [`</${top().tag}>`] });
      stack.pop();
      i = gt + 1;
      continue;
    }
    const gt = findTagEnd(html, lt);
    if (gt === -1) fail('SUNAO_UNCLOSED_TAG', '開きタグが閉じていません（> がありません）。', { src: html, index: lt });
    let inner = html.slice(lt + 1, gt).trim();
    const selfClose = inner.endsWith('/');
    if (selfClose) inner = inner.slice(0, -1).trim();
    const sp = inner.search(/\s/);
    const tag = (sp === -1 ? inner : inner.slice(0, sp)).trim();
    const attrStr = sp === -1 ? '' : inner.slice(sp).trim();
    if (!/^[a-zA-Z][\w-]*$/.test(tag)) fail('SUNAO_BAD_TAG', `タグ名が不正です: "${tag}"`, { src: html, index: lt });
    const node = { type: 'el', tag, attrs: parseAttrs(attrStr, tag, html, lt), children: [], start: lt };
    top().children.push(node);
    if (!selfClose && !VOID.has(tag)) stack.push(node);
    i = gt + 1;
  }
  if (stack.length !== 1) fail('SUNAO_UNCLOSED_ELEMENT', `閉じていない要素があります: <${top().tag}>`, { src: html, index: top().start });
  return root.children;
}

function parseAttrs(str, tag, html, base) {
  const attrs = [];
  // 値は "…" / '…' の両対応（findTagEnd は単引用も尊重するのでここも合わせる）。
  const re = /([:@]?[\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  let m;
  while ((m = re.exec(str))) {
    if (!m[0].trim()) continue;
    const name = m[1];
    const value = m[2] ?? m[3] ?? '';
    if (name.startsWith('v-') && !ALLOWED_DIRECTIVES.has(name)) {
      const sug = nearest(name, [...ALLOWED_DIRECTIVES]);
      fail('SUNAO_UNKNOWN_DIRECTIVE',
        `<${tag}> の未知ディレクティブ "${name}"。許可: ${[...ALLOWED_DIRECTIVES].join(', ')}（:bind / @event も可）。${sug ? `もしかして: ${sug}？` : ''}`,
        { src: html, index: base, suggestions: [...ALLOWED_DIRECTIVES] });
    }
    attrs.push({ name, value });
  }
  return attrs;
}

// ---- 式解析ヘルパ（AST ベース: @babel/parser で自由変数を正しく解析） ----
// 破棄する AST ノードのメタキー。
const _AST_META = new Set(['type', 'start', 'end', 'loc', 'range', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'comments']);
// 束縛パターン（arrow/function の仮引数・分割代入）から名前を集める。
function collectBindingNames(node, set) {
  if (!node || typeof node !== 'object') return;
  switch (node.type) {
    case 'Identifier': set.add(node.name); return;
    case 'AssignmentPattern': collectBindingNames(node.left, set); return; // 既定値の右辺は外側参照だが近似で無視
    case 'RestElement': collectBindingNames(node.argument, set); return;
    case 'ArrayPattern': for (const e of node.elements) collectBindingNames(e, set); return;
    case 'ObjectPattern':
      for (const p of node.properties) {
        if (p.type === 'RestElement') collectBindingNames(p.argument, set);
        else collectBindingNames(p.value, set);
      }
      return;
  }
}
// AST を歩いて、宣言/グローバルでない「参照位置の識別子」を used に集める。scopes は束縛集合スタック。
function walkFreeIdents(node, scopes, used, calls) {
  if (!node || typeof node !== 'object') return;
  const declared = (name) => scopes.some((s) => s.has(name));
  switch (node.type) {
    case 'Identifier':
      if (!declared(node.name) && !GLOBALS.has(node.name)) used.add(node.name);
      return;
    case 'MemberExpression':
    case 'OptionalMemberExpression':
      walkFreeIdents(node.object, scopes, used, calls);
      if (node.computed) walkFreeIdents(node.property, scopes, used, calls); // a[b] の b は参照
      return; // a.b の b（非 computed）はプロパティ名＝参照でない
    case 'ObjectProperty':
    case 'Property':
      if (node.computed) walkFreeIdents(node.key, scopes, used, calls); // { [k]: v } の k
      walkFreeIdents(node.value, scopes, used, calls);                   // shorthand {x} も value=Identifier(x) を辿る
      return;
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'ObjectMethod':
    case 'FunctionDeclaration': {
      const s = new Set();
      for (const p of node.params || []) collectBindingNames(p, s);
      if (node.id && node.id.type === 'Identifier') s.add(node.id.name);
      scopes.push(s);
      // 仮引数の既定値は外側/兄弟 scope を参照しうる → 自由変数として拾う（M4: (a = greeting) => a の greeting）
      for (const p of node.params || []) if (p && p.type === 'AssignmentPattern') walkFreeIdents(p.right, scopes, used, calls);
      walkFreeIdents(node.body, scopes, used, calls);
      scopes.pop();
      return;
    }
    case 'CallExpression':
    case 'OptionalCallExpression':
      // 呼ばれた名前（callee が Identifier のみ）を calls に記録（() 呼び忘れ判定用）。
      // a.b() の object `a` は記録しない（L1: {{ user.getName() }} で user を「呼んだ」扱いにしない）。
      if (calls && node.callee && node.callee.type === 'Identifier') calls.add(node.callee.name);
      break; // 既定の子走査へ
  }
  // 既定: 全子ノード/配列を再帰。
  for (const k in node) {
    if (_AST_META.has(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) walkFreeIdents(c, scopes, used, calls); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') walkFreeIdents(v, scopes, used, calls);
  }
}
// 式を parse（式→文の順に試す）。calls に呼ばれた識別子も集める。失敗時は regex fallback。
function analyzeExpr(expr, bound, used, calls) {
  let ast = null;
  try { ast = _parseExpression(String(expr)); }
  catch {
    try { ast = _parseExpression(`(()=>{\n${expr}\n})`); } // イベントの文列（a(); b()）等
    catch { collectIdentsRegex(expr, bound, used); if (calls) noteCalledRegex(expr, calls); return; }
  }
  walkFreeIdents(ast, [new Set(bound)], used, calls);
}
function _parseExpression(src) {
  return _babelParseExpression(src, { plugins: ['optionalChaining', 'nullishCoalescingOperator'], errorRecovery: false });
}
// 旧・正規表現版（AST が使えない式のフォールバック。非回帰用）。
function collectIdentsRegex(expr, bound, used) {
  const noStr = String(expr).replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, ' ');
  const re = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*(:(?!:))?/g;
  let m;
  while ((m = re.exec(noStr))) {
    const [, name, colon] = m;
    if (colon) continue;
    if (GLOBALS.has(name) || bound.has(name)) continue;
    used.add(name);
  }
}
function noteCalledRegex(expr, calls) {
  for (const m of String(expr).matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) calls.add(m[1]);
}
// 公開ヘルパ（呼び出し側は不変）: 自由識別子を used に集める。
function collectIdents(expr, bound, used) {
  analyzeExpr(expr, bound, used, null);
}
function refsCtx(expr, bound) {
  const s = new Set();
  collectIdents(expr, bound, s);
  return s.size > 0;
}
// 式に呼び出しが含まれるか（signal は「呼んで読む」ので、call があれば reactive とみなす）。
function exprHasCall(expr) {
  let ast;
  try { ast = _parseExpression(String(expr)); }
  catch { try { ast = _parseExpression(`(()=>{\n${expr}\n})`); } catch { return /[\w$)\]]\s*\(/.test(String(expr)); } }
  let found = false;
  (function w(n) {
    if (found || !n || typeof n !== 'object') return;
    if (n.type === 'CallExpression' || n.type === 'OptionalCallExpression') { found = true; return; }
    for (const k in n) { if (_AST_META.has(k)) continue; const v = n[k]; if (Array.isArray(v)) v.forEach(w); else if (v && typeof v.type === 'string') w(v); }
  })(ast);
  return found;
}
// 「動的（reactive にすべき）」判定: ctx 参照 **または** 呼び出しを含む。
// 後者が per-item signal（bound な item を呼ぶ）の reactivity を拾う（従来は静的化して更新漏れしていた）。
function isDyn(expr, bound) {
  return refsCtx(expr, bound) || exprHasCall(expr);
}
// 呼び出された識別子（name( / obj.m(）を記録＝「関数っぽい」判定用。
function noteCalled(expr, ctx) {
  const dummy = new Set();
  analyzeExpr(expr, new Set(), dummy, ctx.called);
}
const isBareIdent = (e) => /^[A-Za-z_$][\w$]*$/.test(String(e).trim());
// 値位置の裸の識別子を記録（他所で name() と呼ばれ or signal 束縛なら () 呼び忘れ警告）。
function noteBare(expr, bound, ctx) {
  const e = String(expr).trim();
  if (isBareIdent(e) && !bound.has(e) && !GLOBALS.has(e)) ctx.bare.push(e);
}
// <script> から「呼んで読む」束縛（signal を返すもの）と props を集める。
// これらが値位置に裸で出れば、他所で呼ばれていなくても呼び忘れ濃厚（穴を塞ぐ）。
const SIGNAL_FACTORIES = 'signal|computed|resource|now|useRoute|store|machine';
export function scanSignals(script) {
  const s = new Set();
  const re = new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${SIGNAL_FACTORIES})\\s*\\(`, 'g');
  for (const m of script.matchAll(re)) s.add(m[1]);
  // props は常に accessor（子は prop() で読む）＝値位置の裸参照は呼び忘れ。
  const propsBody = balancedBlock(script, 'props');
  if (propsBody) {
    let depth = 0;
    for (let i = 0; i < propsBody.length; i++) {
      const ch = propsBody[i];
      if (ch === '{') depth++; else if (ch === '}') depth--;
      else if (depth === 0) { const mm = /^([A-Za-z_$][\w$]*)\s*:/.exec(propsBody.slice(i)); if (mm) { s.add(mm[1]); i += mm[0].length - 1; } }
    }
  }
  return s;
}
const isLiteral = (expr) => /^(['"]).*\1$/s.test(expr.trim()) || /^-?\d+(\.\d+)?$/.test(expr.trim());
// v-for のリスト式が reactive か。keyed は常に reactive。それ以外は ctx 参照があれば thunk 化するが、
// **裸の非 signal 識別子**（例: const items = [...]）は依存を持たず thunk が二度と再発火しない＝静的扱いで
// 安全（hydration で adopt でき、tree-shake にも効く）。判定を誤ると under-reactive になるので narrow に。
function listReactive(listExpr, bound, ctx, keyExpr) {
  if (keyExpr) return true;
  const bareNonSignal = isBareIdent(listExpr) && !ctx.signals.has(listExpr);
  return refsCtx(listExpr, bound) && !bareNonSignal;
}

// ---- codegen ----
function genChildren(children, bound, ctx) {
  return children.map((c) => genNode(c, bound, ctx)).filter(Boolean);
}

function genNode(node, bound, ctx) {
  if (node.type === 'text') return JSON.stringify(node.value);
  if (node.type === 'interp') {
    collectIdents(node.expr, bound, ctx.used);
    noteCalled(node.expr, ctx); noteBare(node.expr, bound, ctx);
    if (isDyn(node.expr, bound)) { ctx.hasDynamic = true; return `() => String(${node.expr})`; }
    if (!isLiteral(node.expr)) ctx.staticSerializable = false;
    return `String(${node.expr})`;
  }
  // <slot>: 親から渡された子（$slot）を描画、無ければデフォルト内容。
  if (node.tag === 'slot') {
    ctx.hasDynamic = true;
    const def = genChildren(node.children, bound, ctx);
    return `(typeof ctx.$slot === 'function' ? ctx.$slot() : ${def.length ? `[${def.join(', ')}]` : 'null'})`;
  }
  // element or component（大文字始まり = コンポーネント）
  const isComponent = /^[A-Z]/.test(node.tag);
  // ディレクティブ / :bind / @event / flip / コンポーネントを含む要素は「定数 HTML」に serialize できない
  //（v-if の評価・v-for 展開・:x のリライトが要る）。static 早道に載せない（生の属性が漏れるのを防ぐ）。
  if (isComponent || node.attrs.some((a) => a.name.startsWith(':') || a.name.startsWith('@') || a.name === 'flip' || ALLOWED_DIRECTIVES.has(a.name))) ctx.staticSerializable = false;
  const vIf = node.attrs.find((a) => a.name === 'v-if');
  const vFor = node.attrs.find((a) => a.name === 'v-for');
  const vModel = node.attrs.find((a) => a.name === 'v-model');
  let innerBound = bound;
  let forHead = null;
  let keyExpr = null;
  let flipOn = false; // `flip` 属性 = keyed リストの並び替えを FLIP アニメ
  if (vFor) {
    // "item in expr" または "(item, index) in expr"
    const mm = /^\s*(?:\(\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\)|([A-Za-z_$][\w$]*))\s+in\s+([\s\S]+)$/.exec(vFor.value);
    if (!mm) fail('SUNAO_VFOR_FORM', `v-for は "x in expr" か "(x, i) in expr" の形で書いてください: "${vFor.value}"`, { src: ctx.src, index: node.start, suggestions: ['item in items()', '(item, i) in items()'] });
    const item = mm[1] || mm[3];
    const index = mm[2] || null;
    const listExpr = mm[4];
    collectIdents(listExpr, bound, ctx.used);
    noteCalled(listExpr, ctx);
    innerBound = new Set([...bound, item, ...(index ? [index] : [])]);
    forHead = { item, index, listExpr };
    const keyAttr = node.attrs.find((a) => a.name === ':key' || a.name === 'key');
    if (keyAttr) { keyExpr = keyAttr.value; collectIdents(keyExpr, innerBound, ctx.used); noteCalled(keyExpr, ctx); }
  }

  if (isComponent) {
    // ④ コンポーネント合成: <Child :prop="expr"/>。import 必須（fail-closed）。
    if (!ctx.components.has(node.tag)) {
      fail('SUNAO_COMPONENT_NOT_IMPORTED', `<${node.tag}> は import されていません。<script> に import ${node.tag} from './${node.tag}.sunao' を書いてください（大文字始まり = コンポーネント）。`, { src: ctx.src, index: node.start, suggestions: [...ctx.components] });
    }
    ctx.hasDynamic = true; // 子は reactive になりうる
    const cprops = [];
    // スロット: 子要素を $slot（vnode を返す関数）として渡す。
    if (node.children.length) {
      const sk = genChildren(node.children, innerBound, ctx);
      if (sk.length) cprops.push(`"$slot": () => [${sk.join(', ')}]`);
    }
    for (const a of node.attrs) {
      if (a.name === 'v-if' || a.name === 'v-for' || a.name === ':key' || a.name === 'key') continue;
      if (a.name === 'v-model' || a.name.startsWith('@')) {
        fail('SUNAO_COMPONENT_EVENT', `<${node.tag}>: コンポーネントへの ${a.name} は未対応です（props のみ）。`, { src: ctx.src, index: node.start });
      }
      if (a.name.startsWith(':')) {
        const key = a.name.slice(1);
        collectIdents(a.value, innerBound, ctx.used);
        noteCalled(a.value, ctx); noteBare(a.value, innerBound, ctx);
        cprops.push(`${JSON.stringify(key)}: () => (${a.value})`); // accessor で渡す（reactive）
      } else {
        // 静的属性も accessor に揃える（子は常に prop() で読む）。
        cprops.push(`${JSON.stringify(a.name)}: () => (${JSON.stringify(a.value)})`);
      }
    }
    let expr = `component(${node.tag}, {${cprops.join(', ')}})`;
    if (vIf) { collectIdents(vIf.value, innerBound, ctx.used); noteCalled(vIf.value, ctx); noteBare(vIf.value, innerBound, ctx); expr = isDyn(vIf.value, innerBound) && !vFor ? `() => (${vIf.value}) ? ${expr} : null` : `((${vIf.value}) ? ${expr} : null)`; }
    if (forHead) {
      const params = forHead.index ? `(${forHead.item}, ${forHead.index})` : `(${forHead.item})`;
      const inner = keyExpr
        ? `keyed((${forHead.listExpr}), (${forHead.item}) => (${keyExpr}), ${params} => ${expr})`
        : `(${forHead.listExpr}).map(${params} => ${expr})`;
      if (listReactive(forHead.listExpr, bound, ctx, keyExpr)) { ctx.hasDynamic = true; expr = `() => ${inner}`; }
      else expr = inner;
    }
    return expr;
  }

  const props = [];
  if (ctx.scopeAttr) props.push(`${JSON.stringify(ctx.scopeAttr)}: true`);
  let staticClass = null, dynClass = null; // class マージ用
  for (const a of node.attrs) {
    if (a.name === 'v-if' || a.name === 'v-for' || a.name === 'v-model') continue;
    if (a.name === ':key' || (a.name === 'key' && keyExpr)) continue; // v-for の :key は keyed() が消費
    if (a.name === 'flip') { flipOn = true; continue; } // FLIP アニメ指定（属性として出さない）
    if (a.name === 'class') { staticClass = a.value; continue; }
    if (a.name === ':class') { collectIdents(a.value, innerBound, ctx.used); noteCalled(a.value, ctx); noteBare(a.value, innerBound, ctx); dynClass = a.value; continue; }
    if (a.name.startsWith(':')) {
      const key = a.name.slice(1);
      collectIdents(a.value, innerBound, ctx.used);
      noteCalled(a.value, ctx); noteBare(a.value, innerBound, ctx);
      if (isDyn(a.value, innerBound)) { ctx.hasDynamic = true; props.push(`${JSON.stringify(key)}: () => (${a.value})`); }
      else props.push(`${JSON.stringify(key)}: (${a.value})`);
    } else if (a.name.startsWith('@')) {
      const ev = a.name.slice(1);
      const on = 'on' + ev.charAt(0).toUpperCase() + ev.slice(1);
      collectIdents(a.value, innerBound, ctx.used);
      noteCalled(a.value, ctx);
      ctx.hasEvent = true;
      // イベント引数の糖衣: 単なる参照/関数式はそのまま、式・文なら ($event) => {...} に包む（Vue 互換）。
      const v = a.value.trim();
      const isRef = /^[A-Za-z_$][\w$.]*$/.test(v);
      const isFn = v.startsWith('(') || v.startsWith('function') || /=>/.test(v);
      props.push(`${JSON.stringify(on)}: ${(isRef || isFn) ? `(${v})` : `($event) => { ${v}; }`}`);
    } else {
      props.push(`${JSON.stringify(a.name)}: ${JSON.stringify(a.value)}`);
    }
  }
  // class マージ: 静的 class と :class を結合（Vue 同様）。
  if (staticClass != null && dynClass != null) {
    ctx.hasDynamic = true;
    props.push(`"class": () => [${JSON.stringify(staticClass)}, (${dynClass})].filter(Boolean).join(' ')`);
  } else if (dynClass != null) {
    if (isDyn(dynClass, innerBound)) { ctx.hasDynamic = true; props.push(`"class": () => (${dynClass})`); }
    else props.push(`"class": (${dynClass})`);
  } else if (staticClass != null) {
    props.push(`"class": ${JSON.stringify(staticClass)}`);
  }
  if (vModel) {
    // 純粋な糖衣: :value + @input（signal 前提）。魔法を runtime に持ち込まない。
    collectIdents(vModel.value, innerBound, ctx.used);
    noteCalled(vModel.value, ctx);
    ctx.hasDynamic = true; ctx.hasEvent = true;
    props.push(`"value": () => (${vModel.value})()`);
    props.push(`"onInput": (e) => (${vModel.value}).set(e.target.value)`);
  }
  const propsObj = `{${props.join(', ')}}`;
  const kids = genChildren(node.children, innerBound, ctx);
  let expr = `h(${JSON.stringify(node.tag)}, ${propsObj}, [${kids.join(', ')}])`;

  if (vIf) {
    collectIdents(vIf.value, innerBound, ctx.used);
    noteCalled(vIf.value, ctx); noteBare(vIf.value, innerBound, ctx);
    if (isDyn(vIf.value, innerBound) && !vFor) { ctx.hasDynamic = true; expr = `() => (${vIf.value}) ? ${expr} : null`; }
    else expr = `((${vIf.value}) ? ${expr} : null)`;
  }
  if (forHead) {
    const params = forHead.index ? `(${forHead.item}, ${forHead.index})` : `(${forHead.item})`;
    const inner = keyExpr
      ? `keyed((${forHead.listExpr}), (${forHead.item}) => (${keyExpr}), ${params} => ${expr}${flipOn ? ', true' : ''})`
      : `(${forHead.listExpr}).map(${params} => ${expr})`;
    if (listReactive(forHead.listExpr, bound, ctx, keyExpr)) { ctx.hasDynamic = true; expr = `() => ${inner}`; }
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
export function compileTemplate(template, { scopeAttr = null, components = new Set(), signals = new Set() } = {}) {
  const nodes = parseTemplate(template);
  const ctx = { used: new Set(), hasDynamic: false, hasEvent: false, staticSerializable: true, scopeAttr, components, src: template, called: new Set(), bare: [], signals };
  const roots = genChildren(nodes, new Set(), ctx);
  const body = roots.length === 1 ? roots[0] : `[${roots.join(', ')}]`;
  const destructure = ctx.used.size ? `const { ${[...ctx.used].join(', ')} } = ctx;\n  ` : '';
  const render = `function render(ctx) {\n  ${destructure}return ${body};\n}`;
  const isStatic = !ctx.hasDynamic && !ctx.hasEvent && ctx.staticSerializable;
  // () 呼び忘れ警告: 値位置に裸で出た識別子が、どこかで name() と呼ばれている **または** signal 束縛/props
  // （常に「呼んで読む」）なら、呼び忘れ濃厚。後者で「一度も呼んでいない」silent ケースの穴も塞ぐ。
  const warnings = [...new Set(ctx.bare)].filter((n) => ctx.called.has(n) || signals.has(n)).map((n) => ({
    code: 'SUNAO_CALL_FORGOTTEN',
    message: `"${n}" は値位置で裸で使われていますが、別の箇所で ${n}() と呼ばれています。signal/関数なら ${n}() が要るかもしれません（意図的なら無視可）。`,
    ident: n,
  }));
  return {
    render,
    used: [...ctx.used],
    hasDynamic: ctx.hasDynamic || ctx.hasEvent,
    static: isStatic,
    staticHTML: isStatic ? serializeStatic(nodes, scopeAttr) : null,
    warnings,
  };
}

/** SFC → 警告配列（非致命）。ツール/factory が表示に使う。 */
export function warningsOf(source) {
  try {
    const { template, script } = extractBlocks(source);
    const components = new Set();
    for (const m of script.matchAll(/import\s+([A-Z]\w*)\s+from/g)) components.add(m[1]);
    let scopeAttr = null;
    const sty = /<style[^>]*>([\s\S]*?)<\/style>/.exec(source);
    if (sty) scopeAttr = scopeStyles(sty[1], '').attr;
    return compileTemplate(template, { scopeAttr, components, signals: scanSignals(script) }).warnings || [];
  } catch {
    return []; // コンパイルエラーは別系統（fail-closed）。警告はベストエフォート。
  }
}

/**
 * ツール用のシンボル抽出（LSP の補完・ホバーの頭脳）。編集中で壊れていても throw しない。
 *   { props:[], returns:[], exposed:[], signals:[], components:[] }
 * props/return/expose = テンプレが参照してよい宣言集合。signals = 「呼んで読む」束縛。components = import 済み大文字タグ。
 */
export function symbols(source) {
  const out = { props: [], returns: [], exposed: [], signals: [], components: [] };
  try {
    const scr = /<script>([\s\S]*?)<\/script>/.exec(source);
    const script = scr ? scr[1] : '';
    for (const m of script.matchAll(/import\s+([A-Z]\w*)\s+from/g)) out.components.push(m[1]);
    // props キー（トップレベル）を先に確定
    const propsBody = balancedBlock(script, 'props');
    if (propsBody) {
      let depth = 0;
      for (let i = 0; i < propsBody.length; i++) {
        const ch = propsBody[i];
        if (ch === '{') depth++; else if (ch === '}') depth--;
        else if (depth === 0) { const mm = /^([A-Za-z_$][\w$]*)\s*:/.exec(propsBody.slice(i)); if (mm) { out.props.push(mm[1]); i += mm[0].length - 1; } }
      }
    }
    // signals は「呼んで読む」束縛のみ（scanSignals は props も含むので props を除く）
    const props = new Set(out.props);
    out.signals = [...scanSignals(script)].filter((n) => !props.has(n));
    // expose:[...]
    const ex = /expose\s*:\s*\[([^\]]*)\]/.exec(script);
    if (ex) ex[1].split(',').forEach((s) => { const n = s.trim().replace(/^['"]|['"]$/g, ''); if (n) out.exposed.push(n); });
    // setup の return { ... } の名前（balanced＝ネスト object でも壊れない）
    out.returns = returnNames(script);
  } catch {}
  const uniq = (a) => [...new Set(a)];
  for (const k of Object.keys(out)) out[k] = uniq(out[k]);
  return out;
}

/**
 * 非 throw の診断（エディタ/LSP・ツール用）。error（fail-closed）＋ warning（()呼び忘れ等）を
 * LSP の Diagnostic に近い形で返す。line/column は 1 始まり。
 *   { filename, diagnostics: [{ severity:'error'|'warning', code, message, line, column, suggestions?, ident? }] }
 */
export function diagnose(source, { filename = 'component.sunao' } = {}) {
  const diagnostics = [];
  try {
    compileSFC(source, { runtime: 'sunao' });
  } catch (e) {
    if (e instanceof CompileError) {
      const d = e.diagnostic;
      // 機械可読な fix ヒント（AI の自己修正用）: 未宣言参照/未知ディレクティブは最有力候補を fix に。
      const fix = (d.code === 'SUNAO_UNDECLARED_REF' || d.code === 'SUNAO_UNKNOWN_DIRECTIVE') && d.suggestions && d.suggestions[0] ? d.suggestions[0] : null;
      diagnostics.push({ severity: 'error', code: d.code, message: d.message, line: d.loc?.line ?? 1, column: d.loc?.column ?? 1, suggestions: d.suggestions || [], fix });
    } else {
      diagnostics.push({ severity: 'error', code: 'SUNAO_ERROR', message: e.message, line: 1, column: 1, suggestions: [], fix: null });
    }
  }
  for (const w of warningsOf(source)) {
    const idx = w.ident ? source.indexOf(w.ident) : -1; // ベストエフォートの位置
    const loc = idx >= 0 ? posAt(source, idx) : null;
    // () 呼び忘れは `name()` が fix（signal/関数は呼んで読む）。
    const fix = w.code === 'SUNAO_CALL_FORGOTTEN' && w.ident ? `${w.ident}()` : null;
    diagnostics.push({ severity: 'warning', code: w.code, message: w.message, line: loc?.line ?? 1, column: loc?.column ?? 1, ident: w.ident, fix });
  }
  return { filename, diagnostics };
}

// scoped styles（最小・Vue 方式）: content から短い hash、各セレクタの最後の compound に
// `[scopeAttr]` を足す（`.x` → `.x[data-s]`）。全要素が同じ scope 属性を持つので、
// **ルート要素自身も** マッチし（descendant 方式の穴を塞ぐ）、他コンポーネントには漏れない。
function scopeStyles(css, scopeAttr) {
  let h = 5381;
  for (let i = 0; i < css.length; i++) h = ((h << 5) + h + css.charCodeAt(i)) >>> 0;
  const attr = `data-s${h.toString(36)}`;
  // depth 追跡のスキャナ（SCSS は先に flat CSS 化済み＝ネストは at-rule のみ）。
  // @keyframes の中の step（0% / from / to）は **セレクタでない**ので scope しない（H3: 壊れて animation が消える）。
  let out = '', prelude = '';
  const stack = []; // true = @keyframes の中（直下の子は step なので触らない）
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      const sel = prelude.trim();
      const inKeyframes = stack.length > 0 && stack[stack.length - 1];
      if (sel.startsWith('@')) { out += prelude + '{'; stack.push(/^@(-\w+-)?keyframes\b/.test(sel)); }
      else if (inKeyframes) { out += prelude + '{'; stack.push(false); } // step selector はそのまま
      else { out += sel.split(',').map((s) => scopeSelector(s.trim(), attr)).join(', ') + ' {'; stack.push(false); }
      prelude = '';
    } else if (ch === '}') {
      out += prelude + '}'; prelude = ''; stack.pop();
    } else prelude += ch;
  }
  out += prelude;
  return { attr, scoped: out };
}
// 複合セレクタ列の「最後の単純セレクタ群」に [attr] を挿入（疑似要素/クラスの前）。
function scopeSelector(sel, attr) {
  if (!sel) return sel;
  const parts = sel.split(/(\s*[>+~]\s*|\s+)/); // combinator を保持して分割
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p && !/^\s*[>+~]\s*$/.test(p) && !/^\s+$/.test(p)) { parts[i] = injectScopeAttr(p, attr); break; }
  }
  return parts.join('');
}
function injectScopeAttr(compound, attr) {
  const m = /::?[\w-]/.exec(compound); // 最初の疑似（:hover / ::after）位置
  const idx = m ? m.index : compound.length;
  return `${compound.slice(0, idx)}[${attr}]${compound.slice(idx)}`;
}

/**
 * ビルド時のクロスコンポーネント検査用メタを抽出:
 *   { name, props:{key:{required,type}}, uses:[{tag, props:[names]}] }
 * 全プロジェクト解析して「子に無い prop / 必須 prop 欠落」を build 時に止める（型そのものは runtime 境界）。
 */
// `key:{...}` の釣り合った波括弧の中身を取り出す（ネストした prop spec 用）。
function balancedBlock(script, keyword) {
  const m = new RegExp(keyword + '\\s*:\\s*\\{').exec(script);
  if (!m) return null;
  let depth = 0;
  const start = m.index + m[0].length - 1;
  for (let i = start; i < script.length; i++) {
    if (script[i] === '{') depth++;
    else if (script[i] === '}' && --depth === 0) return script.slice(start + 1, i);
  }
  return null;
}
// `return { ... }` の **トップレベルのキー名**を balanced に取り出す（ネストした {…} でも壊れない）。
// 旧実装は /return\s*\{([^{}]*)\}/ でネスト object があると空になり、未宣言参照を誤検出していた。
function returnNames(script) {
  const m = /\breturn\s*\{/.exec(script);
  if (!m) return [];
  const open = m.index + m[0].length - 1;
  let depth = 0, body = null;
  for (let i = open; i < script.length; i++) {
    if (script[i] === '{') depth++;
    else if (script[i] === '}' && --depth === 0) { body = script.slice(open + 1, i); break; }
  }
  if (body == null) return [];
  const names = [];
  let d = 0, seg = '';
  const take = (s) => { const km = /^\s*([A-Za-z_$][\w$]*)\s*[:,]?/.exec(s); if (km && !s.trim().startsWith('...')) names.push(km[1]); };
  for (const ch of body) {
    if (ch === '{' || ch === '(' || ch === '[') { d++; seg += ch; }
    else if (ch === '}' || ch === ')' || ch === ']') { d--; seg += ch; }
    else if (ch === ',' && d === 0) { take(seg); seg = ''; }
    else seg += ch;
  }
  if (seg.trim()) take(seg);
  return names;
}

export function analyze(source) {
  const { template, script } = extractBlocks(source);
  const nameM = /name\s*:\s*['"]([A-Za-z0-9_$]+)['"]/.exec(script);
  const props = {};
  const propsBody = balancedBlock(script, 'props');
  if (propsBody) {
    // トップレベルのキーを深さ 0 で拾う（値が {…} でも識別子でも登録。spread(...X) は無視）。
    let i = 0, depth = 0;
    while (i < propsBody.length) {
      const ch = propsBody[i];
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth--;
      else if (depth === 0) {
        const mm = /^([A-Za-z_$][\w$]*)\s*:/.exec(propsBody.slice(i));
        if (mm) {
          let j = i + mm[0].length, d = 0, val = '';
          for (; j < propsBody.length; j++) {
            const c = propsBody[j];
            if (c === '{' || c === '(' || c === '[') d++;
            else if (c === '}' || c === ')' || c === ']') d--;
            else if (c === ',' && d === 0) break;
            val += c;
          }
          const enumM = /enum\s*:\s*\[([^\]]*)\]/.exec(val);
          const en = enumM ? enumM[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : null;
          props[mm[1]] = { required: /required\s*:\s*true/.test(val), type: (/\btype\s*:\s*['"](\w+)['"]/.exec(val) || [])[1] || null, enum: en };
          i = j;
          continue;
        }
      }
      i++;
    }
  }
  const uses = [];
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.type !== 'el') continue;
      if (/^[A-Z]/.test(n.tag)) {
        const pn = n.attrs
          .filter((a) => !['v-if', 'v-for', 'v-model', ':key', 'key'].includes(a.name))
          .map((a) => a.name.replace(/^[:@]/, ''));
        uses.push({ tag: n.tag, props: pn });
      }
      walk(n.children);
    }
  };
  walk(parseTemplate(template));
  return { name: nameM ? nameM[1] : null, props, uses };
}

/**
 * 部品の契約を **機械可読**に（AI がソースを読まず `<Child/>` を正しく組めるように）。
 *   { name, file?, props:[{name,type,required,enum}], slots(bool), events:[], uses:[{tag,props}], signals:[] }
 * 編集中で壊れていても throw しない（best-effort）。
 */
export function manifest(source, file = null) {
  try {
    const { template, script } = extractBlocks(source);
    const a = analyze(source);
    const props = Object.entries(a.props).map(([name, s]) => ({ name, type: s.type || null, required: !!s.required, enum: s.enum || null }));
    const sy = symbols(source);
    const slots = /<slot[\s/>]/.test(template); // 既定 slot を受け取るか
    // @event 系はコンポーネントには未対応なので events は空（将来 emit を入れたらここに）。
    return { name: a.name || (file ? file.replace(/.*\//, '').replace(/\.sunao$/, '') : null), file, props, slots, uses: a.uses, signals: sy.signals };
  } catch {
    return { name: null, file, props: [], slots: false, uses: [], signals: [] };
  }
}

// ---- source map（line-level・<script> 用） ----
// codegen は位置追跡しないが、compileSFC は <script> 本文をほぼ逐語で保持する（export default だけ置換）。
// なので出力の script 領域を .sunao の script 行へ 1:1 対応させる line-level map を作れば、
// **実行時エラー（ユーザの setup ロジック）が .sunao の正しい行へ戻る**（テンプレ由来行は script 先頭に寄せる）。
const _B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function vlq(n) {
  let v = n < 0 ? ((-n) << 1) | 1 : n << 1;
  let s = '';
  do { let d = v & 31; v >>>= 5; if (v > 0) d |= 32; s += _B64[d]; } while (v > 0);
  return s;
}
function scriptSourceMap(source, out, scriptBody, importLines, filename) {
  const tag = /<script>/.exec(source);
  if (!tag) return '';
  let p = tag.index + tag[0].length;
  while (p < source.length && /\s/.test(source[p])) p++; // trim される先頭空白ぶんを飛ばす
  const firstLine0 = source.slice(0, p).split('\n').length - 1; // script 本文の先頭ソース行（0 始まり）
  const B = scriptBody.split('\n').length;
  const genLines = out.split('\n').length;
  let prevSrc = 0;
  const segs = [];
  for (let g = 0; g < genLines; g++) {
    let src;
    if (g < importLines) src = firstLine0;                       // import 行 → script 先頭
    else if (g < importLines + B) src = firstLine0 + (g - importLines); // script 本文を 1:1
    else src = firstLine0 + (B - 1);                             // 合成した render/export 行 → script 末尾
    segs.push(vlq(0) + vlq(0) + vlq(src - prevSrc) + vlq(0));    // genCol0, srcIdx0, srcLineΔ, srcCol0
    prevSrc = src;
  }
  const map = { version: 3, sources: [filename], sourcesContent: [source], names: [], mappings: segs.join(';') };
  return `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}\n`;
}

/** SFC → ES モジュール文字列。sourcemap:true で inline line-level map を付ける（filename は .sunao 名）。 */
export function compileSFC(source, { runtime = './runtime.mjs', sourcemap = false, filename = 'component.sunao' } = {}) {
  const { template, script, style, styleLang } = extractBlocks(source);

  let scopeAttr = null, scopedCss = null;
  if (style) { const css = compileStyleLang(style, styleLang, template); const s = scopeStyles(css, ''); scopeAttr = s.attr; scopedCss = s.scoped; }

  // ④ import されたコンポーネント（大文字始まり）を把握。
  const components = new Set();
  for (const m of script.matchAll(/import\s+([A-Z]\w*)\s+from/g)) components.add(m[1]);

  const compiled = compileTemplate(template, { scopeAttr, components, signals: scanSignals(script) });

  // ④ 宣言必須（fail-closed）: 宣言集合が判れば、テンプレの未宣言参照を止める（診断つき）。
  //    宣言集合 = props のキー ∪ expose:[...] ∪ setup の `return { ... }` で返した名前。
  const declared = new Set();
  const exposeM = /expose\s*:\s*\[([^\]]*)\]/.exec(script);
  if (exposeM) exposeM[1].split(',').forEach((s) => { const n = s.trim().replace(/^['"]|['"]$/g, ''); if (n) declared.add(n); });
  const propsBody = balancedBlock(script, 'props');
  if (propsBody) {
    // トップレベルのキーだけ（ネストした { type, required } の中は見ない）。
    let depth = 0;
    for (let i = 0; i < propsBody.length; i++) {
      const ch = propsBody[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (depth === 0) {
        const mm = /^([A-Za-z_$][\w$]*)\s*:/.exec(propsBody.slice(i));
        if (mm) { declared.add(mm[1]); i += mm[0].length - 1; }
      }
    }
  }
  for (const n of returnNames(script)) declared.add(n);

  if (declared.size) {
    const unknown = compiled.used.filter((u) => !declared.has(u));
    if (unknown.length) {
      const sugg = unknown.map((u) => nearest(u, [...declared])).filter(Boolean);
      const hints = unknown.map((u) => { const s = nearest(u, [...declared]); return s ? `${u}（もしかして: ${s}？）` : u; });
      fail('SUNAO_UNDECLARED_REF',
        `テンプレが未宣言の識別子を参照: ${hints.join(', ')}。setup の return / props / expose に宣言してください（declared: ${[...declared].join(', ')}）。`,
        { src: template, index: template.indexOf(unknown[0]), suggestions: sugg });
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

  // script が無い / export default が無いが static でもない（例: <script> 省略で v-if="false" や
  // 静的 v-for を使う）→ 空コンポーネントを合成して dynamic 経路に載せる（描画は state 不要）。
  const hasExport = /export\s+default/.test(script);
  if (!hasExport && /\bsetup\b/.test(script)) {
    throw new CompileError({ code: 'SUNAO_NO_EXPORT', message: '<script> は `export default { setup() {...} }` を持つ必要があります（静的コンポーネントは <script> 省略可）。' });
  }
  const scriptBody = hasExport ? script.replace(/export\s+default/, 'const __component =') : `${script}\nconst __component = {};`;
  const stylesLine = scopedCss ? `__component.styles = ${JSON.stringify(scopedCss)};\n` : '';
  const importLine = `import { h, signal, effect, computed, batch, component, keyed, windowed, windowedVar, useRoute, navigate, matchRoute, setRouteGuard, onCleanup, onMount, now, interval, timeout, debounce, throttle, context, go, resource, provide, inject, machine, store, decode, match, produce, boundary } from ${JSON.stringify(runtime)};\n`;
  const out = (
    importLine +
    `${scriptBody}\n` +
    `__component.${compiled.render.replace(/^function /, 'render = function ')};\n` +
    stylesLine +
    `export default __component;\n`
  );
  if (!sourcemap) return out;
  // import 行は 1 行（JSON.stringify(runtime) に改行は入らない）。
  return out + scriptSourceMap(source, out, scriptBody, importLine.split('\n').length - 1, filename);
}
