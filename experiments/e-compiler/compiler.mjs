/**
 * Semantic UI Compiler.
 *
 *   compile(cards, recipe) -> { html, css, recipeHash }
 *
 * 性質（tests/tailwind と counter-proof が検査する）:
 *  1. 決定論: 同じ (cards, recipe) から同じ bytes を返す。乱数・時刻・反復順に依存しない
 *  2. 閉じた語彙: recipe は presentation-recipe.schema.json の enum のみ。arbitrary value は入らない
 *  3. required field を隠せない: CSS 生成側に display:none 等の「消す」経路が無い。
 *     密度は padding/font-size/段組みでのみ表現する
 *  4. CSS は recipe の純関数: cards に依存しない。よって recipe が同じなら CSS も 1 byte 同じ
 */
import { renderCardDom } from './semantic-dom.mjs';

// ---- 閉じた語彙 → 具体値のテーブル（ここが Compiler の全知識） -----------------
const PALETTE = {
  calm:            { page:'oklch(97.5% 0.006 250)', card:'oklch(100% 0 0)', sunken:'oklch(96% 0.008 250)', ink:'oklch(22% 0.016 250)', ink2:'oklch(42% 0.014 250)', quiet:'oklch(50% 0.012 250)', border:'oklch(80% 0.010 250)', borderStrong:'oklch(50% 0.012 250)', accent:'oklch(46% 0.16 250)', danger:'oklch(48% 0.18 25)', caution:'oklch(52% 0.13 75)', positive:'oklch(48% 0.13 150)', unknown:'oklch(48% 0.17 300)', onAccent:'oklch(100% 0 0)' },
  editorial:       { page:'oklch(97% 0.015 85)', card:'oklch(99% 0.008 85)', sunken:'oklch(94.5% 0.018 85)', ink:'oklch(24% 0.02 60)', ink2:'oklch(40% 0.02 60)', quiet:'oklch(45% 0.02 60)', border:'oklch(80% 0.02 70)', borderStrong:'oklch(45% 0.02 60)', accent:'oklch(40% 0.12 25)', danger:'oklch(43% 0.16 25)', caution:'oklch(48% 0.12 70)', positive:'oklch(43% 0.12 150)', unknown:'oklch(44% 0.15 300)', onAccent:'oklch(99% 0.008 85)' },
  'command-center':{ page:'oklch(19% 0.015 260)', card:'oklch(24% 0.018 260)', sunken:'oklch(28% 0.020 260)', ink:'oklch(95% 0.005 260)', ink2:'oklch(82% 0.008 260)', quiet:'oklch(72% 0.010 260)', border:'oklch(40% 0.020 260)', borderStrong:'oklch(60% 0.030 260)', accent:'oklch(72% 0.14 200)', danger:'oklch(70% 0.17 25)', caution:'oklch(80% 0.14 85)', positive:'oklch(76% 0.14 155)', unknown:'oklch(74% 0.13 300)', onAccent:'oklch(18% 0.02 260)' },
  conversational:  { page:'oklch(98% 0.012 320)', card:'oklch(100% 0 0)', sunken:'oklch(96% 0.018 320)', ink:'oklch(22% 0.016 320)', ink2:'oklch(42% 0.014 320)', quiet:'oklch(50% 0.012 320)', border:'oklch(82% 0.010 320)', borderStrong:'oklch(50% 0.012 320)', accent:'oklch(46% 0.16 320)', danger:'oklch(48% 0.18 25)', caution:'oklch(52% 0.13 75)', positive:'oklch(48% 0.13 150)', unknown:'oklch(48% 0.17 300)', onAccent:'oklch(100% 0 0)' },
  'high-contrast': { page:'oklch(100% 0 0)', card:'oklch(100% 0 0)', sunken:'oklch(95% 0 0)', ink:'oklch(15% 0 0)', ink2:'oklch(25% 0 0)', quiet:'oklch(30% 0 0)', border:'oklch(40% 0 0)', borderStrong:'oklch(20% 0 0)', accent:'oklch(30% 0.2 250)', danger:'oklch(35% 0.2 25)', caution:'oklch(38% 0.14 70)', positive:'oklch(35% 0.14 150)', unknown:'oklch(35% 0.2 300)', onAccent:'oklch(100% 0 0)' },
};
const DENSITY = {
  comfortable: { pad:'1.5rem', gap:'1rem', feed:'1.5rem', lead:'1.125rem', fact:'0.9375rem' },
  compact:     { pad:'1rem', gap:'0.625rem', feed:'1rem', lead:'1.0625rem', fact:'0.875rem' },
  dense:       { pad:'0.625rem 0.75rem', gap:'0.375rem', feed:'0.625rem', lead:'1rem', fact:'0.8125rem' },
};
const SHAPE = {
  rounded:    { radius:'12px', rule:'border-inline-start:4px solid var(--k-accent);' },
  square:     { radius:'0', rule:'border-inline-start:4px solid var(--k-accent);' },
  'left-rule':{ radius:'6px', rule:'border-inline-start:6px solid var(--k-accent);' },
  'top-rule': { radius:'6px', rule:'border-block-start:4px solid var(--k-accent);' },
};
const TYPO = {
  system: `system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif`,
  serif:  `Georgia, "Hiragino Mincho ProN", "Yu Mincho", serif`,
  mono:   `ui-monospace, "SFMono-Regular", "Noto Sans Mono", monospace`,
};
// カード種別 → 強調色（役割ベース。recipe では変えない）
const KIND_ACCENT = {
  'owner-question':'var(--k-accent)', 'action-approval':'var(--k-danger)',
  'outcome-unknown':'var(--k-unknown)', 'result-review':'var(--k-positive)', 'information':'var(--k-quiet)',
};

const j = (obj) => Object.entries(obj).map(([k, v]) => `${k}:${v}`).join(';');

// 閉じた語彙。Compiler が知っている値だけ。ここに無い値は拒否する（fail loud）。
export const VOCAB = {
  readingMode: ['decision-first', 'chronological', 'reference'],
  density: ['comfortable', 'compact', 'dense'],
  effectEmphasis: ['normal', 'strong'],
  scopePresentation: ['inline', 'bounded-list', 'grid'],
  evidencePresentation: ['level-badge', 'claim-vs-verified'],
  uncertaintyPresentation: ['inline', 'interruptive'],
  actionLayout: ['single-primary', 'equal-weight', 'stacked'],
  palette: ['calm', 'editorial', 'command-center', 'conversational', 'high-contrast'],
  cardShape: ['rounded', 'square', 'left-rule', 'top-rule'],
  typography: ['system', 'serif', 'mono'],
};

export class RecipeError extends Error { constructor(m) { super(m); this.name = 'RecipeError'; } }

/**
 * recipe を検証し、既定値を埋める（決定論のため順序固定）。
 * enum 外の値・未知のキーは RecipeError で拒否する。
 * これが「未知の表現を安全に受け入れる」= 黙って壊れない、の実装。
 * Tailwind の動的 class は build から黙って消える（T5）。E は compile で止める。
 */
export function normalizeRecipe(recipe = {}) {
  for (const key of Object.keys(recipe)) {
    if (!(key in VOCAB)) throw new RecipeError(`未知のキー: ${key}（許可: ${Object.keys(VOCAB).join(', ')}）`);
    if (recipe[key] != null && !VOCAB[key].includes(recipe[key]))
      throw new RecipeError(`${key} の未知の値: ${JSON.stringify(recipe[key])}（許可: ${VOCAB[key].join(', ')}）`);
  }
  return {
    readingMode: 'decision-first', density: 'comfortable', effectEmphasis: 'normal',
    scopePresentation: 'bounded-list', evidencePresentation: 'level-badge',
    uncertaintyPresentation: 'inline', actionLayout: 'single-primary',
    palette: 'calm', cardShape: 'rounded', typography: 'system', ...recipe,
  };
}

/** CSS は recipe の純関数。cards に依存しない → recipe が同じなら常に同じ bytes */
export function compileCss(recipe) {
  const r = normalizeRecipe(recipe);
  const p = PALETTE[r.palette], d = DENSITY[r.density], s = SHAPE[r.cardShape], typo = TYPO[r.typography];
  const leadWeight = r.effectEmphasis === 'strong' ? '600' : '400';
  const effectWeight = r.effectEmphasis === 'strong' ? '700' : '600';
  const scopeDisplay = { inline: 'inline', 'bounded-list': 'grid', grid: 'grid' }[r.scopePresentation];
  const scopeCols = r.scopePresentation === 'grid' ? 'repeat(auto-fit,minmax(12rem,1fr))' : 'minmax(0,1fr)';
  const actionDir = r.actionLayout === 'stacked' ? 'column' : 'row';
  const primaryOrder = r.actionLayout === 'single-primary' ? '.kbtn--primary{order:-1}' : '';
  const uncertaintyBlock = r.uncertaintyPresentation === 'interruptive'
    ? `.kcard--outcome-unknown{outline:2px solid var(--k-unknown);outline-offset:2px}.kfact--unknown .kfact__value{font-size:1.05em;font-weight:700}`
    : '';
  const evidenceBlock = r.evidencePresentation === 'claim-vs-verified'
    ? `.kfact--claim .kfact__value,.kfact--observation .kfact__value,.kfact--receipt .kfact__value{padding-inline-start:.75rem;border-inline-start:3px solid var(--k-border)}`
    : '';

  // 注意: display:none / visibility:hidden / opacity:0 を CSS 生成のどこにも書かない。
  //       密度は padding と font-size でのみ表現する（required field を消せない）。
  return `/* generated by Semantic UI Compiler — recipe: ${JSON.stringify(r)} */
:root{--k-page:${p.page};--k-card:${p.card};--k-sunken:${p.sunken};--k-ink:${p.ink};--k-ink2:${p.ink2};--k-quiet:${p.quiet};--k-border:${p.border};--k-border-strong:${p.borderStrong};--k-accent:${p.accent};--k-danger:${p.danger};--k-caution:${p.caution};--k-positive:${p.positive};--k-unknown:${p.unknown};--k-on-accent:${p.onAccent};--k-pad:${d.pad};--k-gap:${d.gap};--k-feed:${d.feed};--k-radius:${s.radius};--k-font:${typo}}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--k-page);color:var(--k-ink);font-family:var(--k-font);line-height:1.6}
h1,h2,h3,p,dl,dd{margin:0}ul,ol{margin:0;padding:0;list-style:none}
p,dd,li,h1,h2,h3,button,label,legend{overflow-wrap:anywhere}
:focus-visible{outline:3px solid var(--k-accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
.kpage{max-inline-size:78rem;margin-inline:auto;padding:2rem 1rem}
.kfeed{display:grid;gap:var(--k-feed)}
.kslot{container-type:inline-size;container-name:kcard}
.kcard{display:grid;gap:var(--k-gap);padding:var(--k-pad);background:var(--k-card);border:1px solid var(--k-border);border-radius:var(--k-radius);${s.rule}}
.kcard--owner-question{--k-kind:${KIND_ACCENT['owner-question']}}
.kcard--action-approval{--k-kind:${KIND_ACCENT['action-approval']}}
.kcard--outcome-unknown{--k-kind:${KIND_ACCENT['outcome-unknown']}}
.kcard--result-review{--k-kind:${KIND_ACCENT['result-review']}}
.kcard--information{--k-kind:${KIND_ACCENT.information};box-shadow:none;background:transparent}
.kcard{border-inline-start-color:var(--k-kind,var(--k-border))}
.kcard__header{display:grid;gap:.25rem}
.kcard__kind{display:flex;align-items:center;gap:.5rem;font-size:.8125rem;font-weight:600;color:var(--k-kind)}
.kcard__glyph{display:grid;place-items:center;inline-size:1.35em;block-size:1.35em;border:1px solid currentColor;border-radius:3px;font-family:${TYPO.mono}}
.kcard__state{justify-self:start;padding:.125rem .5rem;font-size:.75rem;font-weight:700;border:1px solid currentColor;border-radius:3px;color:var(--k-danger)}
.kcard__title{font-size:1rem;line-height:1.35;color:var(--k-ink)}
.klead{font-size:${d.lead};font-weight:${leadWeight};max-inline-size:68ch;color:var(--k-ink)}
.kinfo{font-size:${d.fact};color:var(--k-ink2)}
.kfacts{display:grid;gap:var(--k-gap)}
.kfact{display:grid;gap:.125rem}
.kfact__label{font-size:.75rem;font-weight:600;color:var(--k-quiet);letter-spacing:.03em}
.kfact__value{font-size:${d.fact};color:var(--k-ink2);max-inline-size:68ch}
.kfact--effect .kfact__value{color:var(--k-ink);font-weight:${effectWeight}}
.kfact--one-shot .kfact__value{color:var(--k-ink);font-weight:600}
.kabsent{color:var(--k-quiet);font-style:italic}
.kscope{display:${scopeDisplay};grid-template-columns:${scopeCols};gap:.25rem;font-family:${TYPO.mono};font-size:.75rem}
.kscope li::before{content:"· ";color:var(--k-quiet)}
.kdash li::before{content:"— ";color:var(--k-quiet)}
.krisk{display:grid;gap:.25rem}
.krisk__item{display:grid;grid-template-columns:1.25em minmax(6rem,auto) minmax(0,1fr);gap:.5rem;font-size:${d.fact}}
.krisk__item[data-risk="yes"]{color:var(--k-danger);font-weight:600}
.krisk__item[data-risk="no"]{color:var(--k-quiet)}
.krisk__mark{font-family:${TYPO.mono}}
.ksteps{display:grid;gap:.25rem;counter-reset:s;padding:.75rem;background:var(--k-sunken);border-radius:6px}
.ksteps li{display:grid;grid-template-columns:1.5rem minmax(0,1fr);gap:.5rem;counter-increment:s}
.ksteps li::before{content:counter(s) ".";color:var(--k-quiet);font-family:${TYPO.mono}}
.kdup[data-possible="true"]{color:var(--k-danger);font-weight:600;display:block}
.kdup__detail{color:var(--k-ink2)}
.kevidence{font-weight:600}
.kevidence[data-evidence-level="RECEIPTED"]{color:var(--k-positive)}
.kevidence[data-evidence-level="OBSERVED"]{color:var(--k-caution)}
.kevidence[data-evidence-level="CLAIMED"],.kevidence[data-evidence-level="NONE"]{color:var(--k-danger)}
${evidenceBlock}
${uncertaintyBlock}
.kopts{display:grid;gap:.5rem;margin:0;padding:1rem;border:1px solid var(--k-border);border-radius:6px;background:var(--k-sunken)}
.kopts>legend{padding-inline:.25rem;font-size:.75rem;font-weight:600;color:var(--k-quiet)}
.kopt{display:grid;grid-template-columns:auto minmax(0,1fr);gap:.5rem;align-items:start}
.kopt input{inline-size:1.5rem;block-size:1.5rem;margin-block-start:.2em}
.kopt label{display:grid;gap:.125rem;cursor:pointer}
.kopt__consequence{font-size:.75rem;color:var(--k-quiet)}
.kfree{display:grid;gap:.25rem;margin-block-start:.5rem}
.kfree textarea{inline-size:100%;padding:.5rem;border:1px solid var(--k-border-strong);border-radius:6px;background:var(--k-card);color:inherit}
.kfree__absent{font-size:.75rem;color:var(--k-quiet)}
.kactions{display:flex;flex-wrap:wrap;flex-direction:${actionDir};gap:.5rem;padding-block-start:var(--k-gap);border-block-start:1px solid var(--k-border)}
${primaryOrder}
.kbtn{min-block-size:2.75rem;min-inline-size:2.75rem;padding-inline:1rem;display:inline-flex;align-items:center;justify-content:center;background:var(--k-sunken);color:var(--k-ink);border:1px solid var(--k-border-strong);border-radius:6px;cursor:pointer;font:inherit}
.kbtn--primary{background:var(--k-accent);color:var(--k-on-accent);border-color:var(--k-accent);font-weight:600}
.kbtn--destructive.kbtn--primary{background:var(--k-danger);border-color:var(--k-danger)}
.kbtn:disabled{opacity:.55;cursor:not-allowed}
.kcard[data-card-state="EXPIRED"],.kcard[data-card-state="REVOKED"],.kcard[data-card-state="STALE"]{border-style:dashed;box-shadow:none}
.kcard[data-card-state="EXPIRED"] .kbtn,.kcard[data-card-state="REVOKED"] .kbtn{display:none}
.kdecision-status{flex-basis:100%;font-size:${d.fact};margin:0}
.kdecision-status[data-kind="unknown"],.kdecision-status[data-kind="refused"]{color:var(--k-danger);font-weight:600}
@container kcard (max-width:22rem){.kcard{--k-pad:.75rem;--k-gap:.5rem}.kactions{flex-direction:column;align-items:stretch}}
.kempty{color:var(--k-quiet);padding:3rem;text-align:center}
.kcontrol{display:grid;gap:.25rem;margin-block-start:1rem}
.kcontrol label{font-size:.75rem;font-weight:600;color:var(--k-quiet)}
.kcontrol select{min-block-size:2.75rem;padding-inline:.5rem;background:var(--k-card);color:var(--k-ink);border:1px solid var(--k-border-strong);border-radius:6px}
.kslot[hidden]{display:none}
.kskip{position:absolute;inset-block-start:.5rem;inset-inline-start:.5rem;padding:.5rem 1rem;background:var(--k-card);border:2px solid var(--k-accent);border-radius:6px;transform:translateY(-200%)}
.kskip:focus{transform:none}
.kvh:not(:focus-within){position:absolute;inline-size:1px;block-size:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
`;
}

/** 決定論的な hash（依存を足さないための小さな FNV-1a） */
export function hashBytes(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function compile(cards, recipe) {
  const css = compileCss(recipe);
  const feed = cards.length
    ? `<ul class="kfeed">${cards.map((c) => `<li class="kslot">${renderCardDom(c)}</li>`).join('')}</ul>`
    : `<p class="kempty">対応が必要な項目はありません。</p>`;
  return { html: feed, css, recipeHash: hashBytes(JSON.stringify(normalizeRecipe(recipe))), cssHash: hashBytes(css) };
}
