/**
 * 意味 DOM の生成。条件E ではここが「AI が触らない部分」。
 * data-card-type / data-field / data-action-semantic / data-card-state は
 * contracts/dom-contract.json のとおり。class 名は役割を表す固定値で、Recipe では変わらない。
 * Recipe が変えるのは CSS 側（compiler.mjs）だけ。
 *
 * required field は「必ず出す」。ここに hide の分岐は無い。これが CP(検証を外す)で効く。
 */
const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const fmt = (iso) => { const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`; };
const time = (iso) => `<time datetime="${esc(iso)}">${esc(fmt(iso))}</time>`;

const KIND = {
  OWNER_QUESTION: { label: '質問 — あなたの回答が必要', glyph: '?' },
  ACTION_APPROVAL: { label: '承認 — 実行前の判断が必要', glyph: '!' },
  OUTCOME_UNKNOWN_REVIEW: { label: '結果不明 — 確認が必要', glyph: '~' },
  RESULT_REVIEW: { label: '結果 — 報告', glyph: '=' },
  INFORMATION: { label: 'お知らせ — 操作不要', glyph: '·' },
};
const STATE_LABEL = { LIVE: '有効', EXPIRED: '期限切れ', REVOKED: '取り消し済み', ANSWERED: '回答済み', DECIDED: '決定済み', STALE: '古い情報' };
const EVIDENCE_LABEL = { NONE: '証拠なし', CLAIMED: '自己申告のみ', OBSERVED: '独立観測あり（receipt なし）', RECEIPTED: '検証 receipt あり' };

const fact = (label, field, body, role = '') =>
  `<div class="kfact${role ? ' kfact--' + role : ''}"><dt class="kfact__label">${esc(label)}</dt>` +
  `<dd class="kfact__value" data-field="${esc(field)}">${body}</dd></div>`;
const list = (cls, items, render = esc) => `<ul class="${cls}">${items.map((i) => `<li>${render(i)}</li>`).join('')}</ul>`;
const goalCtx = (c) => fact('Goal', 'goal', `${esc(c.goal.id)} — ${esc(c.goal.title)}`, 'goal') +
  (c.run ? fact('Run', 'run', `${esc(c.run.id)}${c.run.step ? ` / ${esc(c.run.step)}` : ''}`) : '');

const riskFlags = (r) => {
  const rows = [['外部送信', r.externalSend], ['公開', r.publication], ['削除', r.deletion],
    ['credential 利用', r.credentialUse], ['費用', r.cost.incurs, r.cost.incurs ? `${r.cost.amount} ${r.cost.currency}` : null]];
  return `<ul class="krisk">${rows.map(([l, on, ex]) =>
    `<li class="krisk__item" data-risk="${on ? 'yes' : 'no'}"><span class="krisk__mark" aria-hidden="true">${on ? '●' : '○'}</span>` +
    `<span class="krisk__name">${esc(l)}</span><span class="krisk__state">${on ? 'あり' : 'なし'}${ex ? `（${esc(ex)}）` : ''}</span></li>`).join('')}</ul>`;
};

const decisionForm = (c) => {
  const a = c.actions ?? []; if (!a.length) return '';
  return `<form class="kactions" method="post" action="/api/cards/${esc(c.id)}/decision" data-decision-form>` +
    `<input type="hidden" name="cardId" value="${esc(c.id)}"><input type="hidden" name="cardVersion" value="${esc(c.createdAt)}">` +
    a.map((x) => `<button type="submit" name="decision" value="${esc(x.semantic)}"` +
      ` class="kbtn${x.primary ? ' kbtn--primary' : ''}${x.destructive ? ' kbtn--destructive' : ''}"` +
      ` data-action-semantic="${esc(x.semantic)}"${x.primary ? ' data-primary="true"' : ''}>${esc(x.label)}</button>`).join('') +
    `</form>`;
};

const bodies = {
  OWNER_QUESTION(c) {
    const opts = c.answerOptions.map((o) =>
      `<div class="kopt"><input type="radio" id="${esc(c.id)}_${esc(o.id)}" name="answer" value="${esc(o.id)}">` +
      `<label for="${esc(c.id)}_${esc(o.id)}"><span class="kopt__label">${esc(o.label)}</span>` +
      (o.consequence ? `<span class="kopt__consequence">${esc(o.consequence)}</span>` : '') + `</label></div>`).join('');
    return `<p class="klead" data-field="question">${esc(c.question)}</p><dl class="kfacts">` +
      fact('あなたにしか答えられない理由', 'ownerOnlyReason', esc(c.ownerOnlyReason), 'owner-only') + goalCtx(c) +
      fact('回答期限', 'answerDeadline', time(c.answerDeadline)) +
      fact('回答後に再開すること', 'resumesOnAnswer', esc(c.resumesOnAnswer)) + `</dl>` +
      `<fieldset class="kopts" data-field="answerOptions"><legend>回答の選択肢</legend>${opts}` +
      (c.freeFormAllowed ? `<div class="kfree"><label for="${esc(c.id)}_free">自由記述（任意）</label><textarea id="${esc(c.id)}_free" name="freeForm" rows="2"></textarea></div>`
        : `<p class="kfree__absent">自由記述はできません。上の選択肢から選んでください。</p>`) + `</fieldset>`;
  },
  ACTION_APPROVAL(c) {
    return `<p class="klead" data-field="action">${esc(c.action)}</p><dl class="kfacts">` +
      fact('起きること', 'effect', esc(c.effect), 'effect') +
      fact('影響範囲', 'resourceScope', list('kscope', c.resourceScope), 'scope') + goalCtx(c) +
      fact('リスク', 'risk', riskFlags(c.risk), 'risk') +
      fact('承認期限', 'expiresAt', time(c.expiresAt)) +
      fact('適用回数', 'oneShot', 'この承認は 1 回限りです。次回は改めて確認します。', 'one-shot') +
      fact('承認しない場合', 'blockedIfRefused', esc(c.blockedIfRefused)) + `</dl>`;
  },
  OUTCOME_UNKNOWN_REVIEW(c) {
    return `<dl class="kfacts">` +
      fact('実行したこと', 'dispatched', esc(c.dispatched)) +
      fact('確認できたこと', 'confirmed', esc(c.confirmed)) +
      fact('不明なこと', 'unknown', esc(c.unknown), 'unknown') +
      fact('再実行した場合', 'duplicateEffectRisk',
        `<span class="kdup" data-possible="${c.duplicateEffectRisk.possible}">${c.duplicateEffectRisk.possible ? '二重に effect が発生する可能性があります' : '二重 effect の恐れはありません'}</span>` +
        `<span class="kdup__detail">${esc(c.duplicateEffectRisk.explanation)}</span>`, 'dup') +
      fact('安全に確認する方法', 'safeVerificationSteps',
        `<ol class="ksteps">${c.safeVerificationSteps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`, 'steps') + goalCtx(c) + `</dl>`;
  },
  RESULT_REVIEW(c) {
    const rc = c.verificationReceipt ? `${esc(c.verificationReceipt.id)}（${esc(c.verificationReceipt.method)} / ${time(c.verificationReceipt.issuedAt)}）`
      : '<span class="kabsent">receipt はありません</span>';
    const ob = c.independentObservation ? esc(c.independentObservation) : '<span class="kabsent">独立した観測はありません</span>';
    return `<p class="klead" data-field="completed">${esc(c.completed)}</p><dl class="kfacts">` +
      fact('証拠の水準', 'evidenceLevel', `<span class="kevidence" data-evidence-level="${esc(c.evidenceLevel)}">${esc(EVIDENCE_LABEL[c.evidenceLevel])}</span>`, 'evidence') +
      fact('実行側の主張', 'actionClaim', esc(c.actionClaim), 'claim') +
      fact('独立した観測', 'independentObservation', ob, 'observation') +
      fact('検証 receipt', 'verificationReceipt', rc, 'receipt') +
      fact('未確認のこと', 'unverified', c.unverified.length ? list('kdash', c.unverified) : '<span class="kabsent">なし</span>') +
      goalCtx(c) + (c.nextCandidates.length ? fact('次の候補', 'nextCandidates', list('kdash', c.nextCandidates)) : '') + `</dl>`;
  },
  INFORMATION(c) {
    return `<p class="kinfo" data-field="headline">${esc(c.headline)}</p><dl class="kfacts">` +
      fact('詳細', 'detail', esc(c.detail)) + goalCtx(c) + `</dl>`;
  },
};

const cardRole = (t) => ({ OWNER_QUESTION: 'owner-question', ACTION_APPROVAL: 'action-approval',
  OUTCOME_UNKNOWN_REVIEW: 'outcome-unknown', RESULT_REVIEW: 'result-review', INFORMATION: 'information' }[t]);

export function renderCardDom(c) {
  const k = KIND[c.type];
  const title = { OWNER_QUESTION: c.question, ACTION_APPROVAL: c.action, OUTCOME_UNKNOWN_REVIEW: c.unknown,
    RESULT_REVIEW: c.completed, INFORMATION: c.headline }[c.type];
  return `<article class="kcard kcard--${cardRole(c.type)}" data-card-type="${esc(c.type)}"` +
    ` data-card-id="${esc(c.id)}" data-card-state="${esc(c.state)}" aria-labelledby="${esc(c.id)}_h">` +
    `<header class="kcard__header"><p class="kcard__kind"><span class="kcard__glyph" aria-hidden="true">${k.glyph}</span>` +
    `<span class="kcard__kindlabel">${esc(k.label)}</span></p>` +
    (c.state !== 'LIVE' ? `<p class="kcard__state" data-field="state">${esc(STATE_LABEL[c.state])}</p>` : '') +
    `<h3 class="kcard__title" id="${esc(c.id)}_h">${esc(String(title).slice(0, 120))}</h3></header>` +
    `<div class="kcard__body">${bodies[c.type](c)}</div>${decisionForm(c)}</article>`;
}
