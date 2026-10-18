const UINT32_RANGE = 0x100000000;

function sfc32(a, b, c, d) {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return r >>> 0;
  };
}

export function fnv1a32(text) {
  if (typeof text !== 'string') throw new TypeError('fnv1a32: Schlüssel muss Text sein');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function streamFor(key) {
  const h = fnv1a32(key);
  const next = sfc32(h, h ^ 0x9e3779b9, h ^ 0x85ebca6b, h ^ 0xc2b2ae35);
  for (let i = 0; i < 12; i += 1) next();
  return next;
}

export function randInt(next, n) {
  if (typeof next !== 'function') throw new TypeError('randInt: Zufallsstrom fehlt');
  if (!Number.isSafeInteger(n) || n < 1 || n > UINT32_RANGE) {
    throw new RangeError('randInt: Grenze muss zwischen 1 und 2^32 liegen');
  }
  const limit = Math.floor(UINT32_RANGE / n) * n;
  for (;;) {
    const value = next();
    if (!Number.isInteger(value) || value < 0 || value >= UINT32_RANGE) {
      throw new TypeError('randInt: Zufallsstrom muss uint32 liefern');
    }
    if (value < limit) return value % n;
  }
}

export function weightedPick(next, entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('weightedPick: leere oder ungültige Gewichte');
  }
  const total = entries.reduce((sum, entry) => {
    if (!Number.isSafeInteger(entry?.weight) || entry.weight <= 0) {
      throw new Error('weightedPick: jedes Gewicht muss eine positive Ganzzahl sein');
    }
    return sum + entry.weight;
  }, 0);
  if (!Number.isSafeInteger(total) || total > UINT32_RANGE) {
    throw new RangeError('weightedPick: Gewichtssumme außerhalb des uint32-Bereichs');
  }
  let cursor = randInt(next, total);
  for (const entry of entries) {
    if (cursor < entry.weight) return entry;
    cursor -= entry.weight;
  }
  throw new Error('weightedPick: Auswahl außerhalb der Gewichtssumme');
}
