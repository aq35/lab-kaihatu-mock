/**
 * sunao runtime v0.2 — 細粒度リアクティビティ（Solid 系）+ 極小。
 *
 * 変更（v0.1 → v0.2）:
 *   - v0.1: 状態変化で render を再実行しサブツリー全再構築（粗い）。
 *   - v0.2: render は **1 回だけ**実行して DOM を組み、**動的な箇所ごとに effect を張る**。
 *     変わった値に対応する DOM だけが更新される（テキストは in-place で node 同一性も保つ）。
 *   - 所有権つき effect: 動的サブツリー（v-if/v-for）が消えるとき、その内部 effect も破棄（leak 防止）。
 *   - computed() を追加。renderToString は thunk を呼んで評価（決定論・SSR/テスト用）。
 *
 * 設計方針は不変: 明示 signal（読むとき呼ぶ）・低マジック・決定論・小ささ。
 */

// ---- reactivity core（所有権つき） ----
let activeSub = null;   // 依存収集中の effect
let activeOwner = null; // 現在の親（子 effect を所有し、破棄を伝播）

export function signal(initial) {
  let value = initial;
  const subs = new Set();
  const read = () => {
    if (activeSub) {
      subs.add(activeSub);
      activeSub.deps.add(subs);
    }
    return value;
  };
  read.__signal = true;
  read.set = (next) => {
    if (Object.is(next, value)) return;
    value = next;
    for (const s of [...subs]) s.run();
  };
  read.update = (fn) => read.set(fn(value));
  read.peek = () => value;
  return read;
}

function makeSub(fn) {
  const sub = {
    deps: new Set(),      // このeffectが購読しているsignalのsubs集合
    children: new Set(),  // このeffectの実行中に作られた子effect
    run() {
      sub.cleanup();
      const prevSub = activeSub, prevOwner = activeOwner;
      activeSub = sub; activeOwner = sub;
      try { fn(); } finally { activeSub = prevSub; activeOwner = prevOwner; }
    },
    cleanup() {
      for (const c of sub.children) c.dispose();
      sub.children.clear();
      for (const set of sub.deps) set.delete(sub);
      sub.deps.clear();
    },
    dispose() { sub.cleanup(); },
  };
  return sub;
}

export function effect(fn) {
  const sub = makeSub(fn);
  if (activeOwner) activeOwner.children.add(sub);
  sub.run();
  return sub;
}

// 派生値（Svelte $derived / Vue computed / Solid createMemo 相当）。読むと購読。
export function computed(fn) {
  const s = signal(undefined);
  effect(() => s.set(fn()));
  const read = () => s();
  read.__signal = true;
  read.peek = () => s.peek();
  return read;
}

// ---- virtual node ----
// props/children の値が **関数(thunk)** なら動的、そうでなければ静的。
export function h(tag, props, children) {
  const kids = (Array.isArray(children) ? children : children == null ? [] : [children]);
  return { tag, props: props || {}, children: kids };
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- render to string（決定論・SSR・テスト。thunk は呼んで評価） ----
export function renderToString(vnode) {
  if (vnode == null || vnode === false || vnode === true) return '';
  if (typeof vnode === 'function') return renderToString(vnode());
  if (typeof vnode === 'string' || typeof vnode === 'number') return escText(vnode);
  if (Array.isArray(vnode)) return vnode.map(renderToString).join('');
  const { tag, props, children } = vnode;
  const attrs = Object.entries(props)
    .filter(([k]) => !k.startsWith('on'))
    .map(([k, v]) => {
      const val = typeof v === 'function' ? v() : v;
      if (val == null || val === false) return '';
      if (val === true) return ` ${k}`;
      return ` ${k}="${escAttr(val)}"`;
    })
    .join('');
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${children.map(renderToString).join('')}</${tag}>`;
}

// ---- コンポーネント合成 + 型付き props（fail-closed） ----
const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

// 型付き props 検証。Comp.props = { key: 'type' | { type, required } }。
// 未宣言 prop・型不一致・必須欠落は **その場で throw**（精密メッセージ）。props 値は accessor でも可。
export function validateProps(Comp, props) {
  const schema = Comp.props;
  const name = Comp.name || 'Component';
  if (!schema) {
    const passed = Object.keys(props);
    if (passed.length) throw new Error(`${name}: props を宣言していないのに ${passed.join(', ')} が渡されました。export default に props:{...} を宣言してください。`);
    return;
  }
  for (const key of Object.keys(schema)) {
    const spec = typeof schema[key] === 'string' ? { type: schema[key] } : schema[key];
    const has = key in props;
    if (spec.required && !has) throw new Error(`${name}: 必須 prop "${key}"（${spec.type}）が渡されていません。`);
    if (has && spec.type) {
      const raw = props[key];
      const val = typeof raw === 'function' ? raw() : raw;
      const t = typeOf(val);
      if (t !== spec.type) throw new Error(`${name}: prop "${key}" は ${spec.type} 期待、実際は ${t}（値: ${String(JSON.stringify(val)).slice(0, 40)}）。`);
    }
  }
  for (const key of Object.keys(props)) {
    if (!(key in schema)) throw new Error(`${name}: 未知の prop "${key}"。許可: ${Object.keys(schema).join(', ')}。`);
  }
}

// 子コンポーネントを props つきで描画。props は declared 型に照らして検証（fail-closed）。
// ctx は { ...props(accessor), ...setup(props) の戻り } を合成 → テンプレは宣言 prop を直接参照できる。
export function component(Comp, props = {}) {
  validateProps(Comp, props);
  const ctx = { ...props, ...(Comp.setup ? Comp.setup(props) : {}) };
  return Comp.render(ctx);
}

export function renderComponentToString(component) {
  if (component.static) return component.render();
  const ctx = component.setup ? component.setup() : {};
  return renderToString(component.render(ctx));
}

// ---- DOM 構築（細粒度） ----
function setProp(el, k, v) {
  if (k.startsWith('on') && typeof v === 'function') { el.addEventListener(k.slice(2).toLowerCase(), v); return; }
  if (v == null || v === false) el.removeAttribute(k);
  else if (v === true) el.setAttribute(k, '');
  else el.setAttribute(k, String(v));
}

function createNode(vnode, doc) {
  if (vnode == null || vnode === false || vnode === true) return doc.createComment('');
  if (typeof vnode === 'string' || typeof vnode === 'number') return doc.createTextNode(String(vnode));
  if (Array.isArray(vnode)) {
    const frag = doc.createDocumentFragment();
    for (const c of vnode) frag.appendChild(createNode(c, doc));
    return frag;
  }
  const el = doc.createElement(vnode.tag);
  for (const [k, val] of Object.entries(vnode.props)) {
    if (typeof val === 'function' && !k.startsWith('on')) {
      effect(() => setProp(el, k, val())); // 動的属性: この属性だけ更新
    } else {
      setProp(el, k, val);
    }
  }
  for (const child of vnode.children) {
    if (typeof child === 'function') insertExpression(el, child, doc); // 動的子: 該当箇所だけ更新
    else el.appendChild(createNode(child, doc));
  }
  return el;
}

// 動的な子（補間 / v-if / v-for）を start..end マーカ間で管理し、変化時にその区間だけ差し替える。
function insertExpression(parent, fn, doc) {
  const start = doc.createComment('');
  const end = doc.createComment('');
  parent.appendChild(start);
  parent.appendChild(end);
  let current = [];
  effect(() => {
    const value = fn();
    // テキスト→テキストの単純ケースは in-place 更新（node 同一性を保つ）
    if ((typeof value === 'string' || typeof value === 'number') &&
        current.length === 1 && current[0].nodeType === 3) {
      current[0].data = String(value);
      return;
    }
    for (const n of current) n.remove();
    current = [];
    for (const n of normalize(value, doc)) {
      parent.insertBefore(n, end);
      current.push(n);
    }
  });
}

function normalize(value, doc) {
  if (value == null || value === false || value === true) return [];
  if (typeof value === 'function') return normalize(value(), doc);
  if (Array.isArray(value)) return value.flatMap((v) => normalize(v, doc));
  if (typeof value === 'string' || typeof value === 'number') return [doc.createTextNode(String(value))];
  return [createNode(value, doc)];
}

// 対話コンポーネント: render を 1 回実行して DOM を組む（以降は細粒度 effect が更新）。
export function mount(component, el, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) throw new Error('mount() は DOM が必要です（テストは renderComponentToString を使う）');
  if (component.static) { el.innerHTML = component.render(); return {}; }
  const ctx = component.setup ? component.setup() : {};
  el.appendChild(createNode(component.render(ctx), doc));
  return ctx;
}

// 静的コンポーネント専用の最小 mount（reactivity を一切参照しない → tree-shake で軽い）。
export function mountStatic(component, el) {
  el.innerHTML = typeof component.render === 'function' ? component.render() : component.render;
}
