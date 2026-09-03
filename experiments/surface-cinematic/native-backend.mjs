/**
 * Cinematic 用 Native CSS backend（条件C）。recipe の純関数として CSS を生成。
 * scroll-driven animation は @supports で入れ、prefers-reduced-motion で必ず無効化する。
 * no-JS でも内容は読める（表示は CSS のみに依存）。
 */
const PAL = {
  graphite: { darkBg:'oklch(18% 0.015 260)', darkInk:'oklch(96% 0.005 260)', darkInk2:'oklch(78% 0.01 260)',
    lightBg:'oklch(97% 0.005 260)', lightInk:'oklch(20% 0.015 260)', lightInk2:'oklch(42% 0.012 260)',
    accent:'oklch(70% 0.14 250)', onAccent:'oklch(18% 0.02 260)' },
  warm: { darkBg:'oklch(20% 0.03 40)', darkInk:'oklch(96% 0.02 70)', darkInk2:'oklch(80% 0.03 60)',
    lightBg:'oklch(97% 0.02 70)', lightInk:'oklch(24% 0.04 40)', lightInk2:'oklch(44% 0.04 45)',
    accent:'oklch(66% 0.17 40)', onAccent:'oklch(99% 0.02 70)' },
  cool: { darkBg:'oklch(19% 0.03 230)', darkInk:'oklch(96% 0.01 220)', darkInk2:'oklch(80% 0.02 220)',
    lightBg:'oklch(97% 0.01 220)', lightInk:'oklch(22% 0.03 230)', lightInk2:'oklch(44% 0.03 230)',
    accent:'oklch(66% 0.15 220)', onAccent:'oklch(99% 0.01 220)' },
  'high-contrast': { darkBg:'oklch(12% 0 0)', darkInk:'oklch(100% 0 0)', darkInk2:'oklch(88% 0 0)',
    lightBg:'oklch(100% 0 0)', lightInk:'oklch(10% 0 0)', lightInk2:'oklch(25% 0 0)',
    accent:'oklch(45% 0.2 250)', onAccent:'oklch(100% 0 0)' },
};
const TYPE = { grand:{h1:'clamp(2.5rem,1.5rem + 5vw,5rem)',h2:'clamp(1.8rem,1.2rem + 2.5vw,3rem)'},
  editorial:{h1:'clamp(2rem,1.4rem + 3vw,3.5rem)',h2:'clamp(1.5rem,1.1rem + 1.8vw,2.4rem)'},
  compact:{h1:'clamp(1.6rem,1.2rem + 2vw,2.6rem)',h2:'clamp(1.3rem,1.05rem + 1.2vw,1.9rem)'} };
const RHYTHM = { spacious:'clamp(4rem,3rem + 8vw,10rem)', tight:'clamp(2rem,1.5rem + 3vw,4rem)' };

export function cinematicCss(recipe) {
  const p = PAL[recipe.palette], t = TYPE[recipe.typeScale], pad = RHYTHM[recipe.sceneRhythm];
  const heroGrid = recipe.heroLayout === 'split'
    ? '.ci-hero{display:grid;grid-template-columns:1fr 1fr;align-items:center}@media(max-width:52rem){.ci-hero{grid-template-columns:1fr}}'
    : recipe.heroLayout === 'full-bleed'
    ? '.ci-hero{display:grid;place-items:center;text-align:center;position:relative}.ci-hero .ci-hero-media{position:absolute;inset:0;z-index:0}.ci-hero .ci-hero-copy{position:relative;z-index:1}'
    : '.ci-hero{display:grid;place-items:center;text-align:center}';
  const ctaCss = recipe.ctaStyle === 'outline'
    ? '.ci-cta{background:transparent;color:var(--accent);border:2px solid var(--accent)}'
    : recipe.ctaStyle === 'sticky'
    ? '.ci-cta{background:var(--accent);color:var(--on-accent);border:2px solid var(--accent)}.ci-hero .ci-cta-row{position:sticky;bottom:1rem}'
    : '.ci-cta{background:var(--accent);color:var(--on-accent);border:2px solid var(--accent)}';
  const motionOn = recipe.motion !== 'none';
  const motionCss = motionOn ? `
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .ci-scene-copy, .ci-scene-media { animation: ci-rise linear both; animation-timeline: view(); animation-range: entry 0% cover 35%; }
    ${recipe.motion === 'cinematic' ? '.ci-hero-media > .ci-img{animation:ci-scale linear both;animation-timeline:view();animation-range:entry 0% exit 100%}' : ''}
  }
}
@keyframes ci-rise { from { opacity:0; transform:translateY(2rem) } to { opacity:1; transform:none } }
@keyframes ci-scale { from { transform:scale(1.08) } to { transform:scale(1) } }` : '';
  return `
:root{--accent:${p.accent};--on-accent:${p.onAccent}}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:system-ui,"Hiragino Sans","Noto Sans JP",sans-serif;line-height:1.6}
img{max-width:100%;height:auto;display:block}
h1,h2,p,dl,dd{margin:0}
p,h1,h2,dd,dt,a{overflow-wrap:anywhere}
.ci-page{display:block}
.ci-hero,.ci-scene,.ci-spec,.ci-footer-cta{padding-block:${pad};padding-inline:clamp(1rem,0.5rem + 3vw,4rem)}
[data-scene-theme="dark"]{background:${p.darkBg};color:${p.darkInk}}
[data-scene-theme="light"]{background:${p.lightBg};color:${p.lightInk}}
[data-scene-theme="dark"] .ci-scene-body,[data-scene-theme="dark"] .ci-subhead{color:${p.darkInk2}}
[data-scene-theme="light"] .ci-scene-body{color:${p.lightInk2}}
.ci-hero{min-block-size:80vh}
${heroGrid}
.ci-hero-copy{display:grid;gap:1rem;max-inline-size:40rem;padding:clamp(1rem,3vw,3rem)}
.ci-eyebrow{text-transform:uppercase;letter-spacing:.1em;font-size:.8rem;color:var(--accent);font-weight:600}
.ci-headline{font-size:${t.h1};line-height:1.05;font-weight:700;letter-spacing:-0.02em}
.ci-subhead{font-size:clamp(1rem,0.9rem + 0.6vw,1.4rem);max-inline-size:38ch}
.ci-cta-row{display:flex;flex-wrap:wrap;gap:1rem;margin-block-start:.5rem}
.ci-cta{min-block-size:2.75rem;padding-inline:1.5rem;display:inline-flex;align-items:center;border-radius:999px;font-weight:600;text-decoration:none}
.ci-cta[data-cta="SECONDARY"]{background:transparent;color:inherit;border:2px solid currentColor}
${ctaCss.replace('.ci-cta{', '.ci-cta[data-cta="PRIMARY"]{')}
.ci-scene{display:grid;gap:2rem;align-items:center}
@media(min-width:52rem){.ci-scene{grid-template-columns:1fr 1fr}.ci-scene[data-emphasis="strong"] .ci-scene-heading{font-size:calc(${t.h2} * 1.15)}}
.ci-scene-copy{display:grid;gap:1rem;max-inline-size:40rem}
.ci-scene-heading{font-size:${t.h2};font-weight:700;line-height:1.1;letter-spacing:-0.01em}
.ci-scene-body{font-size:clamp(1rem,0.95rem + 0.4vw,1.25rem);max-inline-size:70ch}
.ci-img{inline-size:100%;border-radius:12px;background:${p.darkInk2}}
.ci-spec-list{display:grid;gap:.5rem;max-inline-size:40rem;margin-block-start:1.5rem}
.ci-spec-heading{font-size:${t.h2};font-weight:700}
.ci-spec-row{display:grid;grid-template-columns:minmax(8rem,1fr) 2fr;gap:1rem;padding-block:.75rem;border-block-end:1px solid color-mix(in oklch,currentColor 20%,transparent)}
.ci-spec-k{color:${p.lightInk2};font-weight:600}
.ci-footer-cta{display:grid;place-items:center;text-align:center}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media (forced-colors: active){.ci-cta{border:2px solid ButtonText}}
${motionCss}
`.trim();
}
