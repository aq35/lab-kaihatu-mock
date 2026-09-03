/**
 * カードの絞り込み。
 * 描画済みの server-rendered DOM を «隠す» のではなく、
 * どの項目が対象かを DOM の意味属性から読み、hidden 属性で出し入れする。
 * required information を CSS で消すことは禁止 (contracts/dom-contract.json)。
 */

export function filterCards(root, { type = 'ALL', state = 'ALL' } = {}) {
  let shown = 0;
  for (const slot of root.querySelectorAll('.card-slot')) {
    const card = slot.querySelector('[data-card-type]');
    if (!card) continue;
    const ok =
      (type === 'ALL' || card.dataset.cardType === type) &&
      (state === 'ALL' || card.dataset.cardState === state);
    slot.hidden = !ok;
    if (ok) shown += 1;
  }
  return shown;
}

/** 対応が必要な項目だけを数える。INFORMATION は含めない。 */
export function countAttentionItems(root) {
  return root.querySelectorAll(
    '[data-card-type="OWNER_QUESTION"][data-card-state="LIVE"],' +
    '[data-card-type="ACTION_APPROVAL"][data-card-state="LIVE"],' +
    '[data-card-type="OUTCOME_UNKNOWN_REVIEW"][data-card-state="LIVE"]'
  ).length;
}
