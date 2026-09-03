/**
 * 条件B: 無規律な素の CSS（対照群）。
 * 「Tailwind を外しただけ」で、token も layer も命名規約も無い状態を再現する。
 * 意味DOM（data-card-type / data-field / data-action-semantic）は条件Cと同一に保つ。
 * 変えているのは class 名の付け方と CSS の構成だけ。
 */
const esc = (s) => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const fmt = (iso) => { const d=new Date(iso), p=(n)=>String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`; };
const time = (iso) => `<time datetime="${esc(iso)}">${esc(fmt(iso))}</time>`;

const KIND = {
  OWNER_QUESTION:{label:'質問 — あなたの回答が必要',glyph:'?'},
  ACTION_APPROVAL:{label:'承認 — 実行前の判断が必要',glyph:'!'},
  OUTCOME_UNKNOWN_REVIEW:{label:'結果不明 — 確認が必要',glyph:'~'},
  RESULT_REVIEW:{label:'結果 — 報告',glyph:'='},
  INFORMATION:{label:'お知らせ — 操作不要',glyph:'·'},
};
const STATE_LABEL={LIVE:'有効',EXPIRED:'期限切れ',REVOKED:'取り消し済み',ANSWERED:'回答済み',DECIDED:'決定済み',STALE:'古い情報'};
const EVIDENCE_LABEL={NONE:'証拠なし',CLAIMED:'自己申告のみ',OBSERVED:'独立観測あり（receipt なし）',RECEIPTED:'検証 receipt あり'};

// class 名は見た目ベース。B の特徴（blue-box, gray-small, big-text ...）
const row=(label,field,body,cls='')=>`<div class="gray-row ${cls}"><dt class="small-gray-label">${esc(label)}</dt><dd class="row-text" data-field="${esc(field)}">${body}</dd></div>`;
const ul=(cls,items)=>`<ul class="${cls}">${items.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`;
const goalRows=(c)=>row('Goal','goal',`${esc(c.goal.id)} — ${esc(c.goal.title)}`)+(c.run?row('Run','run',`${esc(c.run.id)}${c.run.step?` / ${esc(c.run.step)}`:''}`):'');

const riskFlags=(r)=>{
  const rows=[['外部送信',r.externalSend],['公開',r.publication],['削除',r.deletion],['credential 利用',r.credentialUse],
    ['費用',r.cost.incurs,r.cost.incurs?`${r.cost.amount} ${r.cost.currency}`:null]];
  return `<ul class="red-list">${rows.map(([l,on,ex])=>`<li class="${on?'red-item':'gray-item'}" data-risk="${on?'yes':'no'}"><span aria-hidden="true">${on?'●':'○'}</span> <span>${esc(l)}</span> <span>${on?'あり':'なし'}${ex?`（${esc(ex)}）`:''}</span></li>`).join('')}</ul>`;
};

const form=(c)=>{
  const a=c.actions??[]; if(!a.length) return '';
  return `<form class="bottom-buttons" method="post" action="/api/cards/${esc(c.id)}/decision" data-decision-form>`+
    `<input type="hidden" name="cardId" value="${esc(c.id)}"><input type="hidden" name="cardVersion" value="${esc(c.createdAt)}">`+
    a.map(x=>`<button type="submit" name="decision" value="${esc(x.semantic)}" class="${x.primary?'blue-button':'gray-button'}${x.destructive?' red-button':''}" data-action-semantic="${esc(x.semantic)}"${x.primary?' data-primary="true"':''}>${esc(x.label)}</button>`).join('')+
    `</form>`;
};

const bodies={
  OWNER_QUESTION(c){
    const opts=c.answerOptions.map(o=>`<div class="radio-line"><input type="radio" id="${esc(c.id)}_${esc(o.id)}" name="answer" value="${esc(o.id)}"><label for="${esc(c.id)}_${esc(o.id)}"><span class="black-text">${esc(o.label)}</span>${o.consequence?`<span class="tiny-gray">${esc(o.consequence)}</span>`:''}</label></div>`).join('');
    return `<p class="big-text" data-field="question">${esc(c.question)}</p><dl class="gray-rows">`+
      row('あなたにしか答えられない理由','ownerOnlyReason',esc(c.ownerOnlyReason))+goalRows(c)+
      row('回答期限','answerDeadline',time(c.answerDeadline))+
      row('回答後に再開すること','resumesOnAnswer',esc(c.resumesOnAnswer))+`</dl>`+
      `<fieldset class="gray-box" data-field="answerOptions"><legend class="small-gray-label">回答の選択肢</legend>${opts}`+
      (c.freeFormAllowed?`<div class="textarea-wrap"><label for="${esc(c.id)}_free">自由記述（任意）</label><textarea id="${esc(c.id)}_free" name="freeForm" rows="2"></textarea></div>`:`<p class="tiny-gray">自由記述はできません。上の選択肢から選んでください。</p>`)+
      `</fieldset>`;
  },
  ACTION_APPROVAL(c){
    return `<p class="big-text" data-field="action">${esc(c.action)}</p><dl class="gray-rows">`+
      row('起きること','effect',esc(c.effect),'important-row')+
      row('影響範囲','resourceScope',ul('mono-list',c.resourceScope))+goalRows(c)+
      row('リスク','risk',riskFlags(c.risk))+
      row('承認期限','expiresAt',time(c.expiresAt))+
      row('適用回数','oneShot','この承認は 1 回限りです。次回は改めて確認します。','bold-row')+
      row('承認しない場合','blockedIfRefused',esc(c.blockedIfRefused))+`</dl>`;
  },
  OUTCOME_UNKNOWN_REVIEW(c){
    return `<dl class="gray-rows">`+
      row('実行したこと','dispatched',esc(c.dispatched))+
      row('確認できたこと','confirmed',esc(c.confirmed))+
      row('不明なこと','unknown',esc(c.unknown),'bold-row')+
      row('再実行した場合','duplicateEffectRisk',`<span class="${c.duplicateEffectRisk.possible?'red-text-bold':'gray-text'}" data-possible="${c.duplicateEffectRisk.possible}">${c.duplicateEffectRisk.possible?'二重に effect が発生する可能性があります':'二重 effect の恐れはありません'}</span> <span>${esc(c.duplicateEffectRisk.explanation)}</span>`)+
      row('安全に確認する方法','safeVerificationSteps',`<ol class="steps-box">${c.safeVerificationSteps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`)+
      goalRows(c)+`</dl>`;
  },
  RESULT_REVIEW(c){
    const rc=c.verificationReceipt?`${esc(c.verificationReceipt.id)}（${esc(c.verificationReceipt.method)} / ${time(c.verificationReceipt.issuedAt)}）`:'<span class="italic-gray">receipt はありません</span>';
    const ob=c.independentObservation?esc(c.independentObservation):'<span class="italic-gray">独立した観測はありません</span>';
    return `<p class="big-text" data-field="completed">${esc(c.completed)}</p><dl class="gray-rows">`+
      row('証拠の水準','evidenceLevel',`<span class="badge-${c.evidenceLevel.toLowerCase()}" data-evidence-level="${esc(c.evidenceLevel)}">${esc(EVIDENCE_LABEL[c.evidenceLevel])}</span>`)+
      row('実行側の主張','actionClaim',esc(c.actionClaim))+
      row('独立した観測','independentObservation',ob)+
      row('検証 receipt','verificationReceipt',rc)+
      row('未確認のこと','unverified',c.unverified.length?ul('dash-list',c.unverified):'<span class="italic-gray">なし</span>')+
      goalRows(c)+(c.nextCandidates.length?row('次の候補','nextCandidates',ul('dash-list',c.nextCandidates)):'')+`</dl>`;
  },
  INFORMATION(c){
    return `<p class="gray-text" data-field="headline">${esc(c.headline)}</p><dl class="gray-rows">`+
      row('詳細','detail',esc(c.detail))+goalRows(c)+`</dl>`;
  },
};

const boxClass={OWNER_QUESTION:'blue-box',ACTION_APPROVAL:'red-box',OUTCOME_UNKNOWN_REVIEW:'purple-box',RESULT_REVIEW:'green-box',INFORMATION:'plain-box'};

export function renderCard(c){
  const k=KIND[c.type];
  const title={OWNER_QUESTION:c.question,ACTION_APPROVAL:c.action,OUTCOME_UNKNOWN_REVIEW:c.unknown,RESULT_REVIEW:c.completed,INFORMATION:c.headline}[c.type];
  return `<article class="box ${boxClass[c.type]}" data-card-type="${esc(c.type)}" data-card-id="${esc(c.id)}" data-card-state="${esc(c.state)}" aria-labelledby="${esc(c.id)}_h">`+
    `<header class="box-top"><p class="kind-line"><span class="kind-square" aria-hidden="true">${k.glyph}</span><span>${esc(k.label)}</span></p>`+
    (c.state!=='LIVE'?`<p class="state-chip" data-field="state">${esc(STATE_LABEL[c.state])}</p>`:'')+
    `<h3 class="box-title" id="${esc(c.id)}_h">${esc(String(title).slice(0,120))}</h3></header>`+
    `<div class="box-inner">${bodies[c.type](c)}</div>${form(c)}</article>`;
}
export function renderInbox(cards){
  if(!cards.length) return `<p class="gray-center">対応が必要な項目はありません。</p>`;
  return `<ul class="list">${cards.map(c=>`<li class="list-item">${renderCard(c)}</li>`).join('')}</ul>`;
}
