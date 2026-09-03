/**
 * oklch() を sRGB へ変換し、WCAG のコントラスト比を計算する。
 * token を「定義しただけ」ではアクセシビリティは保証されない、という実測結果
 * (docs/results/ui-1-comparison.md) を受けて追加した。
 */

const cbrt = Math.cbrt;

/** oklch(L% C H) -> [r,g,b] 0..1 (clamped sRGB) */
export function oklchToSrgb(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const enc = (u) => {
    const v = u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(Math.max(u, 0), 1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, v));
  };
  return [enc(lr), enc(lg), enc(lb)];
}

export function parseColor(str) {
  const s = String(str).trim();
  let m = s.match(/^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)/i);
  if (m) return oklchToSrgb(Number(m[1]) / 100, Number(m[2]), Number(m[3]));
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16) / 255);
  m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) return [1, 2, 3].map((i) => Number(m[i]) / 255);
  return null;
}

const lin = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
export const relativeLuminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

export function contrastRatio(fg, bg) {
  const a = relativeLuminance(typeof fg === 'string' ? parseColor(fg) : fg);
  const b = relativeLuminance(typeof bg === 'string' ? parseColor(bg) : bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export const toHex = (rgb) =>
  '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

/** CSS ファイルから custom property の定義を読む（同一セレクタブロック単位） */
export function readTokens(css, selectorPattern) {
  const out = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (selectorPattern && !selectorPattern.test(sel)) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

/** var(--x) を再帰的に解決する */
export function resolve(tokens, name, depth = 0) {
  if (depth > 10) return null;
  const v = tokens[name];
  if (!v) return null;
  const m = v.match(/^var\(\s*(--[\w-]+)/);
  if (m) return resolve(tokens, m[1], depth + 1);
  return v;
}
