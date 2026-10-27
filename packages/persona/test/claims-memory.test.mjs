// Urteile im Selbstmodell: nur Kürzel erscheinen in den Gründen.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { emptySelfModel, observeJudgement, selfModelView } from '../assets/self-model.js';
import { judgeAction } from '../assets/claim-core.js';

test('self-model: ein Urteil erscheint als Kürzel in den Gründen, ohne Text', () => {
  const judgement = judgeAction({
    action: { id: 'patch', scope: 'packages/prompter' },
    conflicts: [{ id: 'c1', scope: 'packages/prompter', severity: 'security', resolved: false }],
    claims: [{ id: 'k1', state: 'proposed' }],
    required: ['k1'],
  });
  const model = observeJudgement(emptySelfModel(), judgement, '2026-10-20');
  assert.equal(model.reasons['urteil:DENY'] >= 1, true);
  assert.equal(model.reasons['urteil:KONFLIKT_UNGELOEST:c1'], 1);
  assert.equal(model.reasons['urteil:CLAIM_NICHT_AKZEPTIERT:k1'], 1);
  const view = selfModelView(model);
  assert.equal(JSON.stringify(view).includes('packages/prompter'), false, 'kein Pfad im Modell');
});

test('self-model: ein fehlendes Urteil zählt als DENY, nie als ALLOW', () => {
  const model = observeJudgement(emptySelfModel(), null, '2026-10-20');
  assert.equal(model.reasons['urteil:DENY'], 1);
  assert.equal(model.reasons['urteil:ALLOW'], undefined);
});
