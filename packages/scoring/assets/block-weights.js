/**
 * @shinon/scoring — Block-Gewichte (assets/block-weights.js).
 *
 * KEINE Imports (weder Bare noch node:): nur dann läuft der Test in CI ohne
 * node_modules — dieselbe Regel wie `scoring-core.js` und `note-core.js`.
 * Der Host (`index.js`) besitzt den Zustand, dieser Kern die Rechnung.
 *
 * WAS HIER STEHT: aus den vorhandenen Signalen Erfolgszähler je Baustein.
 * → Kanon: docs/COMMENT-KANON.md#k-dbfe85cfd222
 */

/** Die vierte Naht (Phase 3): schmaler Dienst, eine Operation `read`. */
export const WEIGHTS_SERVICE = 'shinon_block_weights';
export const WEIGHTS_CONTRACT = 'shinon.block-weights/read-v1';

/** Vertragsname des Gewichtsanteils im Ledger-Snapshot. */
export const WEIGHTS_SNAPSHOT_CONTRACT = 'shinon.block-weights/v1';

/** Wie viele Zuordnungen höchstens überdauern — darüber fällt die älteste weg. */
export const MAX_ATTRIBUTIONS = 200;

/** Wie viele Baustein-Ids eine Zuordnung höchstens trägt. */
export const MAX_BLOCKS_PER_ATTRIBUTION = 30;

/** Polarität je Signal — die Tabelle, keine Ableitung. */
const POLARITY = {
  copy: 'up',
  accept: 'up',
  selffix: 'down',
  rephrase: 'down',
  dismiss: 'down',
};

/** Die Polarität eines Signals — oder null (kein Pol, kein Raten). */
export function polarityOf(signal) {
  return typeof signal === 'string' && Object.hasOwn(POLARITY, signal) ? POLARITY[signal] : null;
}

/** Ein Objekt, kein Array, kein null. */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Gültige Baustein-Ids: nicht-leere Strings, entdoppelt, gedeckelt. */
export function cleanBlockIds(blocks) {
  if (!Array.isArray(blocks)) return [];
  const seen = new Set();
  const clean = [];
  for (const id of blocks) {
    if (typeof id !== 'string' || id === '') continue;
    if (seen.has(id)) continue;
    seen.add(id);
    clean.push(id);
    if (clean.length >= MAX_BLOCKS_PER_ATTRIBUTION) break;
  }
  return clean;
}

/** Leere Gewichte — der ehrliche Anfang statt eines geratenen. */
export function emptyWeights() {
  return {};
}

/**
 * Gewichte aus der Ablage übernehmen — nur die Form wird geprüft, nie geraten.
 * @returns { weights, dropped } — Unlesbares fällt weg und wird gezählt.
 */
export function validateWeights(raw) {
  if (!isRecord(raw)) return { weights: {}, dropped: 0 };
  const weights = {};
  let dropped = 0;
  for (const [id, entry] of Object.entries(raw)) {
    if (typeof id !== 'string' || id === '' || !isRecord(entry)) {
      dropped += 1;
      continue;
    }
    const up = entry.up;
    const down = entry.down;
    if (!Number.isInteger(up) || up < 0 || !Number.isInteger(down) || down < 0) {
      dropped += 1;
      continue;
    }
    if (up === 0 && down === 0) continue;
    weights[id] = { up, down };
  }
  return { weights, dropped };
}

/** Eine Zuordnung prüfen — Sitzung + Betreff + Ids + Polarität, sonst nichts. */
export function validateAttribution(entry) {
  if (!isRecord(entry)) return null;
  if (typeof entry.session_id !== 'string' || typeof entry.subject !== 'string') return null;
  if (entry.subject === '') return null;
  const blocks = cleanBlockIds(entry.blocks);
  if (blocks.length === 0) return null;
  if (entry.polarity !== 'up' && entry.polarity !== 'down') return null;
  return { session_id: entry.session_id, subject: entry.subject, blocks, polarity: entry.polarity };
}

/**
 * Eine Wertung auf die Zähler legen — rein, ohne Deckel, ohne Uhr.
 * Ersetzt nichts: wer zweimal wertet, zählt zweimal (der Aufrufer kehrt
 * vorher um — siehe `reverseAttribution`).
 */
export function applyAttribution(weights, blockIds, polarity) {
  const next = { ...weights };
  if (polarity !== 'up' && polarity !== 'down') return next;
  for (const id of cleanBlockIds(blockIds)) {
    const entry = isRecord(next[id]) ? next[id] : { up: 0, down: 0 };
    const up = Number.isInteger(entry.up) && entry.up >= 0 ? entry.up : 0;
    const down = Number.isInteger(entry.down) && entry.down >= 0 ? entry.down : 0;
    next[id] = polarity === 'up' ? { up: up + 1, down } : { up, down: down + 1 };
  }
  return next;
}

/**
 * Eine Wertung exakt zurücknehmen (Widerruf-Symmetrie zum Protokoll).
 * Zähler fallen nie unter null; ein leerer Eintrag verschwindet, statt als
 * Null-Zeile zu überdauern.
 */
export function reverseAttribution(weights, attribution) {
  const valid = validateAttribution(attribution);
  if (valid === null) return { ...weights };
  const next = { ...weights };
  for (const id of valid.blocks) {
    const entry = isRecord(next[id]) ? next[id] : null;
    if (entry === null) continue;
    const up = valid.polarity === 'up' ? Math.max(0, (entry.up ?? 0) - 1) : (entry.up ?? 0);
    const down = valid.polarity === 'down' ? Math.max(0, (entry.down ?? 0) - 1) : (entry.down ?? 0);
    if (up === 0 && down === 0) delete next[id];
    else next[id] = { up, down };
  }
  return next;
}

/** Der Rang eines Bausteins — 0 für unbekannt (kein Raten). */
export function rankScore(weights, id) {
  const entry = isRecord(weights) ? weights[id] : null;
  if (!isRecord(entry)) return 0;
  const up = Number.isInteger(entry.up) && entry.up >= 0 ? entry.up : 0;
  const down = Number.isInteger(entry.down) && entry.down >= 0 ? entry.down : 0;
  return up - down;
}

/** Leere Gewichte lesen sich als null — wie der Ton: nichts zu sagen. */
export function readWeights(weights) {
  if (!isRecord(weights)) return null;
  return Object.keys(weights).length > 0 ? { ...weights } : null;
}
