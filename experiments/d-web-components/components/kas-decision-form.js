/**
 * <kas-decision-form> — 決定フォームの progressive enhancement。
 * light DOM の <form> をそのまま使う（shadow に閉じ込めると form 送信が親へ届かない）。
 * JS が動かなくても method="post" で submit できる。
 */
import { submitDecision, ServerRefusal, OutcomeUnknown } from '../scripts/api.js';

const STATUS_TEXT = {
  sending: '送信中です。まだ確定していません。',
  refused: 'サーバが受け付けませんでした。実行されていません。',
  unknown: '結果が確認できませんでした。実行された可能性があります。再送する前に確認してください。',
};

class KasDecisionForm extends HTMLElement {
  #controller = null;
  #busy = false;

  connectedCallback() {
    this.addEventListener('submit', this.#onSubmit);
  }
  disconnectedCallback() {
    this.removeEventListener('submit', this.#onSubmit);
    this.#controller?.abort(new DOMException('disconnected', 'AbortError'));
  }

  #status() {
    const form = this.querySelector('form');
    let el = form.querySelector('[data-decision-status]');
    if (!el) {
      el = document.createElement('p');
      el.className = 'decision-status';
      el.setAttribute('data-decision-status', '');
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      form.append(el);
    }
    return el;
  }

  #setBusy(on) {
    this.#busy = on;
    for (const b of this.querySelectorAll('button[type="submit"]')) {
      b.disabled = on;
      b.setAttribute('aria-busy', String(on));
    }
  }

  #onSubmit = async (event) => {
    if (this.#busy) { event.preventDefault(); return; }
    event.preventDefault();
    const form = event.target;
    const body = new FormData(form, event.submitter);
    this.#controller = new AbortController();
    this.#setBusy(true);
    const status = this.#status();
    status.textContent = STATUS_TEXT.sending;
    status.dataset.kind = 'sending';
    try {
      const result = await submitDecision({ url: form.action, body, signal: this.#controller.signal });
      status.textContent = result.ownerVisibleMessage ?? '';
      status.dataset.kind = 'settled';
      this.#setBusy(false);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      const kind = err instanceof ServerRefusal ? 'refused' : err instanceof OutcomeUnknown ? 'unknown' : 'unknown';
      status.textContent = STATUS_TEXT[kind];
      status.dataset.kind = kind;
      if (kind !== 'unknown') this.#setBusy(false);
    } finally {
      this.#controller = null;
    }
  };
}
customElements.define('kas-decision-form', KasDecisionForm);
export { KasDecisionForm };
