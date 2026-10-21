import { BXP_FOUNDER } from './zucht-xp.js';
import { fnv1a32 } from './zufall.js';
import { LEVEL_CAP, levelFor, statAt } from './leiter.js';

const LEGACY = { factor: 1.35, xpBase: 250, cap: 2000 };
const legacyThreshold = (level) => Math.round((LEGACY.xpBase * (Math.pow(LEGACY.factor, level - 1) - 1)) / (LEGACY.factor - 1));

export function legacyLevelFor(xp) {
  if (!Number.isFinite(xp) || xp < 0) throw new RangeError('Alt-XP muss endlich und nicht negativ sein');
  let level = 1;
  while (level < LEGACY.cap && legacyThreshold(level + 1) <= xp) level += 1;
  return level;
}

const nonNegativeInteger = (value, fallback = 0) => Number.isSafeInteger(value) && value >= 0 ? value : fallback;
const decimalText = (value) => /^\d+$/.test(String(value ?? '')) ? String(value) : '0';

function migrateWild(wild, speciesCatalog) {
  if (!wild || typeof wild !== 'object') return null;
  const ids = Object.keys(speciesCatalog ?? {});
  const speciesId = speciesCatalog?.[wild.speciesId] ? wild.speciesId : (ids[0] ?? null);
  if (!speciesId) return null;
  const level = Math.min(LEVEL_CAP, Math.max(1, nonNegativeInteger(wild.level, 1)));
  const base = speciesCatalog[speciesId].stats ?? speciesCatalog[speciesId];
  const maxHp = statAt(base.hp, level);
  const oldMaxHp = Number.isFinite(wild.maxHp) && wild.maxHp > 0 ? wild.maxHp : maxHp;
  const oldHp = Number.isFinite(wild.hp) ? Math.max(0, wild.hp) : oldMaxHp;
  return {
    speciesId, level, hp: Math.min(maxHp, Math.round((oldHp / oldMaxHp) * maxHp)), maxHp,
    gen: 1, bxp: BXP_FOUNDER, bonuses: [],
  };
}

export function migrateToV3(old, { speciesCatalog = {} } = {}) {
  if (!old || typeof old !== 'object') throw new TypeError('Migration erwartet einen Spielstand');
  const version = old.schemaVersion ?? 2;
  if (version === 3) return old;
  if (version !== 2) throw new Error(`Unbekannte CodingMon-Fassung ${version}`);
  if (typeof old.species !== 'string' || old.species.length === 0) throw new Error('Altstand hat keine Spezies');
  const catalogIds = Object.keys(speciesCatalog);
  const species = catalogIds.length && !speciesCatalog[old.species] ? catalogIds[0] : old.species;
  const oldLevel = legacyLevelFor(old.xp);
  const bxp = BXP_FOUNDER + Math.min(150, 10 * Math.max(0, oldLevel - 50));
  const seed = fnv1a32(`codingmon-seed|${old.xp}|${nonNegativeInteger(old.wins)}|${nonNegativeInteger(old.losses)}|${nonNegativeInteger(old.completions)}`);
  const maxHp = statAt(speciesCatalog[species]?.stats?.hp ?? speciesCatalog[species]?.hp ?? 1,
    Math.min(LEVEL_CAP, Math.max(1, levelFor(old.xp))));
  const creature = {
    id: 'c1', species, xp: old.xp, bxp, gen: 1, bonuses: [], clutch: 0,
    wins: nonNegativeInteger(old.wins), losses: nonNegativeInteger(old.losses),
    round: nonNegativeInteger(old.round), hits: nonNegativeInteger(old.hits),
    damageTotal: decimalText(old.damageTotal), hp: maxHp,
  };
  return {
    schemaVersion: 3, seed, nextId: 2, active: 'c1', creatures: [creature], eggs: [],
    completions: nonNegativeInteger(old.completions), loot: {
      schrott: nonNegativeInteger(old.loot?.schrott),
      brauchbar: nonNegativeInteger(old.loot?.brauchbar),
      shiny: nonNegativeInteger(old.loot?.shiny),
    },
    wild: migrateWild(old.wild, speciesCatalog),
  };
}

export { LEVEL_CAP, levelFor };
