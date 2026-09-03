/** CSP script-src 'self' 適合の外部ブートストラップ（inline 禁止）。 */
import { initNavigation } from './navigation.js';
import { enhanceDecisionForms } from './forms.js';
const main = document.querySelector('#main');
const d1 = initNavigation(main), d2 = enhanceDecisionForms(main);
window.addEventListener('pagehide', () => { d1(); d2(); }, { once: true });
