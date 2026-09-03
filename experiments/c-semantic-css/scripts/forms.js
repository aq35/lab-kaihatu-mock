/**
 * 決定フォームの progressive enhancement。
 *
 * 前提: JS が 1 行も動かなくても、form は method="post" で submit できる。
 * ここでやるのは「二重送信の防止」と「結果不明の正直な表示」だけ。
 * 承認済み・送信済みを勝手に表示しない。表示できるのは server が返した事実だけ。
 */
import { submitDecision, NetworkFailure, ServerRefusal, OutcomeUnknown } from './api.js';

/** 送信中の form。DOM の存在ではなく、この Map が正本。 */
const inFlight = new WeakMap();

const STATUS_TEXT = {
  sending: '送信中です。まだ確定していません。',
  refused: 'サーバが受け付けませんでした。実行されていません。',
  network: '通信に失敗しました。実行されたかどうかは不明です。',
  unknown: '結果が確認できませんでした。実行された可能性があります。再送する前に確認してください。',
};

function statusRegion(form) {
  let el = form.querySelector('[data-decision-status]');
  if (!el) {
    el = document.createElement('p');
    el.className = 'decision-status';
    el.setAttribute('data-decision-status', '');
    // 過剰読み上げを避けるため polite。assertive にしない。
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    form.append(el);
  }
  return el;
}

function setBusy(form, busy) {
  for (const b of form.querySelectorAll('button[type="submit"]')) {
    b.disabled = busy;
    // disabled を「承認済み」と読ませないため、状態は必ず文言でも出す
    b.setAttribute('aria-busy', String(busy));
  }
}

export function enhanceDecisionForms(root, { onResult } = {}) {
  const controllers = new Set();

  const onSubmit = async (event) => {
    const form = event.target.closest('form[data-decision-form]');
    if (!form) return;
    if (inFlight.has(form)) { event.preventDefault(); return; } // 二重送信を止める
    event.preventDefault();

    const submitter = event.submitter;
    const body = new FormData(form, submitter);
    const controller = new AbortController();
    controllers.add(controller);
    inFlight.set(form, controller);
    setBusy(form, true);
    const status = statusRegion(form);
    status.textContent = STATUS_TEXT.sending;
    status.dataset.kind = 'sending';

    try {
      const result = await submitDecision({ url: form.action, body, signal: controller.signal });
      // server の応答だけを描画根拠にする
      status.textContent = result.ownerVisibleMessage ?? '';
      status.dataset.kind = 'settled';
      onResult?.(result, form);
    } catch (err) {
      if (err?.name === 'AbortError') return; // 画面を離れた。何も主張しない。
      const kind =
        err instanceof ServerRefusal ? 'refused'
        : err instanceof OutcomeUnknown ? 'unknown'
        : err instanceof NetworkFailure ? 'network'
        : 'unknown';
      status.textContent = STATUS_TEXT[kind];
      status.dataset.kind = kind;
      // 結果不明のときは再送を安全側に倒す: ボタンを戻さない
      if (kind !== 'unknown') setBusy(form, false);
    } finally {
      controllers.delete(controller);
      inFlight.delete(form);
      if (statusRegion(form).dataset.kind !== 'unknown') setBusy(form, false);
    }
  };

  root.addEventListener('submit', onSubmit);

  // listener と in-flight request を必ず片付けられるようにする
  return function dispose() {
    root.removeEventListener('submit', onSubmit);
    for (const c of controllers) c.abort(new DOMException('disposed', 'AbortError'));
    controllers.clear();
  };
}
