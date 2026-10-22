import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLedger, readMemory, writeMemory } from '../../../packages/project-index/assets/index-core.js';

test('Project Index erhält die Schreibreihenfolge von Memos statt lexikalisch zu sortieren', () => {
  const db = openLedger(':memory:');
  try {
    writeMemory(db, 'shinon.order-test', { memos: [{ id: 's1' }, { id: 's2' }, { id: 's10' }] });
    assert.deepEqual(readMemory(db, 'shinon.order-test').memos.map((memo) => memo.id), ['s1', 's2', 's10']);
  } finally {
    db.close();
  }
});
