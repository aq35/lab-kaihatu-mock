/**
 * Cinematic 用 Tailwind backend（条件D）。同じ recipe・同じ意味 DOM を消費し、
 * ci-* 役割へ完全な静的 Tailwind class を付ける。
 * Cinematic に必要だが標準 utility に無いもの（clamp 型・scroll-driven animation）は
 * arbitrary value / 小さな custom layer に「逃げる」。その逃げを記録する（TW-3/TW-4）。
 */
const PAL = {
  graphite: { dark:'bg-slate-900 text-slate-50', light:'bg-slate-50 text-slate-900', accent:'blue-400', accentBg:'blue-600', darkInk2:'text-slate-300', lightInk2:'text-slate-600' },
  warm:     { dark:'bg-orange-950 text-orange-50', light:'bg-orange-50 text-orange-950', accent:'orange-500', accentBg:'orange-700', darkInk2:'text-orange-200', lightInk2:'text-orange-800' },
  cool:     { dark:'bg-sky-950 text-sky-50', light:'bg-sky-50 text-sky-950', accent:'sky-500', accentBg:'sky-700', darkInk2:'text-sky-200', lightInk2:'text-sky-800' },
  'high-contrast': { dark:'bg-black text-white', light:'bg-white text-black', accent:'blue-800', accentBg:'blue-800', darkInk2:'text-zinc-200', lightInk2:'text-zinc-700' },
};
const TYPE = { grand:{h1:'text-[clamp(2.5rem,1.5rem+5vw,5rem)]',h2:'text-[clamp(1.8rem,1.2rem+2.5vw,3rem)]'},
  editorial:{h1:'text-[clamp(2rem,1.4rem+3vw,3.5rem)]',h2:'text-[clamp(1.5rem,1.1rem+1.8vw,2.4rem)]'},
  compact:{h1:'text-[clamp(1.6rem,1.2rem+2vw,2.6rem)]',h2:'text-[clamp(1.3rem,1.05rem+1.2vw,1.9rem)]'} };
const RHYTHM = { spacious:'py-[clamp(4rem,3rem+8vw,10rem)]', tight:'py-[clamp(2rem,1.5rem+3vw,4rem)]' };

// 逃げの記録（TW-4 escape ratio 用）
export const escapes = { arbitraryValue: new Set(), customCss: new Set() };

function trackArb(cls) { for (const t of cls.split(/\s+/)) if (/\[.*\]/.test(t)) escapes.arbitraryValue.add(t); return cls; }

export function twClassMap(recipe) {
  const p = PAL[recipe.palette], t = TYPE[recipe.typeScale], pad = RHYTHM[recipe.sceneRhythm];
  const heroLayout = recipe.heroLayout === 'split' ? 'md:grid-cols-2 items-center' : 'place-items-center text-center';
  const ctaPrimary = recipe.ctaStyle === 'outline'
    ? `bg-transparent text-${p.accentBg} border-2 border-${p.accentBg}`
    : `bg-${p.accentBg} text-white border-2 border-${p.accentBg}`;
  const px = 'px-[clamp(1rem,0.5rem+3vw,4rem)]';
  return {
    'ci-hero': trackArb(`grid ${heroLayout} min-h-[80vh] ${pad} ${px} ${p.dark}`),
    'ci-hero-copy': trackArb('grid gap-4 max-w-[40rem] p-[clamp(1rem,3vw,3rem)]'),
    'ci-eyebrow': `uppercase tracking-widest text-sm font-semibold text-${p.accent}`,
    'ci-headline': trackArb(`${t.h1} leading-[1.05] font-bold tracking-tight`),
    'ci-subhead': trackArb(`text-[clamp(1rem,0.9rem+0.6vw,1.4rem)] max-w-[38ch] ${p.darkInk2}`),
    'ci-cta-row': 'flex flex-wrap gap-4 mt-2',
    'ci-cta': 'min-h-11 px-6 inline-flex items-center rounded-full font-semibold no-underline',
    'ci-scene': trackArb(`grid gap-8 items-center md:grid-cols-2 ${pad} ${px}`),
    'ci-scene-copy': 'grid gap-4 max-w-[40rem]',
    'ci-scene-heading': trackArb(`${t.h2} font-bold leading-tight tracking-tight`),
    'ci-scene-body': trackArb('text-[clamp(1rem,0.95rem+0.4vw,1.25rem)] max-w-[70ch]'),
    'ci-img': trackArb('w-full rounded-xl h-auto'),
    'ci-spec': trackArb(`${pad} ${px} ${p.light}`),
    'ci-spec-heading': trackArb(`${t.h2} font-bold`),
    'ci-spec-list': 'grid gap-2 max-w-[40rem] mt-6',
    'ci-spec-row': trackArb(`grid grid-cols-[minmax(8rem,1fr)_2fr] gap-4 py-3 border-b border-current/20`),
    'ci-spec-k': `${p.lightInk2} font-semibold`,
    'ci-footer-cta': trackArb(`grid place-items-center text-center ${pad} ${px} ${p.dark}`),
    __ctaPrimary: ctaPrimary,
  };
}

/** scroll-driven animation は Tailwind の標準語彙に無い → custom CSS layer に逃げる（記録） */
export function twCustomCss(recipe) {
  if (recipe.motion === 'none') return '';
  escapes.customCss.add('scroll-driven-animation(@keyframes + animation-timeline)');
  escapes.customCss.add('data-scene-theme attribute theming');
  return `
/* Tailwind の標準 utility で表せないため custom CSS へ逃げた分（TW-4）*/
[data-scene-theme="dark"]{background:#0f172a;color:#f8fafc}
[data-scene-theme="light"]{background:#f8fafc;color:#0f172a}
@supports (animation-timeline: view()){@media (prefers-reduced-motion: no-preference){
  .ci-scene-copy,.ci-scene-media{animation:ci-rise linear both;animation-timeline:view();animation-range:entry 0% cover 35%}
}}
@keyframes ci-rise{from{opacity:0;transform:translateY(2rem)}to{opacity:1;transform:none}}`;
}

export function applyTwClasses(html, recipe) {
  const map = twClassMap(recipe);
  // 1) 役割 class ごとに utility を付与（新しい属性は足さない = 意味 DOM を変えない）
  let out = html.replace(/class="([^"]*)"/g, (m, cls) => {
    const roles = cls.split(/\s+/).filter(Boolean);
    const utils = roles.flatMap((r) => (map[r] ?? '').split(/\s+/)).filter(Boolean);
    return `class="${[...roles, ...new Set(utils)].join(' ')}"`;
  });
  // 2) PRIMARY CTA(既存の data-cta 属性で判定)の class に primary 色を足す。属性は増やさない
  out = out.replace(/<a class="([^"]*)"([^>]*?)data-cta="PRIMARY"/g,
    (m, cls, mid) => `<a class="${cls} ${map.__ctaPrimary}"${mid}data-cta="PRIMARY"`);
  return out;
}
