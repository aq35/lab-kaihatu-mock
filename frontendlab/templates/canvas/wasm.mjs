// 依存ゼロの WASM ロード補助（毎フレーム計算を WASM 化したいとき用）。
// sunao core には入れない: 描画/計算は app-land、sunao は「安全な殻＋ライフサイクル」を提供する。
//
// 使い方（App.sunao の onMount 内）:
//   import { loadWasm } from './wasm.mjs';
//   const wasm = await loadWasm(new URL('./engine.wasm', import.meta.url));
//   const project = wasm.exports.project;              // C-ABI export（wasm-bindgen 不要）
//   const mem = new Float32Array(wasm.exports.memory.buffer);
//   raf(() => { project(ptr, ax, ay); /* mem から座標を読んで描く */ });
//
// prerender（server）では呼ばない: onMount は DOM 挿入後 = ブラウザだけで走る。
export async function loadWasm(url, imports = {}) {
  if (typeof WebAssembly === 'undefined' || typeof fetch === 'undefined') {
    throw new Error('WASM/fetch 非対応環境（server prerender では onMount ごと走らない）');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WASM 取得失敗: ${res.status} ${url}`);
  // instantiateStreaming が使える環境ならそちら（fallback つき）。
  if (WebAssembly.instantiateStreaming) {
    try { return (await WebAssembly.instantiateStreaming(res.clone(), imports)).instance; }
    catch { /* content-type 不一致等 → ArrayBuffer 経路へ */ }
  }
  const buf = await res.arrayBuffer();
  return (await WebAssembly.instantiate(buf, imports)).instance;
}
