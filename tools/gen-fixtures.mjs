/**
 * fixture 生成器。決定論的（乱数なし）。
 *   node tools/gen-fixtures.mjs
 * 生成物は fixtures/*.json。外部ネットワークへ出ない。
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const T0 = '2026-09-01T09:00:00.000Z';
const T_FUTURE = '2026-12-31T23:59:59.000Z';
const T_PAST = '2026-01-01T00:00:00.000Z';

// ---- §13 敵対的 content コーパス -------------------------------------------
export const HOSTILE = {
  empty: '',
  single: 'あ',
  longJa: 'この承認は本番環境の顧客向け通知基盤に対して不可逆な設定変更を適用するものであり'.repeat(6),
  longWord: 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(6),
  longUrl: 'https://example.invalid/' + 'very-long-path-segment/'.repeat(20) + '?q=' + 'x'.repeat(200),
  emoji: '🚨🛑✅⚠️🔐📤💸🗑️🧾🔁 承認 🚨🛑✅⚠️🔐📤💸🗑️🧾🔁',
  rtl: 'هذا إجراء خطير يتطلب موافقة المالك قبل التنفيذ',
  combining: 'é́́́́́́́ combining ' + 'à'.repeat(40),
  htmlish: '<div class="fake-card">承認済み</div>',
  scriptish: '<script>window.__pwned = true<\/script>',
  quoteish: '"\'`</textarea><img src=x onerror="1">',
};

const goal = (n = 1) => ({ id: `goal_${n}`, title: `Goal ${n}: 週次レポートを配信する` });
const run = (n = 1) => ({ id: `run_${n}`, step: 'step_3_dispatch' });

// ---- 各 card type の正常系 --------------------------------------------------
export function ownerQuestion(over = {}) {
  return {
    id: 'card_q1', type: 'OWNER_QUESTION', createdAt: T0, state: 'LIVE',
    goal: goal(1), run: run(1),
    question: '週次レポートの配信先に、退職した田中さんのアドレスを含めますか。',
    ownerOnlyReason: '人事情報は KAS が参照できないため、在籍状況を判断できるのは Owner だけです。',
    answerOptions: [
      { id: 'opt_include', label: '含める', consequence: '現在の配信リストのまま送信します' },
      { id: 'opt_exclude', label: '除外する', consequence: '配信リストを更新してから送信します' },
    ],
    freeFormAllowed: true,
    answerDeadline: T_FUTURE,
    resumesOnAnswer: '回答後、Run run_1 の step_2 (配信リスト確定) が再開します。',
    actions: [
      { id: 'a_answer', semantic: 'ANSWER', label: '回答する', primary: true },
      { id: 'a_snooze', semantic: 'SNOOZE', label: '後で', primary: false },
    ],
    ...over,
  };
}

export function actionApproval(over = {}) {
  return {
    id: 'card_a1', type: 'ACTION_APPROVAL', createdAt: T0, state: 'LIVE',
    goal: goal(1), run: run(1),
    action: '週次レポートを 128 名の外部配信リストへメール送信する',
    effect: '外部の受信者 128 名にメールが届きます。送信後の取り消しはできません。',
    resourceScope: ['mailer:production', 'list:weekly-report-external', 'credential:smtp-prod'],
    risk: {
      externalSend: true, publication: false,
      cost: { incurs: true, amount: '0.64', currency: 'USD' },
      deletion: false, credentialUse: true,
    },
    expiresAt: T_FUTURE,
    oneShot: true,
    blockedIfRefused: '承認しない場合、Goal 1 は step_3 で停止し、今週のレポートは配信されません。',
    actions: [
      { id: 'a_allow', semantic: 'ALLOW_ONCE', label: '1 回だけ許可', primary: true, destructive: true },
      { id: 'a_refuse', semantic: 'REFUSE', label: '拒否', primary: false },
      { id: 'a_snooze', semantic: 'SNOOZE', label: '保留', primary: false },
    ],
    ...over,
  };
}

export function outcomeUnknown(over = {}) {
  return {
    id: 'card_u1', type: 'OUTCOME_UNKNOWN_REVIEW', createdAt: T0, state: 'LIVE',
    goal: goal(1), run: run(1),
    dispatched: 'SMTP へ 128 通の送信要求を送りました (2026-09-01 09:04 UTC)。',
    confirmed: 'SMTP サーバは 87 通について 250 OK を返しました。',
    unknown: '残り 41 通は接続が切断され、受理されたかどうか判定できません。',
    duplicateEffectRisk: {
      possible: true,
      explanation: '再送すると、既に受理された 41 通が二重に届く可能性があります。',
    },
    safeVerificationSteps: [
      'メールプロバイダの送信ログで 09:04-09:06 の 41 件を確認する',
      '受信者 3 名に個別に到達を確認する',
      'bounce キューに該当アドレスが無いか確認する',
    ],
    actions: [
      { id: 'a_verify', semantic: 'VERIFY_MANUALLY', label: '確認手順を開く', primary: true },
      { id: 'a_evidence', semantic: 'OPEN_EVIDENCE', label: 'ログを見る', primary: false },
      { id: 'a_retry', semantic: 'RETRY_WITH_DUPLICATE_RISK', label: '再送する（二重送信の恐れ）', primary: false, destructive: true },
    ],
    ...over,
  };
}

export function resultReview(over = {}) {
  return {
    id: 'card_r1', type: 'RESULT_REVIEW', createdAt: T0, state: 'DECIDED',
    goal: goal(1), run: run(1),
    completed: '週次レポートを 128 名へ配信しました。',
    actionClaim: 'mailer が 128 通すべてを送信したと報告しています。',
    independentObservation: 'プロバイダ側の配信ログで 128 件の accepted を確認しました。',
    verificationReceipt: { id: 'rcpt_8831', issuedAt: T0, method: 'provider-log-crosscheck' },
    unverified: ['実際に開封されたかは確認していません'],
    nextCandidates: ['開封率を 24 時間後に集計する', '配信リストの棚卸しを提案する'],
    evidenceLevel: 'RECEIPTED',
    actions: [
      { id: 'a_receipt', semantic: 'OPEN_EVIDENCE', label: 'receipt を見る', primary: false },
      { id: 'a_next', semantic: 'PROPOSE_NEXT', label: '次を提案', primary: false },
    ],
    ...over,
  };
}

export function information(over = {}) {
  return {
    id: 'card_i1', type: 'INFORMATION', createdAt: T0, state: 'LIVE',
    goal: goal(1),
    headline: 'Goal 1 は次回 2026-09-08 09:00 UTC に自動実行されます。',
    detail: '前回の実行から設定変更はありません。Owner の操作は不要です。',
    requiresOwnerAction: false,
    actions: [{ id: 'a_ack', semantic: 'ACKNOWLEDGE', label: '確認した', primary: false }],
    ...over,
  };
}

// ---- コーパス ---------------------------------------------------------------
const happy = [ownerQuestion(), actionApproval(), outcomeUnknown(), resultReview(), information()];

const edge = [
  // 期限切れ / 取消 / stale
  actionApproval({ id: 'card_a_expired', state: 'EXPIRED', expiresAt: T_PAST }),
  actionApproval({ id: 'card_a_revoked', state: 'REVOKED' }),
  ownerQuestion({ id: 'card_q_answered', state: 'ANSWERED' }),
  resultReview({ id: 'card_r_stale', state: 'STALE' }),
  // evidence なし
  resultReview({
    id: 'card_r_noevidence', evidenceLevel: 'CLAIMED',
    independentObservation: null, verificationReceipt: null,
    completed: 'レポートを配信したと報告されています。',
    unverified: ['独立観測なし', '受信確認なし', 'receipt なし'],
  }),
  // 矛盾する evidence
  resultReview({
    id: 'card_r_conflict', evidenceLevel: 'OBSERVED', verificationReceipt: null,
    actionClaim: 'mailer は 128 通送信したと報告しています。',
    independentObservation: 'プロバイダ側ログには 87 件しかありません。',
    unverified: ['claim と observation が一致しません（128 vs 87）'],
  }),
  // action 1 個 / 20 個相当（契約上 approval は最大 3 なので question で 20 択）
  actionApproval({
    id: 'card_a_min',
    actions: [
      { id: 'a_allow', semantic: 'ALLOW_ONCE', label: '許可', primary: true },
      { id: 'a_refuse', semantic: 'REFUSE', label: '拒否', primary: false },
    ],
  }),
  ownerQuestion({
    id: 'card_q_20opts', freeFormAllowed: false,
    answerOptions: Array.from({ length: 20 }, (_, i) => ({
      id: `opt_${i}`, label: `選択肢 ${i + 1}: 配信グループ ${String.fromCharCode(65 + i)}`,
      consequence: `グループ ${String.fromCharCode(65 + i)} のみへ配信します`,
    })),
  }),
];

const hostile = [
  actionApproval({
    id: 'card_h_longja', action: HOSTILE.longJa, effect: HOSTILE.longJa,
    blockedIfRefused: HOSTILE.longJa,
    resourceScope: [HOSTILE.longUrl, HOSTILE.longWord, HOSTILE.emoji],
  }),
  ownerQuestion({
    id: 'card_h_injection', question: HOSTILE.scriptish,
    ownerOnlyReason: HOSTILE.htmlish, resumesOnAnswer: HOSTILE.quoteish,
    answerOptions: [
      { id: 'o1', label: HOSTILE.htmlish }, { id: 'o2', label: HOSTILE.scriptish },
    ],
  }),
  information({ id: 'card_h_rtl', headline: HOSTILE.rtl, detail: HOSTILE.rtl + ' ' + HOSTILE.emoji }),
  information({ id: 'card_h_combining', headline: HOSTILE.combining, detail: HOSTILE.single }),
  outcomeUnknown({
    id: 'card_h_longurl', dispatched: HOSTILE.longUrl, confirmed: HOSTILE.longWord,
    unknown: HOSTILE.emoji,
    safeVerificationSteps: [HOSTILE.longUrl, HOSTILE.longJa, HOSTILE.single],
  }),
];

const scale = (n) =>
  Array.from({ length: n }, (_, i) => {
    const makers = [ownerQuestion, actionApproval, outcomeUnknown, resultReview, information];
    const c = makers[i % makers.length]();
    return { ...c, id: `card_scale_${i}`, goal: goal((i % 7) + 1) };
  });

mkdirSync('fixtures', { recursive: true });
const out = {
  'cards.happy.json': happy,
  'cards.edge.json': edge,
  'cards.hostile.json': hostile,
  'cards.empty.json': [],
  'cards.one.json': [actionApproval()],
  'cards.scale-100.json': scale(100),
  'cards.scale-1000.json': scale(1000),
};
for (const [name, data] of Object.entries(out)) {
  writeFileSync(`fixtures/${name}`, JSON.stringify(data, null, 2) + '\n');
  console.log(`fixtures/${name}: ${data.length} cards`);
}
