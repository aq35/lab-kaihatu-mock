import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schema = JSON.parse(readFileSync('contracts/cards.schema.json', 'utf8'));
const ajv = addFormats(new Ajv2020({ allErrors: true, strict: false }));
const validate = ajv.compile(schema);

const fixtureFiles = readdirSync('fixtures').filter((f) => f.endsWith('.json'));

test('全 fixture が契約を満たす', () => {
  for (const f of fixtureFiles) {
    const cards = JSON.parse(readFileSync(`fixtures/${f}`, 'utf8'));
    for (const card of cards) {
      const ok = validate(card);
      assert.ok(ok, `${f} / ${card.id}: ${JSON.stringify(validate.errors?.slice(0, 3))}`);
    }
  }
});

// --- 契約が実際に「間違いを弾く」ことの証明（counter-proof の一部） -----------
// 契約を書いただけで検査していないと、下の違反がすべて通ってしまう。
const violations = [
  ['質問カードに ALLOW_ONCE を置く（質問と承認の取り違え）', () => {
    const c = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'))[0];
    c.actions = [{ id: 'x', semantic: 'ALLOW_ONCE', label: '許可', primary: true }];
    return c;
  }],
  ['承認カードに永続許可を足す', () => {
    const c = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'))[1];
    c.actions.push({ id: 'x', semantic: 'ALLOW_ALWAYS', label: '常に許可', primary: false });
    return c;
  }],
  ['承認カードの oneShot を false にする', () => {
    const c = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'))[1];
    c.oneShot = false;
    return c;
  }],
  ['承認カードから effect を削る', () => {
    const c = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'))[1];
    delete c.effect;
    return c;
  }],
  ['承認カードの risk を一部だけ書く', () => {
    const c = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'))[1];
    c.risk = { externalSend: true };
    return c;
  }],
  ['OUTCOME_UNKNOWN の retry を primary にする', () => {
    const c = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'))[2];
    c.actions = [
      { id: 'r', semantic: 'RETRY_WITH_DUPLICATE_RISK', label: '再送', primary: true },
      { id: 'v', semantic: 'VERIFY_MANUALLY', label: '確認', primary: false },
    ];
    return c;
  }],
  ['OUTCOME_UNKNOWN から安全な確認手順を削る', () => {
    const c = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'))[2];
    c.safeVerificationSteps = [];
    return c;
  }],
  ['evidence なしで RECEIPTED を名乗る', () => {
    const c = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'))[3];
    c.verificationReceipt = null;
    return c;
  }],
  ['observation なしで OBSERVED を名乗る', () => {
    const c = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'))[3];
    c.evidenceLevel = 'OBSERVED';
    c.verificationReceipt = null;
    c.independentObservation = null;
    return c;
  }],
  ['INFORMATION が Owner の操作を要求する', () => {
    const c = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'))[4];
    c.requiresOwnerAction = true;
    return c;
  }],
  ['INFORMATION に primary action を置く', () => {
    const c = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'))[4];
    c.actions = [{ id: 'x', semantic: 'ACKNOWLEDGE', label: 'OK', primary: true }];
    return c;
  }],
  ['契約外のフィールドを足す', () => {
    const c = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'))[1];
    c.autoApprove = true;
    return c;
  }],
];

test('契約は既知の危険な違反をすべて拒否する', () => {
  for (const [name, make] of violations) {
    assert.equal(validate(make()), false, `契約が「${name}」を通してしまった`);
  }
});
