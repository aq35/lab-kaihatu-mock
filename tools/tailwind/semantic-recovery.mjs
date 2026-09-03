/**
 * T1 — 表現が意味を持たない。
 *   node tools/tailwind/semantic-recovery.mjs
 *
 * 各 variant の描画結果から「意味属性 (data-*) を全部剥がした」DOM を作り、
 * 残った class 列だけから card type を機械的に復元できるかを測る。
 *
 * これは「AI が過去のセッションのコードを読んで意味を回復する」状況の代理。
 * data-* が無い ＝ 契約が壊れた/薄い実装を読まされた状況を想定する。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const TYPES = ['OWNER_QUESTION', 'ACTION_APPROVAL', 'OUTCOME_UNKNOWN_REVIEW', 'RESULT_REVIEW', 'INFORMATION'];
const cards = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'));

async function classListsByType(variant) {
  const { renderCard } = await import(new URL(`../../experiments/${variant}/render.mjs`, import.meta.url).href).catch(() => ({}));
  const mod = await import(new URL(`../../experiments/${variant}/render.mjs`, import.meta.url).href);
  const render = mod.renderCard ?? ((c) => mod.renderInbox([c]));
  const out = {};
  for (const c of cards) {
    // renderInbox で 1 カードだけ描画し、article（data-card-type を持つ要素）の class を取る
    const html = mod.renderInbox([c], { base: './' });
    const art = html.match(/<(?:article|kas-card)[^>]*\bclass="([^"]*)"[^>]*data-card-type/) ||
                html.match(/data-card-type="[^"]*"[^>]*\bclass="([^"]*)"/) ||
                html.match(/<(?:article|kas-card)[^>]*\bclass="([^"]*)"/);
    out[c.type] = (art ? art[1] : '').split(/\s+/).filter(Boolean);
  }
  return out;
}

// 復元器: class 列だけを見て card type を当てる（誰でも書ける素朴なルール）
function recover(classes) {
  const s = classes.join(' ');
  // 役割ベースの命名なら復元できる
  for (const t of TYPES) {
    const role = t.toLowerCase().replace(/_review$/, '').replace(/_/g, '-');
    if (s.includes(role) || s.includes(t.toLowerCase())) return t;
  }
  // owner-question / action-approval / outcome-unknown / result-review / information
  const roleMap = { 'owner-question': 'OWNER_QUESTION', 'action-approval': 'ACTION_APPROVAL',
    'outcome-unknown': 'OUTCOME_UNKNOWN_REVIEW', 'result-review': 'RESULT_REVIEW', information: 'INFORMATION' };
  for (const [k, v] of Object.entries(roleMap)) if (s.includes(k)) return v;
  return null; // class 列だけからは決められない
}

// 全 variant の描画結果で data-card-type が付いているか（＝契約経由なら常に復元できる）
async function hasContractAttr(variant) {
  const mod = await import(new URL(`../../experiments/${variant}/render.mjs`, import.meta.url).href);
  let ok = 0;
  for (const c of cards) if (mod.renderInbox([c], { base: './' }).includes(`data-card-type="${c.type}"`)) ok++;
  return `${ok}/${TYPES.length}`;
}
// A の class 列が種別間で同一か（utility が型情報を運ばない証拠）
function identicalAcrossTypes(byType) {
  const sigs = new Set(TYPES.map((t) => (byType[t] ?? []).filter((x) => !/--|owner-question|action-approval|outcome-unknown|result-review|information|blue-box|red-box|purple-box|green-box|plain-box/.test(x)).sort().join(' ')));
  return sigs.size === 1;
}

const results = [];
for (const variant of ['a-tailwind', 'b-raw-css', 'c-semantic-css', 'd-web-components', 'e-compiler']) {
  const byType = await classListsByType(variant);
  let recovered = 0;
  const detail = {};
  for (const t of TYPES) {
    const got = recover(byType[t] ?? []);
    detail[t] = { classes: (byType[t] ?? []).join(' ').slice(0, 60), recovered: got, ok: got === t };
    if (got === t) recovered++;
  }
  results.push({ variant, viaClassList: `${recovered}/${TYPES.length}`,
    viaContractAttr: await hasContractAttr(variant),
    baseClassesIdenticalAcrossTypes: identicalAcrossTypes(byType), detail });
}

writeFileSync('docs/results/raw/semantic-recovery.json', JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2) + '\n');
console.table(results.map((r) => ({ variant: r.variant,
  'class列だけで復元': r.viaClassList, '契約属性で復元': r.viaContractAttr,
  '素の外観class が種別間で同一': r.baseClassesIdenticalAcrossTypes })));
for (const r of results) {
  console.log(`\n${r.variant}:`);
  for (const t of TYPES) console.log(`  ${r.detail[t].ok ? '○' : '×'} ${t.padEnd(24)} class="${r.detail[t].classes}"`);
}
