/** E のブートストラップ。CSP script-src 'self' に適合するよう外部ファイルにする（inline 禁止）。 */
import { enhanceDecisionForms } from './forms.js';
const main = document.querySelector('#main');
const dispose = enhanceDecisionForms(main);
const filter = document.querySelector('[data-type-filter]');
filter?.addEventListener('change', () => {
  let n = 0;
  for (const slot of main.querySelectorAll('.kslot')) {
    const card = slot.querySelector('[data-card-type]');
    const ok = filter.value === 'ALL' || card?.dataset.cardType === filter.value;
    slot.hidden = !ok; if (ok) n++;
  }
  const s = document.querySelector('[data-filter-status]'); if (s) s.textContent = `${n} 件を表示しています。`;
});
const counter = document.querySelector('[data-attention-count]');
if (counter) counter.textContent = String(main.querySelectorAll(
  '[data-card-type="OWNER_QUESTION"][data-card-state="LIVE"],[data-card-type="ACTION_APPROVAL"][data-card-state="LIVE"],[data-card-type="OUTCOME_UNKNOWN_REVIEW"][data-card-state="LIVE"]').length);
window.addEventListener('pagehide', () => dispose(), { once: true });
