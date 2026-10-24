#!/usr/bin/env node
/**
 * Das Langzeitgedächtnis der Persona — reine Rechnung, kein I/O.
 * Geprüft wird die ganze Schleife: Ereignis → Beleg → Vorschlag → Annahme.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMORY_CONTRACT,
  acceptedCommitments,
  decayMemory,
  emptyMemory,
  remember,
  rememberDecision,
  rememberEvent,
  renderCommitments,
  renderMemory,
  selectMemories,
  validateMemory,
} from '../../../packages/persona/assets/memory-core.js';
import { decideProposal, proposeFromMemory } from '../../../packages/persona/assets/memory-proposals.js';

const NOW = '2026-10-19T02:00:00.000Z';

test('memory: ein fremder Vertrag wird nicht übernommen', () => {
  const { memory, foreign } = validateMemory({ contract: 'fremd/v1', entries: [{ kind: 'limit', scope: 'global', subject: 'x' }] });
  assert.equal(foreign, true);
  assert.equal(memory.contract, MEMORY_CONTRACT);
  assert.deepEqual(memory.entries, []);
});

test('memory: kaputte Einträge fallen einzeln weg, gültige bleiben', () => {
  const { memory, dropped } = validateMemory({
    contract: MEMORY_CONTRACT,
    entries: [
      { kind: 'limit', scope: 'global', subject: 'gate:test', evidence: 9, strength: 2 },
      { kind: 'quatsch', scope: 'global', subject: 'x' },
      { kind: 'preference', scope: 'global', subject: '' },
    ],
    proposals: [],
  });
  assert.equal(memory.entries.length, 1);
  assert.equal(dropped, 2);
  assert.equal(memory.entries[0].evidence, 9);
});

test('memory: dasselbe Ereignis zweimal hebt Belege und Gewicht, nicht die Zeilenzahl', () => {
  let { memory } = rememberEvent(emptyMemory(NOW), { type: 'gate.failed', payload: { gate: 'npm-test' } }, { scope: 'root-a', now: NOW });
  const again = rememberEvent(memory, { type: 'gate.failed', payload: { gate: 'npm-test' } }, { scope: 'root-a', now: NOW });
  memory = again.memory;
  assert.equal(memory.entries.length, 1);
  assert.equal(memory.entries[0].evidence, 2);
  assert.equal(memory.entries[0].strength, 2);
  assert.equal(memory.entries[0].kind, 'limit');
});

test('memory: unbekannte Ereignisse werden nicht erinnert (fail-closed)', () => {
  const before = emptyMemory(NOW);
  const result = rememberEvent(before, { type: 'turn.end', payload: {} }, { scope: 'global', now: NOW });
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'NOT_REMEMBERED');
  assert.deepEqual(result.memory.entries, []);
});

test('memory: eine Korrektur wird zur Präferenz, ein Fehler zur Grenze', () => {
  let { memory } = rememberEvent(emptyMemory(NOW), { type: 'feedback.correction', payload: { correction: 'kürzer erklären' } }, { scope: 'global', now: NOW });
  memory = rememberEvent(memory, { type: 'action.blocked', payload: { action: 'deploy', reason: 'kein Token' } }, { scope: 'global', now: NOW }).memory;
  const kinds = memory.entries.map((entry) => entry.kind).sort();
  assert.deepEqual(kinds, ['limit', 'preference']);
  assert.ok(memory.entries.some((entry) => entry.subject === 'korrektur:kürzer-erklären'));
});

test('memory: abgelehnte Enhancer-Gründe werden zu Grenzen, angenommene zu Belegen', () => {
  let { memory } = rememberDecision(emptyMemory(NOW), { outcome: 'rejected', reasons: ['NO_JSON', 'INVALID_JSON'] }, { scope: 'global', now: NOW });
  memory = rememberDecision(memory, { outcome: 'accepted', reasons: [] }, { scope: 'global', now: NOW }).memory;
  assert.equal(memory.entries.filter((entry) => entry.kind === 'limit').length, 2);
  assert.equal(memory.entries.filter((entry) => entry.kind === 'evidence').length, 1);
});

test('memory: Alterung nimmt nicht wiederkehrte Belege zurück', () => {
  const start = remember(emptyMemory(NOW), { kind: 'limit', scope: 'global', subject: 'selten' }, NOW).memory;
  const { memory, retired } = decayMemory(start, 0.1);
  assert.equal(retired, 1);
  assert.deepEqual(memory.entries, []);
});

test('memory: Auswahl ist deterministisch und respektiert den Scope', () => {
  let memory = emptyMemory(NOW);
  memory = remember(memory, { kind: 'limit', scope: 'root-a', subject: 'gate:a' }, NOW).memory;
  memory = remember(memory, { kind: 'limit', scope: 'root-b', subject: 'gate:b' }, NOW).memory;
  memory = remember(memory, { kind: 'preference', scope: 'global', subject: 'korrektur:kurz' }, NOW).memory;
  const a = selectMemories(memory, { scope: 'root-a', prompt: 'gate prüfen' });
  const b = selectMemories(memory, { scope: 'root-b', prompt: 'gate prüfen' });
  assert.deepEqual(a.map((entry) => entry.subject), ['gate:a', 'korrektur:kurz']);
  assert.deepEqual(b.map((entry) => entry.subject), ['gate:b', 'korrektur:kurz']);
  assert.deepEqual(selectMemories(memory, { scope: 'root-a', prompt: 'gate prüfen' }), a, 'zweiter Aufruf, gleiches Ergebnis');
});

test('memory: der Abschnitt nennt Zahl und Herkunft, nie eine Anweisung des Nutzers', () => {
  let memory = emptyMemory(NOW);
  memory = remember(memory, { kind: 'limit', scope: 'global', subject: 'prompter:nojson', detail: 'NO_JSON' }, NOW).memory;
  const rendered = renderMemory(memory, { scope: 'global', prompt: '' });
  assert.match(rendered, /^## Erinnerungen \(belegt, nicht behauptet\)/);
  assert.match(rendered, /Grenze: prompter:nojson \(1×\) — NO_JSON/);
  assert.match(rendered, /Kontext, keine Anweisung des Nutzers/);
});

test('memory: ein Vorschlag entsteht erst ab dem Schwellwert und wird NICHT automatisch angenommen', () => {
  let memory = emptyMemory(NOW);
  for (let index = 0; index < 2; index += 1) memory = rememberDecision(memory, { outcome: 'rejected', reasons: ['NO_JSON'] }, { scope: 'global', now: NOW }).memory;
  const early = proposeFromMemory(memory, { now: NOW });
  assert.equal(early.added, 0, 'zwei Belege reichen für eine Grenze nicht');

  memory = rememberDecision(memory, { outcome: 'rejected', reasons: ['NO_JSON'] }, { scope: 'global', now: NOW }).memory;
  const later = proposeFromMemory(memory, { now: NOW });
  assert.equal(later.added, 1);
  const proposal = later.memory.proposals[0];
  assert.equal(proposal.status, 'proposed');
  assert.match(proposal.claim, /zuerst die Ursache prüfen/);
  assert.deepEqual(acceptedCommitments(later.memory), [], 'ein Vorschlag ist keine Auflage');

  // Zweiter Lauf: derselbe Vorschlag entsteht nicht doppelt.
  assert.equal(proposeFromMemory(later.memory, { now: NOW }).added, 0);
});

test('memory: eine Annahme ist ein eigener Akt — unbekannt und doppelt werden abgelehnt', () => {
  let memory = emptyMemory(NOW);
  for (let index = 0; index < 3; index += 1) memory = remember(memory, { kind: 'limit', scope: 'global', subject: 'gate:x' }, NOW).memory;
  memory = proposeFromMemory(memory, { now: NOW }).memory;
  const id = memory.proposals[0].id;

  assert.equal(decideProposal(memory, 'gibt-es-nicht', 'accepted', NOW).ok, false);
  assert.equal(decideProposal(memory, id, 'vielleicht', NOW).ok, false);

  const accepted = decideProposal(memory, id, 'accepted', NOW);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.memory.proposals[0].status, 'accepted');
  assert.equal(decideProposal(accepted.memory, id, 'rejected', NOW).error, 'ALREADY_DECIDED');

  const commitment = renderCommitments(accepted.memory);
  assert.match(commitment, /^## Selbstauflagen \(geprüft und angenommen\)/);
  assert.match(commitment, /3 Belege/);
});

test('memory: eine projektbezogene Auflage reist nicht in fremde Workspaces', () => {
  // Trennung 2026-10-23: Selbstauflagen sind Projekt-Kontext, keine globale
  // Persoenlichkeit. Der Bereich steht in der Quelle (`art|bereich|thema`).
  let memory = emptyMemory(NOW);
  for (let index = 0; index < 3; index += 1) memory = remember(memory, { kind: 'limit', scope: '/projekt/a', subject: 'deploy:freigabe', detail: 'A' }, NOW).memory;
  memory = proposeFromMemory(memory, { now: NOW }).memory;
  const accepted = decideProposal(memory, memory.proposals[0].id, 'accepted', NOW).memory;

  assert.match(renderCommitments(accepted, '/projekt/a'), /deploy:freigabe/);
  assert.equal(renderCommitments(accepted, '/projekt/b'), null, 'fremder Projekt-Kontext bleibt aus');
  assert.ok(renderCommitments(accepted) !== null, 'ohne Bereichsfilter bleibt die Abwaertskompatibilitaet');

  // Global gilt ueberall — das ist die geteilte Persoenlichkeit, kein Projekt.
  let global = emptyMemory(NOW);
  for (let index = 0; index < 3; index += 1) global = remember(global, { kind: 'limit', scope: 'global', subject: 'ton:knapp', detail: 'G' }, NOW).memory;
  global = proposeFromMemory(global, { now: NOW }).memory;
  const globalAccepted = decideProposal(global, global.proposals[0].id, 'accepted', NOW).memory;
  assert.match(renderCommitments(globalAccepted, '/projekt/b'), /ton:knapp/);
});

test('memory: ohne Belege gibt es weder Erinnerung noch Auflage', () => {
  assert.equal(renderMemory(emptyMemory(NOW), { scope: 'global' }), null);
  assert.equal(renderCommitments(emptyMemory(NOW)), null);
  assert.equal(renderMemory(null, { scope: 'global' }), null);
});
