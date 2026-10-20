/**
 * Fakten-Kern (Wissens-Runtime, Zug 1): Lebenszyklus, Klassen, kanonische
 * Kennung, Zeigerform und Zyklenpruefung. Rein und importfrei — der Test laeuft
 * ohne node_modules, und der Store (`facts-store.js`) ist die einzige Stelle,
 * die schreibt.
 *
 * Regeln, die hier gelten und getestet werden:
 *  - Das LLM setzt nie `status`. Ein Uebergang braucht einen Laufzeit-Akteur
 *    aus ACTORS; `model` ist nicht darunter und wird abgelehnt.
 *  - Eine Klasse (`kind`) wird nie umgeschrieben. Nur from === to ist erlaubt
 *    (Erbe des `canPromote`-Musters aus provenance.js).
 *  - Terminale Zustaende (SUPERSEDED, REJECTED) verlassen sich nie.
 *  - Abhaengigkeiten duerfen keinen Zyklus schliessen.
 *  - Die Kennung ist ein Hash aus scope/subject/predicate/value, nie aus dem
 *    Zeitpunkt, damit gleiche Aussagen gleich heissen.
 */

export const FACTS_CONTRACT = 'shinon.facts/v1';

export const KINDS = Object.freeze(['FACT', 'DERIVED', 'DECISION', 'PROPOSAL', 'CONFLICT']);

export const STATUSES = Object.freeze([
  'DISCOVERED',
  'EXTRACTED',
  'VALIDATING',
  'VALID',
  'STALE',
  'DISPUTED',
  'SUPERSEDED',
  'REJECTED',
]);

export const ACTORS = Object.freeze(['extractor', 'validator', 'invalidator', 'reconciler']);

// Erlaubte Uebergaenge. Jeder andere Paar ist verboten. Die Tabelle ist die
// einzige Wahrheit; der Test zaehlt sie gegen die Zahl aller 64 Paare.
const TRANSITIONS = Object.freeze({
  DISCOVERED: ['EXTRACTED', 'REJECTED'],
  EXTRACTED: ['VALIDATING', 'REJECTED'],
  VALIDATING: ['VALID', 'DISPUTED', 'REJECTED'],
  VALID: ['STALE', 'DISPUTED', 'SUPERSEDED'],
  STALE: ['VALIDATING', 'SUPERSEDED', 'REJECTED'],
  DISPUTED: ['VALIDATING', 'SUPERSEDED', 'REJECTED'],
  SUPERSEDED: [],
  REJECTED: [],
});

export const TERMINAL = Object.freeze(['SUPERSEDED', 'REJECTED']);

/**
 * Prueft einen Statusuebergang. Gibt { ok, reason } zurueck — nie einen Wurf,
 * damit der Aufrufer den Grund in den Befund schreiben kann.
 */
export function canTransition(from, to, actor) {
  if (!STATUSES.includes(from) || !STATUSES.includes(to)) {
    return { ok: false, reason: 'STATUS_UNBEKANNT' };
  }
  if (!ACTORS.includes(actor)) {
    return { ok: false, reason: 'AKTEUR_VERBOTEN' };
  }
  if (TERMINAL.includes(from)) {
    return { ok: false, reason: 'TERMINAL' };
  }
  if (!TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: 'UEBERGANG_VERBOTEN' };
  }
  return { ok: true, reason: '' };
}

/** Eine Klasse bleibt unveraendert. Jeder Wechsel ist ein Befund. */
export function canReclassify(from, to) {
  if (!KINDS.includes(from) || !KINDS.includes(to)) {
    return { ok: false, reason: 'KLASSE_UNBEKANNT' };
  }
  return from === to ? { ok: true, reason: '' } : { ok: false, reason: 'KLASSE_WECHSEL_VERBOTEN' };
}

// FNV-1a, zweimal mit verschiedenem Startwert: 64 Bit, reine Funktion,
// ohne Bare-Import. Kollisionen sind bei Projektgroesse vernachlaessigbar,
// und der Store prueft die Eindeutigkeit ohnehin per Primaerschluessel.
function fnv1a(text, seed) {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Kanonische Kennung. Feldreihenfolge ist fest; Objektschluessel sind egal. */
export function factId({ scope, subject, predicate, value }) {
  const canonical = JSON.stringify([String(scope), String(subject), String(predicate), String(value)]);
  return `f_${fnv1a(canonical, 0x811c9dc5)}${fnv1a(canonical, 0x2166136b)}`;
}

/**
 * Zeigerform (wie provenance.parsePointer, aber ohne Dateisystem): relativ,
 * ohne `..`, ohne Backslash, ohne Laufwerk, optional `:Zeile` mit Zeile >= 1.
 */
export function parsePointer(pointer) {
  if (typeof pointer !== 'string' || pointer.trim() === '') return { ok: false, reason: 'ZEIGER_LEER' };
  if (pointer.includes('\\')) return { ok: false, reason: 'ZEIGER_FORM' };
  if (/^[A-Za-z]:/.test(pointer)) return { ok: false, reason: 'ZEIGER_FORM' };
  if (pointer.startsWith('/')) return { ok: false, reason: 'ZEIGER_ABSOLUT' };
  const match = /^(.*?)(?::(\d+))?$/.exec(pointer);
  const path = match[1];
  if (path === '' || path.endsWith('/')) return { ok: false, reason: 'ZEIGER_FORM' };
  if (path.split('/').includes('..')) return { ok: false, reason: 'ZEIGER_AUSBRUCH' };
  if (match[2] !== undefined && Number(match[2]) < 1) return { ok: false, reason: 'ZEIGER_ZEILE' };
  return { ok: true, reason: '' };
}

/**
 * Prueft eine Fakt-Form. Gibt eine Liste von Befunden zurueck (leer = gueltig).
 * Der Status eines neuen Fakts ist fest DISCOVERED — ein Einstieg in der Mitte
 * des Lebenszyklus waere eine Behauptung ohne Herkunft.
 */
export function checkFact(fact) {
  const issues = [];
  if (typeof fact !== 'object' || fact === null) return ['KEIN_OBJEKT'];
  for (const field of ['scope', 'subject', 'predicate']) {
    if (typeof fact[field] !== 'string' || fact[field].trim() === '') issues.push(`FELD_LEER:${field}`);
  }
  if (typeof fact.value !== 'string') issues.push('FELD_KEIN_TEXT:value');
  if (!KINDS.includes(fact.kind)) issues.push('KLASSE_UNBEKANNT');
  if (fact.status !== 'DISCOVERED') issues.push('EINSTIEG_NICHT_DISCOVERED');
  if (!Array.isArray(fact.sources) || fact.sources.length === 0) {
    issues.push('QUELLE_FEHLT');
  } else {
    for (const source of fact.sources) {
      const parsed = parsePointer(source?.pointer);
      if (!parsed.ok) issues.push(`QUELLE_${parsed.reason}`);
      if (typeof source?.rev !== 'string' || source.rev.trim() === '') issues.push('QUELLE_OHNE_REVISION');
    }
  }
  if (issues.length === 0 && fact.id !== undefined && fact.id !== factId(fact)) issues.push('KENNUNG_FALSCH');
  return issues;
}

/**
 * Wuerde `from` von `to` abhaengen, schliesst sich ein Zyklus? `edges` ist eine
 * Map id -> Array der Ids, von denen die Id abhaengt.
 */
export function wouldCreateCycle(edges, from, to) {
  if (from === to) return true;
  const seen = new Set();
  const stack = [to];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === from) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of edges.get(current) ?? []) stack.push(next);
  }
  return false;
}
