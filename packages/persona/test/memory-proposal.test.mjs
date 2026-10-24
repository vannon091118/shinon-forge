// Die Naht des Lernprüfers in das Nutzer-Gedächtnis (SH-LEARN-04).
//
// Der Reviewer schlägt vor, die Persona entscheidet. Dieser Test fährt den Kern
// ohne Host: Vertrag, Grenzen, Duplikat, Geheimnis, Kapazität, Bereich — und den
// Widerruf, der eine angenommene Auflage wieder aus dem Prompt nimmt.
//
// Die Vertrags-Gleichheit beider Seiten wird am Quelltext gepinnt, nicht über
// einen Import: dieser Test läuft ohne `node_modules` (CI-Testbahn), und
// `@shinon/seams` ist ein Workspace-Paket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MEMORY_MAX_PROPOSALS, MEMORY_PROPOSAL_CONTRACT, emptyMemory, renderCommitments, scopeOfProposal, validateMemory } from '../assets/memory-core.js';
import { proposeMemory, retractProposal } from '../assets/memory-proposals.js';

const SEAMS = new URL('../../seams/assets/seams.js', import.meta.url);
const PERSONA = new URL('../index.js', import.meta.url);
const SEAM = new URL('../assets/memory-proposal-seam.js', import.meta.url);

const proposal = (patch = {}) => ({
  contract: MEMORY_PROPOSAL_CONTRACT,
  id: 'lp_abc',
  subject: 'test-tempo',
  claim: 'Bei einem Test über der Zeitgrenze den Test verkleinern, nicht die Grenze heben.',
  reason: 'Die Grenze schützt den Lauf, der Test ist das Problem.',
  sources: ['message:m2', 'turn:1'],
  scope: '/projekt/a',
  ...patch,
});

test('naht: das Literal ist der Vertrag aus @shinon/seams, und die Persona bietet den Dienst an', () => {
  const seams = readFileSync(SEAMS, 'utf8');
  assert.match(seams, new RegExp(`PERSONA_MEMORY_PROPOSAL_CONTRACT = '${MEMORY_PROPOSAL_CONTRACT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  const index = readFileSync(PERSONA, 'utf8');
  assert.match(index, /installMemoryProposalSeam\(\{ bus, runtime \}\)/);
  // Kein zweiter Schreibweg: der Dienst hat genau `propose`.
  const seam = readFileSync(SEAM, 'utf8');
  assert.match(seam, /provide\(PERSONA_MEMORY_PROPOSAL_SERVICE/);
  assert.match(seam, /propose: \(payload\) => runtime\.propose\(payload\)/);
});

test('naht: ein fremder Vertrag wird abgewiesen, nicht umgedeutet', () => {
  const result = proposeMemory(emptyMemory(), proposal({ contract: 'shinon.persona-memory/v2' }), '2026-10-24');
  assert.equal(result.ok, false);
  assert.match(result.reason, /^FREMDER_VERTRAG:/);
  assert.equal(result.memory.proposals.length, 0);
});

test('naht: Größen, Pflichtfelder und Geheimnisse sind harte Grenzen', () => {
  assert.equal(proposeMemory(emptyMemory(), proposal({ claim: '' })).reason, 'OHNE_CLAIM');
  assert.match(proposeMemory(emptyMemory(), proposal({ claim: 'x'.repeat(161) })).reason, /^CLAIM_ZU_LANG:161$/);
  assert.equal(proposeMemory(emptyMemory(), proposal({ claim: 'Mein Schlüssel ist sk-CANARY-1234567890abcdef' })).reason, 'GEHEIMNIS');
  assert.equal(proposeMemory(emptyMemory(), proposal({ claim: 'password: hunter2-hunter2' })).reason, 'GEHEIMNIS');
  assert.equal(proposeMemory(emptyMemory(), null).reason, 'KEIN_VORSCHLAG');
});

test('naht: ein offener Vorschlag wartet, ein freigegebener wird zur Auflage', () => {
  const waiting = proposeMemory(emptyMemory(), proposal(), '2026-10-24T10:00:00.000Z');
  assert.equal(waiting.ok, true);
  assert.equal(waiting.status, 'proposed');
  assert.equal(waiting.memory.proposals[0].decidedAt, null);
  assert.equal(renderCommitments(waiting.memory, '/projekt/a'), null, 'ein offener Vorschlag wirkt nicht');

  const accepted = proposeMemory(emptyMemory(), proposal({ decision: 'accepted' }), '2026-10-24T10:00:00.000Z');
  assert.equal(accepted.status, 'accepted');
  const text = renderCommitments(accepted.memory, '/projekt/a');
  assert.ok(typeof text === 'string' && text.includes('den Test verkleinern'), 'die Auflage steht im Abschnitt');
  assert.equal(renderCommitments(accepted.memory, '/projekt/b'), null, 'ein fremder Workspace sieht die Auflage nicht');
});

test('naht: Begründung, Quellen und Bereich reisen mit und überleben den Neustart', () => {
  const result = proposeMemory(emptyMemory(), proposal({ sources: ['message:m2', 'message:m2', 'turn:1', '', 'x'.repeat(200)] }), '2026-10-24');
  const [stored] = result.memory.proposals;
  assert.equal(stored.reason.includes('Grenze'), true);
  assert.deepEqual(stored.sources.slice(0, 2), ['message:m2', 'turn:1'], 'Quellen sind entdoppelt und kurz gehalten');
  assert.equal(stored.scope, '/projekt/a');
  assert.equal(scopeOfProposal(stored), '/projekt/a');

  const reloaded = validateMemory(JSON.parse(JSON.stringify(result.memory)));
  assert.equal(reloaded.foreign, false);
  assert.equal(reloaded.dropped, 0);
  assert.equal(reloaded.memory.proposals[0].reason, stored.reason);
  assert.deepEqual(reloaded.memory.proposals[0].sources, stored.sources);
  assert.equal(reloaded.memory.proposals[0].scope, '/projekt/a');
});

test('naht: ein Duplikat ist ein Duplikat, auch bei anderer Schreibweise', () => {
  const first = proposeMemory(emptyMemory(), proposal(), '2026-10-24');
  const again = proposeMemory(first.memory, proposal({ id: 'lp_other', claim: proposal().claim.toUpperCase().replace(/\s+/g, '  ') }), '2026-10-25');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'DUPLIKAT:c:lp_abc');
  assert.equal(again.memory.proposals.length, 1);

  // Eine ABGELEHNTE Auflage ist kein Duplikat mehr: die Ablehnung ist die Aussage.
  const rejected = { ...first.memory, proposals: first.memory.proposals.map((entry) => ({ ...entry, status: 'rejected' })) };
  assert.equal(proposeMemory(rejected, proposal(), '2026-10-26').ok, true);
});

test('naht: die Kapazität weicht zuerst Abgelehntem, nie einer lebenden Auflage', () => {
  let memory = emptyMemory();
  for (let index = 0; index < MEMORY_MAX_PROPOSALS; index += 1) {
    const step = proposeMemory(memory, proposal({ id: `lp_${index}`, claim: `Auflage Nummer ${index}`, subject: `thema-${index}` }), '2026-10-24');
    assert.equal(step.ok, true, `Vorschlag ${index}: ${step.reason}`);
    memory = step.memory;
  }
  const full = proposeMemory(memory, proposal({ id: 'lp_extra', claim: 'Ein weiterer Vorschlag', subject: 'extra' }), '2026-10-24');
  assert.equal(full.ok, false);
  assert.match(full.reason, new RegExp(`^KAPAZITAET:${MEMORY_MAX_PROPOSALS}/${MEMORY_MAX_PROPOSALS}$`));

  const withRejected = { ...memory, proposals: memory.proposals.map((entry, index) => (index === 0 ? { ...entry, status: 'rejected' } : entry)) };
  const after = proposeMemory(withRejected, proposal({ id: 'lp_extra', claim: 'Ein weiterer Vorschlag', subject: 'extra' }), '2026-10-24');
  assert.equal(after.ok, true, after.reason);
  assert.equal(after.memory.proposals.some((entry) => entry.id === 'c:lp_0'), false, 'die abgelehnte Zeile ist gewichen');
  assert.equal(after.memory.proposals.length, MEMORY_MAX_PROPOSALS);
});

test('widerruf: nur eine angenommene Auflage lässt sich zurücknehmen, symmetrisch', () => {
  const accepted = proposeMemory(emptyMemory(), proposal({ decision: 'accepted' }), '2026-10-24T10:00:00.000Z');
  const undone = retractProposal(accepted.memory, 'c:lp_abc', '2026-10-24T11:00:00.000Z');
  assert.equal(undone.ok, true);
  assert.equal(undone.proposal.status, 'rejected');
  assert.equal(undone.proposal.retractedAt, '2026-10-24T11:00:00.000Z');
  assert.equal(renderCommitments(undone.memory, '/projekt/a'), null, 'die Auflage ist aus dem Prompt verschwunden');

  const open = proposeMemory(emptyMemory(), proposal(), '2026-10-24');
  assert.equal(retractProposal(open.memory, 'c:lp_abc').error, 'NICHT_ANGENOMMEN');
  assert.equal(retractProposal(open.memory, 'c:unbekannt').error, 'UNKNOWN_PROPOSAL');

  const reloaded = validateMemory(JSON.parse(JSON.stringify(undone.memory)));
  assert.equal(reloaded.memory.proposals[0].status, 'rejected');
});
