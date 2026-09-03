/**
 * 条件D: Native Web Components。
 *
 * Declarative Shadow DOM (<template shadowrootmode="open">) で server-render する。
 * これにより JS 無効でも中身が描画される（= no-JS 劣化を公平に測れる）。
 * custom element は「振る舞いの追加」だけを担当する。
 *
 * 代償は測定対象:
 *   - shadow root ごとに <link rel="stylesheet"> が必要（HTML bytes / request 数）
 *   - 外側の CSS は shadow を貫通しない。theme は custom property でのみ入る
 */
const esc=(s)=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const fmt=(iso)=>{const d=new Date(iso),p=(n)=>String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;};
const time=(iso)=>`<time datetime="${esc(iso)}">${esc(fmt(iso))}</time>`;

const KIND={
  OWNER_QUESTION:{label:'質問 — あなたの回答が必要',glyph:'?'},
  ACTION_APPROVAL:{label:'承認 — 実行前の判断が必要',glyph:'!'},
  OUTCOME_UNKNOWN_REVIEW:{label:'結果不明 — 確認が必要',glyph:'~'},
  RESULT_REVIEW:{label:'結果 — 報告',glyph:'='},
  INFORMATION:{label:'お知らせ — 操作不要',glyph:'·'},
};
const STATE_LABEL={LIVE:'有効',EXPIRED:'期限切れ',REVOKED:'取り消し済み',ANSWERED:'回答済み',DECIDED:'決定済み',STALE:'古い情報'};
const EVIDENCE_LABEL={NONE:'証拠なし',CLAIMED:'自己申告のみ',OBSERVED:'独立観測あり（receipt なし）',RECEIPTED:'検証 receipt あり'};

const fact=(l,f,b,cls='')=>`<div class="fact ${cls}"><dt>${esc(l)}</dt><dd data-field="${esc(f)}">${b}</dd></div>`;
const ul=(cls,items)=>`<ul class="${cls}">${items.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`;
const goalRows=(c)=>fact('Goal','goal',`${esc(c.goal.id)} — ${esc(c.goal.title)}`)+
  (c.run?fact('Run','run',`${esc(c.run.id)}${c.run.step?` / ${esc(c.run.step)}`:''}`):'');

const riskFlags=(r)=>{
  const rows=[['外部送信',r.externalSend],['公開',r.publication],['削除',r.deletion],['credential 利用',r.credentialUse],
    ['費用',r.cost.incurs,r.cost.incurs?`${r.cost.amount} ${r.cost.currency}`:null]];
  return `<ul class="risk-flags">${rows.map(([l,on,ex])=>
    `<li data-risk="${on?'yes':'no'}"><span aria-hidden="true">${on?'●':'○'}</span><span>${esc(l)}</span><span>${on?'あり':'なし'}${ex?`（${esc(ex)}）`:''}</span></li>`).join('')}</ul>`;
};

const form=(c)=>{
  const a=c.actions??[]; if(!a.length) return '';
  return `<kas-decision-form><form method="post" action="/api/cards/${esc(c.id)}/decision" data-decision-form>`+
    `<input type="hidden" name="cardId" value="${esc(c.id)}"><input type="hidden" name="cardVersion" value="${esc(c.createdAt)}">`+
    a.map(x=>`<button type="submit" name="decision" value="${esc(x.semantic)}" part="decision" class="decision${x.primary?' primary':''}${x.destructive?' destructive':''}" data-action-semantic="${esc(x.semantic)}"${x.primary?' data-primary="true"':''}>${esc(x.label)}</button>`).join('')+
    `</form></kas-decision-form>`;
};

const bodies={
  OWNER_QUESTION(c){
    const opts=c.answerOptions.map(o=>`<div class="answer-option"><input type="radio" id="${esc(c.id)}_${esc(o.id)}" name="answer" value="${esc(o.id)}"><label for="${esc(c.id)}_${esc(o.id)}"><span>${esc(o.label)}</span>${o.consequence?`<span class="consequence">${esc(o.consequence)}</span>`:''}</label></div>`).join('');
    return `<p class="lead" data-field="question">${esc(c.question)}</p><dl class="facts">`+
      fact('あなたにしか答えられない理由','ownerOnlyReason',esc(c.ownerOnlyReason),'strong')+goalRows(c)+
      fact('回答期限','answerDeadline',time(c.answerDeadline))+
      fact('回答後に再開すること','resumesOnAnswer',esc(c.resumesOnAnswer))+`</dl>`+
      `<fieldset data-field="answerOptions"><legend>回答の選択肢</legend>${opts}`+
      (c.freeFormAllowed?`<div class="free-form"><label for="${esc(c.id)}_free">自由記述（任意）</label><textarea id="${esc(c.id)}_free" name="freeForm" rows="2"></textarea></div>`:`<p class="quiet">自由記述はできません。上の選択肢から選んでください。</p>`)+
      `</fieldset>`;
  },
  ACTION_APPROVAL(c){
    return `<p class="lead" data-field="action">${esc(c.action)}</p><dl class="facts">`+
      fact('起きること','effect',esc(c.effect),'strong')+
      fact('影響範囲','resourceScope',ul('mono',c.resourceScope))+goalRows(c)+
      fact('リスク','risk',riskFlags(c.risk))+
      fact('承認期限','expiresAt',time(c.expiresAt))+
      fact('適用回数','oneShot','この承認は 1 回限りです。次回は改めて確認します。','strong')+
      fact('承認しない場合','blockedIfRefused',esc(c.blockedIfRefused))+`</dl>`;
  },
  OUTCOME_UNKNOWN_REVIEW(c){
    return `<dl class="facts">`+
      fact('実行したこと','dispatched',esc(c.dispatched))+
      fact('確認できたこと','confirmed',esc(c.confirmed))+
      fact('不明なこと','unknown',esc(c.unknown),'strong')+
      fact('再実行した場合','duplicateEffectRisk',`<span class="dup" data-possible="${c.duplicateEffectRisk.possible}">${c.duplicateEffectRisk.possible?'二重に effect が発生する可能性があります':'二重 effect の恐れはありません'}</span><span>${esc(c.duplicateEffectRisk.explanation)}</span>`)+
      fact('安全に確認する方法','safeVerificationSteps',`<ol class="steps">${c.safeVerificationSteps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`)+
      goalRows(c)+`</dl>`;
  },
  RESULT_REVIEW(c){
    const rc=c.verificationReceipt?`${esc(c.verificationReceipt.id)}（${esc(c.verificationReceipt.method)} / ${time(c.verificationReceipt.issuedAt)}）`:'<span class="absent">receipt はありません</span>';
    const ob=c.independentObservation?esc(c.independentObservation):'<span class="absent">独立した観測はありません</span>';
    return `<p class="lead" data-field="completed">${esc(c.completed)}</p><dl class="facts">`+
      fact('証拠の水準','evidenceLevel',`<span class="evidence" data-evidence-level="${esc(c.evidenceLevel)}">${esc(EVIDENCE_LABEL[c.evidenceLevel])}</span>`)+
      fact('実行側の主張','actionClaim',esc(c.actionClaim),'quote')+
      fact('独立した観測','independentObservation',ob,'quote')+
      fact('検証 receipt','verificationReceipt',rc,'quote mono')+
      fact('未確認のこと','unverified',c.unverified.length?ul('dash',c.unverified):'<span class="absent">なし</span>')+
      goalRows(c)+(c.nextCandidates.length?fact('次の候補','nextCandidates',ul('dash',c.nextCandidates)):'')+`</dl>`;
  },
  INFORMATION(c){
    return `<p class="quiet" data-field="headline">${esc(c.headline)}</p><dl class="facts">`+fact('詳細','detail',esc(c.detail))+goalRows(c)+`</dl>`;
  },
};

export function renderCard(c,{base=''}={}){
  const k=KIND[c.type];
  const title={OWNER_QUESTION:c.question,ACTION_APPROVAL:c.action,OUTCOME_UNKNOWN_REVIEW:c.unknown,RESULT_REVIEW:c.completed,INFORMATION:c.headline}[c.type];
  // shadow root ごとに stylesheet を読み込む必要がある = D 固有のコスト
  return `<kas-card data-card-type="${esc(c.type)}" data-card-id="${esc(c.id)}" data-card-state="${esc(c.state)}" aria-labelledby="${esc(c.id)}_h" role="article">`+
    `<template shadowrootmode="open">`+
    `<link rel="stylesheet" href="${base}components/kas-card.css">`+
    `<article class="card">`+
    `<header><p class="kind"><span class="glyph" aria-hidden="true">${k.glyph}</span><span>${esc(k.label)}</span></p>`+
    (c.state!=='LIVE'?`<p class="state" data-field="state">${esc(STATE_LABEL[c.state])}</p>`:'')+
    `<h3 id="${esc(c.id)}_h"><slot name="title">${esc(String(title).slice(0,120))}</slot></h3></header>`+
    `<div class="body">${bodies[c.type](c)}</div>${form(c)}</article>`+
    `</template>`+
    `</kas-card>`;
}
export function renderInbox(cards,opts={}){
  if(!cards.length) return `<p class="empty">対応が必要な項目はありません。</p>`;
  return `<ul class="card-feed">${cards.map(c=>`<li class="card-slot">${renderCard(c,opts)}</li>`).join('')}</ul>`;
}
