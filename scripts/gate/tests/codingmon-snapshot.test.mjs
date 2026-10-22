/**
 * The hatch result must satisfy the shipped client-to-host snapshot contract.
 * This crosses the pure breeding core with its Zod runtime schema, so it belongs
 * in the dependency-backed gate tier rather than the no-node_modules unit tier.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotSchema } from '../../../packages/codingmon/assets/snapshot-schema.js';
import { HATCH_BP, hatchReady, pair } from '../../../packages/codingmon/assets/zucht.js';

const lineage = {
  nullpointer: { ancestor: null },
  stackoverflow: { ancestor: null },
  racecondition: { ancestor: 'nullpointer' },
  deadlock: { ancestor: 'stackoverflow' },
  recursion: { ancestor: 'deadlock' },
};

test('ein geschluepftes Pet erfuellt den v3 Snapshot-Vertrag', () => {
  const breeding = {
    schemaVersion: 3, seed: 2718281828, nextId: 3, active: 'c1',
    creatures: [
      { id: 'c1', species: 'nullpointer', xp: 0, bxp: 50, gen: 1, bonuses: [], clutch: 0, wins: 0, losses: 0, round: 0, hits: 0, damageTotal: '0', hp: 20 },
      { id: 'c2', species: 'stackoverflow', xp: 0, bxp: 70, gen: 1, bonuses: [], clutch: 0, wins: 0, losses: 0, round: 0, hits: 0, damageTotal: '0', hp: 20 },
    ],
    eggs: [], completions: 0, loot: { schrott: 0, brauchbar: 8, shiny: 0 }, wild: null,
  };
  pair(breeding, 'c1', 'c2', { lineage, selectedSpecies: 'racecondition' });
  breeding.eggs[0].bp = HATCH_BP;
  hatchReady(breeding);

  const snapshot = SnapshotSchema.safeParse({
    schemaVersion: 3, species: 'nullpointer', xp: 0, wins: 0, losses: 0,
    round: 0, damageTotal: '0', hits: 0,
    loot: { schrott: 0, brauchbar: 0, shiny: 0 }, breeding,
  });
  assert.equal(snapshot.success, true, JSON.stringify(snapshot.success ? {} : snapshot.error.issues));
});
