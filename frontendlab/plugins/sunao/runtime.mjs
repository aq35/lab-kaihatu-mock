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

// 子 sub を owner に登録（children Set は遅延生成＝葉 effect では割り当てない）。
function addChild(owner, sub) { (owner.children || (owner.children = new Set())).add(sub); }

export function signal(initial) {
  let value = initial;
  let subs = null; // 遅延生成: 一度も購読されない signal は Set を割り当てない
  const read = () => {
    if (activeSub) {
      (subs || (subs = new Set())).add(activeSub);
      activeSub.deps.add(subs);
    }
    return value;
  };
  read.__signal = true;
  read.set = (next) => {
    if (Object.is(next, value)) return;
    value = next;
    if (subs) {
      if (_batchDepth) { for (const s of subs) _batchQueue.add(s); } // バッチ中はキューへ（後で 1 回）
      else for (const s of [...subs]) s.run();
    }
  };
  read.update = (fn) => read.set(fn(value));
  read.peek = () => value;
  return read;
}

function makeSub(fn) {
  const sub = {
    deps: new Set(),      // このeffectが購読しているsignalのsubs集合
    children: null,       // 遅延: 実行中に作られた子effect（葉なら null のまま）
    cleanups: null,       // 遅延: 後始末（timer/fetch abort 等。無ければ null）
    disposed: false,      // 破棄済みなら run しない（伝播中に消えた sub の復活＝ゾンビを防ぐ）
    run() {
      if (sub.disposed) return; // 通知スナップショットに残った破棄済み sub を再実行しない
      sub.cleanup();
      const prevSub = activeSub, prevOwner = activeOwner;
      activeSub = sub; activeOwner = sub;
      try { fn(); } finally { activeSub = prevSub; activeOwner = prevOwner; }
    },
    cleanup() {
      if (sub.cleanups) { for (const c of sub.cleanups) { try { c(); } catch {} } sub.cleanups = null; }
      if (sub.children) { for (const c of sub.children) c.dispose(); sub.children = null; }
      for (const set of sub.deps) set.delete(sub);
      sub.deps.clear();
    },
    dispose() { sub.disposed = true; sub.cleanup(); },
  };
  return sub;
}

export function effect(fn) {
  const sub = makeSub(fn);
  if (activeOwner) addChild(activeOwner, sub);
  sub.run();
  return sub;
}

// ---- バッチング（opt-in）: 既定は同期・単純。batch(fn) の中の複数 set を 1 回の effect 実行に畳む ----
let _batchDepth = 0;
const _batchQueue = new Set();
export function batch(fn) {
  _batchDepth++;
  try { return fn(); }
  finally {
    if (--_batchDepth === 0 && _batchQueue.size) {
      const subs = [..._batchQueue]; _batchQueue.clear();
      for (const s of subs) s.run(); // 同じ effect は 1 回だけ（重複除去＝グリッチ回避）
    }
  }
}

// mount 後（DOM 挿入後）に走らせたい処理を登録（focus / 実測 / windowedVar.attach など）。
// setup は DOM 前に走るので、DOM を触る初期化はここへ。mount/hydrate が挿入後に flush する。
let _mountQueue = null;
export function onMount(fn) {
  if (_mountQueue) _mountQueue.push(fn);
  else if (typeof queueMicrotask !== 'undefined') queueMicrotask(fn); // mount 文脈外は best-effort
}

// 現在の scope に後始末を登録（scope 破棄で自動実行）。timer/fetch のキャンセルに使う。
export function onCleanup(fn) {
  const owner = activeSub || activeOwner;
  if (owner) (owner.cleanups || (owner.cleanups = [])).push(fn);
  return fn;
}

// 独立した reactive スコープで fn を実行し、{value, dispose} を返す（Solid createRoot 相当）。
// owner を渡すと、その子として登録（owner 破棄で一緒に破棄 = unmount 時の一括破棄）。
export function createRoot(fn, owner = null) {
  const sub = makeSub(() => {});
  if (owner) addChild(owner, sub);
  const prevOwner = activeOwner, prevSub = activeSub;
  activeOwner = sub; activeSub = null; // 追跡を切り、内部 effect は sub を親にする
  try { return { value: fn(), dispose: () => { sub.dispose(); owner?.children?.delete(sub); } }; }
  finally { activeOwner = prevOwner; activeSub = prevSub; }
}
// 独立スコープ（owner の子）。keyed リストのアイテム親として使い、親 effect の再実行では壊れず、
// 囲む scope（v-if サブツリー等）の破棄でまとめて破棄される。
function makeScope(owner) {
  const sub = makeSub(() => {});
  if (owner) addChild(owner, sub);
  return sub;
}

// keyed v-for マーカ。insertExpression が検出して「キーでノードを再利用・移動」する。
// flip=true で enter/leave フェード＋並び替えの FLIP アニメ（ブラウザのみ。Node では無視）。
export function keyed(list, keyFn, renderFn, flip = false) {
  return { __keyed: true, list, keyFn, renderFn, flip };
}

// 仮想化（windowing）: 巨大リストでも **可視範囲だけ**描画する。実 DOM は数十行に収まる。
//   const vp = windowed(items, { rowHeight: 28, height: 400 });
//   template:
//     <div class="vp" @scroll="vp.onScroll($event)" :style="'height:400px;overflow:auto'">
//       <div :style="'height:'+vp.total()+'px;position:relative'">
//         <div :style="'transform:translateY('+vp.offsetY()+'px)'">
//           <div v-for="row in vp.visible()" :key="row.id" ...>{{ row.label }}</div>
//   固定 rowHeight・固定 viewport height（可変高は非対応＝正直な最小）。
export function windowed(items, { rowHeight, height, overscan = 4 } = {}) {
  if (!rowHeight || !height) throw new Error('windowed() は rowHeight と height（px）が必要です');
  const scrollTop = signal(0);
  const count = Math.ceil(height / rowHeight) + overscan * 2; // 一度に描く行数（固定）
  const list = typeof items === 'function' ? items : () => items;
  const start = () => Math.max(0, Math.min(Math.floor(scrollTop() / rowHeight) - overscan, Math.max(0, list().length - count)));
  return {
    onScroll: (e) => scrollTop.set(e.target.scrollTop),
    total: () => list().length * rowHeight,       // スクロール領域の総高さ
    offsetY: () => start() * rowHeight,            // 先頭可視行の translateY
    visible: () => list().slice(start(), start() + count), // 描画する slice（数十件）
    count,
  };
}

// 可変高の仮想化: 行の高さがバラバラなリスト（チャット/フィード/コメント）向け。
// Fenwick(BIT) で累積オフセットを O(log N)。初期は estimate、描画後に ResizeObserver で実測して補正。
// 使い方（各行を絶対配置。v = {item, index, top}）:
//   const vp = windowedVar(items, { estimate: 60, height: 500 });
//   template:
//     <div class="vp" @scroll="vp.onScroll($event)" :style="'height:500px;overflow:auto'">
//       <div :style="'height:'+vp.total()+'px;position:relative'">
//         <div v-for="v in vp.visible()" :key="v.item.id" :data-vindex="v.index"
//              :style="'position:absolute;left:0;right:0;top:'+v.top+'px'"> …v.item… </div>
//   mount 後に vp.attach(viewportEl) を呼ぶと実測で高さが補正される（呼ばなくても estimate で動く）。
function makeBIT(n, init) {
  const t = new Float64Array(n + 1);
  const add = (i, d) => { for (i++; i <= n; i += i & -i) t[i] += d; };
  const sum = (i) => { let s = 0; for (; i > 0; i -= i & -i) s += t[i]; return s; }; // [0, i) の和
  for (let i = 0; i < n; i++) add(i, init);
  // offset を含む item の index（= offset 未満に完全に収まる item 数）
  const findIndex = (target) => {
    let pos = 0, acc = 0, r = 1; while (r * 2 <= n) r *= 2;
    for (let k = r; k >= 1; k >>= 1) { if (pos + k <= n && acc + t[pos + k] <= target) { pos += k; acc += t[pos]; } }
    return pos;
  };
  return { add, sum, findIndex, total: () => sum(n) };
}
export function windowedVar(items, { estimate = 40, height, overscan = 4 } = {}) {
  if (!height) throw new Error('windowedVar() は height（px）が必要です');
  const list = typeof items === 'function' ? items : () => items;
  const creationOwner = activeSub || activeOwner; // 生成時（setup）の scope。attach の後始末をここに繋ぐ
  const scrollTop = signal(0);
  const version = signal(0); // 実測で高さが変わったら bump → visible/total 再計算
  let n = -1, bit = null, heights = null;
  const ensure = () => {
    const len = list().length;
    if (len === n) return;
    const old = heights;
    heights = new Float64Array(len).fill(estimate);
    if (old) for (let i = 0, m = Math.min(len, old.length); i < m; i++) heights[i] = old[i]; // 実測値を保持（append/remove で全捨てしない）
    bit = makeBIT(len, 0);
    for (let i = 0; i < len; i++) if (heights[i]) bit.add(i, heights[i]);
    n = len;
  };
  const measure = (index, px) => {
    ensure();
    if (index < 0 || index >= n || !(px > 0)) return;
    const d = px - heights[index];
    if (Math.abs(d) < 0.5) return;
    heights[index] = px; bit.add(index, d); version.set(version.peek() + 1);
  };
  const start = () => { ensure(); version(); return Math.max(0, bit.findIndex(scrollTop()) - overscan); };
  const visible = () => {
    ensure(); version();
    const s = start(), arr = list(), limit = scrollTop() + height;
    const out = []; let acc = bit.sum(s), i = s;
    while (i < n) {
      out.push({ item: arr[i], index: i, top: acc });
      const bottom = acc + heights[i]; acc = bottom; i++;
      if (bottom > limit) { let ex = overscan; while (i < n && ex-- > 0) { out.push({ item: arr[i], index: i, top: acc }); acc += heights[i]; i++; } break; }
    }
    return out;
  };
  const total = () => { ensure(); version(); return bit.total(); };
  const attach = (viewportEl) => {
    if (!viewportEl || typeof ResizeObserver === 'undefined') return () => {};
    const ro = new ResizeObserver((entries) => { for (const e of entries) { const idx = +e.target.dataset.vindex; if (!Number.isNaN(idx)) measure(idx, e.target.getBoundingClientRect().height); } });
    let observed = new Set();
    const sync = () => {
      const els = viewportEl.querySelectorAll('[data-vindex]'); const now = new Set();
      for (const el of els) { now.add(el); if (!observed.has(el)) ro.observe(el); measure(+el.dataset.vindex, el.getBoundingClientRect().height); }
      for (const el of observed) if (!now.has(el)) ro.unobserve(el);
      observed = now;
    };
    const eff = effect(() => { visible(); if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(sync); else sync(); });
    const dispose = () => { ro.disconnect(); eff.dispose?.(); };
    // attach は mount 後（activeOwner=null）に呼ぶのが普通なので、生成時 scope に後始末を繋ぐ＝dispose() で確実に片付く
    if (creationOwner) (creationOwner.cleanups || (creationOwner.cleanups = [])).push(dispose);
    else onCleanup(dispose);
    return dispose;
  };
  return { onScroll: (e) => scrollTop.set(e.target.scrollTop), total, visible, measure, attach };
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

// ---- SSR / prerender（サーバモード） ----
// server モードでは now/interval/timeout が **実タイマーを張らない**（Node で event loop を
// 生かし続けてプロセスが止まるのを防ぐ）。描画は初期状態で決定論的に文字列化する。
let _server = false;
export function isServer() { return _server; }
// prerender 中に出会った部品の scoped CSS を集める（<head> に inline するため）。
const _collectedStyles = new Set();

// ---- Context（SwiftUI environment / React context 相当）: prop drilling を消す ----
// 同期レンダの入れ子に沿って親→子へ伝播。provide/inject は setup 内で使う。
let _provides = new Map();
export function provide(key, value) { _provides.set(key, value); }
export function inject(key, def) { return _provides.has(key) ? _provides.get(key) : def; }

// 子コンポーネントを props つきで描画。props は declared 型に照らして検証（fail-closed）。
// ctx は { ...props(accessor), ...setup(props) の戻り } を合成 → テンプレは宣言 prop を直接参照できる。
export function component(Comp, props = {}) {
  validateProps(Comp, props);
  if (Comp.styles) { // 子の scoped CSS: server では収集、client では 1 度だけ注入
    if (_server) _collectedStyles.add(Comp.styles);
    else if (typeof document !== 'undefined') injectStyles(Comp, document);
  }
  const parent = _provides;
  _provides = new Map(parent); // 親の context を継承
  try {
    const ctx = { ...props, ...(Comp.setup ? Comp.setup(props) : {}) };
    return Comp.render(ctx);
  } finally {
    _provides = parent;
  }
}

export function renderComponentToString(component) {
  _provides = new Map();
  const prev = _server;
  _server = true; // タイマーを張らない・子 style を収集
  try {
    if (component.styles) _collectedStyles.add(component.styles);
    if (component.static) return component.render();
    const ctx = component.setup ? component.setup() : {};
    return renderToString(component.render(ctx));
  } finally { _server = prev; }
}

/**
 * SSG prerender: 部品を **実 HTML 文字列 + 収集した scoped CSS + meta** にする。
 * 返り値を <head>(title/meta/style) と <div id="app">html</div> に流し込めば
 * クローラが中身を読める（SEO）。client bundle を足せば hydrate で対話も戻る。
 */
export function prerender(component) {
  _collectedStyles.clear();
  const html = renderComponentToString(component); // server モードで描画＋style 収集
  return { html, styles: [..._collectedStyles].join('\n'), meta: component.meta || {} };
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
// desc.flip なら enter/leave フェード＋FLIP（First-Last-Invert-Play）で移動をアニメ。
function reconcileKeyed(parent, end, prev, desc, doc, itemsRoot) {
  const flip = desc.flip && prev && typeof requestAnimationFrame !== 'undefined';
  const oldRects = flip ? new Map() : null;
  if (flip) for (const [k, rec] of prev) if (rec.node.getBoundingClientRect) oldRects.set(k, rec.node.getBoundingClientRect());
  const next = new Map();
  const order = [];
  for (const item of desc.list) {
    const k = desc.keyFn(item);
    order.push(k);
    if (prev && prev.has(k)) next.set(k, prev.get(k)); // 既存ノードを再利用（effect も保持）
    else { const root = createRoot(() => createNode(desc.renderFn(item), doc), itemsRoot); next.set(k, { node: root.value, dispose: root.dispose, isNew: true }); }
  }
  if (prev) for (const [k, rec] of prev) { // 消えたキーを破棄（flip なら leave アニメ後に）
    if (next.has(k)) continue;
    const n = rec.node;
    if (desc.flip && n.animate) n.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.92)' }], { duration: 150, easing: 'ease' }).finished.then(() => { rec.dispose(); n.remove?.(); }, () => { rec.dispose(); n.remove?.(); });
    else { rec.dispose(); n.remove?.(); }
  }
  // 位置合わせ: 右→左に走査し、**新規 or 位置がズレたノードだけ** insertBefore（全再挿入をやめる）。
  // 安定した並びなら移動ゼロ、swap なら動いた分だけ＝O(変化) の DOM 操作。
  let nextDom = end;
  for (let i = order.length - 1; i >= 0; i--) {
    const rec = next.get(order[i]);
    const node = rec.node;
    if (rec.isNew || node.nextSibling !== nextDom) parent.insertBefore(node, nextDom);
    nextDom = node;
  }
  for (const k of order) { // enter（新規）/ FLIP（移動）
    const rec = next.get(k), n = rec.node;
    if (rec.isNew) { rec.isNew = false; if (desc.flip && n.animate) n.animate([{ opacity: 0, transform: 'scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 150, easing: 'ease' }); }
    else if (flip && oldRects.has(k) && n.getBoundingClientRect && n.animate) {
      const nr = n.getBoundingClientRect(), o = oldRects.get(k);
      const dx = o.left - nr.left, dy = o.top - nr.top;
      if (dx || dy) n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
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
    if (itemsRoot) { itemsRoot.dispose(); parentOwner?.children?.delete(itemsRoot); itemsRoot = null; }
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
const _injectedStyles = new Set(); // 同じ scoped CSS を二重注入しない（content で dedupe）。
function injectStyles(component, doc) {
  const css = component && component.styles;
  if (!css || _injectedStyles.has(css)) return;
  _injectedStyles.add(css);
  const tag = doc.createElement('style');
  tag.setAttribute('data-sunao', '');
  tag.textContent = css;
  (doc.head || doc.documentElement).appendChild(tag);
}
export function mount(component, el, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) throw new Error('mount() は DOM が必要です（テストは renderComponentToString を使う）');
  injectStyles(component, doc); // <style scoped> ブロックを 1 度だけ head へ
  if (component.static) { el.innerHTML = component.render(); return { ctx: {}, dispose() {} }; }
  _provides = new Map();
  let ctx = {};
  const prevQ = _mountQueue; _mountQueue = []; // 木の onMount を集める（ネスト component 含む）
  const root = createRoot(() => {
    ctx = component.setup ? component.setup() : {};
    el.appendChild(createNode(component.render(ctx), doc));
  });
  const q = _mountQueue; _mountQueue = prevQ;
  for (const fn of q) { try { fn(); } catch (e) { console.error(e); } } // DOM 挿入後に flush
  return { ctx, dispose: () => { root.dispose(); el.textContent = ''; } };
}

// ---- hydration（SSR/prerender した実 HTML を作り直さず対話を乗せる） ----
// 方針（小さく・正直に）: **静的な骨格は既存 DOM を adopt** して props effect / イベントだけ張り、
// **動的な島（v-if / v-for / 補間などの function 子）だけ** その場で作り直す。
// これで SEO 用のサーバ HTML（＝クローラが見る中身）を保ったまま、対話が戻る。
function flattenStatic(children) {
  const out = [];
  for (const c of children) { if (Array.isArray(c)) out.push(...flattenStatic(c)); else out.push(c); }
  return out;
}
function hydrateChildren(parentDom, childVnodes, doc) {
  const flat = flattenStatic(childVnodes);
  // 動的な子（function）が混ざる親は「島」= この親の中身を作り直す（骨格＝親自身は保持）。
  if (flat.some((c) => typeof c === 'function')) {
    parentDom.textContent = '';
    for (const child of flat) {
      if (typeof child === 'function') insertExpression(parentDom, child, doc);
      else parentDom.appendChild(createNode(child, doc));
    }
    return;
  }
  // 全部静的: 要素 vnode を既存の要素子へ位置対応で adopt（テキストは配線不要なので無視）。
  const domEls = [...parentDom.children];
  let ei = 0;
  for (const v of flat) {
    if (v && typeof v === 'object' && v.tag) {
      const d = domEls[ei++];
      if (d && d.tagName && d.tagName.toLowerCase() === v.tag.toLowerCase()) hydrateNode(v, d, doc);
      else {
        // ズレ/欠落: 新規ノードを **正しい位置** に挿入し、ズレた既存ノードは置換（末尾追加＝順序崩壊を防ぐ）
        const fresh = createNode(v, doc);
        if (d) parentDom.replaceChild(fresh, d);
        else parentDom.appendChild(fresh);
      }
    }
  }
}
function hydrateNode(vnode, dom, doc) {
  for (const [k, val] of Object.entries(vnode.props)) {
    if (k.startsWith('on') && typeof val === 'function') dom.addEventListener(k.slice(2).toLowerCase(), val);
    else if (typeof val === 'function') effect(() => setProp(dom, k, val())); // 動的属性: この属性だけ更新
    // 静的属性は既にサーバ HTML に載っている → 張り直さない
  }
  hydrateChildren(dom, vnode.children, doc);
}
export function hydrate(component, el, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) throw new Error('hydrate() は DOM が必要です');
  injectStyles(component, doc);
  if (component.static) return { ctx: {}, dispose() {} }; // 完全な静的 HTML＝対話なし
  _provides = new Map();
  let ctx = {};
  const prevQ = _mountQueue; _mountQueue = [];
  const root = createRoot(() => {
    ctx = component.setup ? component.setup() : {};
    const vnode = component.render(ctx);
    if (el.children.length === 0) { el.appendChild(createNode(vnode, doc)); return; } // サーバ HTML 不在 → 通常 mount
    hydrateChildren(el, Array.isArray(vnode) ? vnode : [vnode], doc);
  });
  const q = _mountQueue; _mountQueue = prevQ;
  for (const fn of q) { try { fn(); } catch (e) { console.error(e); } }
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
  if (typeof setInterval !== 'undefined' && !_server) { // server では時計を進めない（初期時刻で決定論的）
    const id = setInterval(() => s.set(Date.now()), tickMs);
    onCleanup(() => clearInterval(id));
  }
  return () => s();
}
// 反復。stop() で止まり、scope 破棄でも自動停止。server では張らない（noop）。
export function interval(ms, fn) {
  if (_server) return () => {};
  const id = setInterval(fn, ms);
  const stop = () => clearInterval(id);
  onCleanup(stop);
  return stop;
}
// 一回遅延。cancel() で取り消し、scope 破棄でも自動取消。server では張らない（noop）。
export function timeout(ms, fn) {
  if (_server) return () => {};
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
const _rcache = new Map(); // key -> 直近の成功データ（SWR / React Query 相当）
export function resource(fetcher, { initial = null, key = null, swr = false } = {}) {
  const cached = key != null && _rcache.has(key) ? _rcache.get(key) : initial;
  const hasCache = key != null && _rcache.has(key);
  const data = signal(cached);
  const loading = signal(!(swr && hasCache)); // swr: キャッシュを即出し（loading にしない）
  const error = signal(null);
  let cur = null;
  const load = () => {
    cur?.abort();
    cur = _ctrl();
    const my = cur;
    if (!(swr && data.peek() != null)) loading.set(true);
    error.set(null);
    Promise.resolve().then(() => fetcher(my.signal))
      .then((v) => { if (!my.signal.aborted) { if (key != null) _rcache.set(key, v); data.set(v); loading.set(false); } })
      .catch((e) => { if (!my.signal.aborted) { error.set(e); loading.set(false); } });
  };
  onCleanup(() => cur?.abort());
  if (!_server) load(); // server では取得を発火しない（初期/キャッシュ状態を決定論的に描画）
  else loading.set(false);
  const read = () => data();
  read.loading = () => loading();
  read.error = () => error();
  read.refetch = load;
  return read;
}

// ---- 他言語・フレームワークの良さ（すべて宣言的・fail-closed・決定論に寄せて再現） ----

// 状態機械（XState / statechart）。宣言した状態・遷移だけ許す＝不正状態が作れない。
//   const m = machine({ initial:'idle', states:{ idle:{on:{START:'run'}}, run:{on:{STOP:'idle'}} } });
//   m() -> 現在状態 / m.send('START') / m.can('START') / m.matches('run')
export function machine(def) {
  const state = signal(def.initial);
  const send = (event, payload) => {
    const st = def.states[state.peek()];
    const t = st && st.on && Object.prototype.hasOwnProperty.call(st.on, event) ? st.on[event] : undefined; // prototype を歩かない
    if (!t) throw new Error(`machine: 状態 "${state.peek()}" で未定義のイベント "${event}"（許可: ${st && st.on ? Object.keys(st.on).join(', ') : 'なし'}）`);
    const target = typeof t === 'string' ? t : t.target;
    if (!def.states[target]) throw new Error(`machine: 未定義の遷移先 "${target}"`);
    if (typeof t === 'object' && t.action) t.action(payload);
    state.set(target);
  };
  const read = () => state();
  read.send = send;
  read.can = (event) => { const on = def.states[state.peek()]?.on; return !!(on && Object.prototype.hasOwnProperty.call(on, event) && on[event]); };
  read.matches = (s) => state() === s;
  return read;
}

// Elm / Redux ストア（Model-Update-View）。update は純関数。タイムトラベル付き。
//   const s = store(0, (n, msg) => msg==='inc' ? n+1 : n); s.dispatch('inc'); s.undo();
export function store(init, update) {
  const state = signal(init);
  const history = [init];
  let idx = 0;
  const dispatch = (msg) => {
    const next = update(state.peek(), msg);
    history.length = idx + 1; history.push(next); idx++;
    state.set(next);
  };
  const read = () => state();
  read.dispatch = dispatch;
  read.undo = () => { if (idx > 0) { idx--; state.set(history[idx]); } };
  read.redo = () => { if (idx < history.length - 1) { idx++; state.set(history[idx]); } };
  read.history = () => history.slice();
  return read;
}

// Zod / Elm decoder: 外部データを宣言スキーマで検証（不正は path つきで fail-closed）。
//   decode({ id:'number', name:'string', tags:['array','string'] }, json)
export function decode(schema, value, path = '$') {
  const t = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  if (typeof schema === 'string') {
    if (t(value) !== schema) throw new Error(`decode: ${path} は ${schema} 期待、実際 ${t(value)}`);
    return value;
  }
  if (Array.isArray(schema) && schema[0] === 'array') {
    if (!Array.isArray(value)) throw new Error(`decode: ${path} は array 期待、実際 ${t(value)}`);
    return value.map((v, i) => decode(schema[1], v, `${path}[${i}]`));
  }
  if (schema && typeof schema === 'object') {
    if (t(value) !== 'object') throw new Error(`decode: ${path} は object 期待、実際 ${t(value)}`);
    const out = {};
    for (const k of Object.keys(schema)) out[k] = decode(schema[k], value[k], `${path}.${k}`);
    return out;
  }
  throw new Error(`decode: 不正なスキーマ ${path}`);
}

// Rust の match（網羅）。`_` が無く未対応の値なら fail-closed。
//   match(kind, { A:()=>1, B:2, _:()=>0 })
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function match(value, cases) {
  const c = hasOwn(cases, value) ? cases[value] : (hasOwn(cases, '_') ? cases._ : undefined); // prototype を歩かない
  if (c === undefined) throw new Error(`match: 未対応の値 "${value}"（許可: ${Object.keys(cases).join(', ')}）`);
  return typeof c === 'function' ? c(value) : c;
}

// Immer 風の immutable 更新。draft を書き換えて新オブジェクトを返す。
export function produce(base, fn) {
  const draft = typeof structuredClone === 'function' ? structuredClone(base) : JSON.parse(JSON.stringify(base));
  fn(draft);
  return draft;
}

// エラー境界（Erlang "let it crash" + 復帰 / React error boundary）。
// 子の描画で例外が出たら fallback(err) を出す（同期描画エラーを捕捉）。
export function boundary(fn, fallback) {
  return () => { try { return fn(); } catch (e) { return typeof fallback === 'function' ? fallback(e) : fallback; } };
}
