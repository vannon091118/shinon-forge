// Der Fakten-Dienst (Wissens-Runtime, Zug 3/4).
//
// Geprüft wird, was der Prompter tatsächlich sieht: kein Snapshot ohne Datei,
// ein Snapshot mit Fakten und einer Constraint aus der bestätigten Commit-Policy,
// und kein Block, wenn das Budget brechen würde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { constraintsFrom, createFactsService } from '../assets/facts-service.js';
import { FACTS_FILE_NAME, closeFacts, insertFact, openFacts, transitionFact } from '../assets/facts-store.js';

function workspace({ withPolicy = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-facts-service-'));
  mkdirSync(join(dir, 'docs', 'contracts'), { recursive: true });
  mkdirSync(join(dir, '.shinon'), { recursive: true });
  if (withPolicy) {
    writeFileSync(join(dir, 'docs', 'contracts', 'commit-policy.json'), JSON.stringify({ preset: 'shinon-maintainer' }), 'utf8');
  }
  return { dir, file: join(dir, '.shinon', FACTS_FILE_NAME), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('dienst: ohne Faktendatei gibt es keinen Snapshot (ehrliche Leere)', () => {
  const ws = workspace();
  try {
    const service = createFactsService({ file: ws.file, root: ws.dir });
    assert.equal(service.contract, 'shinon.facts/snapshot-v1');
    assert.equal(service.snapshot({ intent: 'MULTI_STEP_TASK' }), null);
  } finally {
    ws.cleanup();
  }
});

test('dienst: Constraints kommen aus der bestätigten Commit-Policy, nicht aus Prosa', () => {
  const withPolicy = workspace();
  const withoutPolicy = workspace({ withPolicy: false });
  try {
    assert.deepEqual(constraintsFrom(withPolicy.dir), [{ key: 'commit-policy', text: 'shinon-maintainer' }]);
    assert.deepEqual(constraintsFrom(withoutPolicy.dir), []);
    assert.deepEqual(constraintsFrom(''), []);
    assert.deepEqual(constraintsFrom('/gibt/es/nicht'), []);
  } finally {
    withPolicy.cleanup();
    withoutPolicy.cleanup();
  }
});

test('dienst: ein gültiger Fakt plus Constraint ergibt den Block; Budget bricht ab', () => {
  const ws = workspace();
  try {
    const db = openFacts(ws.file);
    const { id } = insertFact(db, {
      scope: 'packages/prompter',
      subject: 'pre-step.js',
      predicate: 'montiert',
      value: 'den Wissensblock',
      kind: 'FACT',
      status: 'DISCOVERED',
      sources: [{ pointer: 'packages/prompter/assets/pre-step.js:509', rev: 'dev:1:2:3:4' }],
    }, 1);
    for (const status of ['EXTRACTED', 'VALIDATING', 'VALID']) transitionFact(db, id, status, 'validator', 1);
    closeFacts(db);

    const service = createFactsService({ file: ws.file, root: ws.dir });
    const snapshot = service.snapshot({ intent: 'MULTI_STEP_TASK' });
    assert.equal(snapshot.facts.length, 1);
    assert.deepEqual(snapshot.constraints, [{ key: 'commit-policy', text: 'shinon-maintainer' }]);
    assert.equal(snapshot.intent.classification, 'MULTI_STEP_TASK');

    const tight = createFactsService({ file: ws.file, root: ws.dir, budget: { maxFacts: 0, maxChars: 6000 } });
    assert.equal(tight.snapshot({ intent: 'MULTI_STEP_TASK' }), null, 'kein Block statt einer Kürzung');
  } finally {
    ws.cleanup();
  }
});
