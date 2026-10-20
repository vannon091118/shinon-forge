// Reconciliation und Post-Checks (Wissens-Runtime, Zug 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkFact, factId } from '../assets/facts-core.js';
import { authorityRank, deriveChecks, judgementFact, reconcile } from '../assets/facts-reconcile.js';

const fact = (overrides) => ({
  id: factId({ scope: 'packages/x', subject: 'a', predicate: 'p', value: 'v', ...overrides }),
  scope: 'packages/x',
  subject: 'a',
  predicate: 'p',
  value: 'v',
  kind: 'FACT',
  status: 'VALID',
  sources: [{ pointer: 'packages/x/index.js', rev: 'r1' }],
  ...overrides,
});

test('reconciliation: gleiche Aussage wird EIN Eintrag mit allen Quellen', () => {
  const a = fact({ sources: [{ pointer: 'packages/x/index.js', rev: 'r1' }] });
  const b = fact({ sources: [{ pointer: 'docs/contracts/facts.json', rev: 'r2' }] });
  const result = reconcile([a, b]);
  assert.equal(result.ok, true);
  assert.equal(result.merged.length, 1);
  assert.deepEqual(result.merged[0].ids, [a.id, b.id].sort());
  assert.deepEqual(result.merged[0].sources, ['docs/contracts/facts.json@r2', 'packages/x/index.js@r1']);
  assert.deepEqual(result.conflicts, []);
});

test('reconciliation: echter Widerspruch bleibt sichtbar, nach Autorität sortiert', () => {
  const code = fact({ value: 'alt', sources: [{ pointer: 'packages/x/index.js', rev: 'r1' }] });
  const contract = fact({ value: 'neu', sources: [{ pointer: 'docs/contracts/facts.json', rev: 'r2' }] });
  const result = reconcile([code, contract]);
  assert.equal(result.ok, false);
  assert.equal(result.merged.length, 0);
  assert.equal(result.conflicts.length, 1);
  const [conflict] = result.conflicts;
  assert.equal(conflict.resolved, false, 'nichts wird still entschieden');
  assert.deepEqual(conflict.sides.map((side) => side.value), ['neu', 'alt'], 'Vertrag steht über Code');
  assert.equal(conflict.sides[0].authority, 3);
  assert.equal(conflict.sides[1].authority, 2);
  assert.equal(conflict.highest, 3);
});

test('reconciliation: Autorität kommt aus dem Pfad, nicht aus der Zeit', () => {
  assert.equal(authorityRank('docs/contracts/facts.json'), 3);
  assert.equal(authorityRank('packages/prompter/index.js'), 2);
  assert.equal(authorityRank('scripts/lib/repo.mjs'), 2);
  assert.equal(authorityRank('docs/ROADMAP.md'), 1);
  assert.equal(authorityRank('fremd.txt'), 0);
  assert.equal(authorityRank(''), 0);
});

test('post-checks: deterministisch, aus Auftrag und Änderungsbereich', () => {
  const checks = deriveChecks({
    intent: 'MULTI_STEP_TASK',
    changedPaths: ['packages/prompter/index.js', 'packages/scoring/index.js', 'docs/contracts/facts.json', 'package.json'],
  });
  assert.deepEqual(checks.map((check) => check.id), [
    'gate:contracts', 'gate:profile', 'paket:prompter', 'paket:scoring', 'tests:pakete',
  ]);
  assert.deepEqual(checks, deriveChecks({
    intent: 'MULTI_STEP_TASK',
    changedPaths: ['package.json', 'docs/contracts/facts.json', 'packages/scoring/index.js', 'packages/prompter/index.js'],
  }), 'die Reihenfolge der Eingabe ist unerheblich');
  assert.deepEqual(deriveChecks({ intent: 'CHAT', changedPaths: [] }), []);
});

test('post-check: das Urteil ist ein belegter JUDGEMENT-Fakt, keine Wahrheit', () => {
  const [check] = deriveChecks({ changedPaths: ['packages/prompter/index.js'] });
  const judgement = judgementFact({ check, verdict: 'BESTANDEN', evidencePointer: 'docs/probes/x.json', rev: 'dev:1:2:3:4', at: 7 });
  assert.equal(judgement.kind, 'JUDGEMENT');
  assert.equal(judgement.status, 'DISCOVERED');
  assert.deepEqual(checkFact(judgement), []);
  assert.match(judgement.value, /BESTANDEN @ 7/);
  assert.deepEqual(judgement.sources, [{ pointer: 'docs/probes/x.json', rev: 'dev:1:2:3:4' }]);
});
