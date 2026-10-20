// Snapshot-Kompilator und Cache (Wissens-Runtime, Zug 3).
//
// Der Test prüft die drei Zusagen des Kompilators: nur VALID kommt hinein,
// das Budget bricht ab statt zu kürzen, und zwei Läufe mit denselben Eingaben
// ergeben denselben Hash — unabhängig von der Reihenfolge der Listen.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_BUDGET, SNAPSHOT_CONTRACT, cacheKey, compileSnapshot, createSnapshotCache, snapshotHash } from '../assets/facts-snapshot.js';

const fact = (id, status = 'VALID', extra = {}) => ({
  id,
  scope: 'packages/prompter',
  subject: 'pre-step.js',
  predicate: 'p',
  value: `v-${id}`,
  kind: 'FACT',
  status,
  revisions: ['dev:1:2:3:4'],
  ...extra,
});

test('snapshot: nur VALID kommt hinein, der Rest steht als Auslassung daneben', () => {
  const result = compileSnapshot({
    intent: { classification: 'MULTI_STEP_TASK' },
    facts: [fact('f_1'), fact('f_2', 'STALE'), fact('f_3', 'DISPUTED')],
    constraints: [{ key: 'commit-policy', text: 'shinon-maintainer' }],
    conflicts: [{ id: 'f_3', sources: ['a.md', 'b.js'] }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.facts.map((entry) => entry.id), ['f_1']);
  assert.deepEqual(result.omitted.map((entry) => entry.reason), ['STATUS_STALE', 'STATUS_DISPUTED']);
  assert.deepEqual(result.snapshot.conflicts, [{ id: 'f_3', sources: ['a.md', 'b.js'] }]);
  assert.equal(result.snapshot.contract, SNAPSHOT_CONTRACT);
});

test('snapshot: derselbe Inhalt ergibt denselben Hash, die Reihenfolge ist unerheblich', () => {
  const a = compileSnapshot({ intent: { classification: 'X' }, facts: [fact('f_1'), fact('f_2')], constraints: [{ key: 'b', text: '2' }, { key: 'a', text: '1' }] });
  const b = compileSnapshot({ intent: { classification: 'X' }, facts: [fact('f_2'), fact('f_1')], constraints: [{ key: 'a', text: '1' }, { key: 'b', text: '2' }] });
  assert.equal(a.snapshot.hash, b.snapshot.hash);
  assert.equal(snapshotHash(a.snapshot), a.snapshot.hash);
  const changed = compileSnapshot({ intent: { classification: 'X' }, facts: [fact('f_1', 'VALID', { revisions: ['dev:9:9:9:9'] }), fact('f_2')] });
  assert.notEqual(changed.snapshot.hash, a.snapshot.hash, 'eine andere Revision ist ein anderer Snapshot');
});

test('snapshot: das Budget bricht ab und nennt Soll und Ist, statt zu kürzen', () => {
  const result = compileSnapshot({
    intent: { classification: 'X' },
    facts: [fact('f_1'), fact('f_2'), fact('f_3')],
    budget: { maxFacts: 2, maxChars: DEFAULT_BUDGET.maxChars },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'BUDGET_UEBERSCHRITTEN');
  assert.equal(result.snapshot, null);
  assert.equal(result.required.facts, 3);
  assert.equal(result.required.maxFacts, 2);

  const tight = compileSnapshot({ intent: { classification: 'X' }, facts: [fact('f_1')], budget: { maxFacts: 10, maxChars: 5 } });
  assert.equal(tight.ok, false, 'auch die Zeichengrenze bricht ab');
  assert.equal(tight.required.chars > 5, true);
});

test('cache: eine geänderte Revision ergibt einen anderen Schlüssel', () => {
  const base = { intent: 'MULTI_STEP_TASK', features: ['tests'], extractorVersion: 1, rulesVersion: 1 };
  const first = cacheKey({ ...base, facts: [{ id: 'f_1', revisions: ['r1'] }] });
  const same = cacheKey({ ...base, facts: [{ id: 'f_1', revisions: ['r1'] }] });
  const changed = cacheKey({ ...base, facts: [{ id: 'f_1', revisions: ['r2'] }] });
  const otherVersion = cacheKey({ ...base, extractorVersion: 2, facts: [{ id: 'f_1', revisions: ['r1'] }] });
  assert.equal(first, same);
  assert.notEqual(first, changed);
  assert.notEqual(first, otherVersion);
});

test('cache: begrenzt, vergisst den ältesten Eintrag, hält Treffer', () => {
  const cache = createSnapshotCache(2);
  cache.set('a', 1);
  cache.set('b', 2);
  assert.equal(cache.get('a'), 1, 'ein Treffer bleibt ein Treffer');
  cache.set('c', 3);
  assert.equal(cache.size, 2);
  assert.equal(cache.get('b'), null, 'der älteste Eintrag fällt heraus');
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
  cache.clear();
  assert.equal(cache.size, 0);
});
