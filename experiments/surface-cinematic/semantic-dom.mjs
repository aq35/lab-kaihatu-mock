/**
 * Cinematic surface の意味 DOM。C(native) と D(tailwind) が共有する。
 * data-section / data-field / data-cta が意味契約。class は backend が後から付ける。
 * 画像は固定寸法のプレースホルダ（色 SVG data-URI、外部ネットワーク不要）。
 * ref==="MISSING" のときは壊れた src を出し、fallback を検証できるようにする。
 */
const esc = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const COLORS = { hero: '223046', display: '141821', battery: 'e8eaed', material: '2a2f3a' };
function placeholder(img) {
  if (!img) return '';
  if (img.ref === 'MISSING') {
    // 壊れた画像。alt と CSS fallback（背景）で情報を保つ
    return `<img class="ci-img" data-field="image" src="/__missing__/${esc(img.ref)}.png" width="${img.w}" height="${img.h}" alt="${esc(img.alt)}" loading="lazy">`;
  }
  const c = COLORS[img.ref] ?? '888888';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${img.w}' height='${img.h}'><rect width='100%' height='100%' fill='%23${c}'/></svg>`;
  const uri = `data:image/svg+xml,${svg.replaceAll('#', '%23').replaceAll('<', '%3C').replaceAll('>', '%3E').replaceAll('"', "'")}`;
  return `<img class="ci-img" data-field="image" src="${uri}" width="${img.w}" height="${img.h}" alt="${esc(img.alt)}" loading="lazy" decoding="async">`;
}

const cta = (c, kind) => c
  ? `<a class="ci-cta" data-cta="${esc(c.semantic)}" data-field="${kind}" href="${esc(c.href)}">${esc(c.label)}</a>`
  : '';

export function renderCinematicDom(data) {
  const hero = data.hero ?? {};
  const heroImg = placeholder(hero.image);
  const scenes = (data.scenes ?? []).map((s) => (
    `<section class="ci-scene" data-section="scene:${esc(s.id)}" data-scene-theme="${esc(s.theme)}" data-emphasis="${esc(s.emphasis)}">` +
    `<div class="ci-scene-media">${placeholder(s.image)}</div>` +
    `<div class="ci-scene-copy">` +
    `<h2 class="ci-scene-heading" data-field="heading">${esc(s.heading)}</h2>` +
    `<p class="ci-scene-body" data-field="body">${esc(s.body)}</p>` +
    `</div></section>`
  )).join('');
  const specRows = (data.spec?.rows ?? []).map((r) =>
    `<div class="ci-spec-row"><dt class="ci-spec-k" data-field="spec-k">${esc(r.k)}</dt><dd class="ci-spec-v" data-field="spec-v">${esc(r.v)}</dd></div>`).join('');
  return (
    `<main class="ci-page" data-surface="cinematic">` +
    `<section class="ci-hero" data-section="hero" data-scene-theme="dark" data-hero-layout="__LAYOUT__">` +
    `<div class="ci-hero-media">${heroImg}</div>` +
    `<div class="ci-hero-copy">` +
    (hero.eyebrow ? `<p class="ci-eyebrow" data-field="eyebrow">${esc(hero.eyebrow)}</p>` : '') +
    `<h1 class="ci-headline" data-field="headline">${esc(hero.headline ?? '')}</h1>` +
    (hero.subhead ? `<p class="ci-subhead" data-field="subhead">${esc(hero.subhead)}</p>` : '') +
    `<div class="ci-cta-row">${cta(hero.primaryCta, 'primaryCta')}${cta(hero.secondaryCta, 'secondaryCta')}</div>` +
    `</div></section>` +
    scenes +
    `<section class="ci-spec" data-section="spec" data-scene-theme="light">` +
    `<h2 class="ci-spec-heading" data-field="spec-heading">${esc(data.spec?.heading ?? '')}</h2>` +
    `<dl class="ci-spec-list">${specRows}</dl></section>` +
    `<section class="ci-footer-cta" data-section="footerCta" data-scene-theme="dark">${cta(data.footerCta, 'footerCta')}</section>` +
    `</main>`
  );
}
