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
    cleanups: [],         // scope 破棄/再実行時に呼ぶ後始末（timer/fetch abort 等）
    run() {
      sub.cleanup();
      const prevSub = activeSub, prevOwner = activeOwner;
      activeSub = sub; activeOwner = sub;
      try { fn(); } finally { activeSub = prevSub; activeOwner = prevOwner; }
    },
    cleanup() {
      for (const c of sub.cleanups) { try { c(); } catch {} }
      sub.cleanups.length = 0;
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

// 現在の scope に後始末を登録（scope 破棄で自動実行）。timer/fetch のキャンセルに使う。
export function onCleanup(fn) {
  const owner = activeSub || activeOwner;
  if (owner) owner.cleanups.push(fn);
  return fn;
}

// 独立した reactive スコープで fn を実行し、{value, dispose} を返す（Solid createRoot 相当）。
// owner を渡すと、その子として登録（owner 破棄で一緒に破棄 = unmount 時の一括破棄）。
export function createRoot(fn, owner = null) {
  const sub = makeSub(() => {});
  if (owner) owner.children.add(sub);
  const prevOwner = activeOwner, prevSub = activeSub;
  activeOwner = sub; activeSub = null; // 追跡を切り、内部 effect は sub を親にする
  try { return { value: fn(), dispose: () => { sub.dispose(); owner?.children.delete(sub); } }; }
  finally { activeOwner = prevOwner; activeSub = prevSub; }
}
// 独立スコープ（owner の子）。keyed リストのアイテム親として使い、親 effect の再実行では壊れず、
// 囲む scope（v-if サブツリー等）の破棄でまとめて破棄される。
function makeScope(owner) {
  const sub = makeSub(() => {});
  if (owner) owner.children.add(sub);
  return sub;
}

// keyed v-for マーカ。insertExpression が検出して「キーでノードを再利用・移動」する。
export function keyed(list, keyFn, renderFn) {
  return { __keyed: true, list, keyFn, renderFn };
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
  if (vnode.__keyed) return vnode.list.map((it) => renderToString(vnode.renderFn(it))).join('');
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
    if (has && (spec.type || spec.enum)) {
      const raw = props[key];
      const val = typeof raw === 'function' ? raw() : raw;
      if (spec.type) {
        const t = typeOf(val);
        if (t !== spec.type) throw new Error(`${name}: prop "${key}" は ${spec.type} 期待、実際は ${t}（値: ${String(JSON.stringify(val)).slice(0, 40)}）。`);
      }
      // 閉じた語彙（PresentationRecipe と同じ思想）: enum 外は fail-closed。
      if (spec.enum && !spec.enum.includes(val)) {
        throw new Error(`${name}: prop "${key}" は閉じた語彙 [${spec.enum.join(', ')}] のみ。実際: ${JSON.stringify(val)}。`);
      }
    }
  }
  for (const key of Object.keys(props)) {
    if (key[0] === '$') continue; // $slot 等の予約 prop はスキップ
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

// キー付きリストの再利用・移動・削除（並び替え / DnD で node 同一性と in-item 状態を保つ）。
function reconcileKeyed(parent, end, prev, desc, doc, itemsRoot) {
  const next = new Map();
  const order = [];
  for (const item of desc.list) {
    const k = desc.keyFn(item);
    order.push(k);
    if (prev && prev.has(k)) next.set(k, prev.get(k)); // 既存ノードを再利用（effect も保持）
    else { const root = createRoot(() => createNode(desc.renderFn(item), doc), itemsRoot); next.set(k, { node: root.value, dispose: root.dispose }); }
  }
  if (prev) for (const [k, rec] of prev) { if (!next.has(k)) { rec.dispose(); rec.node.remove?.(); } } // 消えたキーを破棄
  for (const k of order) parent.insertBefore(next.get(k).node, end); // 順序どおり挿入＝既存ノードは移動
  return next;
}

// 動的な子（補間 / v-if / v-for）を start..end マーカ間で管理し、変化時にその区間だけ差し替える。
function insertExpression(parent, fn, doc) {
  const start = doc.createComment('');
  const end = doc.createComment('');
  parent.appendChild(start);
  parent.appendChild(end);
  const parentOwner = activeOwner; // 囲む scope（unmount / v-if 解除でまとめて破棄される）
  let current = [];
  let keyState = null;
  let itemsRoot = null;
  effect(() => {
    const value = fn();
    // keyed v-for: キー差分で再利用・移動
    if (value && value.__keyed) {
      for (const n of current) n.remove(); current = [];
      if (!itemsRoot) itemsRoot = makeScope(parentOwner); // 親 effect の再実行では壊れない安定スコープ
      keyState = reconcileKeyed(parent, end, keyState, value, doc, itemsRoot);
      return;
    }
    if (keyState) { for (const rec of keyState.values()) { rec.dispose(); rec.node.remove?.(); } keyState = null; }
    if (itemsRoot) { itemsRoot.dispose(); parentOwner?.children.delete(itemsRoot); itemsRoot = null; }
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
// 戻り値 { ctx, dispose }。dispose() で全 effect・keyed スコープをまとめて破棄（unmount）。
export function mount(component, el, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) throw new Error('mount() は DOM が必要です（テストは renderComponentToString を使う）');
  if (component.static) { el.innerHTML = component.render(); return { ctx: {}, dispose() {} }; }
  let ctx = {};
  const root = createRoot(() => {
    ctx = component.setup ? component.setup() : {};
    el.appendChild(createNode(component.render(ctx), doc));
  });
  return { ctx, dispose: () => { root.dispose(); el.textContent = ''; } };
}

// 静的コンポーネント専用の最小 mount（reactivity を一切参照しない → tree-shake で軽い）。
export function mountStatic(component, el) {
  el.innerHTML = typeof component.render === 'function' ? component.render() : component.render;
}

// ---- フロントエンドルーティング（最小・hash ベース = 公開ホストでリロードしても安全） ----
// これらは使われなければ tree-shake で落ちる（ルーティングしないアプリは runtime に載らない）。
let _route = null;
const _hash = () => (typeof location !== 'undefined' ? location.hash.slice(1) || '/' : '/');
function _ensureRoute() {
  if (!_route) {
    _route = signal(_hash());
    if (typeof window !== 'undefined') window.addEventListener('hashchange', () => _route.set(_hash()));
  }
  return _route;
}
// 現在のパスを表す signal（読むと購読 → route で画面が更新される）。
export function useRoute() { return _ensureRoute(); }
// ルートガード: navigate 前に fn(to, from) を呼び、false を返すと遷移中止、文字列ならそこへリダイレクト。
let _guard = null;
export function setRouteGuard(fn) { _guard = fn; }
// 画面遷移。hash を変え、戻る/進む（履歴）も効く。ガードがあれば通す。
export function navigate(to) {
  const from = _ensureRoute().peek();
  if (_guard) {
    const r = _guard(to, from);
    if (r === false) return;            // 中止
    if (typeof r === 'string') to = r;  // リダイレクト
  }
  if (typeof location !== 'undefined') location.hash = to;
  _ensureRoute().set(to);
}
// '/day/:date' 等のパターン照合。一致で params（{date}）、不一致で null。
// 末尾 '*' は前方一致（ネスト用）: '/settings/*' は '/settings/x/y' に一致し params['*']='x/y'。
export function matchRoute(pattern, path) {
  const pp = pattern.split('/');
  const sp = path.split('?')[0].split('/');
  const params = {};
  if (pp[pp.length - 1] === '*') {
    if (sp.length < pp.length) return null;
    for (let i = 0; i < pp.length - 1; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(sp[i]);
      else if (pp[i] !== sp[i]) return null;
    }
    params['*'] = sp.slice(pp.length - 1).join('/');
    return params;
  }
  if (pp.length !== sp.length) return null;
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(sp[i]);
    else if (pp[i] !== sp[i]) return null;
  }
  return params;
}

// ---- 時間まわり（Go の time / ticker 相当。scope 破棄で自動停止） ----
// 一定間隔で更新する時計 signal。読むと購読 → 時刻表示が自動更新。
export function now(tickMs = 1000) {
  const s = signal(Date.now());
  if (typeof setInterval !== 'undefined') {
    const id = setInterval(() => s.set(Date.now()), tickMs);
    onCleanup(() => clearInterval(id));
  }
  return () => s();
}
// 反復。stop() で止まり、scope 破棄でも自動停止。
export function interval(ms, fn) {
  const id = setInterval(fn, ms);
  const stop = () => clearInterval(id);
  onCleanup(stop);
  return stop;
}
// 一回遅延。cancel() で取り消し、scope 破棄でも自動取消。
export function timeout(ms, fn) {
  const id = setTimeout(fn, ms);
  const cancel = () => clearTimeout(id);
  onCleanup(cancel);
  return cancel;
}
// デバウンス／スロットル（入力・スクロール等）。
export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  onCleanup(d.cancel);
  return d;
}
export function throttle(fn, ms) {
  let last = 0, t;
  const th = (...a) => {
    const rem = ms - (Date.now() - last);
    if (rem <= 0) { last = Date.now(); fn(...a); }
    else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn(...a); }, rem); }
  };
  th.cancel = () => clearTimeout(t);
  onCleanup(th.cancel);
  return th;
}

// ---- 通信・並行まわり（Go の context / goroutine 相当） ----
const _ctrl = () => (typeof AbortController !== 'undefined' ? new AbortController() : { abort() {}, signal: { aborted: false } });
// キャンセル可能な context（Go の context.WithCancel）。scope 破棄で自動 abort。
export function context() {
  const c = _ctrl();
  onCleanup(() => c.abort());
  return { signal: c.signal, cancel: () => c.abort() };
}
// 非同期タスクを走らせて { promise, cancel } を返す（goroutine + context）。
export function go(fn) {
  const ctx = context();
  const promise = Promise.resolve().then(() => fn(ctx.signal));
  return { promise, cancel: ctx.cancel };
}
// リアクティブな非同期データ（Solid createResource / SWR 相当）。
//   const user = resource((signal) => fetch('/me', {signal}).then(r=>r.json()));
//   テンプレ: user.loading() / user.error() / user() / user.refetch()
// 前の取得は refetch/scope 破棄で abort（Go context のキャンセル伝播）。
export function resource(fetcher, { initial = null } = {}) {
  const data = signal(initial);
  const loading = signal(true);
  const error = signal(null);
  let cur = null;
  const load = () => {
    cur?.abort();
    cur = _ctrl();
    const my = cur;
    loading.set(true); error.set(null);
    Promise.resolve().then(() => fetcher(my.signal))
      .then((v) => { if (!my.signal.aborted) { data.set(v); loading.set(false); } })
      .catch((e) => { if (!my.signal.aborted) { error.set(e); loading.set(false); } });
  };
  onCleanup(() => cur?.abort());
  load();
  const read = () => data();
  read.loading = () => loading();
  read.error = () => error();
  read.refetch = load;
  return read;
}
