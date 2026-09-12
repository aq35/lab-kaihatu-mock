/**
 * sunao 式パーサ — 依存ゼロ。@babel/parser を置き換える自前実装。
 *
 * 目的: テンプレの式・イベントハンドラの「自由変数」と「呼び出し」を正しく解析する。
 * 出力は **Babel 互換の AST サブセット**（node.type と子キーだけ）なので、
 * compile.mjs の walkFreeIdents / collectBindingNames / exprHasCall は無改変で動く。
 *
 * 対応文法（＝テンプレの式に書ける範囲。ここを増やせば文法が増える）:
 *   識別子/リテラル(数値・文字列・真偽・null・undefined)/テンプレートリテラル/
 *   配列・オブジェクト（shorthand・computed key・method・spread）/括弧/
 *   アロー関数（式本体・ブロック本体・**async**）/関数式/new/
 *   メンバ(. ?. [] ?.[])・呼び出し(() ?.())/単項(! - + ~ typeof void delete **await** ++ --)/
 *   二項・論理(** * / % + - << >> >>> < > <= >= in instanceof == != === !== & ^ | && || ??)/
 *   三項/代入/カンマ列/spread/
 *   文（ブロック本体用）: return・const/let/var・if・式文・空文。
 * 非対応（→ regex フォールバックに安全に落ちる。必要なら都度ここへ足す）:
 *   generator/yield・正規表現リテラル・ラベル文・class 式・decorator 等。
 *
 * ここで解析できない稀な式は throw → 呼び出し側が正規表現フォールバックに落とす（安全網は不変）。
 */

// ---- トークナイザ ----
const KEYWORD_OPS = new Set(['in', 'instanceof']);
const UNARY_WORDS = new Set(['typeof', 'void', 'delete', 'await']);
// 3/2 文字の記号（長い順）。
const PUNCT3 = ['===', '!==', '>>>', '...', '**=', '<<=', '>>=', '&&=', '||=', '??=', '>>>='];
const PUNCT2 = ['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '**', '<<', '>>', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '?.'];
const PUNCT1 = new Set('+-*/%<>!~?:=&|^.,;()[]{}'.split(''));

function isIdStart(c) { return /[A-Za-z_$]/.test(c); }
function isIdPart(c) { return /[\w$]/.test(c); }
function isDigit(c) { return c >= '0' && c <= '9'; }

function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    // 空白
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }
    // コメント
    if (c === '/' && src[i + 1] === '/') { i += 2; while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    // 文字列
    if (c === '"' || c === "'") { const [val, end] = readString(src, i); toks.push({ t: 'str', v: val, s: i, e: end }); i = end; continue; }
    // テンプレートリテラル
    if (c === '`') { const [node, end] = readTemplate(src, i); toks.push({ t: 'tpl', node, s: i, e: end }); i = end; continue; }
    // 数値
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) { const end = readNumber(src, i); toks.push({ t: 'num', v: src.slice(i, end), s: i, e: end }); i = end; continue; }
    // 識別子/キーワード
    if (isIdStart(c)) { let j = i + 1; while (j < n && isIdPart(src[j])) j++; toks.push({ t: 'name', v: src.slice(i, j), s: i, e: j }); i = j; continue; }
    // 記号（長い順）
    let matched = null;
    if (i + 3 <= n) { const p3 = src.slice(i, i + 4); for (const p of PUNCT3) if (p3.startsWith(p)) { matched = p; break; } }
    if (!matched) { const p2 = src.slice(i, i + 2); if (PUNCT2.includes(p2)) matched = p2; }
    if (!matched && PUNCT1.has(c)) matched = c;
    if (!matched) throw new Error('sunao/expr: 不明な文字 ' + JSON.stringify(c) + ' at ' + i);
    toks.push({ t: 'punct', v: matched, s: i, e: i + matched.length });
    i += matched.length;
  }
  toks.push({ t: 'eof', v: '', s: n, e: n });
  return toks;
}

function readString(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (c === q) { j++; break; }
    j++;
  }
  if (j > src.length) throw new Error('sunao/expr: 文字列が閉じていない');
  return [src.slice(i + 1, j - 1), j];
}

// テンプレートリテラルを {type:'TemplateLiteral', quasis, expressions} に。
// ${ } の中は再帰 parse。ネストした `${}`・文字列・テンプレも brace 深度で正しく追う。
function readTemplate(src, i) {
  const quasis = [];
  const expressions = [];
  let j = i + 1;
  let cooked = '';
  const n = src.length;
  while (j < n) {
    const c = src[j];
    if (c === '\\') { cooked += src.slice(j, j + 2); j += 2; continue; }
    if (c === '`') { quasis.push(quasi(cooked, true)); j++; return [{ type: 'TemplateLiteral', quasis, expressions }, j]; }
    if (c === '$' && src[j + 1] === '{') {
      quasis.push(quasi(cooked, false)); cooked = '';
      // ${ ... } を brace 対応で抜き出す
      let depth = 1; let k = j + 2; const start = k;
      while (k < n && depth > 0) {
        const d = src[k];
        if (d === '{') depth++;
        else if (d === '}') { depth--; if (depth === 0) break; }
        else if (d === '"' || d === "'") { const [, end] = readString(src, k); k = end; continue; }
        else if (d === '`') { const [, end] = readTemplate(src, k); k = end; continue; }
        k++;
      }
      if (depth !== 0) throw new Error('sunao/expr: テンプレの ${} が閉じていない');
      const inner = src.slice(start, k);
      expressions.push(parseExpressionString(inner));
      j = k + 1; // '}' の次
      continue;
    }
    cooked += c; j++;
  }
  throw new Error('sunao/expr: テンプレートリテラルが閉じていない');
}
function quasi(cooked, tail) { return { type: 'TemplateElement', value: { raw: cooked, cooked }, tail }; }

function readNumber(src, i) {
  let j = i;
  const n = src.length;
  if (src[j] === '0' && /[xXoObB]/.test(src[j + 1] || '')) { j += 2; while (j < n && /[0-9a-fA-F_]/.test(src[j])) j++; return j; }
  while (j < n && (isDigit(src[j]) || src[j] === '_')) j++;
  if (src[j] === '.') { j++; while (j < n && (isDigit(src[j]) || src[j] === '_')) j++; }
  if (src[j] === 'e' || src[j] === 'E') { j++; if (src[j] === '+' || src[j] === '-') j++; while (j < n && isDigit(src[j])) j++; }
  if (src[j] === 'n') j++; // bigint 接尾辞
  return j;
}

// ---- パーサ（Pratt） ----
// 二項演算子の左結合強度。
const BIN_BP = {
  '??': 1, '||': 1, '&&': 2,
  '|': 3, '^': 4, '&': 5,
  '==': 6, '!=': 6, '===': 6, '!==': 6,
  '<': 7, '>': 7, '<=': 7, '>=': 7, in: 7, instanceof: 7,
  '<<': 8, '>>': 8, '>>>': 8,
  '+': 9, '-': 9,
  '*': 10, '/': 10, '%': 10,
  '**': 11,
};
const LOGICAL = new Set(['&&', '||', '??']);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '&=', '|=', '^=', '&&=', '||=', '??=']);

class Parser {
  constructor(toks) { this.toks = toks; this.p = 0; }
  peek(o = 0) { return this.toks[this.p + o]; }
  next() { return this.toks[this.p++]; }
  isPunct(v) { const t = this.peek(); return t.t === 'punct' && t.v === v; }
  isName(v) { const t = this.peek(); return t.t === 'name' && t.v === v; }
  eat(v) { if (!this.isPunct(v)) throw new Error('sunao/expr: 期待した記号 ' + v + ' が無い'); return this.next(); }

  // プログラム（文の列）。ブロック本体・トップ文列に使う。
  parseProgram() {
    const body = [];
    while (this.peek().t !== 'eof') body.push(this.parseStatement());
    return { type: 'Program', body };
  }
  parseBlock() {
    this.eat('{');
    const body = [];
    while (!this.isPunct('}') && this.peek().t !== 'eof') body.push(this.parseStatement());
    this.eat('}');
    return { type: 'BlockStatement', body };
  }
  parseStatement() {
    const t = this.peek();
    if (t.t === 'punct' && t.v === ';') { this.next(); return { type: 'EmptyStatement' }; }
    if (t.t === 'punct' && t.v === '{') return this.parseBlock();
    if (t.t === 'name' && t.v === 'return') {
      this.next();
      let arg = null;
      if (!this.isPunct(';') && !this.isPunct('}') && this.peek().t !== 'eof') arg = this.parseExpression();
      if (this.isPunct(';')) this.next();
      return { type: 'ReturnStatement', argument: arg };
    }
    if (t.t === 'name' && (t.v === 'const' || t.v === 'let' || t.v === 'var')) return this.parseVarDecl();
    if (t.t === 'name' && t.v === 'if') return this.parseIf();
    const expr = this.parseExpression();
    if (this.isPunct(';')) this.next();
    return { type: 'ExpressionStatement', expression: expr };
  }
  parseVarDecl() {
    const kind = this.next().v;
    const declarations = [];
    do {
      const id = this.parseBindingTarget();
      let init = null;
      if (this.isPunct('=')) { this.next(); init = this.parseAssign(); }
      declarations.push({ type: 'VariableDeclarator', id, init });
    } while (this.isPunct(',') && (this.next(), true));
    if (this.isPunct(';')) this.next();
    return { type: 'VariableDeclaration', kind, declarations };
  }
  parseIf() {
    this.next(); this.eat('(');
    const test = this.parseExpression();
    this.eat(')');
    const consequent = this.parseStatement();
    let alternate = null;
    if (this.isName('else')) { this.next(); alternate = this.parseStatement(); }
    return { type: 'IfStatement', test, consequent, alternate };
  }

  // 式（カンマ列を許す）。
  parseExpression() {
    let expr = this.parseAssign();
    if (this.isPunct(',')) {
      const expressions = [expr];
      while (this.isPunct(',')) { this.next(); expressions.push(this.parseAssign()); }
      return { type: 'SequenceExpression', expressions };
    }
    return expr;
  }
  parseAssign() {
    // アロー関数の検出（Identifier => ... / (params) => ...）
    const arrow = this.tryParseArrow();
    if (arrow) return arrow;
    const left = this.parseConditional();
    const t = this.peek();
    if (t.t === 'punct' && ASSIGN_OPS.has(t.v)) {
      this.next();
      const right = this.parseAssign();
      return { type: 'AssignmentExpression', operator: t.v, left, right };
    }
    return left;
  }
  parseConditional() {
    const test = this.parseBinary(0);
    if (this.isPunct('?')) {
      this.next();
      const consequent = this.parseAssign();
      this.eat(':');
      const alternate = this.parseAssign();
      return { type: 'ConditionalExpression', test, consequent, alternate };
    }
    return test;
  }
  parseBinary(minBp) {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      let op = null;
      if (t.t === 'punct' && BIN_BP[t.v] != null) op = t.v;
      else if (t.t === 'name' && KEYWORD_OPS.has(t.v)) op = t.v;
      if (op == null) break;
      const bp = BIN_BP[op];
      if (bp < minBp) break;
      this.next();
      const rightAssoc = op === '**';
      const right = this.parseBinary(rightAssoc ? bp : bp + 1);
      left = { type: LOGICAL.has(op) ? 'LogicalExpression' : 'BinaryExpression', operator: op, left, right };
    }
    return left;
  }
  parseUnary() {
    const t = this.peek();
    if (t.t === 'punct' && (t.v === '!' || t.v === '-' || t.v === '+' || t.v === '~')) {
      this.next();
      return { type: 'UnaryExpression', operator: t.v, prefix: true, argument: this.parseUnary() };
    }
    if (t.t === 'punct' && (t.v === '++' || t.v === '--')) {
      this.next();
      return { type: 'UpdateExpression', operator: t.v, prefix: true, argument: this.parseUnary() };
    }
    if (t.t === 'name' && UNARY_WORDS.has(t.v)) {
      this.next();
      return { type: 'UnaryExpression', operator: t.v, prefix: true, argument: this.parseUnary() };
    }
    return this.parsePostfix();
  }
  parsePostfix() {
    let expr = this.parseCallMember();
    const t = this.peek();
    if (t.t === 'punct' && (t.v === '++' || t.v === '--')) { this.next(); return { type: 'UpdateExpression', operator: t.v, prefix: false, argument: expr }; }
    return expr;
  }
  parseCallMember() {
    let expr = this.parsePrimary();
    for (;;) {
      if (this.isPunct('.')) {
        this.next();
        const name = this.next();
        if (name.t !== 'name') throw new Error('sunao/expr: . の後は名前');
        expr = { type: 'MemberExpression', object: expr, property: { type: 'Identifier', name: name.v }, computed: false };
      } else if (this.isPunct('?.')) {
        this.next();
        if (this.isPunct('(')) { expr = { type: 'OptionalCallExpression', callee: expr, arguments: this.parseArgs(), optional: true }; }
        else if (this.isPunct('[')) { this.next(); const prop = this.parseExpression(); this.eat(']'); expr = { type: 'OptionalMemberExpression', object: expr, property: prop, computed: true, optional: true }; }
        else { const name = this.next(); if (name.t !== 'name') throw new Error('sunao/expr: ?. の後は名前/[/('); expr = { type: 'OptionalMemberExpression', object: expr, property: { type: 'Identifier', name: name.v }, computed: false, optional: true }; }
      } else if (this.isPunct('[')) {
        this.next(); const prop = this.parseExpression(); this.eat(']');
        expr = { type: 'MemberExpression', object: expr, property: prop, computed: true };
      } else if (this.isPunct('(')) {
        expr = { type: 'CallExpression', callee: expr, arguments: this.parseArgs() };
      } else if (this.peek().t === 'tpl') {
        // タグ付きテンプレ: fn`...`
        const tpl = this.next().node;
        expr = { type: 'TaggedTemplateExpression', tag: expr, quasi: tpl };
      } else break;
    }
    return expr;
  }
  parseArgs() {
    this.eat('(');
    const args = [];
    while (!this.isPunct(')')) {
      if (this.isPunct('...')) { this.next(); args.push({ type: 'SpreadElement', argument: this.parseAssign() }); }
      else args.push(this.parseAssign());
      if (this.isPunct(',')) this.next(); else break;
    }
    this.eat(')');
    return args;
  }
  parsePrimary() {
    const t = this.peek();
    if (t.t === 'num') { this.next(); return { type: 'NumericLiteral', value: Number(t.v.replace(/_/g, '').replace(/n$/, '')) }; }
    if (t.t === 'str') { this.next(); return { type: 'StringLiteral', value: t.v }; }
    if (t.t === 'tpl') { this.next(); return t.node; }
    if (t.t === 'name') {
      // リテラル語
      if (t.v === 'true' || t.v === 'false') { this.next(); return { type: 'BooleanLiteral', value: t.v === 'true' }; }
      if (t.v === 'null') { this.next(); return { type: 'NullLiteral' }; }
      if (t.v === 'undefined') { this.next(); return { type: 'Identifier', name: 'undefined' }; }
      if (t.v === 'this') { this.next(); return { type: 'ThisExpression' }; }
      if (t.v === 'new') { this.next(); const callee = this.parseCallMemberNoCall(); let args = []; if (this.isPunct('(')) args = this.parseArgs(); return { type: 'NewExpression', callee, arguments: args }; }
      if (t.v === 'function') return this.parseFunctionExpr();
      this.next();
      return { type: 'Identifier', name: t.v };
    }
    if (t.t === 'punct') {
      if (t.v === '(') { this.next(); const e = this.parseExpression(); this.eat(')'); return e; }
      if (t.v === '[') return this.parseArray();
      if (t.v === '{') return this.parseObject();
    }
    throw new Error('sunao/expr: 予期しないトークン ' + JSON.stringify(t.v));
  }
  // new の callee 用（呼び出しは new が消費するので member のみ辿る）。
  parseCallMemberNoCall() {
    let expr = this.parsePrimary();
    for (;;) {
      if (this.isPunct('.')) { this.next(); const name = this.next(); expr = { type: 'MemberExpression', object: expr, property: { type: 'Identifier', name: name.v }, computed: false }; }
      else if (this.isPunct('[')) { this.next(); const prop = this.parseExpression(); this.eat(']'); expr = { type: 'MemberExpression', object: expr, property: prop, computed: true }; }
      else break;
    }
    return expr;
  }
  parseFunctionExpr() {
    this.next(); // function
    let id = null;
    if (this.peek().t === 'name' && !this.isPunct('(')) { id = { type: 'Identifier', name: this.next().v }; }
    const params = this.parseParams();
    const body = this.parseBlock();
    return { type: 'FunctionExpression', id, params, body };
  }
  parseArray() {
    this.eat('[');
    const elements = [];
    while (!this.isPunct(']')) {
      if (this.isPunct(',')) { this.next(); elements.push(null); continue; } // 疎配列
      if (this.isPunct('...')) { this.next(); elements.push({ type: 'SpreadElement', argument: this.parseAssign() }); }
      else elements.push(this.parseAssign());
      if (this.isPunct(',')) this.next(); else break;
    }
    this.eat(']');
    return { type: 'ArrayExpression', elements };
  }
  parseObject() {
    this.eat('{');
    const properties = [];
    while (!this.isPunct('}')) {
      if (this.isPunct('...')) { this.next(); properties.push({ type: 'SpreadElement', argument: this.parseAssign() }); if (this.isPunct(',')) this.next(); continue; }
      let computed = false;
      let key;
      if (this.isPunct('[')) { this.next(); key = this.parseAssign(); this.eat(']'); computed = true; }
      else { const k = this.next(); if (k.t === 'str') key = { type: 'StringLiteral', value: k.v }; else if (k.t === 'num') key = { type: 'NumericLiteral', value: Number(k.v) }; else key = { type: 'Identifier', name: k.v }; }
      if (this.isPunct('(')) {
        // メソッド
        const params = this.parseParams();
        const body = this.parseBlock();
        properties.push({ type: 'ObjectMethod', key, computed, params, body, kind: 'method' });
      } else if (this.isPunct(':')) {
        this.next();
        const value = this.parseAssign();
        properties.push({ type: 'ObjectProperty', key, value, computed, shorthand: false });
      } else {
        // shorthand（{x} or {x = default}）
        let value = key;
        if (this.isPunct('=')) { this.next(); value = { type: 'AssignmentPattern', left: key, right: this.parseAssign() }; }
        properties.push({ type: 'ObjectProperty', key, value, computed: false, shorthand: true });
      }
      if (this.isPunct(',')) this.next(); else break;
    }
    this.eat('}');
    return { type: 'ObjectExpression', properties };
  }

  // ---- アロー関数 ----
  tryParseArrow() {
    const t = this.peek();
    // async アロー: async x => ... / async (params) => ...
    if (t.t === 'name' && t.v === 'async') {
      const t1 = this.peek(1);
      if (t1.t === 'name' && !KEYWORD_OPS.has(t1.v) && this.peek(2).t === 'punct' && this.peek(2).v === '=>') {
        this.next(); const id = this.next(); this.next();
        return this.finishArrow([{ type: 'Identifier', name: id.v }], true);
      }
      if (t1.t === 'punct' && t1.v === '(') {
        const close = this.matchParen(this.p + 1);
        const after = close >= 0 ? this.toks[close + 1] : null;
        if (after && after.t === 'punct' && after.v === '=>') {
          this.next(); // async
          const params = this.parseParams();
          this.eat('=>');
          return this.finishArrow(params, true);
        }
      }
    }
    // x => ...
    if (t.t === 'name' && !KEYWORD_OPS.has(t.v) && !UNARY_WORDS.has(t.v) && this.peek(1).t === 'punct' && this.peek(1).v === '=>') {
      this.next(); this.next();
      return this.finishArrow([{ type: 'Identifier', name: t.v }]);
    }
    // (params) => ...  — 括弧が対応する `)` の直後が `=>` なら params とみなす
    if (t.t === 'punct' && t.v === '(') {
      const close = this.matchParen(this.p);
      if (close >= 0) {
        const after = this.toks[close + 1];
        if (after && after.t === 'punct' && after.v === '=>') {
          const params = this.parseParams();
          this.eat('=>') /* '=>' */;
          return this.finishArrow(params);
        }
      }
    }
    return null;
  }
  finishArrow(params, isAsync = false) {
    let body;
    if (this.isPunct('{')) body = this.parseBlock();
    else body = this.parseAssign();
    return { type: 'ArrowFunctionExpression', params, body, async: isAsync };
  }
  // p 位置（'(') に対応する ')' のインデックスを返す（無ければ -1）。
  matchParen(p) {
    let depth = 0;
    for (let k = p; k < this.toks.length; k++) {
      const tk = this.toks[k];
      if (tk.t === 'punct' && (tk.v === '(' || tk.v === '[' || tk.v === '{')) depth++;
      else if (tk.t === 'punct' && (tk.v === ')' || tk.v === ']' || tk.v === '}')) { depth--; if (depth === 0) return k; }
      else if (tk.t === 'eof') return -1;
    }
    return -1;
  }
  parseParams() {
    this.eat('(');
    const params = [];
    while (!this.isPunct(')')) {
      if (this.isPunct('...')) { this.next(); params.push({ type: 'RestElement', argument: this.parseBindingTarget() }); }
      else {
        let target = this.parseBindingTarget();
        if (this.isPunct('=')) { this.next(); target = { type: 'AssignmentPattern', left: target, right: this.parseAssign() }; }
        params.push(target);
      }
      if (this.isPunct(',')) this.next(); else break;
    }
    this.eat(')');
    return params;
  }
  // 束縛対象（識別子・分割代入パターン）。
  parseBindingTarget() {
    if (this.isPunct('[')) {
      this.next();
      const elements = [];
      while (!this.isPunct(']')) {
        if (this.isPunct(',')) { this.next(); elements.push(null); continue; }
        if (this.isPunct('...')) { this.next(); elements.push({ type: 'RestElement', argument: this.parseBindingTarget() }); }
        else { let el = this.parseBindingTarget(); if (this.isPunct('=')) { this.next(); el = { type: 'AssignmentPattern', left: el, right: this.parseAssign() }; } elements.push(el); }
        if (this.isPunct(',')) this.next(); else break;
      }
      this.eat(']');
      return { type: 'ArrayPattern', elements };
    }
    if (this.isPunct('{')) {
      this.next();
      const properties = [];
      while (!this.isPunct('}')) {
        if (this.isPunct('...')) { this.next(); properties.push({ type: 'RestElement', argument: this.parseBindingTarget() }); if (this.isPunct(',')) this.next(); continue; }
        let computed = false; let key;
        if (this.isPunct('[')) { this.next(); key = this.parseAssign(); this.eat(']'); computed = true; }
        else { const k = this.next(); key = k.t === 'str' ? { type: 'StringLiteral', value: k.v } : { type: 'Identifier', name: k.v }; }
        let value;
        if (this.isPunct(':')) { this.next(); value = this.parseBindingTarget(); }
        else value = key; // shorthand
        if (this.isPunct('=')) { this.next(); value = { type: 'AssignmentPattern', left: value, right: this.parseAssign() }; }
        properties.push({ type: 'ObjectProperty', key, value, computed, shorthand: !computed });
        if (this.isPunct(',')) this.next(); else break;
      }
      this.eat('}');
      return { type: 'ObjectPattern', properties };
    }
    const t = this.next();
    if (t.t !== 'name') throw new Error('sunao/expr: 束縛名を期待');
    return { type: 'Identifier', name: t.v };
  }
}

// ---- 公開 API ----
// 1 個の式として parse（完全消費を要求）。テンプレの {{ }} や :attr / v-if などに使う。
export function parseExpressionString(src) {
  const p = new Parser(tokenize(src));
  const expr = p.parseAssignEntry();
  if (p.peek().t !== 'eof') throw new Error('sunao/expr: 末尾に余分なトークン');
  return expr;
}
// エントリ用: カンマ列も式として許す（1 式扱い）。
Parser.prototype.parseAssignEntry = function () { return this.parseExpression(); };

// 文の列として parse（イベントハンドラの `a(); b()` 等）。Program を返す。
export function parseProgramString(src) {
  const p = new Parser(tokenize(src));
  const prog = p.parseProgram();
  if (p.peek().t !== 'eof') throw new Error('sunao/expr: 末尾に余分なトークン');
  return prog;
}
