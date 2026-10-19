/**
 * @shinon/prompter — intent-conflicts.js
 *
 * Die Konfliktmatrix der Intent-Patterns: welche Trigger einander überlappen,
 * ob sie dieselbe Klasse und dieselbe Expansion tragen — und in welcher
 * Reihenfolge der Resolver zwei Treffer auflöst.
 *
 * WARUM DIE MATRIX EIN KERN IST UND KEIN SKRIPT: eine Matrix, die nur ein
 * einmaliger Lauf erzeugt, veraltet beim nächsten Trigger. Sie wird deshalb aus
 * DENSELBEN Daten gerechnet, die der Resolver liest (`intent-rules.json`), und
 * von einem Test bei jedem `gate:test` neu erzeugt. Kein zweiter Bestand, keine
 * gepflegte Kopie.
 *
 * DIE AUFLÖSUNG IST DATEN, NICHT GESCHMACK: längste passende Phrase zuerst,
 * dann die Klasse (`INTENT_PRIORITY`), dann die Erfahrung, zuletzt die ID. Die
 * Reihenfolge der Patterns in der Datei entscheidet NICHTS — sonst wäre das
 * Umsortieren der Regeln eine stille Verhaltensänderung.
 *
 * IMPORTFREIHEIT: nur relative Importe auf die beiden Kerne, die ohnehin ohne
 * `node_modules` laufen. Der Test fährt in CI ohne Installation.
 */
import { INTENT_PRIORITY, normalizeIntentText } from './intent-resolver.js';

/** Vertragsname der Matrix. */
export const INTENT_CONFLICTS_CONTRACT = 'shinon.intent-conflicts/v1';

/** Die vier Konfliktarten. Jede ist ein eigener Befund, keine Sammelklasse. */
export const CONFLICT_KINDS = Object.freeze(['EXAKT', 'PRAEFIX', 'TEILWORT', 'EXPANSION']);

/** Eine Klasse, die der Resolver nicht kennt, ist ein Befund — keine stille Leere. */
export const UNKNOWN_CLASS = 'UNBEKANNT';

/**
 * Alle Trigger einer Regeldatei, normalisiert, mit ihren Besitzern.
 *
 * Ein Trigger kann mehreren Patterns gehören; genau das ist die exakte
 * Doppelung, die `conflictMatrix` sichtbar macht. Doppelte Trigger INNERHALB
 * eines Patterns zählen einmal — sie sind ein Datenfehler, aber kein Konflikt
 * zwischen zwei Zuständigkeiten.
 */
export function triggerIndex(rules) {
  const index = new Map();
  const patterns = Array.isArray(rules?.patterns) ? rules.patterns : [];
  for (const pattern of patterns) {
    if (pattern === null || typeof pattern !== 'object') continue;
    const id = typeof pattern.id === 'string' ? pattern.id : '';
    const classification = typeof pattern.classification === 'string' ? pattern.classification : UNKNOWN_CLASS;
    const expansion = typeof pattern.expansion === 'string' ? pattern.expansion : '';
    const triggers = Array.isArray(pattern.trigger) ? pattern.trigger : [];
    const seen = new Set();
    for (const raw of triggers) {
      if (typeof raw !== 'string') continue;
      const trigger = normalizeIntentText(raw);
      if (trigger === '' || seen.has(trigger)) continue;
      seen.add(trigger);
      const owners = index.get(trigger) ?? [];
      owners.push({ id, classification, expansion });
      index.set(trigger, owners);
    }
  }
  return index;
}

/** Die Klasse eines Treffers — unbekannte Klassen sind ein eigener Rang. */
function classRank(classification) {
  return Number.isInteger(INTENT_PRIORITY[classification]) ? INTENT_PRIORITY[classification] : -1;
}

/**
 * Zwei Trigger derselben Frage: welche Phrase ist die genauere?
 *
 * Die Reihenfolge ist total (Länge → Klasse → ID); `-1/0/1` wie ein
 * Sortiervergleich. Sie ist die EINE Regel, die Matrix und Resolver teilen.
 */
export function compareTriggers(a, b) {
  if (a.trigger.length !== b.trigger.length) return a.trigger.length > b.trigger.length ? -1 : 1;
  const rankA = classRank(a.classification);
  const rankB = classRank(b.classification);
  if (rankA !== rankB) return rankA > rankB ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Die Matrix aus einer Regeldatei bauen.
 *
 * Geprüft werden drei Beziehungen zwischen TRIGGERN und eine zwischen PATTERNS:
 *
 *   EXAKT     derselbe Trigger in zwei Patterns (echte Doppelzuständigkeit)
 *   PRAEFIX   eine Phrase ist der Anfang einer längeren („wie funktioniert" in
 *             „wie funktioniert das")
 *   TEILWORT  eine Phrase steckt mitten in einer anderen (kein Präfix)
 *   EXPANSION zwei Patterns schreiben denselben nicht-leeren Zusatz
 *
 * `sameClass` und `sameExpansion` stehen an JEDEM Befund: gleich ist harmlos
 * für die Klasse, verschieden ist die Mehrdeutigkeit, die die Auflösung regelt.
 *
 * @returns {{contract: string, patterns: number, triggers: number, conflicts: Array,
 *            counts: object, unknownClasses: string[]}}
 */
export function conflictMatrix(rules) {
  const patterns = Array.isArray(rules?.patterns) ? rules.patterns.filter((p) => p !== null && typeof p === 'object') : [];
  const index = triggerIndex(rules);
  const triggers = [...index.keys()].sort();
  const conflicts = [];
  const unknownClasses = new Set();

  for (const pattern of patterns) {
    if (!Number.isInteger(INTENT_PRIORITY[pattern.classification])) unknownClasses.add(String(pattern.id ?? ''));
  }

  // Exakte Doppelungen: ein Trigger, mehrere Besitzer. Alle Paare, nicht nur das
  // erste — drei Besitzer sind drei Verantwortlichkeiten.
  for (const trigger of triggers) {
    const owners = index.get(trigger);
    if (owners.length < 2) continue;
    for (let i = 0; i < owners.length; i += 1) {
      for (let j = i + 1; j < owners.length; j += 1) {
        conflicts.push(conflictOf('EXAKT', trigger, owners[i], trigger, owners[j]));
      }
    }
  }

  // Präfix und Teilwort über alle Triggerpaare. 402 Trigger ergeben ~80k Paare —
  // billig genug für einen Testlauf, zu teuer für jeden Turn. Deshalb läuft die
  // Matrix im Gate, nicht im Request.
  for (let i = 0; i < triggers.length; i += 1) {
    for (let j = i + 1; j < triggers.length; j += 1) {
      const a = triggers[i];
      const b = triggers[j];
      if (a === b) continue;
      const kind = a.startsWith(b) || b.startsWith(a) ? 'PRAEFIX' : (a.includes(b) || b.includes(a) ? 'TEILWORT' : null);
      if (kind === null) continue;
      for (const ownerA of index.get(a)) {
        for (const ownerB of index.get(b)) {
          // Reihenfolge a/b ist die lexikografische des Paars, nicht die
          // Spezifitaet: welche Seite die laengere Phrase traegt, sagt
          // `resolutionOf` an der Laenge — eine zweite Sortierung hier waere
          // eine zweite Wahrheit.
          conflicts.push(conflictOf(kind, a, ownerA, b, ownerB));
        }
      }
    }
  }

  // Dieselbe Expansion in zwei Patterns: derselbe Zusatz aus zwei Anlässen. Für
  // den Prompt ist das meist harmlos — bis einer der beiden umformuliert wird.
  const byExpansion = new Map();
  for (const pattern of patterns) {
    const expansion = typeof pattern.expansion === 'string' ? pattern.expansion.trim() : '';
    if (expansion === '') continue;
    const owners = byExpansion.get(expansion) ?? [];
    owners.push({ id: String(pattern.id ?? ''), classification: pattern.classification, expansion });
    byExpansion.set(expansion, owners);
  }
  for (const [expansion, owners] of byExpansion) {
    if (owners.length < 2) continue;
    for (let i = 0; i < owners.length; i += 1) {
      for (let j = i + 1; j < owners.length; j += 1) {
        conflicts.push({
          kind: 'EXPANSION',
          a: { trigger: '', ...owners[i] },
          b: { trigger: '', ...owners[j] },
          sameClass: owners[i].classification === owners[j].classification,
          sameExpansion: true,
          expansion: expansion.slice(0, 80),
        });
      }
    }
  }

  const counts = Object.fromEntries(CONFLICT_KINDS.map((kind) => [kind, 0]));
  for (const conflict of conflicts) counts[conflict.kind] += 1;

  return {
    contract: INTENT_CONFLICTS_CONTRACT,
    patterns: patterns.length,
    triggers: triggers.length,
    conflicts,
    counts,
    unknownClasses: [...unknownClasses].sort(),
  };
}

/** Ein Befund mit beiden Seiten — nur die Kennungen, nie der ganze Regeltext. */
function conflictOf(kind, triggerA, ownerA, triggerB, ownerB) {
  return {
    kind,
    a: { trigger: triggerA, id: ownerA.id, classification: ownerA.classification },
    b: { trigger: triggerB, id: ownerB.id, classification: ownerB.classification },
    sameClass: ownerA.classification === ownerB.classification,
    sameExpansion: ownerA.expansion === ownerB.expansion,
  };
}

/**
 * Die Auflösung für einen Konflikt, benannt.
 *
 * `PRAEFIX` und `TEILWORT` löst die LÄNGE; bei gleicher Länge entscheidet die
 * Klasse, dann die ID. `EXAKT` kann die Länge nicht lösen (die Phrase ist
 * dieselbe) — dort entscheidet die Klasse. `EXPANSION` ist kein Wettbewerb um
 * einen Treffer; der Befund sagt nur, dass zwei Anlässe denselben Zusatz
 * tragen.
 */
export function resolutionOf(conflict) {
  if (conflict.kind === 'EXPANSION') return { rule: 'KEINE', winner: null };
  if (conflict.kind === 'EXAKT') {
    if (conflict.sameClass) return { rule: 'KLASSE', winner: null, note: 'gleiche Klasse — die ID bleibt als letzte Ordnung' };
    return { rule: 'KLASSE', winner: classRank(conflict.a.classification) >= classRank(conflict.b.classification) ? conflict.a.id : conflict.b.id };
  }
  if (conflict.a.trigger.length !== conflict.b.trigger.length) {
    return { rule: 'PHRASE_LAENGE', winner: conflict.a.trigger.length > conflict.b.trigger.length ? conflict.a.id : conflict.b.id };
  }
  return { rule: 'KLASSE', winner: classRank(conflict.a.classification) >= classRank(conflict.b.classification) ? conflict.a.id : conflict.b.id };
}
