/**
 * 条件C: Semantic CSS の HTML レンダラ。
 *
 * ここが生成するのは「意味DOM」である。
 *   - data-card-type / data-field / data-action-semantic は契約 (contracts/dom-contract.json)
 *   - class 名は "役割" を表す。見た目 (blue-box, mt-4) を表さない
 *   - server-rendered を基準にし、JS なしでも form が submit できる
 *
 * 外観を変えたい場合、このファイルは触らない。styles/tokens.css と styles/themes/ を触る。
 */

const esc = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const fmt = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
};
const time = (iso) => `<time datetime="${esc(iso)}">${esc(fmt(iso))}</time>`;

/** カード種別の表示名。色だけで区別させないため、必ずテキストと記号を出す。 */
const KIND = {
  OWNER_QUESTION: { label: '質問 — あなたの回答が必要', glyph: '?' },
  ACTION_APPROVAL: { label: '承認 — 実行前の判断が必要', glyph: '!' },
  OUTCOME_UNKNOWN_REVIEW: { label: '結果不明 — 確認が必要', glyph: '~' },
  RESULT_REVIEW: { label: '結果 — 報告', glyph: '=' },
  INFORMATION: { label: 'お知らせ — 操作不要', glyph: '·' },
};

const STATE_LABEL = {
  LIVE: '有効', EXPIRED: '期限切れ', REVOKED: '取り消し済み',
  ANSWERED: '回答済み', DECIDED: '決定済み', STALE: '古い情報',
};

const EVIDENCE_LABEL = {
  NONE: '証拠なし', CLAIMED: '自己申告のみ',
  OBSERVED: '独立観測あり（receipt なし）', RECEIPTED: '検証 receipt あり',
};

const fact = (label, field, body, extraClass = '') =>
  `<div class="fact ${extraClass}"><dt class="fact-label">${esc(label)}</dt>` +
  `<dd class="fact-value" data-field="${esc(field)}">${body}</dd></div>`;

const list = (cls, items, render = esc) =>
  `<ul class="${cls}">${items.map((i) => `<li>${render(i)}</li>`).join('')}</ul>`;

function goalContext(card) {
  const run = card.run
    ? fact('Run', 'run', `${esc(card.run.id)}${card.run.step ? ` / ${esc(card.run.step)}` : ''}`)
    : '';
  return fact('Goal', 'goal', `${esc(card.goal.id)} — ${esc(card.goal.title)}`, 'goal-context') + run;
}

function riskFlags(risk) {
  const rows = [
    ['外部送信', risk.externalSend],
    ['公開', risk.publication],
    ['削除', risk.deletion],
    ['credential 利用', risk.credentialUse],
    ['費用', risk.cost.incurs, risk.cost.incurs ? `${risk.cost.amount} ${risk.cost.currency}` : null],
  ];
  return `<ul class="risk-flags">${rows
    .map(([label, on, extra]) =>
      `<li class="risk-flag" data-risk="${on ? 'yes' : 'no'}">` +
      `<span class="risk-mark" aria-hidden="true">${on ? '●' : '○'}</span>` +
      `<span class="risk-name">${esc(label)}</span>` +
      `<span class="risk-state">${on ? 'あり' : 'なし'}${extra ? `（${esc(extra)}）` : ''}</span></li>`)
    .join('')}</ul>`;
}

function decisionForm(card) {
  const actions = card.actions ?? [];
  if (actions.length === 0) return '';
  return (
    `<form class="decision-actions" method="post" action="/api/cards/${esc(card.id)}/decision" data-decision-form>` +
    `<input type="hidden" name="cardId" value="${esc(card.id)}">` +
    `<input type="hidden" name="cardVersion" value="${esc(card.createdAt)}">` +
    actions
      .map((a) =>
        `<button type="submit" name="decision" value="${esc(a.semantic)}"` +
        ` class="decision${a.primary ? ' decision-primary' : ''}${a.destructive ? ' decision-destructive' : ''}"` +
        ` data-action-semantic="${esc(a.semantic)}"${a.primary ? ' data-primary="true"' : ''}>` +
        `${esc(a.label)}</button>`)
      .join('') +
    `</form>`
  );
}

const bodies = {
  OWNER_QUESTION(card) {
    const opts = card.answerOptions
      .map((o, i) =>
        `<div class="answer-option"><input type="radio" id="${esc(card.id)}_${esc(o.id)}"` +
        ` name="answer" value="${esc(o.id)}"><label for="${esc(card.id)}_${esc(o.id)}">` +
        `<span class="answer-label">${esc(o.label)}</span>` +
        (o.consequence ? `<span class="answer-consequence">${esc(o.consequence)}</span>` : '') +
        `</label></div>`)
      .join('');
    return (
      `<p class="question-text" data-field="question">${esc(card.question)}</p>` +
      `<dl class="card-facts">` +
      fact('あなたにしか答えられない理由', 'ownerOnlyReason', esc(card.ownerOnlyReason), 'owner-only-reason') +
      goalContext(card) +
      fact('回答期限', 'answerDeadline', time(card.answerDeadline)) +
      fact('回答後に再開すること', 'resumesOnAnswer', esc(card.resumesOnAnswer)) +
      `</dl>` +
      `<fieldset class="answer-options" data-field="answerOptions">` +
      `<legend>回答の選択肢</legend>${opts}` +
      (card.freeFormAllowed
        ? `<div class="answer-free-form"><label for="${esc(card.id)}_free">自由記述（任意）</label>` +
          `<textarea id="${esc(card.id)}_free" name="freeForm" rows="2"></textarea></div>`
        : `<p class="answer-free-form-absent">自由記述はできません。上の選択肢から選んでください。</p>`) +
      `</fieldset>`
    );
  },

  ACTION_APPROVAL(card) {
    return (
      `<p class="action-summary" data-field="action">${esc(card.action)}</p>` +
      `<dl class="card-facts">` +
      fact('起きること', 'effect', esc(card.effect), 'effect-summary') +
      fact('影響範囲', 'resourceScope', list('scope-list', card.resourceScope), 'scope-summary') +
      goalContext(card) +
      fact('リスク', 'risk', riskFlags(card.risk), 'risk-summary') +
      fact('承認期限', 'expiresAt', time(card.expiresAt)) +
      fact('適用回数', 'oneShot', 'この承認は 1 回限りです。次回は改めて確認します。', 'one-shot-notice') +
      fact('承認しない場合', 'blockedIfRefused', esc(card.blockedIfRefused)) +
      `</dl>`
    );
  },

  OUTCOME_UNKNOWN_REVIEW(card) {
    return (
      `<dl class="card-facts">` +
      fact('実行したこと', 'dispatched', esc(card.dispatched)) +
      fact('確認できたこと', 'confirmed', esc(card.confirmed)) +
      fact('不明なこと', 'unknown', esc(card.unknown), 'unknown-summary') +
      fact('再実行した場合', 'duplicateEffectRisk',
        `<span class="duplicate-risk" data-possible="${card.duplicateEffectRisk.possible}">` +
        `${card.duplicateEffectRisk.possible ? '二重に effect が発生する可能性があります' : '二重 effect の恐れはありません'}` +
        `</span><span class="duplicate-risk-detail">${esc(card.duplicateEffectRisk.explanation)}</span>`,
        'duplicate-risk-summary') +
      fact('安全に確認する方法', 'safeVerificationSteps',
        `<ol class="verification-steps">${card.safeVerificationSteps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`,
        'verification-steps-summary') +
      goalContext(card) +
      `</dl>`
    );
  },

  RESULT_REVIEW(card) {
    const receipt = card.verificationReceipt
      ? `${esc(card.verificationReceipt.id)}（${esc(card.verificationReceipt.method)} / ${time(card.verificationReceipt.issuedAt)}）`
      : '<span class="absent">receipt はありません</span>';
    const obs = card.independentObservation
      ? esc(card.independentObservation)
      : '<span class="absent">独立した観測はありません</span>';
    return (
      `<p class="result-summary" data-field="completed">${esc(card.completed)}</p>` +
      `<dl class="card-facts">` +
      fact('証拠の水準', 'evidenceLevel',
        `<span class="evidence-level" data-evidence-level="${esc(card.evidenceLevel)}">${esc(EVIDENCE_LABEL[card.evidenceLevel])}</span>`,
        'evidence-summary') +
      fact('実行側の主張', 'actionClaim', esc(card.actionClaim), 'evidence-claim') +
      fact('独立した観測', 'independentObservation', obs, 'evidence-observation') +
      fact('検証 receipt', 'verificationReceipt', receipt, 'evidence-receipt') +
      fact('未確認のこと', 'unverified',
        card.unverified.length ? list('unverified-list', card.unverified) : '<span class="absent">なし</span>') +
      goalContext(card) +
      (card.nextCandidates.length
        ? fact('次の候補', 'nextCandidates', list('next-candidates', card.nextCandidates))
        : '') +
      `</dl>`
    );
  },

  INFORMATION(card) {
    return (
      `<p class="information-headline" data-field="headline">${esc(card.headline)}</p>` +
      `<dl class="card-facts">` +
      fact('詳細', 'detail', esc(card.detail)) +
      goalContext(card) +
      `</dl>`
    );
  },
};

export function renderCard(card) {
  const kind = KIND[card.type];
  const title = {
    OWNER_QUESTION: card.question, ACTION_APPROVAL: card.action,
    OUTCOME_UNKNOWN_REVIEW: card.unknown, RESULT_REVIEW: card.completed,
    INFORMATION: card.headline,
  }[card.type];

  return (
    `<article class="card ${cardClass(card.type)}" data-card-type="${esc(card.type)}"` +
    ` data-card-id="${esc(card.id)}" data-card-state="${esc(card.state)}"` +
    ` aria-labelledby="${esc(card.id)}_h">` +
    `<header class="card-header">` +
    `<p class="card-kind"><span class="card-kind-glyph" aria-hidden="true">${kind.glyph}</span>` +
    `<span class="card-kind-label">${esc(kind.label)}</span></p>` +
    (card.state !== 'LIVE'
      ? `<p class="card-state" data-field="state">${esc(STATE_LABEL[card.state])}</p>`
      : '') +
    `<h3 class="card-title" id="${esc(card.id)}_h">${esc(String(title).slice(0, 120))}</h3>` +
    `</header>` +
    `<div class="card-body">${bodies[card.type](card)}</div>` +
    decisionForm(card) +
    `</article>`
  );
}

const cardClass = (type) =>
  ({
    OWNER_QUESTION: 'owner-question', ACTION_APPROVAL: 'action-approval',
    OUTCOME_UNKNOWN_REVIEW: 'outcome-unknown', RESULT_REVIEW: 'result-review',
    INFORMATION: 'information',
  })[type];

export function renderInbox(cards) {
  if (cards.length === 0) {
    return `<p class="empty-state">対応が必要な項目はありません。</p>`;
  }
  return `<ul class="card-feed">${cards
    .map((c) => `<li class="card-slot">${renderCard(c)}</li>`)
    .join('')}</ul>`;
}
