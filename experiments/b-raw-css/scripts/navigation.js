/**
 * theme と絞り込みの切り替え。
 * theme は <html data-theme> のみを変える。意味DOM には触れない。
 */
import { filterCards, countAttentionItems } from './cards.js';

export function initNavigation(root, doc = document) {
  const feed = root.querySelector('.list');
  const listeners = [];
  const on = (el, ev, fn) => { el.addEventListener(ev, fn); listeners.push(() => el.removeEventListener(ev, fn)); };

  const themeSelect = doc.querySelector('[data-theme-select]');
  if (themeSelect) {
    on(themeSelect, 'change', () => {
      const v = themeSelect.value;
      if (v === 'auto') doc.documentElement.removeAttribute('data-theme');
      else doc.documentElement.dataset.theme = v;
    });
  }

  const filter = doc.querySelector('[data-type-filter]');
  const counter = doc.querySelector('[data-attention-count]');
  if (feed && filter) {
    on(filter, 'change', () => {
      const n = filterCards(feed, { type: filter.value });
      const live = doc.querySelector('[data-filter-status]');
      if (live) live.textContent = `${n} 件を表示しています。`;
    });
  }
  if (feed && counter) counter.textContent = String(countAttentionItems(feed));

  return function dispose() { for (const off of listeners) off(); listeners.length = 0; };
}
