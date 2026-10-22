import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a32, randInt, streamFor, weightedPick } from '../assets/zufall.js';
import { GROWTH_BPS, LEVEL_CAP, levelFor, statAt, statsAt, threshold } from '../assets/leiter.js';
import { SPECIES } from '../assets/katalog.js';
import { SnapshotSchema } from '../assets/snapshot-schema.js';
import {
  BXP_CHILD, BXP_FOUNDER, HATCH_GAIN, PAIR_GAIN, bxpModBps, effectiveStat, genMods,
} from '../assets/zucht-xp.js';
import { POOLS, childGen, luckFactorBps, poolFor, rollBonuses, slotChanceBps, validatePools } from '../assets/zucht-glueck.js';
import { BP_PER_COMPLETION, HATCH_BP, childSpeciesCandidates, successorsOf, lootWeights, onCompletions, pair, hatchReady } from '../assets/zucht.js';
import { migrateToV3, legacyLevelFor } from '../assets/migration.js';

const lineage = {
  nullpointer: { ancestor: null },
  stackoverflow: { ancestor: null },
  racecondition: { ancestor: 'nullpointer' },
  deadlock: { ancestor: 'stackoverflow' },
  recursion: { ancestor: 'deadlock' },
};

const state = () => ({
  schemaVersion: 3, seed: 2718281828, nextId: 3, active: 'c1',
  creatures: [
    { id: 'c1', species: 'nullpointer', xp: 0, bxp: 50, gen: 1, bonuses: [], clutch: 0, wins: 0, losses: 0, round: 0, hits: 0, damageTotal: '0' },
    { id: 'c2', species: 'stackoverflow', xp: 0, bxp: 70, gen: 1, bonuses: [], clutch: 0, wins: 0, losses: 0, round: 0, hits: 0, damageTotal: '0' },
  ],
  eggs: [], completions: 0, loot: { schrott: 0, brauchbar: 8, shiny: 0 }, wild: null,
});

describe('CodingMon deterministic stream', () => {
  test('FNV-1a vectors and keyed streams repeat exactly', () => {
    assert.equal(fnv1a32(''), 0x811c9dc5);
    assert.equal(fnv1a32('hello'), 0x4f9f2cab);
    const first = streamFor('fixture');
    const second = streamFor('fixture');
    assert.deepEqual(Array.from({ length: 8 }, first), Array.from({ length: 8 }, second));
  });
  test('rejects invalid integer and weighted-selection inputs', () => {
    assert.throws(() => randInt(() => 0, 0), /Grenze/);
    assert.throws(() => weightedPick(() => 0, []), /leere/);
    assert.throws(() => weightedPick(() => 0, [{ weight: 0 }]), /positive/);
  });
});

describe('Stufen und Zucht-Erfahrung', () => {
  test('uses quadratic XP and caps the linear stat curve at level 50', () => {
    assert.equal(LEVEL_CAP, 50);
    assert.equal(GROWTH_BPS, 1200);
    assert.equal(threshold(2), 250);
    assert.equal(threshold(5), 2500);
    assert.equal(threshold(10), 11250);
    assert.equal(threshold(50), 306250);
    assert.equal(levelFor(306250), 50);
    assert.equal(levelFor(1e9), 50);
    assert.ok(statAt(44, 50) / statAt(44, 1) <= 8);
    assert.throws(() => levelFor(-1), /XP/);
  });
  test('ZE, bonus whitelist, caps and effective stats are enforced', () => {
    assert.equal(BXP_FOUNDER, 50);
    assert.equal(BXP_CHILD, 0);
    assert.equal(bxpModBps(0), -2000);
    assert.equal(bxpModBps(125), 3000);
    assert.throws(() => genMods([{ slot: 0, id: 'x', effect: 'attackSlot', value: 1 }]), /Zuchtbonus/);
    assert.equal(genMods([{ slot: 0, id: 'a', effect: 'statMod', value: 99999 }]).statMod, 1500);
    assert.equal(effectiveStat(44, { xp: 0, bxp: 50, bonuses: [] }), 44);
    assert.equal(PAIR_GAIN, 10);
    assert.equal(HATCH_GAIN, 20);
  });
});

describe('Pool, Glück und Paarungsregeln', () => {
  test('validates the three cycle pools and deterministic bonus snapshots', () => {
    assert.equal(validatePools(POOLS), POOLS);
    assert.equal(poolFor(1), null);
    assert.equal(poolFor(2).baseChanceBps, 1500);
    assert.equal(poolFor(7).scale, 10000);
    assert.equal(poolFor(8).scale, 10200);
    assert.equal(luckFactorBps(50, 50), 10000);
    assert.equal(luckFactorBps(100, 100), 15000);
    assert.equal(luckFactorBps(200, 200), 25000);
    assert.equal(slotChanceBps(1500, 25000), 3750);
    assert.deepEqual(rollBonuses({ seed: 9, eggId: 'e7', gen: 2, bxpA: 80, bxpB: 90 }), rollBonuses({ seed: 9, eggId: 'e7', gen: 2, bxpA: 80, bxpB: 90 }));
    assert.throws(() => validatePools({ ...POOLS, cycle: [{ slots: 1, baseChanceBps: 2, entries: [{ id: 'bad', effect: 'attackSlot', value: 1, weight: 1 }] }] }), /ungültiger Bonus/);
    assert.equal(childGen({ gen: 2 }, { gen: 4 }), 5);
  });

  test('stellt bei Verzweigungen ALLE direkten Nachkommen als D48-Kandidaten bereit', () => {
    const a = { id: 'c1', species: 'nullpointer', bxp: 60, gen: 1, clutch: 0 };
    const b = { id: 'c2', species: 'stackoverflow', bxp: 80, gen: 1, clutch: 0 };
    assert.deepEqual(successorsOf('nullpointer', Object.fromEntries(Object.entries(
      { ...lineage, nullprism: { ancestor: 'nullpointer' }, stackwisp: { ancestor: 'stackoverflow' } }
    ))), ['nullprism', 'racecondition']);
    const catalogLineage = {
      ...lineage,
      nullprism: { ancestor: 'nullpointer' },
      stackwisp: { ancestor: 'stackoverflow' },
    };
    const candidates = childSpeciesCandidates(a, b, catalogLineage);
    assert.deepEqual(candidates.map((candidate) => candidate.species), [
      'deadlock', 'nullprism', 'racecondition', 'stackwisp',
    ]);
    assert.throws(() => pair(state(), 'c1', 'c2', {
      lineage: catalogLineage,
      selectedSpecies: 'not-a-child',
    }), /kein gültiger Kandidat/);
  });

  test('requires a visible choice when both lineages offer different children', () => {
    const s = state();
    const candidates = childSpeciesCandidates(s.creatures[0], s.creatures[1], lineage);
    assert.deepEqual(candidates.map((item) => item.species), ['deadlock', 'racecondition']);
    assert.throws(() => pair(s, 'c1', 'c2', { lineage }), /ausdrücklich ausgewählt/);
    assert.equal(s.loot.brauchbar, 8);
    assert.equal(s.creatures[0].bxp, 50);
    const eggId = pair(s, 'c1', 'c2', { lineage, selectedSpecies: 'racecondition' });
    assert.equal(eggId, 'e3');
    assert.equal(s.loot.brauchbar, 7);
    assert.equal(s.creatures[0].bxp, 60);
    assert.equal(s.creatures[1].bxp, 80);
    assert.deepEqual(s.eggs[0].parents, ['c1', 'c2']);
    assert.equal(s.eggs[0].species, 'racecondition');
    assert.equal(s.eggs[0].gen, 2);
    assert.equal(s.creatures[0].clutch, 1);
    const before = JSON.stringify(s);
    assert.throws(() => pair(s, 'c1', 'c1', { lineage }), /verschiedene/);
    assert.equal(JSON.stringify(s), before);
  });
});

describe('Brut, Schlupf und Loot', () => {
  test('each completion feeds all eggs; hatch ordering is stable and parents gain ZE', () => {
    const s = state();
    pair(s, 'c1', 'c2', { lineage, selectedSpecies: 'racecondition' });
    assert.equal(BP_PER_COMPLETION, 10);
    const initialBp = s.eggs[0].bp;
    const beforeHatch = Math.ceil((HATCH_BP - initialBp) / BP_PER_COMPLETION) - 1;
    assert.equal(onCompletions(s, beforeHatch), beforeHatch);
    assert.equal(s.eggs[0].bp, initialBp + beforeHatch * BP_PER_COMPLETION);
    assert.equal(onCompletions(s, beforeHatch), 0, 'wiederholter Snapshot ist idempotent');
    assert.equal(s.eggs[0].bp, initialBp + beforeHatch * BP_PER_COMPLETION);
    assert.deepEqual(hatchReady(s), []);
    assert.equal(onCompletions(s, beforeHatch + 1), 1);
    assert.ok(s.eggs[0].bp >= HATCH_BP);
    assert.deepEqual(hatchReady(s), ['e3']);
    assert.equal(s.eggs.length, 0);
    assert.equal(s.creatures.length, 3);
    assert.equal(s.creatures[0].bxp, 80);
    assert.equal(s.creatures[1].bxp, 100);
    assert.equal(s.creatures[2].bxp, 0);
    assert.equal(s.creatures[2].gen, 2);
    assert.equal(s.creatures[2].species, 'racecondition');
    assert.equal(s.creatures[2].hp, statsAt(SPECIES.racecondition, 1).hp);
    assert.ok(s.creatures[2].bonuses.every((bonus) => ['statMod', 'hatchPoints', 'lootLuck'].includes(bonus.effect)));
    assert.equal(s.nextId, 5);
    assert.equal(s.completions, beforeHatch + 1);
  });
  test('a hatched pet passes the v3 snapshot contract', () => {
    const breeding = state();
    breeding.creatures[0].hp = 20;
    breeding.creatures[1].hp = 20;
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
  test('loot luck scales useful drops but leaves scrap unchanged', () => {
    const base = [{ id: 'schrott', weight: 8500 }, { id: 'brauchbar', weight: 1400 }, { id: 'shiny', weight: 100 }];
    const weighted = lootWeights(base, { bonuses: [{ slot: 0, id: 'nose', effect: 'lootLuck', value: 5000 }] });
    assert.deepEqual(weighted.map((item) => item.weight), [8500, 2100, 150]);
  });
});

describe('Migration v2 to v3', () => {
  test('preserves actual counters, maps level into ZE and is idempotent', () => {
    const old = { schemaVersion: 2, species: 'nullpointer', xp: 2500, wins: 4, losses: 2, round: 17, hits: 9, damageTotal: '1234', completions: 8, loot: { schrott: 3, brauchbar: 2, shiny: 0 }, wild: null };
    const migrated = migrateToV3(old);
    assert.equal(migrated.schemaVersion, 3);
    assert.equal(migrated.creatures[0].species, 'nullpointer');
    assert.equal(migrated.creatures[0].xp, 2500);
    assert.equal(migrated.creatures[0].bxp, 50 + Math.min(150, 10 * Math.max(0, legacyLevelFor(2500) - 50)));
    assert.equal(migrated.creatures[0].damageTotal, '1234');
    assert.equal(migrated.completions, 8);
    assert.equal(migrated.loot.brauchbar, 2);
    assert.deepEqual(migrateToV3(migrated), migrated);
  });
});
