/**
 * @shinon/prompter — intent-resolver.js
 *
 * Der RUNTIME-RESOLVER der Intent-Klasse: reine Funktion, kein I/O, kein Modell.
 * Drei deterministische Schichten: ganze Phrasen (Treffer), Textmerkmale und
 * Begriffsmarker (Semantik, belegen nur) und gelernte Gewichte aus der
 * Gesamtlaufzeit (Erfahrung). Ohne Phrase bleibt es UNDEFINED — Merkmale und
 * Marker erzeugen nie einen Treffer.
 */

// Das Vokabular hat EINE Quelle: `mode-core.js` (dort ohne Importe). Der
// Resolver fuehrt keine zweite Liste und reicht sie nur weiter.
import { INTENT_CLASSES } from './mode-core.js';
// Die gelernte Semantik kommt aus dem Gedaechtnis-Kern — ebenfalls importfrei,
// damit beide Kerne in CI ohne node_modules laufen. Der Resolver rechnet nicht
// nach, was dort schon steht: `semanticSupport` ist die EINE Formel.
import { semanticSupport } from './intent-memory.js';

export { INTENT_CLASSES };

/**
 * Die Enthaltung. Kein Mitglied der Klassenliste: wer UNDEFINED als Klasse
 * behandelt, hat eine Antwort erfunden, die der Text nicht hergibt.
 */
export const UNDEFINED = 'UNDEFINED';

/**
 * Die feste Prioritaet: hoeher gewinnt — aber erst NACH der Phrasenlaenge.
 * Die Reihenfolge ist total (Laenge, Klasse, Erfahrung, ID), damit zwei Treffer
 * nie unentschieden bleiben und die Reihenfolge der Daten nichts dreht.
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

/** Der kleinste gewichtete Wert, der noch als Treffer gilt (gelernte Daempfung). */
export const MIN_WEIGHTED_SCORE = 1;

/** Wie viel ein zutreffendes Merkmal zu einem BESTEHENDEN Treffer beitraegt. */
export const SIGNAL_WEIGHT = 0.5;

/** Wie viel ein Begriffsmarker beitraegt — und wo der Deckel liegt. */
export const SEMANTIC_WEIGHT = 0.25;
export const SEMANTIC_CAP = 1.5;

/** Heuristik-Merkmale des Textes. Ein Wort aus dieser Liste ist ein Merkmal. */
export const FEATURES = Object.freeze(['frage', 'imperativ', 'mehrschritt', 'ziel', 'pfad', 'code', 'emotion', 'dringend', 'bestand', 'entscheidung']);

/** Fragewörter, mit denen ein Prompt eine Frage ist statt einer Aufgabe. */
const QUESTION_WORDS = new Set([
  'was', 'wie', 'warum', 'wieso', 'weshalb', 'wer', 'wo', 'wann', 'welche', 'welcher', 'welches',
  'welchem', 'welchen', 'wieviel', 'wieviele', 'kann', 'kannst', 'können', 'ist', 'sind', 'hat', 'haben', 'gibt',
  'why', 'how', 'what', 'which', 'who', 'where', 'when', 'can', 'could', 'is', 'are', 'was', 'were', 'should', 'does', 'do', 'did',
]);

/** Handlungsverben — ein Satz, der damit beginnt, ist ein Auftrag, keine Frage. */
const IMPERATIVE_VERBS = new Set([
  'bau', 'baue', 'baust', 'schreib', 'schreibe', 'mach', 'mache', 'fix', 'fixe', 'repariere', 'reparier',
  'refaktoriere', 'refaktorier', 'fuege', 'füge', 'erstelle', 'erstell', 'pruefe', 'prüfe', 'teste',
  'lies', 'zeig', 'zeige', 'erklaer', 'erklär', 'erklaere', 'erkläre', 'aktualisiere', 'aktualisier',
  'ergaenze', 'ergänze', 'entferne', 'entfern', 'loesche', 'lösche', 'aendere', 'ändere', 'implementiere',
  'integriere', 'erweitere', 'deploye', 'starte', 'stoppe', 'analysiere', 'optimiere', 'dokumentiere',
  'installiere', 'richte', 'migriere', 'portiere', 'verschiebe', 'benenne', 'formatiere', 'vereinfache',
  'extrahiere', 'uebersetze', 'übersetze', 'plane', 'entwirf', 'vergleiche', 'messe', 'benchmarke',
  'add', 'create', 'fix', 'build', 'run', 'test', 'write', 'update', 'remove', 'delete', 'refactor',
  'explain', 'show', 'check', 'make', 'implement', 'integrate', 'deploy', 'install', 'migrate', 'review',
]);

/** Anreden und Floskeln, die vor dem ersten Verb stehen duerfen. */
const LEADING_PARTICLES = new Set(['bitte', 'mal', 'jetzt', 'schnell', 'einfach', 'kannst', 'könntest', 'please']);

/** Mehrschritt-Marker: der Text kuendigt mehrere Schritte an. */
const MULTI_STEP_MARKERS = ['danach', 'anschliessend', 'anschließend', 'und dann', 'erst ', 'zuerst', 'zweitens', 'drittens', 'ausserdem', 'außerdem', 'zudem', 'sowie', '1.', '2.', '3.', 'schritt'];

/** Ziel-Marker: der Auftrag reicht ueber diesen Turn hinaus. */
const GOAL_MARKERS = ['ueber tage', 'über tage', 'ueber wochen', 'über wochen', 'jede nacht', 'jeden tag', 'jede woche', 'auf dauer', 'langfristig', 'dauerhaft', 'immer wieder', 'bis es fertig', 'kontinuierlich', 'iterativ'];

/** Emotions-Marker: der Mensch sagt etwas ueber seine Lage. */
const EMOTION_MARKERS = ['genervt', 'frust', 'nervt', 'müde', 'muede', 'keine nerven', 'sauer', 'wütend', 'wuetend', 'freu', 'bock', 'spass', 'spaß', 'danke'];

/** Dringlichkeit: die Reihenfolge der Arbeit ist Teil des Auftrags. */
const URGENT_MARKERS = ['sofort', 'dringend', 'eilig', 'asap', 'schnellstens', 'gleich jetzt'];

/** Bestand: der Text bezieht sich auf etwas, das schon da ist (oder wieder). */
const EXISTING_MARKERS = ['schon', 'bereits', 'wieder', 'erneut', 'immer noch', 'nochmal'];

/** Entscheidung: der Mensch wägt ab, statt anzuweisen. */
const DECISION_MARKERS = ['lieber', 'besser', 'alternative', 'stattdessen', 'entweder', 'oder '];

/** Ein Pfad oder eine Dateiendung im Text — der Auftrag ist konkret. */
const PATH_PATTERN = /(?:^|[\s(])(?:[\w.-]*\/)+[\w.-]+|\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|ya?ml|html|css|scss|py|sh|rs|go|java|toml|sql)\b/i;

/** Code-Marker: Backticks, Aufrufe, Schluesselwoerter. */
const CODE_MARKERS = ['`', 'function ', 'const ', '=>', 'def ', 'class ', 'import ', 'export ', '<div', 'npm run', 'git '];

/** Ein Text, wie ihn die Patterns lesen: getrimmt, kleingeschrieben, leer = ''. */
export function normalizeIntentText(promptText) {
  return String(promptText ?? '').toLocaleLowerCase().trim();
}

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

/** Beginnt der Satz mit einer Handlung? Anreden davor sind erlaubt. */
function startsImperative(text) {
  const words = text.split(/[^\p{L}\p{N}]+/u).filter((word) => word !== '');
  for (const word of words.slice(0, 3)) {
    if (IMPERATIVE_VERBS.has(word)) return true;
    if (!LEADING_PARTICLES.has(word)) return false;
  }
  return false;
}

/**
 * Die MERKMALE eines Textes — die semantische Schicht, ohne Modell.
 *
 * Reine Merkmalserkennung: was der Text IST (Frage, Auftrag, mehrschrittig,
 * zielgerichtet, konkret, emotional), nicht was er bedeuten soll. Die Merkmale
 * allein erzeugen nie einen Treffer; sie belegen einen vorhandenen.
 */
export function textFeatures(promptText) {
  const text = normalizeIntentText(promptText);
  if (text === '') return [];
  const features = [];
  if (isQuestion(text)) features.push('frage');
  if (startsImperative(text)) features.push('imperativ');
  if (MULTI_STEP_MARKERS.some((mark) => text.includes(mark))) features.push('mehrschritt');
  if (GOAL_MARKERS.some((mark) => text.includes(mark))) features.push('ziel');
  if (PATH_PATTERN.test(text)) features.push('pfad');
  if (CODE_MARKERS.some((mark) => text.includes(mark))) features.push('code');
  if (EMOTION_MARKERS.some((mark) => text.includes(mark))) features.push('emotion');
  if (URGENT_MARKERS.some((mark) => text.includes(mark))) features.push('dringend');
  if (EXISTING_MARKERS.some((mark) => text.includes(mark))) features.push('bestand');
  if (DECISION_MARKERS.some((mark) => text.includes(mark))) features.push('entscheidung');
  return features;
}

/** Begriffe eines Textes — dieselbe Zerlegung wie in `block-select.js`. */
function words(text) {
  const found = new Set();
  for (const part of text.split(/[^\p{L}\p{N}]+/u)) {
    if (part.length >= 4) found.add(part);
  }
  return found;
}

/** Die Staerke eines Patterns: Datenwert, sonst 1 (kein stiller Sonderfall). */
export function patternStrength(pattern) {
  const strength = pattern?.staerke;
  return Number.isFinite(strength) && strength > 0 ? strength : 1;
}

/**
 * Der Beitrag der Semantik zu einem BESTEHENDEN Treffer.
 *
 * `signale` nennt Merkmale, die zu diesem Pattern passen (ein Ziel-Pattern
 * profitiert von `ziel`, ein Bugfix von `pfad`). `semantik` nennt Begriffe, die
 * im Text vorkommen müssen, damit der Treffer traegt. Beides additiv und
 * gedeckelt — ein Marker kann einen fehlenden Phrasentreffer nicht ersetzen.
 */
export function semanticBonus(pattern, features, textWords) {
  let bonus = 0;
  for (const signal of Array.isArray(pattern?.signale) ? pattern.signale : []) {
    if (typeof signal === 'string' && features.includes(signal)) bonus += SIGNAL_WEIGHT;
  }
  let markHits = 0;
  for (const mark of Array.isArray(pattern?.semantik) ? pattern.semantik : []) {
    if (typeof mark === 'string' && textWords.has(mark.toLocaleLowerCase())) markHits += 1;
  }
  return bonus + Math.min(SEMANTIC_CAP, markHits * SEMANTIC_WEIGHT);
}

/** Die Enthaltung als vollstaendiges Ergebnis — ein Objekt, keine Sonderform. */
function undefinedResolution(reason, features = []) {
  return { classification: UNDEFINED, patternId: '', label: '', expansion: '', score: 0, bias: 1, semantic: 0, features, question: false, matched: false, reason };
}

/** Phrasentreffer eines Patterns, gewichtet mit seiner Staerke. */
function phraseHit(pattern, text) {
  const strength = patternStrength(pattern);
  let score = 0;
  let longest = 0;
  for (const trigger of (Array.isArray(pattern?.trigger) ? pattern.trigger : [])) {
    const phrase = String(trigger).toLocaleLowerCase();
    if (!hasPhrase(text, phrase)) continue;
    score += strength;
    if (phrase.length > longest) longest = phrase.length;
  }
  return { score, longest };
}

/**
 * Die EINE Rangfolge zweier Treffer: laengste Phrase, dann Klasse, dann
 * Erfahrung, zuletzt die ID. Die ID ist die stabile letzte Ordnung — ohne sie
 * haenge das Ergebnis an der Reihenfolge der Regeln in der Datei.
 */
function outranks(candidate, best) {
  if (best === null) return true;
  if (candidate.longest !== best.longest) return candidate.longest > best.longest;
  const rank = INTENT_PRIORITY[candidate.pattern.classification];
  const bestRank = INTENT_PRIORITY[best.pattern.classification];
  if (rank !== bestRank) return rank > bestRank;
  if (candidate.weighted !== best.weighted) return candidate.weighted > best.weighted;
  return String(candidate.pattern.id) < String(best.pattern.id);
}

/** Der gelernte Faktor eines Patterns — 1 ohne Erfahrung (kein Raten). */
function biasOf(weights, id) {
  if (weights === null || typeof weights !== 'object') return 1;
  const value = weights[id];
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Die Klasse aus dem TEXT ableiten — die einzige Stelle, an der das passiert.
 * Fail-closed: Fragewort ohne Pattern ist LOOKUP, eine Frage wird NIE
 * erweitert, unbekannte Klassen zählen nicht, ein zu stark gedämpftes Pattern
 * ist kein Treffer, ohne Phrase steht UNDEFINED.
 * @param options - { weights, lexicon, heuristics } — `heuristics: false` schaltet
 *   die semantische Schicht ab (Diagnose), `lexicon` ist das gelernte
 *   Begriffsprofil aus `semanticProfile()`.
 */
export function resolveIntent(promptText, rules, options = {}) {
  const text = normalizeIntentText(promptText);
  if (text === '') return undefinedResolution('EMPTY');
  if (rules === null || typeof rules !== 'object' || !Array.isArray(rules.patterns)) return undefinedResolution('NO_RULES');

  const useHeuristics = options?.heuristics !== false;
  const features = useHeuristics ? textFeatures(text) : [];
  const textWords = useHeuristics ? words(text) : new Set();
  const weights = useHeuristics ? options?.weights ?? null : null;
  const lexicon = useHeuristics ? options?.lexicon ?? null : null;

  const question = isQuestion(text);
  let best = null;
  let unknownClass = 0;
  for (const pattern of rules.patterns) {
    if (pattern === null || typeof pattern !== 'object') continue;
    const hit = phraseHit(pattern, text);
    const known = INTENT_CLASSES.includes(pattern.classification);
    if (!known) {
      if (hit.score > 0) unknownClass += 1;
      continue;
    }
    if (hit.score === 0) continue;
    // Die Semantik belegt den Treffer, sie erzeugt ihn nicht.
    const semantic = useHeuristics ? semanticSupport(lexicon, text, pattern.classification) : 0;
    const score = hit.score + (useHeuristics ? semanticBonus(pattern, features, textWords) : 0) + semantic;
    const bias = biasOf(weights, pattern.id);
    const weighted = score * bias;
    if (weighted < MIN_WEIGHTED_SCORE) continue;
    const candidate = { pattern, score, bias, semantic, weighted, longest: hit.longest };
    if (outranks(candidate, best)) best = candidate;
  }

  if (best === null) {
    if (question) {
      return { classification: 'LOOKUP', patternId: '', label: '', expansion: '', score: 0, bias: 1, semantic: 0, features, question: true, matched: false, reason: 'QUESTION' };
    }
    return undefinedResolution(unknownClass > 0 ? 'UNKNOWN_CLASS' : 'NO_MATCH', features);
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
    bias: best.bias,
    semantic: best.semantic,
    features,
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
