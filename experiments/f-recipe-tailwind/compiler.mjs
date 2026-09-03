/**
 * 条件F Compiler: PresentationRecipe → 意味 DOM(E と同一) + 完全な静的 Tailwind class。
 *
 * E との共有:
 *   renderCardDom（意味 DOM）, normalizeRecipe/VOCAB/RecipeError（検証）を import。
 * F 固有: tw-map（役割→utility）と Tailwind build。
 *
 * 決定論: 同じ recipe から同じ HTML bytes。CSS は Tailwind build が生成（後段）。
 */
import { renderCardDom } from '../e-compiler/semantic-dom.mjs';
import { normalizeRecipe, hashBytes } from '../e-compiler/compiler.mjs';
import { applyUtilitiesToCard } from './tw-map.mjs';

export function compileHtml(cards, recipe) {
  normalizeRecipe(recipe); // fail-closed: enum 外は RecipeError（E と同一経路）
  const items = cards.map((c) => applyUtilitiesToCard(renderCardDom(c), recipe));
  const feed = cards.length
    ? `<ul class="kfeed grid gap-6 min-w-0">${items.map((h) => `<li class="kslot min-w-0">${h}</li>`).join('')}</ul>`
    : `<p class="kempty p-12 text-center text-slate-500">対応が必要な項目はありません。</p>`;
  return { html: feed, htmlHash: hashBytes(feed) };
}

/** build 前に、使用される完全な class 文字列を全部集める（Tailwind の静的走査用）。
 *  runtime 連結はしない。ここで完全文字列として吐き出す = HF5 の検証条件。 */
export function collectClassStrings(cards, recipe) {
  const { html } = compileHtml(cards, recipe);
  const set = new Set();
  for (const m of html.matchAll(/class="([^"]*)"/g)) for (const t of m[1].split(/\s+/)) if (t) set.add(t);
  return [...set].sort();
}
