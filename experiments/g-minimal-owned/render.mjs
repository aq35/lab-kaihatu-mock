/**
 * 条件G: Minimal Owned Core（reference wiring）。
 *
 * = E の core(semantic-dom 118 行 + compiler 197 行) + backend interface + provenance。
 * 新しい rendering コードは書かない。所有するのは意味変換だけ。
 * production 生成物は静的 HTML/CSS。runtime に Node も CSS framework も要らない。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { nativeBackend, provenanceOf } from './backend.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const recipe = JSON.parse(readFileSync(join(HERE, '..', 'e-compiler', 'recipe.default.json'), 'utf8'));

let lastProvenance = null;
export function renderInbox(cards) {
  const { html, provenance } = nativeBackend.styleCards(cards, recipe);
  lastProvenance = provenance;
  return html;
}

export function buildAssets({ outDir, writeFileSync, mkdirSync }) {
  const { css, provenance } = nativeBackend.styleCards([], recipe);
  mkdirSync(join(outDir, 'styles'), { recursive: true });
  writeFileSync(join(outDir, 'styles', 'generated.css'), css);
  // 生成物に provenance を同梱（Recipe/Compiler hash）。再 build 可能性の証跡
  writeFileSync(join(outDir, 'provenance.json'), JSON.stringify({ ...provenance, generatedAt: 'deterministic' }, null, 2) + '\n');
}

export { recipe };
