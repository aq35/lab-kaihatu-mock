/**
 * sunao フォーマッタ（決定論的・冪等）。
 *   formatSFC(source) -> 整形後の文字列
 *
 * やること（安全側・最小）:
 *   - <template> を 2-space で再インデント（要素ネストで）。子が要素を含まなければ 1 行 inline。
 *   - text は内部空白を 1 つに畳んで trim。コメントは保持。属性は**触らない**（並べ替え/改行しない）。
 *   - <script> / <style> の中身は **一切いじらず** trim だけ（JS/CSS の整形は範囲外＝壊さない）。
 *   - 3 ブロックを template → script → style の順に、間に空行 1 つで並べる。
 * 冪等: format(format(x)) === format(x)。content 非破壊（テキスト/コメント/属性は保つ）。
 */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

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

// template 文字列 → ノード木（text/comment/属性を保持）。
function parseTpl(html) {
  let i = 0;
  const root = { kind: 'el', tag: '#root', attrs: '', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { pushText(top(), html.slice(i)); break; }
    if (lt > i) pushText(top(), html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      const stop = end === -1 ? html.length : end + 3;
      top().children.push({ kind: 'comment', text: html.slice(lt, stop) });
      i = stop; continue;
    }
    if (html[lt + 1] === '/') {
      const gt = html.indexOf('>', lt);
      if (top().tag !== '#root') stack.pop();
      i = (gt === -1 ? html.length : gt + 1); continue;
    }
    const gt = findTagEnd(html, lt);
    if (gt === -1) { pushText(top(), html.slice(lt)); break; }
    let inner = html.slice(lt + 1, gt).trim();
    const selfClose = inner.endsWith('/');
    if (selfClose) inner = inner.slice(0, -1).trim();
    const sp = inner.search(/\s/);
    const tag = sp === -1 ? inner : inner.slice(0, sp);
    const attrs = sp === -1 ? '' : inner.slice(sp).trim().replace(/\s+/g, ' ');
    const node = { kind: 'el', tag, attrs, selfClose, children: [] };
    top().children.push(node);
    if (!selfClose && !VOID.has(tag)) stack.push(node);
    i = gt + 1;
  }
  return root.children;
}
function pushText(parent, raw) {
  const text = raw.replace(/\s+/g, ' ').trim(); // 内部空白は 1 つ（インデント整形のため）
  if (text) parent.children.push({ kind: 'text', text });
}

const IND = '  ';
const openTag = (n) => `<${n.tag}${n.attrs ? ' ' + n.attrs : ''}${n.selfClose ? ' /' : ''}>`;
const inlineOf = (children) => children.map((c) => (c.kind === 'text' ? c.text : c.kind === 'comment' ? c.text : '')).join(' ').replace(/\s+/g, ' ').trim();

function printNodes(nodes, depth, out) {
  const pad = IND.repeat(depth);
  for (const n of nodes) {
    if (n.kind === 'text') { out.push(pad + n.text); continue; }
    if (n.kind === 'comment') { out.push(pad + n.text); continue; }
    if (n.selfClose || VOID.has(n.tag)) { out.push(pad + openTag(n)); continue; }
    const hasEl = n.children.some((c) => c.kind === 'el');
    if (n.children.length === 0) { out.push(`${pad}${openTag(n)}</${n.tag}>`); }
    else if (!hasEl) { out.push(`${pad}${openTag(n)}${inlineOf(n.children)}</${n.tag}>`); } // 要素を含まない → 1 行
    else { out.push(pad + openTag(n)); printNodes(n.children, depth + 1, out); out.push(`${pad}</${n.tag}>`); }
  }
}

export function formatSFC(source) {
  const tpl = /<template>([\s\S]*?)<\/template>/.exec(source);
  const scr = /<script>([\s\S]*?)<\/script>/.exec(source);
  const sty = /<style([^>]*)>([\s\S]*?)<\/style>/.exec(source);
  const parts = [];
  if (tpl) {
    const out = [];
    printNodes(parseTpl(tpl[1]), 1, out);
    parts.push(`<template>\n${out.join('\n')}\n</template>`);
  }
  if (scr) parts.push(`<script>\n${scr[1].trim()}\n</script>`);
  if (sty) parts.push(`<style${sty[1].replace(/\s+/g, ' ').trimEnd()}>\n${sty[2].trim()}\n</style>`);
  return parts.join('\n\n') + '\n';
}
