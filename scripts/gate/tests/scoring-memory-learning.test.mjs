#!/usr/bin/env node
/** Save→Load-Beweis für die Scoring-Lernfelder im echten SQLite-Memory-Store. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';

const source = new URL('../../../packages/project-index/assets/', import.meta.url);

test('project-index memory: Gewichte und Attributionsbelege überleben Save→Load', async () => {
  const work = mkdtempSync(join(tmpdir(), 'shinon-memory-learning-'));
  try {
    const assets = join(work, 'project-index/assets');
    mkdirSync(assets, { recursive: true });
    // Der Kern ist seit T2-5 ein Barrel plus fuenf Eigentuemer-Dateien — die
    // Kopie muss die ganze Familie mitnehmen, sonst bricht der Import im Sandkasten.
    const coreFiles = readdirSync(source).filter((name) => name === 'workspace.js' || /^index-[a-z]+\.js$/.test(name));
    for (const name of coreFiles) cpSync(new URL(name, source), join(assets, name));
    provideSeamCore(work);
    const core = await import(pathToFileURL(join(assets, 'index-core.js')).href);
    const db = core.openIndex(join(work, 'ledger.sqlite'));
    const learned = {
      records: [{ verdict: 'keep' }],
      memos: [],
      scorecard: null,
      notes: 1,
      blockWeights: { 'persona-identity-core': { up: 3, down: 1 } },
      blockAttributions: [{ session_id: 'session-a', subject: 'answer-a', blocks: ['persona-identity-core'], polarity: 'up' }],
    };
    try {
      core.writeMemory(db, 'shinon.scoring/ledger-v1', learned);
      const loaded = core.readMemory(db, 'shinon.scoring/ledger-v1');
      assert.deepEqual(loaded.blockWeights, learned.blockWeights);
      assert.deepEqual(loaded.blockAttributions, learned.blockAttributions);

      core.writeMemory(db, 'shinon.scoring/legacy', { records: [], memos: [] });
      const legacy = core.readMemory(db, 'shinon.scoring/legacy');
      assert.deepEqual(legacy.blockWeights, {}, 'alte Summary-Zeilen liefern einen leeren Standard');
      assert.deepEqual(legacy.blockAttributions, [], 'alte Stände bleiben lesbar');
    } finally {
      db.close();
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
