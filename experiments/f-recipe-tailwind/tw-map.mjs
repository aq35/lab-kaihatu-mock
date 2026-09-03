/**
 * 条件F: PresentationRecipe → 完全な静的 Tailwind class 文字列。
 *
 * E と共有するもの（import する）:
 *   - normalizeRecipe / VOCAB / RecipeError（fail-closed 検証は E と同一）
 *   - semantic-dom.mjs の renderCardDom（意味 DOM は E と 1 バイト同一）
 * F 固有なのは「役割 → Tailwind utility」の写像だけ = CSS backend の違い。
 *
 * 重要: ここが返すのは **完全な文字列**。runtime 連結をしない（T5/HF5 の検証条件）。
 */
import { normalizeRecipe } from '../e-compiler/compiler.mjs';

// palette 名 → Tailwind の色ファミリ（best-practice。arbitrary value を使わない）
const PAL = {
  calm:            { ink:'slate-900', ink2:'slate-700', quiet:'slate-600', card:'white', page:'slate-50', sunken:'slate-100', border:'slate-200', borderStrong:'slate-400', accent:'blue-700', onAccent:'white', danger:'red-700', caution:'amber-700', positive:'emerald-700', unknown:'violet-700' },
  editorial:       { ink:'stone-900', ink2:'stone-700', quiet:'stone-600', card:'stone-50', page:'stone-100', sunken:'stone-200', border:'stone-300', borderStrong:'stone-500', accent:'red-800', onAccent:'stone-50', danger:'red-800', caution:'amber-800', positive:'emerald-800', unknown:'violet-800' },
  'command-center':{ ink:'slate-100', ink2:'slate-300', quiet:'slate-400', card:'slate-800', page:'slate-900', sunken:'slate-700', border:'slate-700', borderStrong:'slate-500', accent:'cyan-400', onAccent:'slate-900', danger:'red-400', caution:'amber-300', positive:'emerald-300', unknown:'violet-300' },
  conversational:  { ink:'slate-900', ink2:'slate-700', quiet:'slate-600', card:'white', page:'fuchsia-50', sunken:'fuchsia-100', border:'fuchsia-200', borderStrong:'fuchsia-400', accent:'fuchsia-700', onAccent:'white', danger:'red-700', caution:'amber-700', positive:'emerald-700', unknown:'violet-700' },
  'high-contrast': { ink:'black', ink2:'zinc-800', quiet:'zinc-700', card:'white', page:'white', sunken:'zinc-100', border:'zinc-400', borderStrong:'black', accent:'blue-800', onAccent:'white', danger:'red-800', caution:'amber-800', positive:'emerald-800', unknown:'violet-800' },
};
const DENS = { comfortable:{pad:'p-6',gap:'gap-4',feed:'gap-6',lead:'text-lg',fact:'text-sm'},
               compact:{pad:'p-4',gap:'gap-2.5',feed:'gap-4',lead:'text-base',fact:'text-sm'},
               dense:{pad:'p-2',gap:'gap-1.5',feed:'gap-2',lead:'text-sm',fact:'text-xs'} };
const RAD = { rounded:'rounded-xl', square:'rounded-none', 'left-rule':'rounded-md', 'top-rule':'rounded-md' };
const FONT = { system:'font-sans', serif:'font-serif', mono:'font-mono' };
const KIND_TEXT = { 'owner-question':'accent','action-approval':'danger','outcome-unknown':'unknown','result-review':'positive','information':'quiet' };

/** role と recipe から完全な Tailwind class 文字列を返す。純関数。 */
export function utilitiesFor(role, r, kindKey) {
  const p = PAL[r.palette], d = DENS[r.density];
  const c = (k) => k; // 可読性のため
  const kindColor = p[KIND_TEXT[kindKey] ?? 'quiet'];
  const effectWeight = r.effectEmphasis === 'strong' ? 'font-bold' : 'font-semibold';
  const shapeBorder = r.cardShape === 'top-rule' ? `border-t-4 border-t-${kindColor}` : `border-s-4 border-s-${kindColor}`;
  const M = {
    kcard: `grid ${d.gap} ${d.pad} bg-${p.card} border border-${p.border} ${RAD[r.cardShape]} ${shapeBorder} ${FONT[r.typography]}`,
    'kcard--information': `bg-transparent shadow-none`,
    kcard__header: `grid gap-1`,
    kcard__kind: `flex items-center gap-2 text-xs font-semibold text-${kindColor}`,
    kcard__glyph: `grid place-items-center size-5 border border-current rounded-sm font-mono`,
    kcard__title: `${d.fact === 'text-xs' ? 'text-sm' : 'text-base'} text-${p.ink}`,
    kcard__state: `justify-self-start px-2 py-0.5 text-xs font-bold border border-current rounded-sm text-${p.danger}`,
    kcard__body: `grid ${d.gap}`,
    klead: `${d.lead} ${r.effectEmphasis === 'strong' ? 'font-semibold' : ''} max-w-[68ch] text-${p.ink} [overflow-wrap:anywhere]`,
    kinfo: `${d.fact} text-${p.ink2} [overflow-wrap:anywhere]`,
    kfacts: `grid ${d.gap}`,
    kfact: `grid gap-0.5`,
    kfact__label: `text-xs font-semibold text-${p.quiet}`,
    kfact__value: `${d.fact} text-${p.ink2} max-w-[68ch] [overflow-wrap:anywhere]`,
    'kfact--effect': `!text-${p.ink} ${effectWeight}`,
    'kfact--one-shot': `!text-${p.ink} font-semibold`,
    kabsent: `text-${p.quiet} italic`,
    kscope: `grid gap-0.5 font-mono text-xs`,
    krisk: `grid gap-1`,
    krisk__item: `grid grid-cols-[1.25em_minmax(6rem,auto)_minmax(0,1fr)] gap-2 ${d.fact}`,
    ksteps: `grid gap-1 p-3 bg-${p.sunken} rounded-md list-decimal ps-8`,
    kevidence: `font-semibold`,
    kopts: `grid gap-2 p-4 border border-${p.border} rounded-md bg-${p.sunken}`,
    kopt: `grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2`,
    kfree: `grid gap-1 mt-2`,
    kactions: `flex flex-wrap ${r.actionLayout === 'stacked' ? 'flex-col' : 'flex-row'} gap-2 pt-3 border-t border-${p.border}`,
    kbtn: `min-h-11 min-w-11 px-4 inline-flex items-center justify-center bg-${p.sunken} text-${p.ink} border border-${p.borderStrong} rounded-md cursor-pointer`,
    'kbtn--primary': `!bg-${p.accent} !text-${p.onAccent} !border-${p.accent} font-semibold ${r.actionLayout === 'single-primary' ? 'order-first' : ''}`,
    'kbtn--destructive': ``,
    kdup: `block`,
    kdash: `grid gap-0.5`,
  };
  return M[role] ?? '';
}

/** 1 カード分の意味 DOM（renderCardDom の出力）に Tailwind utility を注入する。
 *  kind は同カードの kcard--<role> トークンから判定する（外部引数に依存しない）。 */
export function applyUtilitiesToCard(cardHtml, recipe) {
  const r = normalizeRecipe(recipe);
  const kindMatch = cardHtml.match(/kcard--([a-z-]+)/);
  const kindKey = kindMatch ? kindMatch[1] : 'information';
  const stateMatch = cardHtml.match(/data-card-state="([A-Z]+)"/);
  const inert = stateMatch && ['EXPIRED', 'REVOKED'].includes(stateMatch[1]);
  const dashed = stateMatch && ['EXPIRED', 'REVOKED', 'STALE'].includes(stateMatch[1]);
  return cardHtml.replace(/class="([^"]*)"/g, (m, cls) => {
    const roles = cls.split(/\s+/).filter(Boolean);
    const utils = roles.flatMap((role) => utilitiesFor(role, r, kindKey).split(/\s+/)).filter(Boolean);
    // Compiler が state を見て静的に決める（E の states.css に対応）:
    // 期限切れ・取消カードの操作ボタンは hidden、カードは破線
    if (inert && roles.includes('kbtn')) utils.push('!hidden'); // T8: 素の hidden は kbtn の inline-flex に負ける。Tailwind 固有の残余(HF2)
    if (dashed && roles.includes('kcard')) utils.push('border-dashed', 'shadow-none');
    // cross-cutting: native CSS なら `*{overflow-wrap:anywhere;min-inline-size:0}` の 1 規則で済むが、
    // Tailwind では全ノードに utility を刻む必要がある（backend 差の記録。break-words は標準 utility）
    utils.push('[overflow-wrap:anywhere]', 'min-w-0'); // 標準 break-words(=break-word) では hostile に不足。anywhere は arbitrary value しかない(Tailwind 残余)
    return `class="${[...roles, ...new Set(utils)].join(' ')}"`;
  });
}
