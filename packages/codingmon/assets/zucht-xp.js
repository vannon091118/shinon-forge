import { levelFor, statAt } from './leiter.js';

export const BXP_FOUNDER = 50;
export const BXP_CHILD = 0;
export const BXP_NEUTRAL = 50;
export const BXP_BPS_PER_POINT = 40;
export const MOD_CAP_BPS = 3000;
export const GEN_STATMOD_CAP_BPS = 1500;
export const LOOTLUCK_CAP_BPS = 5000;
export const PAIR_GAIN = 10;
export const HATCH_GAIN = 20;
export const BONUS_EFFECTS = new Set(['statMod', 'hatchPoints', 'lootLuck']);

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function bxpModBps(bxp) {
  if (!Number.isSafeInteger(bxp) || bxp < 0) throw new RangeError('ZE muss eine nichtnegative Ganzzahl sein');
  return clamp((bxp - BXP_NEUTRAL) * BXP_BPS_PER_POINT, -MOD_CAP_BPS, MOD_CAP_BPS);
}

export function validateBonuses(bonuses) {
  if (!Array.isArray(bonuses)) throw new TypeError('Boni müssen eine Liste sein');
  for (const bonus of bonuses) {
    if (!Number.isSafeInteger(bonus?.slot) || bonus.slot < 0
      || typeof bonus.id !== 'string' || bonus.id.length === 0
      || !BONUS_EFFECTS.has(bonus.effect)
      || !Number.isSafeInteger(bonus.value) || bonus.value < 0) {
      throw new Error('Ungültiger oder nicht erlaubter Zuchtbonus');
    }
  }
  return bonuses;
}

export function genMods(bonuses = []) {
  validateBonuses(bonuses);
  const sum = (effect) => bonuses.filter((bonus) => bonus.effect === effect).reduce((total, bonus) => total + bonus.value, 0);
  return {
    statMod: clamp(sum('statMod'), 0, GEN_STATMOD_CAP_BPS),
    lootLuck: clamp(sum('lootLuck'), 0, LOOTLUCK_CAP_BPS),
    hatchPoints: sum('hatchPoints'),
  };
}

export const creatureLevel = (creature) => levelFor(creature.xp);

export function effectiveStat(base, creature) {
  const { statMod } = genMods(creature.bonuses);
  const combined = clamp(bxpModBps(creature.bxp) + statMod, -MOD_CAP_BPS, MOD_CAP_BPS);
  return Math.floor((statAt(base, creatureLevel(creature)) * (10000 + combined)) / 10000);
}

export function effectiveStats(species, creature) {
  const base = species?.stats ?? species;
  return Object.fromEntries(['hp', 'atk', 'def', 'agi', 'int'].map((key) => [
    key, effectiveStat(base[key], creature),
  ]));
}
