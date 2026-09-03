/**
 * 条件A: Tailwind CSS（比較専用）。
 * 最終成果物へは残さない。root の package.json に依存を追加していない。
 * ビルド: cd experiments/a-tailwind && npm install && npm run build
 *
 * 意味DOM（data-card-type / data-field / data-action-semantic）は条件B・Cと同一。
 * 差は「外観の指定がどこに書かれるか」だけ = ここ（markup）に書かれる。
 */
const esc = (s) => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const fmt = (iso) => { const d=new Date(iso), p=(n)=>String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`; };
const time=(iso)=>`<time datetime="${esc(iso)}" class="tabular-nums">${esc(fmt(iso))}</time>`;

const KIND={
  OWNER_QUESTION:{label:'質問 — あなたの回答が必要',glyph:'?'},
  ACTION_APPROVAL:{label:'承認 — 実行前の判断が必要',glyph:'!'},
  OUTCOME_UNKNOWN_REVIEW:{label:'結果不明 — 確認が必要',glyph:'~'},
  RESULT_REVIEW:{label:'結果 — 報告',glyph:'='},
  INFORMATION:{label:'お知らせ — 操作不要',glyph:'·'},
};
const STATE_LABEL={LIVE:'有効',EXPIRED:'期限切れ',REVOKED:'取り消し済み',ANSWERED:'回答済み',DECIDED:'決定済み',STALE:'古い情報'};
const EVIDENCE_LABEL={NONE:'証拠なし',CLAIMED:'自己申告のみ',OBSERVED:'独立観測あり（receipt なし）',RECEIPTED:'検証 receipt あり'};

// 種別ごとの見た目は utility 文字列として markup 側に持つ
const ACCENT={
  OWNER_QUESTION:'border-l-blue-600 text-blue-700 dark:border-l-blue-400 dark:text-blue-300',
  ACTION_APPROVAL:'border-l-red-600 text-red-700 dark:border-l-red-400 dark:text-red-300',
  OUTCOME_UNKNOWN_REVIEW:'border-l-violet-600 text-violet-700 dark:border-l-violet-400 dark:text-violet-300',
  RESULT_REVIEW:'border-l-emerald-600 text-emerald-700 dark:border-l-emerald-400 dark:text-emerald-300',
  INFORMATION:'border-l-slate-400 text-slate-500 dark:border-l-slate-500 dark:text-slate-400',
};
const LABEL_CLS='text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400';
const VALUE_CLS='text-sm text-slate-700 dark:text-slate-300 max-w-[68ch] [overflow-wrap:anywhere]';
const ROW_CLS='grid gap-0.5 sm:grid-cols-[minmax(9rem,auto)_minmax(0,1fr)] sm:items-start sm:gap-x-4';

// ---- ACTION_APPROVAL（承認）専用の高密度版 -----------------------------------
// Owner が急いで判断する場面用。余白を詰め、ラベル列と値列の間に縦罫、行間に横罫を
// 入れて effect / 影響範囲 / リスク を上から拾えるようにする。
// 表示する情報は他カード型と完全に同じ（折り畳み・非表示は一切しない）。
const DENSE_ROW_CLS='grid gap-x-3 gap-y-0.5 py-1.5 sm:grid-cols-[minmax(7rem,auto)_minmax(0,1fr)]';
const DENSE_LABEL_CLS='text-xs font-bold tracking-wide text-slate-500 border-slate-300 dark:text-slate-400 dark:border-slate-600 sm:border-e sm:pe-3 sm:text-end';
const DENSE_VALUE_CLS='text-sm leading-snug text-slate-700 dark:text-slate-300 max-w-[68ch] [overflow-wrap:anywhere]';
const DENSE_DL_CLS='grid divide-y divide-slate-200 rounded-md border border-slate-200 bg-slate-50 px-3 dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900/40';

const row=(label,field,body,valueExtra='',dense=false)=>
  `<div class="${dense?DENSE_ROW_CLS:ROW_CLS}">`+
  `<dt class="${dense?DENSE_LABEL_CLS:LABEL_CLS}">${esc(label)}</dt>`+
  `<dd class="${dense?DENSE_VALUE_CLS:VALUE_CLS} ${valueExtra}" data-field="${esc(field)}">${body}</dd></div>`;
const ul=(cls,items)=>`<ul class="${cls}">${items.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`;
const goalRows=(c,dense=false)=>row('Goal','goal',`${esc(c.goal.id)} — ${esc(c.goal.title)}`,'',dense)+
  (c.run?row('Run','run',`${esc(c.run.id)}${c.run.step?` / ${esc(c.run.step)}`:''}`,'',dense):'');

const riskFlags=(r)=>{
  const rows=[['外部送信',r.externalSend],['公開',r.publication],['削除',r.deletion],['credential 利用',r.credentialUse],
    ['費用',r.cost.incurs,r.cost.incurs?`${r.cost.amount} ${r.cost.currency}`:null]];
  // 承認カードでしか使わないヘルパ。密度優先で 2 列に畳み、行間を詰める（項目は減らさない）
  return `<ul class="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">${rows.map(([l,on,ex])=>
    `<li class="grid grid-cols-[1.25em_minmax(5.5rem,auto)_minmax(0,1fr)] items-baseline gap-x-2 text-sm leading-snug ${on?'font-semibold text-red-700 dark:text-red-300':'text-slate-500 dark:text-slate-400'}" data-risk="${on?'yes':'no'}">`+
    `<span class="font-mono" aria-hidden="true">${on?'●':'○'}</span><span>${esc(l)}</span>`+
    `<span>${on?'あり':'なし'}${ex?`（${esc(ex)}）`:''}</span></li>`).join('')}</ul>`;
};

const BTN='inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-4 cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
const BTN_SECONDARY=`${BTN} border-slate-400 bg-slate-100 text-slate-900 hover:bg-slate-200 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600`;
const BTN_PRIMARY=`${BTN} border-blue-700 bg-blue-700 font-semibold text-white hover:bg-blue-800`;
const BTN_DESTRUCTIVE=`${BTN} border-red-700 bg-red-700 font-semibold text-white hover:bg-red-800`;

const form=(c)=>{
  const a=c.actions??[]; if(!a.length) return '';
  const dense=c.type==='ACTION_APPROVAL';   // 承認カードだけ上余白を詰める
  return `<form class="flex flex-wrap gap-2 border-t border-slate-200 ${dense?'pt-2':'pt-4'} dark:border-slate-700" method="post" action="/api/cards/${esc(c.id)}/decision" data-decision-form>`+
    `<input type="hidden" name="cardId" value="${esc(c.id)}"><input type="hidden" name="cardVersion" value="${esc(c.createdAt)}">`+
    a.map(x=>{const cls=x.destructive&&x.primary?BTN_DESTRUCTIVE:x.primary?BTN_PRIMARY:BTN_SECONDARY;
      return `<button type="submit" name="decision" value="${esc(x.semantic)}" class="${cls}" data-action-semantic="${esc(x.semantic)}"${x.primary?' data-primary="true"':''}>${esc(x.label)}</button>`;}).join('')+
    `</form>`;
};

const bodies={
  OWNER_QUESTION(c){
    const opts=c.answerOptions.map(o=>
      `<div class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">`+
      `<input type="radio" id="${esc(c.id)}_${esc(o.id)}" name="answer" value="${esc(o.id)}" class="mt-1 size-6">`+
      `<label for="${esc(c.id)}_${esc(o.id)}" class="grid cursor-pointer gap-0.5 py-0.5">`+
      `<span class="text-slate-900 dark:text-slate-100">${esc(o.label)}</span>`+
      (o.consequence?`<span class="text-xs text-slate-500 dark:text-slate-400">${esc(o.consequence)}</span>`:'')+
      `</label></div>`).join('');
    return `<p class="max-w-[68ch] text-lg text-slate-900 [overflow-wrap:anywhere] dark:text-slate-100" data-field="question">${esc(c.question)}</p>`+
      `<dl class="grid gap-4">`+
      row('あなたにしか答えられない理由','ownerOnlyReason',esc(c.ownerOnlyReason),'text-slate-900 dark:text-slate-100')+
      goalRows(c)+row('回答期限','answerDeadline',time(c.answerDeadline))+
      row('回答後に再開すること','resumesOnAnswer',esc(c.resumesOnAnswer))+`</dl>`+
      `<fieldset class="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800" data-field="answerOptions">`+
      `<legend class="px-1 ${LABEL_CLS}">回答の選択肢</legend>${opts}`+
      (c.freeFormAllowed?`<div class="mt-2 grid gap-1"><label for="${esc(c.id)}_free" class="${LABEL_CLS}">自由記述（任意）</label>`+
        `<textarea id="${esc(c.id)}_free" name="freeForm" rows="2" class="w-full resize-y rounded-md border border-slate-400 bg-white p-2 dark:border-slate-500 dark:bg-slate-900"></textarea></div>`
        :`<p class="text-xs text-slate-500 dark:text-slate-400">自由記述はできません。上の選択肢から選んでください。</p>`)+
      `</fieldset>`;
  },
  ACTION_APPROVAL(c){
    // 高密度版。行・フィールドの並びと文言は変更していない（dense フラグを渡すだけ）。
    return `<p class="max-w-[68ch] text-base font-semibold text-slate-900 [overflow-wrap:anywhere] dark:text-slate-100" data-field="action">${esc(c.action)}</p>`+
      `<dl class="${DENSE_DL_CLS}">`+
      row('起きること','effect',esc(c.effect),'font-semibold text-slate-900 dark:text-slate-100',true)+
      row('影響範囲','resourceScope',ul('grid font-mono text-xs leading-snug [&>li]:before:text-slate-400 [&>li]:before:content-["·_"]',c.resourceScope),'',true)+
      goalRows(c,true)+row('リスク','risk',riskFlags(c.risk),'',true)+
      row('承認期限','expiresAt',time(c.expiresAt),'',true)+
      row('適用回数','oneShot','この承認は 1 回限りです。次回は改めて確認します。','font-semibold text-slate-900 dark:text-slate-100',true)+
      row('承認しない場合','blockedIfRefused',esc(c.blockedIfRefused),'',true)+`</dl>`;
  },
  OUTCOME_UNKNOWN_REVIEW(c){
    return `<dl class="grid gap-4">`+
      row('実行したこと','dispatched',esc(c.dispatched))+
      row('確認できたこと','confirmed',esc(c.confirmed))+
      row('不明なこと','unknown',esc(c.unknown),'font-semibold text-slate-900 dark:text-slate-100')+
      row('再実行した場合','duplicateEffectRisk',
        `<span class="${c.duplicateEffectRisk.possible?'font-semibold text-red-700 dark:text-red-300':'text-slate-500'}" data-possible="${c.duplicateEffectRisk.possible}">`+
        `${c.duplicateEffectRisk.possible?'二重に effect が発生する可能性があります':'二重 effect の恐れはありません'}</span> `+
        `<span>${esc(c.duplicateEffectRisk.explanation)}</span>`,'grid gap-0.5')+
      row('安全に確認する方法','safeVerificationSteps',
        `<ol class="grid list-decimal gap-1 rounded-md bg-slate-100 p-3 ps-8 dark:bg-slate-800">${c.safeVerificationSteps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`)+
      goalRows(c)+`</dl>`;
  },
  RESULT_REVIEW(c){
    const EV={RECEIPTED:'text-emerald-700 dark:text-emerald-300',OBSERVED:'text-amber-700 dark:text-amber-300',CLAIMED:'text-red-700 dark:text-red-300',NONE:'text-red-700 dark:text-red-300'};
    const rc=c.verificationReceipt?`${esc(c.verificationReceipt.id)}（${esc(c.verificationReceipt.method)} / ${time(c.verificationReceipt.issuedAt)}）`:'<span class="italic text-slate-500">receipt はありません</span>';
    const ob=c.independentObservation?esc(c.independentObservation):'<span class="italic text-slate-500">独立した観測はありません</span>';
    return `<p class="max-w-[68ch] text-lg text-slate-900 [overflow-wrap:anywhere] dark:text-slate-100" data-field="completed">${esc(c.completed)}</p>`+
      `<dl class="grid gap-4">`+
      row('証拠の水準','evidenceLevel',
        `<span class="inline-flex items-center gap-1 font-semibold ${EV[c.evidenceLevel]}" data-evidence-level="${esc(c.evidenceLevel)}">`+
        `<span class="font-mono" aria-hidden="true">${c.evidenceLevel==='RECEIPTED'?'◆':'◇'}</span>${esc(EVIDENCE_LABEL[c.evidenceLevel])}</span>`)+
      row('実行側の主張','actionClaim',esc(c.actionClaim),'border-s-2 border-slate-200 ps-3 dark:border-slate-700')+
      row('独立した観測','independentObservation',ob,'border-s-2 border-slate-200 ps-3 dark:border-slate-700')+
      row('検証 receipt','verificationReceipt',rc,'border-s-2 border-slate-200 ps-3 font-mono text-xs dark:border-slate-700')+
      row('未確認のこと','unverified',c.unverified.length?ul('grid gap-0.5 [&>li]:before:text-slate-400 [&>li]:before:content-["—_"]',c.unverified):'<span class="italic text-slate-500">なし</span>')+
      goalRows(c)+(c.nextCandidates.length?row('次の候補','nextCandidates',ul('grid gap-0.5 [&>li]:before:text-slate-400 [&>li]:before:content-["—_"]',c.nextCandidates)):'')+`</dl>`;
  },
  INFORMATION(c){
    return `<p class="text-sm text-slate-600 [overflow-wrap:anywhere] dark:text-slate-400" data-field="headline">${esc(c.headline)}</p>`+
      `<dl class="grid gap-4">`+row('詳細','detail',esc(c.detail))+goalRows(c)+`</dl>`;
  },
};

export function renderCard(c){
  const k=KIND[c.type];
  const title={OWNER_QUESTION:c.question,ACTION_APPROVAL:c.action,OUTCOME_UNKNOWN_REVIEW:c.unknown,RESULT_REVIEW:c.completed,INFORMATION:c.headline}[c.type];
  const info=c.type==='INFORMATION';
  const dense=c.type==='ACTION_APPROVAL';   // 承認カードだけ密度を上げる（他型は据え置き）
  const stale=c.state!=='LIVE'&&c.state!=='DECIDED'&&c.state!=='ANSWERED';
  const cardCls=[
    `grid ${dense?'gap-2':'gap-4'} rounded-xl border border-s-4 border-slate-200 dark:border-slate-700`,
    info?'bg-transparent p-4 shadow-none':`bg-white ${dense?'p-4':'p-6'} shadow-sm dark:bg-slate-800`,
    ACCENT[c.type].split(' ').filter(x=>x.startsWith('border-l-')).join(' '),
    stale?'border-dashed shadow-none':'',
  ].join(' ');
  const kindCls='flex items-center gap-2 text-xs font-semibold tracking-wide '+ACCENT[c.type].split(' ').filter(x=>x.startsWith('text-')||x.startsWith('dark:text-')).join(' ');
  return `<article class="${cardCls}" data-card-type="${esc(c.type)}" data-card-id="${esc(c.id)}" data-card-state="${esc(c.state)}" aria-labelledby="${esc(c.id)}_h">`+
    `<header class="grid ${dense?'gap-0.5':'gap-1'}"><p class="${kindCls}">`+
    `<span class="grid size-[1.35em] place-items-center rounded-sm border border-current font-mono" aria-hidden="true">${k.glyph}</span>`+
    `<span>${esc(k.label)}</span></p>`+
    (c.state!=='LIVE'?`<p class="justify-self-start rounded-sm border border-current px-2 py-0.5 text-xs font-bold text-red-700 dark:text-red-300" data-field="state">${esc(STATE_LABEL[c.state])}</p>`:'')+
    `<h3 class="${info?'text-sm font-semibold text-slate-600 dark:text-slate-400':'text-base text-slate-900 dark:text-slate-100'} [overflow-wrap:anywhere]" id="${esc(c.id)}_h">${esc(String(title).slice(0,120))}</h3>`+
    `</header><div class="grid ${dense?'gap-2':'gap-4'}">${bodies[c.type](c)}</div>${form(c)}</article>`;
}
export function renderInbox(cards){
  if(!cards.length) return `<p class="p-12 text-center text-slate-500">対応が必要な項目はありません。</p>`;
  return `<ul class="grid gap-6">${cards.map(c=>`<li>${renderCard(c)}</li>`).join('')}</ul>`;
}
