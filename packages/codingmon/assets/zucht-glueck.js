import { fnv1a32, randInt, streamFor, weightedPick } from './zufall.js';
import { BXP_NEUTRAL, BONUS_EFFECTS } from './zucht-xp.js';

export const FACTOR_PER_POINT_BPS = 100;
export const FACTOR_MAX_BPS = 25000;
export const CHANCE_MAX_BPS = 6000;

export const POOLS = {
  cycle: [
    { slots: 2, baseChanceBps: 1500, entries: [
      { id: 'tune-a', effect: 'statMod', value: 300, weight: 3 },
      { id: 'warm-a', effect: 'hatchPoints', value: 10, weight: 2 },
      { id: 'nose-a', effect: 'lootLuck', value: 1000, weight: 2 },
    ]},
    { slots: 2, baseChanceBps: 1200, entries: [
      { id: 'tune-b', effect: 'statMod', value: 400, weight: 3 },
      { id: 'warm-b', effect: 'hatchPoints', value: 15, weight: 2 },
      { id: 'nose-b', effect: 'lootLuck', value: 1500, weight: 2 },
    ]},
    { slots: 2, baseChanceBps: 1000, entries: [
      { id: 'tune-c', effect: 'statMod', value: 500, weight: 2 },
      { id: 'warm-c', effect: 'hatchPoints', value: 20, weight: 1 },
      { id: 'nose-c', effect: 'lootLuck', value: 2000, weight: 2 },
    ]},
  ],
  scaleFromGen: 7,
  scaleStepBps: 200,
  scaleCapBps: 20000,
};

export function validatePools(pools) {
  if (!Array.isArray(pools?.cycle) || pools.cycle.length === 0) throw new Error('pools.cycle leer');
  if (!Number.isSafeInteger(pools.scaleFromGen) || pools.scaleFromGen < 2
    || !Number.isSafeInteger(pools.scaleStepBps) || pools.scaleStepBps < 0
    || !Number.isSafeInteger(pools.scaleCapBps) || pools.scaleCapBps < 10000) {
    throw new Error('Ungültige Pool-Skalierung');
  }
  for (const [index, pool] of pools.cycle.entries()) {
    if (!Number.isSafeInteger(pool.slots) || pool.slots < 1
      || !Number.isSafeInteger(pool.baseChanceBps) || pool.baseChanceBps < 0 || pool.baseChanceBps > CHANCE_MAX_BPS
      || !Array.isArray(pool.entries) || pool.entries.length === 0) throw new Error(`pool ${index}: ungültige Slots, Chance oder Einträge`);
    for (const entry of pool.entries) {
      if (typeof entry.id !== 'string' || entry.id.length === 0
        || !BONUS_EFFECTS.has(entry.effect)
        || !Number.isSafeInteger(entry.value) || entry.value < 0
        || !Number.isSafeInteger(entry.weight) || entry.weight <= 0) {
        throw new Error(`pool ${index}: ungültiger Bonus ${entry.id ?? '(ohne ID)'}`);
      }
    }
  }
  return pools;
}

export function poolFor(gen, pools = POOLS) {
  validatePools(pools);
  if (!Number.isSafeInteger(gen) || gen < 1) throw new RangeError('Generation muss positiv sein');
  if (gen < 2) return null;
  const base = pools.cycle[(gen - 2) % pools.cycle.length];
  const scale = gen < pools.scaleFromGen ? 10000
    : Math.min(pools.scaleCapBps, 10000 + (gen - pools.scaleFromGen) * pools.scaleStepBps);
  return { ...base, entries: base.entries.map((entry) => ({ ...entry })), scale };
}

export const childGen = (a, b) => {
  if (!Number.isSafeInteger(a?.gen) || a.gen < 1 || !Number.isSafeInteger(b?.gen) || b.gen < 1) {
    throw new RangeError('Elterngeneration muss positiv sein');
  }
  return Math.max(a.gen, b.gen) + 1;
};

export function luckFactorBps(bxpA, bxpB) {
  for (const [name, value] of [['A', bxpA], ['B', bxpB]]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`ZE von Elternteil ${name} ungültig`);
  }
  const average = Math.floor((bxpA + bxpB) / 2);
  return Math.min(FACTOR_MAX_BPS, 10000 + Math.max(0, average - BXP_NEUTRAL) * FACTOR_PER_POINT_BPS);
}

export const slotChanceBps = (baseBps, factorBps) => {
  if (!Number.isSafeInteger(baseBps) || baseBps < 0 || baseBps > CHANCE_MAX_BPS
    || !Number.isSafeInteger(factorBps) || factorBps < 0) throw new RangeError('Ungültige Glückchance');
  return Math.min(CHANCE_MAX_BPS, Math.floor((baseBps * factorBps) / 10000));
};

export function rollBonuses({ seed, eggId, gen, bxpA, bxpB, pools = POOLS }) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Seed muss uint32 sein');
  if (typeof eggId !== 'string' || !/^e[1-9]\d*$/.test(eggId)) throw new TypeError('Ei-ID ist ungültig');
  const pool = poolFor(gen, pools);
  if (pool === null) return [];
  const next = streamFor(`zucht.bonus|${seed}|${eggId}`);
  const chance = slotChanceBps(pool.baseChanceBps, luckFactorBps(bxpA, bxpB));
  const out = [];
  for (let slot = 0; slot < pool.slots; slot += 1) {
    if (randInt(next, 10000) >= chance) continue;
    const pick = weightedPick(next, pool.entries);
    out.push({ slot, id: pick.id, effect: pick.effect, value: Math.floor((pick.value * pool.scale) / 10000) });
  }
  return out;
}

export { fnv1a32 };
