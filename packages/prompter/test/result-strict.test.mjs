// Ergebnisvertrag, zwei Modi (Wissens-Runtime, Zug 4).
//
// Der Standardweg bleibt, wie er war: eine unbekannte Referenz wird protokolliert
// und der Kontext trotzdem geliefert. Der wissensgebundene Weg ist streng: wer
// einen Faktenblock bekommt, darf sich nicht auf Quellen berufen, die nicht darin
// stehen — dort ist die Referenz ein Ablehnungsgrund.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { acceptance } from '../assets/result-contract.js';

const base = {
  enhancedPrompt: 'Pruefe a.',
  preservedIntent: true,
  addedRequirements: [],
  removedRequirements: [],
  uncertainties: [],
  references: ['gibt/es/nicht'],
};

const context = { files: [{ path: 'src/a.mjs', content: 'x' }], symbols: [], constraints: [], touches: [], dependencies: [] };

test('standard: unbekannte Referenz wird protokolliert, der Kontext bleibt', () => {
  const verdict = acceptance({ ...base, references: ['src/a.mjs', 'gibt/es/nicht'] }, { needsContext: true, context });
  assert.equal(verdict.accepted, true);
  assert.deepEqual(verdict.reasons, []);
});

test('streng: dieselbe Referenz ist im wissensgebundenen Weg ein Grund', () => {
  const verdict = acceptance({ ...base, references: ['src/a.mjs', 'gibt/es/nicht'] }, { needsContext: true, context, strictFacts: true });
  assert.equal(verdict.accepted, false);
  assert.deepEqual(verdict.reasons, ['UNRESOLVED_REFERENCE:gibt/es/nicht']);
});

test('streng: aufloesbare Referenzen bleiben gruen', () => {
  const verdict = acceptance({ ...base, references: ['src/a.mjs'] }, { needsContext: true, context, strictFacts: true });
  assert.equal(verdict.accepted, true);
  assert.deepEqual(verdict.reasons, []);
});

test('streng ohne Not: ohne Kontextbedarf gilt die Regel nicht', () => {
  const verdict = acceptance({ ...base, references: ['gibt/es/nicht'] }, { needsContext: false, strictFacts: true });
  assert.equal(verdict.accepted, true);
});
