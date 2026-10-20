// Claims im Gedächtnis, Urteile im Selbstmodell (Wissens-Runtime, Zug 5).
//
// Die Persona besitzt weder eine zweite Wahrheit noch eine stille Annahme:
// ein Claim von `scoring` bleibt ein Vorschlag, ein Claim von `review` wird
// übernommen, und ein Urteil erscheint nur als Kürzel in den Gründen.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adoptClaim, emptyMemory } from '../assets/memory-core.js';
import { emptySelfModel, observeJudgement, selfModelView } from '../assets/self-model.js';
import { judgeAction, proposeClaim, decideClaim } from '../assets/claim-core.js';

test('memory: ein Vorschlag von scoring bleibt ein Vorschlag', () => {
  const { claim } = proposeClaim({ id: 'k1', subject: 'ton', detail: 'kurz und sachlich', evidencePointer: 'docs/probes/x.json', rev: 'r1', source: 'scoring' });
  const result = adoptClaim(emptyMemory(), claim, '2026-10-20');
  assert.equal(result.changed, true);
  const [proposal] = result.memory.proposals;
  assert.equal(proposal.id, 'c:k1');
  assert.equal(proposal.status, 'proposed');
  assert.equal(proposal.decidedAt, null);
  assert.equal(proposal.evidence, 1);
});

test('memory: ein Claim, den scoring akzeptieren wollte, bleibt proposed', () => {
  const { claim } = proposeClaim({ id: 'k2', subject: 'ton', evidencePointer: 'a.md', rev: 'r1' });
  const forged = { ...claim, state: 'accepted', decidedBy: 'scoring' };
  const result = adoptClaim(emptyMemory(), forged, '2026-10-20');
  assert.equal(result.memory.proposals[0].status, 'proposed');
  assert.equal(result.reason, 'NICHT_ENTSCHIEDEN');
});

test('memory: eine Entscheidung von review wird übernommen, abgelehnte Claims auch', () => {
  const { claim } = proposeClaim({ id: 'k3', subject: 'ton', evidencePointer: 'a.md', rev: 'r1' });
  const accepted = decideClaim(claim, 'accepted', 'review', 9).claim;
  assert.equal(adoptClaim(emptyMemory(), accepted, '2026-10-20').memory.proposals[0].status, 'accepted');

  const rejected = decideClaim(claim, 'rejected', 'human', 9).claim;
  assert.equal(adoptClaim(emptyMemory(), rejected, '2026-10-20').memory.proposals[0].status, 'rejected');

  const { claim: other } = proposeClaim({ id: 'k4', subject: 'ton', evidencePointer: 'a.md', rev: 'r1' });
  assert.equal(adoptClaim(emptyMemory(), other).memory.proposals.length, 1);
});

test('memory: derselbe Claim wird nicht doppelt angelegt', () => {
  const { claim } = proposeClaim({ id: 'k5', subject: 'ton', evidencePointer: 'a.md', rev: 'r1' });
  const first = adoptClaim(emptyMemory(), claim, '2026-10-20');
  const second = adoptClaim(first.memory, claim, '2026-10-21');
  assert.equal(second.memory.proposals.length, 1);
  assert.equal(adoptClaim(emptyMemory(), null).reason, 'KEIN_CLAIM');
});

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
