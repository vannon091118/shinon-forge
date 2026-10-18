/**
 * @shinon/prompter — intent-resolver.js
 *
 * Der RUNTIME-RESOLVER der Intent-Klasse: reine Funktion, kein I/O, kein Modell.
 * Eingabe sind der Prompt-Text und die Pattern-Daten (`intent-rules.json`), Ausgabe
 * eine der fuenf Klassen oder ausdruecklich UNDEFINED. Die Klasse haengt damit am
 * TEXT, nicht an einer Modellantwort. Die Prioritaet ist FEST und total — der
 * starkste Auftrag gewinnt; kein Treffer ist keine Vermutung.
 */

// Das Vokabular hat EINE Quelle: `mode-core.js` (dort ohne Importe). Der
// Resolver fuehrt keine zweite Liste und reicht sie nur weiter.
import { INTENT_CLASSES } from './mode-core.js';

export { INTENT_CLASSES };

/**
 * Die Enthaltung. Kein Mitglied der Klassenliste: wer UNDEFINED als Klasse
 * behandelt, hat eine Antwort erfunden, die der Text nicht hergibt.
 */
export const UNDEFINED = 'UNDEFINED';

/**
 * Die feste Prioritaet: hoeher gewinnt. Sie ist total, damit zwei Treffer nie
 * unentschieden bleiben und die Reihenfolge der Daten die Klasse nicht dreht.
 */
export const INTENT_PRIORITY = Object.freeze({
  LONG_RUNNING_GOAL: 4,
  MULTI_STEP_TASK: 3,
  TRANSFORM: 2,
  LOOKUP: 1,
  CHAT: 0,
});

/** Warum eine Klasse (oder UNDEFINED) herauskam — benannt, nie still. */
export const RESOLUTION_REASONS = Object.freeze(['EMPTY', 'NO_RULES', 'NO_MATCH', 'UNKNOWN_CLASS', 'QUESTION', 'MATCHED']);

/** Fragewörter, mit denen ein Prompt eine Frage ist statt einer Aufgabe. */
const QUESTION_WORDS = new Set([
  'was', 'wie', 'warum', 'wieso', 'weshalb', 'wer', 'wo', 'wann', 'welche', 'welcher', 'welches',
  'welchem', 'welchen', 'wieviel', 'wieviele', 'kann', 'kannst', 'können', 'ist', 'sind', 'hat', 'haben', 'gibt',
  'why', 'how', 'what', 'which', 'who', 'where', 'when', 'can', 'could', 'is', 'are', 'was', 'were', 'should', 'does', 'do', 'did',
]);

/** Eine Frage endet mit `?` oder beginnt mit einem Fragewort. */
export function isQuestion(text) {
  if (text.endsWith('?')) return true;
  const first = text.split(/[^\p{L}\p{N}]+/u)[0] ?? '';
  return QUESTION_WORDS.has(first);
}

/**
 * Ein Trigger gilt als GANZE Phrase, nicht als Substring: `test` trifft nicht
 * `Testament`, `doc` nicht `docker`. Unicode-Grenzen, damit Umlaute zählen.
 */
export function hasPhrase(text, trigger) {
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(text);
}

/** Ein Text, wie ihn die Patterns lesen: getrimmt, kleingeschrieben, leer = ''. */
export function normalizeIntentText(promptText) {
  return String(promptText ?? '').toLocaleLowerCase().trim();
}

/** Die Enthaltung als vollstaendiges Ergebnis — ein Objekt, keine Sonderform. */
function undefinedResolution(reason) {
  return { classification: UNDEFINED, patternId: '', label: '', expansion: '', score: 0, question: false, matched: false, reason };
}

/** Eine Pattern-Zeile nur dann als Treffer zaehlen, wenn ihre Klasse im Vokabular liegt. */
function scorePattern(pattern, text) {
  let score = 0;
  for (const trigger of (Array.isArray(pattern?.trigger) ? pattern.trigger : [])) {
    if (hasPhrase(text, String(trigger).toLocaleLowerCase())) score += 1;
  }
  return score;
}

/**
 * Die Klasse aus dem TEXT ableiten — die einzige Stelle, an der das passiert.
 *
 * Regeln, alle fail-closed: ein Fragewort ohne Pattern ist LOOKUP (eine Frage
 * will eine Antwort, nie ein Goal), eine Frage wird NIE erweitert, eine
 * unbekannte Klasse in den Daten zaehlt nicht als Treffer, und ohne Treffer
 * steht UNDEFINED — nicht die naechstbeste Vermutung.
 */
export function resolveIntent(promptText, rules) {
  const text = normalizeIntentText(promptText);
  if (text === '') return undefinedResolution('EMPTY');
  if (rules === null || typeof rules !== 'object' || !Array.isArray(rules.patterns)) return undefinedResolution('NO_RULES');

  const question = isQuestion(text);
  let best = null;
  let unknownClass = 0;
  for (const pattern of rules.patterns) {
    if (pattern === null || typeof pattern !== 'object') continue;
    if (!INTENT_CLASSES.includes(pattern.classification)) {
      if (scorePattern(pattern, text) > 0) unknownClass += 1;
      continue;
    }
    const score = scorePattern(pattern, text);
    if (score === 0) continue;
    const rank = INTENT_PRIORITY[pattern.classification];
    const bestRank = best === null ? -1 : INTENT_PRIORITY[best.pattern.classification];
    if (rank > bestRank || (rank === bestRank && score > best.score)) {
      best = { pattern, score };
    }
  }

  if (best === null) {
    if (question) {
      return { classification: 'LOOKUP', patternId: '', label: '', expansion: '', score: 0, question: true, matched: false, reason: 'QUESTION' };
    }
    return undefinedResolution(unknownClass > 0 ? 'UNKNOWN_CLASS' : 'NO_MATCH');
  }

  // Eine Frage ist ein Lookup, keine Aufgabe — und Smalltalk bleibt Smalltalk.
  const classification = question && best.pattern.classification !== 'CHAT' ? 'LOOKUP' : best.pattern.classification;
  return {
    classification,
    patternId: best.pattern.id,
    label: best.pattern.label,
    // Eine Frage traegt nie eine Expansion: der Agent soll antworten.
    expansion: question ? '' : (best.pattern.expansion ?? ''),
    score: best.score,
    question,
    matched: true,
    reason: 'MATCHED',
  };
}

/**
 * Den Prompt um die Expansion des Treffers erweitern — als ANGEBOT, nie als
 * Ersatz. Ohne Expansion (und bei jeder Frage) kommt der Text wortgleich zurueck.
 */
export function expandPrompt(promptText, resolution) {
  if (resolution === null || typeof resolution !== 'object' || resolution.expansion === '') return promptText;
  return `${promptText}\n\n# Aufgabe\n${resolution.expansion}`;
}
