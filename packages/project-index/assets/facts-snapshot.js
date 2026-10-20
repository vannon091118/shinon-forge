/**
 * Snapshot-Kompilator (Wissens-Runtime, Zug 3). Rein: kein Dateisystem, keine
 * Datenbank, keine Uhr. Aus Intent, Fähigkeiten, Fakten, Constraints und
 * Konflikten wird EIN deterministischer Snapshot.
 *
 * Drei Zusagen:
 *  - Nur `VALID` kommt in den Snapshot. `STALE`, `DISPUTED` und `REJECTED`
 *    stehen als Auslassung mit Grund daneben — eine stille Auswahl gibt es nicht.
 *  - Das Budget ist eine Guardrail: passt der Snapshot nicht, gibt es
 *    `BUDGET_UEBERSCHRITTEN` mit Soll und Ist, keine Kürzung.
 *  - Zwei Läufe mit denselben Eingaben ergeben denselben Hash, unabhängig von
 *    der Reihenfolge der Listen.
 */
import { factId } from './facts-core.js';

export const SNAPSHOT_CONTRACT = 'shinon.facts/snapshot-v1';
export const SNAPSHOT_VERSION = 1;
export const DEFAULT_BUDGET = Object.freeze({ maxFacts: 60, maxChars: 6000 });

function byText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedUnique(values) {
  return [...new Set(values)].sort(byText);
}

/**
 * Baut den Snapshot.
 *
 * Eingang:
 *   intent        { classification, text? }
 *   capabilities  [{ id, title }]
 *   facts         [{ id, scope, subject, predicate, value, status, kind, revisions? }]
 *   constraints   [{ key, text }]
 *   conflicts     [{ id, sources }]  — ungelöste Widersprüche, bleiben sichtbar
 *   budget        { maxFacts, maxChars }
 *
 * Rückgabe: { ok, snapshot, reason, omitted, required }
 */
export function compileSnapshot({ intent, capabilities = [], facts = [], constraints = [], conflicts = [], budget = DEFAULT_BUDGET } = {}) {
  const maxFacts = Number.isInteger(budget?.maxFacts) ? budget.maxFacts : DEFAULT_BUDGET.maxFacts;
  const maxChars = Number.isInteger(budget?.maxChars) ? budget.maxChars : DEFAULT_BUDGET.maxChars;

  const valid = [];
  const omitted = [];
  for (const fact of [...facts].sort((a, b) => byText(a.id, b.id))) {
    if (fact?.status === 'VALID') {
      valid.push({
        id: fact.id,
        scope: fact.scope,
        subject: fact.subject,
        predicate: fact.predicate,
        value: fact.value,
        kind: fact.kind,
        revisions: sortedUnique((fact.revisions ?? []).map(String)),
      });
    } else {
      omitted.push({ id: fact?.id ?? '', reason: `STATUS_${String(fact?.status ?? 'UNBEKANNT')}` });
    }
  }

  const snapshot = {
    contract: SNAPSHOT_CONTRACT,
    version: SNAPSHOT_VERSION,
    intent: {
      classification: String(intent?.classification ?? 'UNBEKANNT'),
    },
    capabilities: sortedUnique((capabilities ?? []).map((entry) => String(entry?.id ?? entry))).map((id) => ({ id })),
    facts: valid,
    constraints: [...(constraints ?? [])]
      .map((entry) => ({ key: String(entry?.key ?? ''), text: String(entry?.text ?? '') }))
      .filter((entry) => entry.key !== '' && entry.text !== '')
      .sort((a, b) => byText(a.key, b.key)),
    conflicts: [...(conflicts ?? [])]
      .map((entry) => ({ id: String(entry?.id ?? ''), sources: sortedUnique((entry?.sources ?? []).map(String)) }))
      .filter((entry) => entry.id !== '')
      .sort((a, b) => byText(a.id, b.id)),
    revisions: sortedUnique([
      ...facts.flatMap((fact) => (fact?.revisions ?? []).map(String)),
      ...constraints.flatMap((entry) => (entry?.revisions ?? []).map(String)),
    ]),
  };

  const chars = snapshot.facts.reduce((sum, fact) => sum + fact.value.length + 64, 0);
  if (snapshot.facts.length > maxFacts || chars > maxChars) {
    return {
      ok: false,
      snapshot: null,
      reason: 'BUDGET_UEBERSCHRITTEN',
      omitted,
      required: { facts: snapshot.facts.length, chars, maxFacts, maxChars },
    };
  }

  return { ok: true, snapshot: { ...snapshot, hash: snapshotHash(snapshot) }, reason: '', omitted, required: { facts: snapshot.facts.length, chars, maxFacts, maxChars } };
}

/** Der Hash des Snapshots: dieselben Eingaben, derselbe Wert, egal in welcher Reihenfolge. */
export function snapshotHash(snapshot) {
  return factId({
    scope: SNAPSHOT_CONTRACT,
    subject: snapshot.intent.classification,
    predicate: `v${SNAPSHOT_VERSION}`,
    value: JSON.stringify({
      capabilities: snapshot.capabilities.map((entry) => entry.id),
      facts: snapshot.facts.map((fact) => `${fact.id}:${fact.revisions.join(',')}`),
      constraints: snapshot.constraints.map((entry) => `${entry.key}=${entry.text}`),
      conflicts: snapshot.conflicts.map((entry) => entry.id),
      revisions: snapshot.revisions,
    }),
  });
}

/**
 * Der Cache-Schlüssel eines Laufs: Intent, Merkmale, Fakten-Ids mit ihren
 * Revisionen, Extraktor- und Regelversion. Ändert sich eine Revision, ändert
 * sich der Schlüssel — ein alter Treffer kann dann nicht mehr greifen.
 */
export function cacheKey({ intent, features = [], facts = [], extractorVersion = 1, rulesVersion = 1 }) {
  return factId({
    scope: 'snapshot-cache',
    subject: String(intent ?? 'UNBEKANNT'),
    predicate: `e${extractorVersion}-r${rulesVersion}`,
    value: JSON.stringify({
      features: sortedUnique(features.map(String)),
      facts: [...facts]
        .map((fact) => `${fact.id}@${sortedUnique((fact.revisions ?? []).map(String)).join('+')}`)
        .sort(byText),
    }),
  });
}

/** Ein begrenzter Cache. Er wirft nichts, er vergisst: der älteste Eintrag fällt zuerst. */
export function createSnapshotCache(limit = 16) {
  const entries = new Map();
  const max = Math.max(1, limit);
  return {
    get(key) {
      if (!entries.has(key)) return null;
      const value = entries.get(key);
      // Frisch machen: der zuletzt benutzte Eintrag fällt zuletzt heraus.
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      if (entries.has(key)) entries.delete(key);
      entries.set(key, value);
      while (entries.size > max) entries.delete(entries.keys().next().value);
      return entries.size;
    },
    get size() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
  };
}
