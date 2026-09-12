/**
 * sunao フォーマッタ（決定論的・冪等・content 非破壊）。
 *   formatSFC(source) -> 整形後の文字列
 *
 * 方針:
 *   - <template> を 2-space で再インデント。**純コンテナ（要素の子だけ）**のみ block 整形。
 *     テキストや要素が混在する要素（`$<b>5</b>` 等）・leaf・<pre>/<textarea> は **1 行のまま**
 *     （周囲に空白を足さない＝レンダリング結果を変えない）。
 *   - 属性は **触らない**（引用符内の空白も保持）。補間 {{ }} の中身も保持（外側だけ trim）。
 *   - 要素間の空白テキストは畳む（＝インデント整形のためのみ）。<script>/<style> の中身は trim だけ。
 *   - 壊れた（タグ対応が合わない）テンプレは整形せず原文を返す（安全側）。
 * 冪等: format(format(x)) === format(x)。
 */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['pre', 'textarea']); // 空白が意味を持つ → 再インデントしない（1 行のまま）

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
// {{ の対応する }}（文字列/ネスト波括弧を跨ぐ）。from は '{{' の直後。
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

// 生テキスト → 「プレーン片は空白畳み・補間は中身保持」の 1 文字列に正規化。
function normText(raw) {
  let out = '', i = 0;
  while (i < raw.length) {
    const mus = raw.indexOf('{{', i);
    if (mus === -1) { out += raw.slice(i).replace(/\s+/g, ' '); break; }
    out += raw.slice(i, mus).replace(/\s+/g, ' ');
    const end = findInterpEnd(raw, mus + 2);
    if (end === -1) { out += raw.slice(mus).replace(/\s+/g, ' '); break; } // 壊れた補間はそのまま畳む
    out += `{{ ${raw.slice(mus + 2, end).trim()} }}`; // 補間は中身（文字列含む）を保持、外側だけ整える
    i = end + 2;
  }
  return out;
}

// template 文字列 → ノード木（text/comment/属性を保持）。タグ対応が合わなければ throw。
function parseTpl(html) {
  let i = 0;
  const root = { kind: 'el', tag: '#root', attrs: '', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const pushText = (raw) => { const t = normText(raw); if (t.trim()) top().children.push({ kind: 'text', text: t.trim() }); };
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { pushText(html.slice(i)); break; }
    if (lt > i) pushText(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      const stop = end === -1 ? html.length : end + 3;
      top().children.push({ kind: 'comment', text: html.slice(lt, stop) });
      i = stop; continue;
    }
    if (html[lt + 1] === '/') {
      const gt = html.indexOf('>', lt);
      const tag = html.slice(lt + 2, gt === -1 ? html.length : gt).trim();
      if (top().tag !== tag) throw new Error(`format: タグ対応が合いません </${tag}>（開き <${top().tag}>）`);
      stack.pop();
      i = (gt === -1 ? html.length : gt + 1); continue;
    }
    const gt = findTagEnd(html, lt);
    if (gt === -1) { pushText(html.slice(lt)); break; }
    let inner = html.slice(lt + 1, gt).trim();
    const selfClose = inner.endsWith('/');
    if (selfClose) inner = inner.slice(0, -1).trim();
    const sp = inner.search(/\s/);
    const tag = sp === -1 ? inner : inner.slice(0, sp);
    const attrs = sp === -1 ? '' : inner.slice(sp).trim(); // 触らない（引用符内の空白も保持）
    const node = { kind: 'el', tag, attrs, selfClose, children: [] };
    top().children.push(node);
    if (!selfClose && !VOID.has(tag)) stack.push(node);
    i = gt + 1;
  }
  if (stack.length !== 1) throw new Error(`format: 閉じていない要素 <${top().tag}>`);
  return root.children;
}

const IND = '  ';
const openTag = (n) => `<${n.tag}${n.attrs ? ' ' + n.attrs : ''}${n.selfClose ? ' /' : ''}>`;
// 純コンテナ（要素の子だけ・RAW でない）＝ block 整形の対象。混在/leaf/RAW は 1 行。
const isBlock = (n) => !RAW.has(n.tag) && n.children.some((c) => c.kind === 'el') && !n.children.some((c) => c.kind === 'text' || c.kind === 'comment');
// 要素をインラインで（周囲に空白を足さない＝レンダリング不変）。
function printInline(n) {
  if (n.selfClose || VOID.has(n.tag)) return openTag(n);
  return openTag(n) + n.children.map((c) => (c.kind === 'el' ? printInline(c) : c.text)).join('') + `</${n.tag}>`;
}
function printNodes(nodes, depth, out) {
  const pad = IND.repeat(depth);
  for (const n of nodes) {
    if (n.kind === 'text' || n.kind === 'comment') { out.push(pad + n.text); continue; }
    if (n.selfClose || VOID.has(n.tag)) { out.push(pad + openTag(n)); continue; }
    if (n.children.length === 0) { out.push(`${pad}${openTag(n)}</${n.tag}>`); continue; }
    if (isBlock(n)) { out.push(pad + openTag(n)); printNodes(n.children, depth + 1, out); out.push(`${pad}</${n.tag}>`); }
    else out.push(pad + printInline(n)); // 混在/leaf/pre は 1 行（空白を足さない）
  }
}

export function formatSFC(source) {
  const tpl = /<template>([\s\S]*?)<\/template>/.exec(source);
  const scr = /<script>([\s\S]*?)<\/script>/.exec(source);
  const sty = /<style([^>]*)>([\s\S]*?)<\/style>/.exec(source);
  const parts = [];
  if (tpl) {
    let block;
    try { const out = []; printNodes(parseTpl(tpl[1]), 1, out); block = `<template>\n${out.join('\n')}\n</template>`; }
    catch { block = `<template>${tpl[1].replace(/\s+$/, '').replace(/^\s+/, '\n')}\n</template>`; } // 壊れていたら原文を保つ
    parts.push(block);
  }
  if (scr) parts.push(`<script>\n${scr[1].trim()}\n</script>`);
  if (sty) parts.push(`<style${sty[1].replace(/\s+/g, ' ').trimEnd()}>\n${sty[2].trim()}\n</style>`);
  return parts.join('\n\n') + '\n';
}
