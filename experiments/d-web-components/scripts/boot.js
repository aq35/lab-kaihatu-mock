/** CSP script-src 'self' 適合の外部ブートストラップ（inline 禁止）。 */
import '../components/kas-card.js';
import '../components/kas-decision-form.js';
const doc = document, main = doc.querySelector('#main');
const themeSelect = doc.querySelector('[data-theme-select]');
themeSelect?.addEventListener('change', () => {
  const v = themeSelect.value;
  if (v === 'auto') doc.documentElement.removeAttribute('data-theme');
  else doc.documentElement.dataset.theme = v;
});
const filter = doc.querySelector('[data-type-filter]');
filter?.addEventListener('change', () => {
  let n = 0;
  for (const slot of main.querySelectorAll('.card-slot')) {
    const card = slot.querySelector('[data-card-type]');
    const ok = filter.value === 'ALL' || card?.dataset.cardType === filter.value;
    slot.hidden = !ok; if (ok) n++;
  }
  const s = doc.querySelector('[data-filter-status]'); if (s) s.textContent = `${n} 件を表示しています。`;
});
const counter = doc.querySelector('[data-attention-count]');
if (counter) counter.textContent = String(main.querySelectorAll(
  '[data-card-type="OWNER_QUESTION"][data-card-state="LIVE"],[data-card-type="ACTION_APPROVAL"][data-card-state="LIVE"],[data-card-type="OUTCOME_UNKNOWN_REVIEW"][data-card-state="LIVE"]').length);
