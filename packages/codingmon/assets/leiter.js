export const XP_BASE = 250;
export const LEVEL_CAP = 50;
export const GROWTH_BPS = 1200;

const cappedLevel = (level) => {
  if (!Number.isFinite(level)) throw new TypeError('level muss endlich sein');
  return Math.min(LEVEL_CAP, Math.max(1, Math.floor(level)));
};

export function threshold(level, xpBase = XP_BASE) {
  if (!Number.isSafeInteger(xpBase) || xpBase < 1) throw new RangeError('xpBase muss positiv sein');
  const current = cappedLevel(level);
  return (xpBase * (current - 1) * current) / 2;
}

export function levelFor(xp, xpBase = XP_BASE) {
  if (!Number.isFinite(xp) || xp < 0) throw new RangeError('XP muss endlich und nicht negativ sein');
  let level = 1;
  while (level < LEVEL_CAP && threshold(level + 1, xpBase) <= xp) level += 1;
  return level;
}

export function statAt(base, level) {
  if (!Number.isFinite(base) || base < 0) throw new RangeError('Basiswert muss endlich und nicht negativ sein');
  return Math.floor((base * (10000 + GROWTH_BPS * (cappedLevel(level) - 1))) / 10000);
}

export function statsAt(species, level) {
  const stats = species?.stats ?? species;
  if (!stats || !['hp', 'atk', 'def', 'agi', 'int'].every((key) => Number.isFinite(stats[key]) && stats[key] >= 0)) {
    throw new TypeError('statsAt: ungültige Basiswerte');
  }
  return Object.fromEntries(['hp', 'atk', 'def', 'agi', 'int'].map((key) => [key, statAt(stats[key], level)]));
}
