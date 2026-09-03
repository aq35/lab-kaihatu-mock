/**
 * 交換可能な CSS backend の interface（G の中心思想）。
 *
 * KAS が所有するのは「意味 → 表現意図(Recipe)」の変換だけ。
 * CSS を実際に生成する backend は interface の裏に置き、交換可能にする。
 *   - native backend: E の compileCss（外部 framework 0）
 *   - tailwind backend: F の tw-map + Tailwind build
 * Recipe と ViewModel と意味 DOM は backend を替えても不変。
 *
 * Backend interface:
 *   kind: string
 *   styleCards(cards, recipe) -> { html, cssInline?|assetRef, provenance }
 * production では styleCards の出力（静的 HTML/CSS）だけを配信する。backend は runtime に出ない。
 */
import { compile, compileCss, normalizeRecipe, hashBytes } from '../e-compiler/compiler.mjs';

export const COMPILER_VERSION = '0.1.0';

/** native backend: 外部 CSS framework を持たない。E の compiler を使う。 */
export const nativeBackend = {
  kind: 'native-css',
  styleCards(cards, recipe) {
    const r = normalizeRecipe(recipe);
    const { html, css, cssHash } = compile(cards, r);
    return { html, css, provenance: provenanceOf(r, cssHash, this.kind) };
  },
};

/** provenance: 生成物に Recipe/Compiler の hash を刻む（再現性・監査用） */
export function provenanceOf(recipe, cssHash, backendKind) {
  const r = normalizeRecipe(recipe);
  return {
    compilerVersion: COMPILER_VERSION,
    backend: backendKind,
    recipeHash: hashBytes(JSON.stringify(r)),
    cssHash,
  };
}

/** backend interface に適合しているかの最小検査（G の test が使う） */
export function isValidBackend(b) {
  return typeof b?.kind === 'string' && typeof b?.styleCards === 'function';
}
