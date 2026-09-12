import { render } from './render.mjs'; // build-bench.mjs が Vue テンプレをコンパイルして生成
import { createApp, ref, nextTick } from 'vue';

const A = ['pretty', 'large', 'fancy', 'silent', 'warm', 'quiet', 'clean', 'odd', 'cheap', 'red', 'green', 'blue'];
const N = ['table', 'chair', 'house', 'car', 'book', 'road', 'pony', 'mouse', 'keyboard', 'panel'];
let seed = 1;
const rnd = (m) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % m;

const comp = {
  render,
  setup() {
    const rows = ref([]);
    const selected = ref(-1);
    let nextId = 1;
    const build = (n) => {
      const a = new Array(n);
      for (let i = 0; i < n; i++) a[i] = { id: nextId++, label: `${A[rnd(A.length)]} ${N[rnd(N.length)]}` };
      return a;
    };
    return {
      rows, selected,
      create1k: () => { rows.value = build(1000); },
      create10k: () => { rows.value = build(10000); },
      append1k: () => { rows.value = [...rows.value, ...build(1000)]; },
      updateEvery10: () => { const a = rows.value; for (let i = 0; i < a.length; i += 10) a[i].label += ' !!!'; },
      swap: () => { const a = rows.value; if (a.length > 3) { const t = a[1]; a[1] = a[a.length - 2]; a[a.length - 2] = t; } },
      selectRandom: () => { const a = rows.value; if (a.length) selected.value = a[rnd(a.length)].id; },
      removeFirst: () => { rows.value.shift(); },
      clear: () => { rows.value = []; selected.value = -1; },
    };
  },
};

const vm = createApp(comp).mount('#app');
window.runOp = async (name) => { vm[name](); await nextTick(); }; // Vue は非同期更新 → nextTick で commit 待ち
window.rowCount = () => document.querySelectorAll('tbody tr').length;
window.__ready = true;
