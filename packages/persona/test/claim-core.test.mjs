// Claim-Lebenszyklus und Urteilsschicht (Wissens-Runtime, Zug 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLAIM_ACTORS,
  CLAIM_STATES,
  addEvidence,
  canMoveClaim,
  decideClaim,
  judgeAction,
  judgementRecord,
  proposeClaim,
} from '../assets/claim-core.js';

test('claim: ein Vorschlag startet immer als proposed, mit Beleg', () => {
  const result = proposeClaim({ subject: 'ton', detail: 'kurz und sachlich', evidencePointer: 'docs/probes/x.json', rev: 'dev:1:2:3:4' });
  assert.equal(result.ok, true);
  assert.equal(result.claim.state, 'proposed');
  assert.equal(result.claim.decidedBy, null);
  assert.deepEqual(result.claim.evidence, [{ pointer: 'docs/probes/x.json', rev: 'dev:1:2:3:4' }]);

  assert.equal(proposeClaim({ subject: 'ton' }).reason, 'OHNE_BELEG');
  assert.equal(proposeClaim({ evidencePointer: 'a.md', rev: 'r' }).reason, 'OHNE_SUBJEKT');
});

test('claim: nur human und review akzeptieren, scoring nie', () => {
  assert.equal(canMoveClaim('proposed', 'accepted', 'human').ok, true);
  assert.equal(canMoveClaim('proposed', 'accepted', 'review').ok, true);
  assert.equal(canMoveClaim('proposed', 'accepted', 'scoring').reason, 'AKTEUR_NICHT_ZUSTAENDIG');
  assert.equal(canMoveClaim('proposed', 'accepted', 'system').reason, 'AKTEUR_NICHT_ZUSTAENDIG');
  assert.equal(canMoveClaim('proposed', 'erfunden', 'human').reason, 'ZUSTAND_UNBEKANNT');
  assert.equal(canMoveClaim('proposed', 'accepted', 'model').reason, 'AKTEUR_VERBOTEN');
  for (const from of CLAIM_STATES) {
    for (const actor of CLAIM_ACTORS) {
      assert.equal(canMoveClaim(from, 'accepted', actor).ok, from === 'proposed' && (actor === 'human' || actor === 'review'), `${from} → accepted durch ${actor}`);
    }
  }
  assert.equal(canMoveClaim('superseded', 'accepted', 'human').reason, 'UEBERGANG_VERBOTEN');
});

test('claim: eine Entscheidung braucht den richtigen Akteur und setzt den Zeitpunkt', () => {
  const { claim } = proposeClaim({ subject: 'ton', evidencePointer: 'a.md', rev: 'r1' });
  const denied = decideClaim(claim, 'accepted', 'scoring', 5);
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'AKTEUR_NICHT_ZUSTAENDIG');
  const accepted = decideClaim(claim, 'accepted', 'review', 5);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.claim.state, 'accepted');
  assert.equal(accepted.claim.decidedBy, 'review');
  assert.equal(accepted.claim.decidedAt, '5');
});

test('claim: Belege sind gedeckelt und nicht doppelt', () => {
  let { claim } = proposeClaim({ subject: 'ton', evidencePointer: 'a.md', rev: 'r1' });
  const same = addEvidence(claim, { pointer: 'a.md', rev: 'r1' });
  assert.equal(same.reason, 'SCHON_BELEGT');
  for (let i = 2; i <= 12; i += 1) {
    claim = addEvidence(claim, { pointer: `p${i}.md`, rev: `r${i}` }).claim;
  }
  assert.equal(claim.evidence.length, 9, 'die Obergrenze hält');
  assert.equal(addEvidence(claim, { pointer: '' }).reason, 'OHNE_BELEG');
});

test('urteil: ein ungeloester Sicherheitskonflikt blockiert die betroffene Aktion', () => {
  const judgement = judgeAction({
    action: { id: 'patch', scope: 'packages/prompter' },
    conflicts: [
      { id: 'c1', scope: 'packages/prompter', severity: 'security', resolved: false },
      { id: 'c2', scope: 'packages/scoring', severity: 'security', resolved: false },
      { id: 'c3', scope: 'packages/prompter', severity: 'other', resolved: false },
    ],
  });
  assert.equal(judgement.verdict, 'DENY');
  assert.deepEqual(judgement.reasons, ['KONFLIKT_UNGELOEST:c1'], 'nur der eigene Bereich blockiert');
});

test('urteil: ohne Konflikt und mit belegten Claims ist es ALLOW', () => {
  const judgement = judgeAction({
    action: { id: 'patch', scope: 'packages/prompter' },
    conflicts: [{ id: 'c1', scope: 'packages/prompter', severity: 'security', resolved: true }],
    claims: [{ id: 'k1', state: 'accepted' }, { id: 'k2', state: 'proposed' }],
    required: ['k1'],
  });
  assert.equal(judgement.verdict, 'ALLOW');
  assert.deepEqual(judgement.reasons, []);
  assert.deepEqual(judgement.evidence, [{ id: 'k1', state: 'accepted' }, { id: 'k2', state: 'proposed' }]);
});

test('urteil: ein nur vorgeschlagener Claim traegt keine Aktion', () => {
  const judgement = judgeAction({
    action: { id: 'patch' },
    claims: [{ id: 'k1', state: 'proposed' }],
    required: ['k1', 'k2'],
  });
  assert.equal(judgement.verdict, 'DENY');
  assert.deepEqual(judgement.reasons, ['CLAIM_NICHT_AKZEPTIERT:k1', 'CLAIM_NICHT_AKZEPTIERT:k2']);
  assert.equal(judgeAction({}).verdict, 'DENY');
  assert.deepEqual(judgeAction({}).reasons, ['AKTION_UNBEKANNT']);
});

test('datensatz: Zahlen und Gruende, kein Claim-Text', () => {
  const judgement = judgeAction({ action: { id: 'patch' }, claims: [{ id: 'k1', state: 'proposed' }], required: ['k1'] });
  const record = judgementRecord(judgement, 'patch');
  assert.equal(record.verdict, 'DENY');
  assert.deepEqual(record.reasons, ['CLAIM_NICHT_AKZEPTIERT:k1']);
  assert.equal(record.claims, 1);
  assert.equal(JSON.stringify(record).includes('detail'), false);
});
