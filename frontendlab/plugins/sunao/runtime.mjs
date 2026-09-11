/**
 * sunao runtime — 極小のリアクティブ runtime（Vue の reactivity + render の芯だけ）。
 *
 * 設計方針（AIが好きそうなコンパイラの性質）:
 *   - 小さい: signal / effect / h / renderToString / mount だけ。隠れた魔法なし。
 *   - 低 context・低マジック: signal は「読むと購読・set で通知」の関数。テンプレートでは
 *     値が欲しい所で明示的に count() と呼ぶ（Vue の自動 unref はしない = 書いた通りに動く）。
 *   - 決定論: renderToString は同じ状態 → 同じ HTML 文字列。
 *
 * この runtime は「出力に残る唯一の依存」。だから小さく保ち、budget-gate で bytes を監視する。
 */

// ---- reactivity ----
let activeEffect = null;
const effectStack = [];

export function signal(initial) {
  let value = initial;
  const subs = new Set();
  const read = () => {
    if (activeEffect) subs.add(activeEffect);
    return value;
  };
  read.__signal = true;
  read.set = (next) => {
    if (Object.is(next, value)) return;
    value = next;
    for (const e of [...subs]) e();
  };
  read.update = (fn) => read.set(fn(value));
  read.peek = () => value;
  return read;
}

export function effect(fn) {
  const run = () => {
    effectStack.push(run);
    activeEffect = run;
    try {
      fn();
    } finally {
      effectStack.pop();
      activeEffect = effectStack[effectStack.length - 1] ?? null;
    }
  };
  run();
  return run;
}

// ---- virtual node ----
// h(tag, props, children) — props: 属性 + on<Event> 関数。children: (vnode|string|number|array)[]
export function h(tag, props, children) {
  const kids = (Array.isArray(children) ? children : children == null ? [] : [children]).flat(Infinity);
  return { tag, props: props || {}, children: kids };
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- render to string（決定論・テスト・計測用。ブラウザ不要） ----
export function renderToString(vnode) {
  if (vnode == null || vnode === false || vnode === true) return '';
  if (typeof vnode === 'string' || typeof vnode === 'number') return escText(vnode);
  if (Array.isArray(vnode)) return vnode.map(renderToString).join('');
  const { tag, props, children } = vnode;
  const attrs = Object.entries(props)
    .filter(([k, v]) => !k.startsWith('on') && v != null && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${escAttr(v)}"`))
    .join('');
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${children.map(renderToString).join('')}</${tag}>`;
}

/** コンポーネント（{ setup?, render }）を状態 1 スナップショットで HTML 文字列にする。 */
export function renderComponentToString(component) {
  const ctx = component.setup ? component.setup() : {};
  return renderToString(component.render(ctx));
}

// ---- mount to real DOM（ブラウザ用。状態変化で該当コンポーネントを再構築する素朴版） ----
function toDom(vnode, doc) {
  if (vnode == null || vnode === false || vnode === true) return doc.createComment('');
  if (typeof vnode === 'string' || typeof vnode === 'number') return doc.createTextNode(String(vnode));
  if (Array.isArray(vnode)) {
    const frag = doc.createDocumentFragment();
    for (const k of vnode) frag.appendChild(toDom(k, doc));
    return frag;
  }
  const el = doc.createElement(vnode.tag);
  for (const [k, v] of Object.entries(vnode.props)) {
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v != null && v !== false) el.setAttribute(k, String(v));
  }
  for (const c of vnode.children) el.appendChild(toDom(c, doc));
  return el;
}

export function mount(component, el, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) throw new Error('mount() は DOM が必要です（テストは renderComponentToString を使う）');
  const ctx = component.setup ? component.setup() : {};
  effect(() => {
    // 素朴: 状態が変わるたび当該コンポーネントを作り直す。fine-grained diff は将来。
    const vnode = component.render(ctx);
    el.textContent = '';
    el.appendChild(toDom(vnode, doc));
  });
  return ctx;
}
