import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countSalvage, effectiveRoute, journalRejectedAnswer, recordIntent } from '../assets/runtime-state.js';
import { emptyMemory } from '../assets/intent-memory.js';

const resolution = { classification: 'MULTI_STEP_TASK', matched: true, patternId: 'probe', score: 1, features: ['imperativ'] };

test('intent state counts an input once per session and persists without its raw text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prompter-runtime-'));
  try {
    const file = join(dir, 'intent.json');
    const runtime = { intentMemory: emptyMemory(), intentLast: new Map(), intentMemoryPath: file, intentWriteWarned: false };
    recordIntent({}, runtime, 'Prüfe Quarz', resolution, 'a', 3);
    recordIntent({}, runtime, 'Prüfe Quarz', resolution, 'a', 3);
    assert.equal(runtime.intentMemory.runs, 1);
    recordIntent({}, runtime, 'Prüfe Quarz', resolution, 'b', 3);
    assert.equal(runtime.intentMemory.runs, 2);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).runs, 2);
    assert.equal(readFileSync(file, 'utf8').includes('Prüfe Quarz'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('salvage counts are separated by session when persistent storage is disabled', () => {
  const runtime = { salvageLoaded: false, salvageNamespace: '', salvageCounts: new Map() };
  const sample = { reason: 'NO_JSON', chars: 12, answerChars: 34 };
  assert.deepEqual(countSalvage(runtime, 'a', sample), { reason: 'NO_JSON', chars: 12, answer_chars: 34, applied: false, count: 1 });
  assert.equal(countSalvage(runtime, 'a', sample).count, 2);
  assert.equal(countSalvage(runtime, 'b', sample).count, 1);
});

test('route uses configured fallback only when its own key is absent', () => {
  const key = 'SHINON_TEST_RUNTIME_KEY';
  const previous = process.env[key];
  const config = { provider: 'main', model: 'one', providerKeyEnv: key, providerFallback: 'fallback', modelFallback: 'two' };
  try {
    delete process.env[key];
    assert.deepEqual(effectiveRoute(config), { provider: 'fallback', model: 'two' });
    process.env[key] = 'present';
    assert.deepEqual(effectiveRoute(config), { provider: 'main', model: 'one' });
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test('rejected-answer journal stays disabled without a path', () => {
  assert.doesNotThrow(() => journalRejectedAnswer({ probeJournalPath: '' }, { reason: 'NO_JSON' }));
});
