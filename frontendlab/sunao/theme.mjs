/**
 * sunao/theme — 閉じた Recipe 語彙 → 実 CSS トークン（oklch）。
 * 値は repo の Semantic UI Compiler（experiments/e-compiler/compiler.mjs）の PALETTE/DENSITY/SHAPE と
 * 同じ思想でポート。`import { recipeStyle, themeCSS } from 'sunao/theme'`（使わなければ tree-shake）。
 *
 * これで「CSS をいい感じに」= 手で色を決めず、Recipe の閉じた語彙から良い配色が決まる。
 */
const PALETTE = {
  calm: { page: 'oklch(97.5% 0.006 250)', card: 'oklch(100% 0 0)', sunken: 'oklch(96% 0.008 250)', ink: 'oklch(22% 0.016 250)', ink2: 'oklch(42% 0.014 250)', quiet: 'oklch(50% 0.012 250)', border: 'oklch(80% 0.010 250)', accent: 'oklch(46% 0.16 250)', danger: 'oklch(48% 0.18 25)', caution: 'oklch(52% 0.13 75)', positive: 'oklch(48% 0.13 150)', unknown: 'oklch(48% 0.17 300)', onAccent: 'oklch(100% 0 0)' },
  editorial: { page: 'oklch(97% 0.015 85)', card: 'oklch(99% 0.008 85)', sunken: 'oklch(94.5% 0.018 85)', ink: 'oklch(24% 0.02 60)', ink2: 'oklch(40% 0.02 60)', quiet: 'oklch(45% 0.02 60)', border: 'oklch(80% 0.02 70)', accent: 'oklch(40% 0.12 25)', danger: 'oklch(43% 0.16 25)', caution: 'oklch(48% 0.12 70)', positive: 'oklch(43% 0.12 150)', unknown: 'oklch(44% 0.15 300)', onAccent: 'oklch(99% 0.008 85)' },
  'command-center': { page: 'oklch(19% 0.015 260)', card: 'oklch(24% 0.018 260)', sunken: 'oklch(28% 0.020 260)', ink: 'oklch(95% 0.005 260)', ink2: 'oklch(82% 0.008 260)', quiet: 'oklch(72% 0.010 260)', border: 'oklch(40% 0.020 260)', accent: 'oklch(72% 0.14 200)', danger: 'oklch(70% 0.17 25)', caution: 'oklch(80% 0.14 85)', positive: 'oklch(76% 0.14 155)', unknown: 'oklch(74% 0.13 300)', onAccent: 'oklch(18% 0.02 260)' },
  conversational: { page: 'oklch(98% 0.012 320)', card: 'oklch(100% 0 0)', sunken: 'oklch(96% 0.018 320)', ink: 'oklch(22% 0.016 320)', ink2: 'oklch(42% 0.014 320)', quiet: 'oklch(50% 0.012 320)', border: 'oklch(82% 0.010 320)', accent: 'oklch(46% 0.16 320)', danger: 'oklch(48% 0.18 25)', caution: 'oklch(52% 0.13 75)', positive: 'oklch(48% 0.13 150)', unknown: 'oklch(48% 0.17 300)', onAccent: 'oklch(100% 0 0)' },
  'high-contrast': { page: 'oklch(100% 0 0)', card: 'oklch(100% 0 0)', sunken: 'oklch(95% 0 0)', ink: 'oklch(15% 0 0)', ink2: 'oklch(25% 0 0)', quiet: 'oklch(30% 0 0)', border: 'oklch(40% 0 0)', accent: 'oklch(30% 0.2 250)', danger: 'oklch(35% 0.2 25)', caution: 'oklch(38% 0.14 70)', positive: 'oklch(35% 0.14 150)', unknown: 'oklch(35% 0.2 300)', onAccent: 'oklch(100% 0 0)' },
};
const DENSITY = {
  comfortable: { pad: '1.25rem', gap: '.85rem', lead: '1.05rem', fact: '.92rem', radius: '14px' },
  compact: { pad: '.9rem', gap: '.55rem', lead: '1rem', fact: '.86rem', radius: '12px' },
  dense: { pad: '.6rem .7rem', gap: '.35rem', lead: '.95rem', fact: '.8rem', radius: '10px' },
};
const SHAPE = { rounded: '14px', square: '0', 'left-rule': '8px', 'top-rule': '8px' };
const TYPO = {
  system: 'system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif',
  serif: 'Georgia, "Hiragino Mincho ProN", "Yu Mincho", serif',
  mono: 'ui-monospace, SFMono-Regular, "Noto Sans Mono", monospace',
};

// Recipe（文字列 or {palette,density,cardShape,typography}）→ CSS 変数の inline 文字列。
// ルート要素に `:style="recipeStyle(recipe())"` で載せると配下が全部そのトークンで揃う。
export function recipeStyle(recipe) {
  const r = typeof recipe === 'string' ? { palette: recipe } : (recipe || {});
  const p = PALETTE[r.palette] || PALETTE.calm;
  const d = DENSITY[r.density] || DENSITY.comfortable;
  const vars = {
    '--k-page': p.page, '--k-card': p.card, '--k-sunken': p.sunken, '--k-ink': p.ink, '--k-ink2': p.ink2,
    '--k-quiet': p.quiet, '--k-border': p.border, '--k-accent': p.accent, '--k-danger': p.danger,
    '--k-caution': p.caution, '--k-positive': p.positive, '--k-unknown': p.unknown, '--k-on-accent': p.onAccent,
    '--k-pad': d.pad, '--k-gap': d.gap, '--k-lead': d.lead, '--k-fact': d.fact,
    '--k-radius': SHAPE[r.cardShape] || d.radius, '--k-font': TYPO[r.typography] || TYPO.system,
  };
  return Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
}

// カード役割（cards.schema.json の type）→ 強調色トークン（役割ベース）。
export const KIND_ACCENT = {
  OWNER_QUESTION: 'var(--k-accent)', ACTION_APPROVAL: 'var(--k-danger)',
  OUTCOME_UNKNOWN_REVIEW: 'var(--k-unknown)', RESULT_REVIEW: 'var(--k-positive)', INFORMATION: 'var(--k-quiet)',
};
export const KIND_LABEL = {
  OWNER_QUESTION: '質問', ACTION_APPROVAL: '承認依頼',
  OUTCOME_UNKNOWN_REVIEW: '結果不明', RESULT_REVIEW: '結果確認', INFORMATION: 'お知らせ',
};

// 良い既定スタイル。トークン（recipeStyle）を使うので、Recipe を変えるだけで見た目が決まる。
export const themeCSS = `
.k-root{background:var(--k-page);color:var(--k-ink);font-family:var(--k-font);padding:var(--k-pad);
  display:flex;flex-direction:column;gap:var(--k-gap);border-radius:var(--k-radius)}
.k-card{background:var(--k-card);color:var(--k-ink);border:1px solid var(--k-border);border-radius:var(--k-radius);
  border-inline-start:6px solid var(--k-kind,var(--k-accent));padding:var(--k-pad);display:flex;flex-direction:column;gap:var(--k-gap)}
.k-kind{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--k-kind,var(--k-accent))}
.k-title{margin:.1rem 0 0;font-size:var(--k-lead);font-weight:700;line-height:1.4;color:var(--k-ink)}
.k-facts{margin:0;display:grid;gap:.3rem}
.k-fact{display:grid;grid-template-columns:5.5rem 1fr;gap:.5rem;font-size:var(--k-fact)}
.k-fact dt{color:var(--k-quiet)} .k-fact dd{margin:0;color:var(--k-ink2)}
.k-actions{display:flex;gap:.5rem;margin-block-start:.3rem}
.k-btn{padding:.5rem .9rem;border-radius:calc(var(--k-radius) - 4px);border:1px solid var(--k-border);
  background:var(--k-sunken);color:var(--k-ink);font:inherit;font-weight:600;cursor:pointer}
.k-btn.primary{background:var(--k-kind,var(--k-accent));border-color:var(--k-kind,var(--k-accent));color:var(--k-on-accent)}
.k-done{margin:0;font-size:var(--k-fact);color:var(--k-quiet)}
`;
