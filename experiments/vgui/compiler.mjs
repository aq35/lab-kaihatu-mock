/**
 * VGUI compiler: 連続パラメータ → Native CSS。意味 DOM は既存の card 契約(e-compiler/semantic-dom)を再利用。
 * 重要: パラメータを「安全側にクランプしない」。低 contrast など制約違反の案もそのまま描画し、
 *       ブラウザ観測(verify.mjs)で淘汰させる。これが「書く」でなく「探索して検証する」核心。
 * reduced-motion は常に honor する（compiler が守る不変条件）。
 */
import { renderCardDom } from '../e-compiler/semantic-dom.mjs';

const lerp = (a, b, t) => a + (b - a) * t;
const r2 = (x) => Math.round(x * 1000) / 1000;

/** params(0..1) → CSS 変数。contrast は敢えて低くもなりうる（淘汰対象を作る）。 */
export function paramsToVars(p) {
  const inkL = lerp(56, 18, p.contrastEmphasis);          // 低いと薄い黒 → contrast 不足になりうる
  const quietL = lerp(72, 42, p.contrastEmphasis);         // quiet も同様
  const pad = lerp(1.5, 0.5, p.density);                   // rem
  const gap = lerp(1.0, 0.35, p.density);
  const feed = lerp(1.6, 0.5, p.density);
  const titlePx = lerp(15, 20, p.hierarchy);
  const labelPx = lerp(12, 11.5, p.density);
  const btnMin = lerp(2.9, 2.0, p.density);                // 高密度だと 24px 未満になりうる → target-size 淘汰
  const motionMs = Math.round(lerp(0, 260, p.motionIntensity));
  const riskWeight = p.riskProminence > 0.5 ? 700 : 600;
  const riseY = lerp(0, 1.2, p.motionIntensity);
  const hue = r2(p.accentHue), chroma = r2(0.06 + p.accentChroma * 0.12);
  const radius = Math.round(lerp(0, 16, p.radius));
  const rule = r2(lerp(2, 8, p.ruleWeight));
  return { inkL: r2(inkL), quietL: r2(quietL), pad: r2(pad), gap: r2(gap), feed: r2(feed),
    titlePx: r2(titlePx), labelPx: r2(labelPx), btnMin: r2(btnMin), motionMs, riskWeight, riseY: r2(riseY), hue, chroma, radius, rule };
}

export function candidateCss(p) {
  const v = paramsToVars(p);
  return `
:root{
 --bg:oklch(99% 0.004 ${v.hue});--card:oklch(100% 0 0);--sunken:oklch(96% 0.006 ${v.hue});
 --ink:oklch(${v.inkL}% 0.02 ${v.hue});--ink2:oklch(${(v.inkL+8)}% 0.02 ${v.hue});--quiet:oklch(${v.quietL}% 0.012 ${v.hue});
 --border:oklch(80% 0.01 ${v.hue});--border-strong:oklch(50% 0.012 ${v.hue});
 --accent:oklch(48% ${v.chroma} ${v.hue});--on-accent:oklch(100% 0 0);
 --danger:oklch(48% 0.18 25);--positive:oklch(48% 0.13 150);--caution:oklch(52% 0.13 75);--unknown:oklch(48% 0.17 300);
 --pad:${v.pad}rem;--gap:${v.gap}rem;--feed:${v.feed}rem;--radius:${v.radius}px;--rule:${v.rule}px;--motion:${v.motionMs}ms;
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,"Hiragino Sans","Noto Sans JP",sans-serif;line-height:1.6}
h1,h3,p,dl,dd{margin:0}ul,ol{margin:0;padding:0;list-style:none}
p,dd,li,h3,button,label,legend{overflow-wrap:anywhere}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.page{max-inline-size:60rem;margin-inline:auto;padding:2rem 1rem}
.kfeed{display:grid;gap:var(--feed)}
.kslot{container-type:inline-size}
.kcard{display:grid;gap:var(--gap);padding:var(--pad);background:var(--card);border:1px solid var(--border);border-radius:var(--radius);border-inline-start:var(--rule) solid var(--k-kind,var(--border))}
.kcard--owner-question{--k-kind:var(--accent)}.kcard--action-approval{--k-kind:var(--danger)}
.kcard--outcome-unknown{--k-kind:var(--unknown)}.kcard--result-review{--k-kind:var(--positive)}.kcard--information{--k-kind:var(--quiet)}
.kcard__header{display:grid;gap:.25rem}
.kcard__kind{display:flex;align-items:center;gap:.5rem;font-size:${v.labelPx}px;font-weight:600;color:var(--k-kind)}
.kcard__glyph{display:grid;place-items:center;inline-size:1.35em;block-size:1.35em;border:1px solid currentColor;border-radius:2px;font-family:ui-monospace,monospace}
.kcard__state{justify-self:start;padding:.125rem .5rem;font-size:${v.labelPx}px;font-weight:700;border:1px solid currentColor;border-radius:2px;color:var(--danger)}
.kcard__title{font-size:${v.titlePx}px;line-height:1.3;color:var(--ink)}
.klead{font-size:${r2(v.titlePx*1.05)}px;color:var(--ink);max-inline-size:68ch}
.kinfo{font-size:${v.labelPx+1}px;color:var(--ink2)}
.kfacts{display:grid;gap:var(--gap)}
.kfact{display:grid;gap:.125rem}
.kfact__label{font-size:${v.labelPx}px;font-weight:600;color:var(--quiet)}
.kfact__value{font-size:${r2(v.labelPx+2)}px;color:var(--ink2);max-inline-size:68ch}
.kfact--effect .kfact__value,.kfact--risk .kfact__value,.kfact--one-shot .kfact__value{color:var(--ink);font-weight:${v.riskWeight}}
.kabsent{color:var(--quiet);font-style:italic}
.kscope{display:grid;gap:.25rem;font-family:ui-monospace,monospace;font-size:${v.labelPx}px}
.krisk{display:grid;gap:.25rem}
.krisk__item{display:grid;grid-template-columns:1.25em minmax(6rem,auto) minmax(0,1fr);gap:.5rem;font-size:${r2(v.labelPx+1)}px}
.krisk__item[data-risk="yes"]{color:var(--danger);font-weight:${v.riskWeight}}.krisk__item[data-risk="no"]{color:var(--quiet)}
.ksteps{display:grid;gap:.25rem;counter-reset:s;padding:.75rem;background:var(--sunken);border-radius:var(--radius)}
.ksteps li{display:grid;grid-template-columns:1.5rem 1fr;gap:.5rem;counter-increment:s}.ksteps li::before{content:counter(s) ".";color:var(--quiet)}
.kevidence{font-weight:600}.kevidence[data-evidence-level="RECEIPTED"]{color:var(--positive)}
.kevidence[data-evidence-level="OBSERVED"]{color:var(--caution)}.kevidence[data-evidence-level="CLAIMED"],.kevidence[data-evidence-level="NONE"]{color:var(--danger)}
.kopts{display:grid;gap:.5rem;margin:0;padding:1rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--sunken)}
.kopts>legend{padding-inline:.25rem;font-size:${v.labelPx}px;font-weight:600;color:var(--quiet)}
.kopt{display:grid;grid-template-columns:auto 1fr;gap:.5rem;align-items:start}.kopt input{inline-size:1.5rem;block-size:1.5rem;margin-block-start:.2em}
.kopt label{display:grid;gap:.125rem;cursor:pointer}.kopt__consequence{font-size:${v.labelPx}px;color:var(--quiet)}
.kfree{display:grid;gap:.25rem;margin-block-start:.5rem}.kfree textarea{inline-size:100%;padding:.5rem;border:1px solid var(--border-strong);border-radius:var(--radius);background:var(--card)}
.kactions{display:flex;flex-wrap:wrap;gap:.5rem;padding-block-start:var(--gap);border-block-start:1px solid var(--border)}
.kbtn{min-block-size:${v.btnMin}rem;min-inline-size:${v.btnMin}rem;padding-inline:1rem;display:inline-flex;align-items:center;justify-content:center;background:var(--sunken);color:var(--ink);border:1px solid var(--border-strong);border-radius:var(--radius);cursor:pointer;font:inherit;transition:background var(--motion) ease}
.kbtn--primary{background:var(--accent);color:var(--on-accent);border-color:var(--accent);font-weight:600}.kbtn--destructive.kbtn--primary{background:var(--danger)}
.kcard[data-card-state="EXPIRED"],.kcard[data-card-state="REVOKED"],.kcard[data-card-state="STALE"]{border-style:dashed}
.kcard[data-card-state="EXPIRED"] .kbtn,.kcard[data-card-state="REVOKED"] .kbtn{display:none}
${v.motionMs > 0 ? `@media (prefers-reduced-motion: no-preference){.kslot{animation:vg-rise var(--motion) ease both}}@keyframes vg-rise{from{opacity:0;transform:translateY(${v.riseY}rem)}to{opacity:1;transform:none}}` : ''}
`.trim();
}

export function renderCandidatePage(cards, params) {
  const feed = `<ul class="kfeed">${cards.map((c) => `<li class="kslot">${renderCardDom(c)}</li>`).join('')}</ul>`;
  return { html: `<main class="page">${feed}</main>`, css: candidateCss(params) };
}
