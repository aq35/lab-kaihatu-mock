/**
 * 生成器: 意味を固定したまま、意図 + 制約から N 個の「表現仮説」を生成する。
 * 固定 enum を選ぶのではなく、連続パラメータ空間をサンプルする（探索）。
 * seed 決定論: 同じ (grammar, seed, N) から同じ仮説集合（V5）。
 */
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 意図 → 各連続軸の「平均」。生成器はこの平均の周りをサンプルする。
function intentMeans(intent) {
  const e = String(intent.primary_emotion || '').toLowerCase();
  const rhythm = intent.reading_rhythm;
  const has = (w) => e.includes(w);
  // 既定
  const m = { density: 0.5, hierarchy: 0.55, contrastEmphasis: 0.6, motionIntensity: 0.3,
    whitespace: 0.5, riskProminence: 0.6, radius: 0.5, ruleWeight: 0.5, accentHue: 250, accentChroma: 0.5 };
  if (has('quiet') || has('calm') || has('anticipation')) { m.motionIntensity = 0.12; m.density = 0.38; m.whitespace = 0.7; }
  if (has('urgent') || has('alarm')) { m.motionIntensity = 0.5; m.density = 0.62; m.contrastEmphasis = 0.8; m.riskProminence = 0.85; m.accentHue = 25; }
  if (has('premium') || has('trust')) { m.contrastEmphasis = 0.7; m.radius = 0.4; m.accentChroma = 0.4; }
  if (rhythm === 'slow_then_decisive') { m.whitespace = Math.max(m.whitespace, 0.65); m.hierarchy = 0.7; }
  if (rhythm === 'urgent') { m.density = 0.7; m.motionIntensity = 0.45; }
  if (rhythm === 'scan_first') { m.density = 0.75; m.hierarchy = 0.8; }
  // attention_path が risk/evidence を含むほど riskProminence を上げる
  const path = intent.attention_path || [];
  if (path.includes('evidence') || path.includes('risk')) m.riskProminence = Math.min(1, m.riskProminence + 0.15);
  return m;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** 平均 mu の周りを rng で ±spread サンプル（軸ごとに独立）。多様性のため spread を確保する。 */
function sampleAround(mu, rng, spread = 0.35) {
  const out = {};
  for (const [k, v] of Object.entries(mu)) {
    if (k === 'accentHue') { out[k] = (v + (rng() - 0.5) * 120 + 360) % 360; continue; }
    out[k] = clamp01(v + (rng() - 0.5) * 2 * spread);
  }
  return out;
}

export function generate(grammar, { n = 12, seed = 1 } = {}) {
  const rng = mulberry32(seed);
  const mu = intentMeans(grammar.intent);
  const items = [];
  // 1 案目は意図の中心（探索の基準点）
  items.push({ hypothesis: 'intent center', parameters: { ...mu, density: clamp01(mu.density) } });
  for (let i = 1; i < n; i++) {
    // spread を i とともに少し広げ、空間を広く探る
    const spread = 0.25 + 0.2 * (i / n);
    items.push({ hypothesis: `explore ${i}`, parameters: sampleAround(mu, rng, spread) });
  }
  return { intent: grammar.intent, constraints: grammar.constraints, experiments: items, seed, n };
}

/** 勝者の周りに次世代をサンプルする（選択 → 進化。V6） */
export function nextGeneration(grammar, winnerParams, { n = 12, seed = 2, spread = 0.15 } = {}) {
  const rng = mulberry32(seed);
  const items = [{ hypothesis: 'winner', parameters: { ...winnerParams } }];
  for (let i = 1; i < n; i++) items.push({ hypothesis: `refine ${i}`, parameters: sampleAround(winnerParams, rng, spread) });
  return { intent: grammar.intent, constraints: grammar.constraints, experiments: items, seed, n, parentWinner: winnerParams };
}
