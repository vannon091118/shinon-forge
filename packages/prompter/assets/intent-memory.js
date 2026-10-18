/**
 * @shinon/prompter — intent-memory.js
 *
 * Das Intent-GEDÄCHTNIS: was über alle Läufe erkannt wurde, und der Gewichtsfaktor
 * daraus. Reine Daten und Rechnung — kein I/O, kein Modell, keine Uhr (die Zeit
 * kommt als Argument), damit die Datei in CI ohne node_modules prüfbar bleibt.
 * Jeder Nutzer-Input ist Information, auch der ohne Treffer. Prompt-Texte und
 * `shinon/event` berührt das Gedächtnis nie.
 */

/** Vertragsname der Ablage. Ein fremder Vertrag wird nicht übernommen. */
export const MEMORY_CONTRACT = 'shinon.intent-memory/v1';

/** Fassung der Ablage — eine neue Feldform erhöht sie. */
export const MEMORY_VERSION = 1;

/** Wie stark alte Zählungen je Lauf altern (Gesamtlaufzeit bleibt sichtbar). */
export const DECAY_DEFAULT = 0.98;

/** Ab wie vielen Beobachtungen ein Pattern überhaupt ein Gewicht bekommt. */
export const MIN_OBSERVATIONS = 2;

/** Wie weit ein voll gelerntes Pattern vom Neutralwert 1 abweichen darf. */
export const BIAS_STRENGTH = 0.35;

/** Untergrenze/ Obergrenze des Faktors — ein Ausreißer kippt nie die Auswahl. */
export const BIAS_MIN = 0.65;
export const BIAS_MAX = 1.35;

/** Deckel für die Landkarte der Merkmale; der Rest läuft in einen Eimer. */
export const MAX_FEATURES = 32;
const FEATURE_OVERFLOW = '<overflow>';

/** Deckel des Lexikons: begrenzt, damit die Ablage nicht unbegrenzt wächst. */
export const MAX_TERMS = 256;
const TERM_OVERFLOW = '<overflow>';

/** Ab dieser Wortlänge ist ein Begriff ein Begriff („der", „und" nicht). */
export const TERM_MIN_LENGTH = 4;

/** Ab so vielen Beobachtungen behauptet ein Begriff eine Klasse. */
export const MIN_TERM_OBSERVATIONS = 2;

/** Wie viel ein gelerntes Begriffsfeld zum Gewicht beiträgt — und sein Deckel. */
export const SEMANTIC_STRENGTH = 0.25;
export const SEMANTIC_MAX_SUPPORT = 0.6;

/** Ab so vielen Beobachtungen wiegt ein Begriff voll (danach nicht mehr). */
export const SEMANTIC_SATURATION = 4;

/** Funktionswörter: sie kommen in jedem Satz vor und tragen keine Bedeutung. */
const STOPWORDS = new Set([
  'aber', 'auch', 'beim', 'bitte', 'dann', 'dass', 'diese', 'dieser', 'dieses', 'doch', 'eine', 'einen',
  'einer', 'eines', 'etwas', 'fuer', 'für', 'fürs', 'fuer', 'ganz', 'gibt', 'haben', 'habe', 'hast', 'hier', 'immer', 'jetzt',
  'kann', 'kannst', 'koennen', 'können', 'mach', 'mache', 'mehr', 'mich', 'muss', 'nach', 'nicht', 'noch',
  'oder', 'ohne', 'schon', 'sehr', 'sich', 'sind', 'ueber', 'über', 'und', 'viel', 'vom', 'von', 'wenn',
  'werden', 'wieder', 'wird', 'will', 'wir', 'wird', 'with', 'that', 'this', 'have', 'from', 'your',
  'about', 'into', 'they', 'them', 'there', 'their', 'what', 'when', 'which', 'will', 'would', 'should',
]);

/** Ein Objekt, kein Array, kein null. */

/** Ein Objekt, kein Array, kein null. */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Eine Zählung: ganze Zahl, nie negativ, nie NaN. */
function count(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

/** Eine endliche, nicht negative Zahl — sonst 0. */
function amount(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Ein nicht-leerer String oder null. */
function text(value) {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Die Begriffe eines Textes — kleingeschrieben, entdoppelt, ohne Funktionswörter.
 * Dieselbe Zerlegung wie im Resolver; hier ohne Import, damit der Kern allein läuft.
 */
export function tokensOf(promptText) {
  const found = new Set();
  if (typeof promptText !== 'string') return found;
  for (const part of promptText.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (part.length < TERM_MIN_LENGTH) continue;
    if (STOPWORDS.has(part)) continue;
    found.add(part);
  }
  return found;
}

/**
 * Die leere Ablage. `now` kommt von außen (ISO-Zeit), damit dieser Kern keine
 * Uhr liest: derselbe Aufruf mit derselben Zeit ergibt dasselbe Objekt.
 */
export function emptyMemory(now = null) {
  return {
    contract: MEMORY_CONTRACT,
    version: MEMORY_VERSION,
    runs: 0,
    firstSeen: now,
    lastSeen: now,
    patterns: {},
    classes: {},
    features: {},
    terms: {},
    unclaimed: {},
    unmatched: 0,
    feedback: { up: 0, down: 0 },
  };
}

/**
 * Eine gespeicherte Ablage prüfen — FORM, nicht Meinung.
 *
 * Fail-closed: ein fremder Vertrag macht die ganze Datei unbrauchbar (`foreign`),
 * ein unlesbarer Pattern-Eintrag fällt einzeln weg und wird gezählt. Es wird
 * nie ein Feld erfunden, das die Datei nicht hat.
 *
 * @returns { memory, dropped, foreign }
 */
export function validateMemory(raw) {
  if (!isRecord(raw)) return { memory: emptyMemory(), dropped: 0, foreign: false };
  if (raw.contract !== MEMORY_CONTRACT) {
    return { memory: emptyMemory(), dropped: 0, foreign: true };
  }
  const memory = emptyMemory();
  memory.version = MEMORY_VERSION;
  memory.runs = count(raw.runs);
  memory.firstSeen = text(raw.firstSeen);
  memory.lastSeen = text(raw.lastSeen);
  memory.unmatched = count(raw.unmatched);

  let dropped = 0;
  const patterns = isRecord(raw.patterns) ? raw.patterns : {};
  for (const [id, entry] of Object.entries(patterns)) {
    if (!isRecord(entry) || id === '') {
      dropped += 1;
      continue;
    }
    const seen = count(entry.seen);
    if (seen === 0) {
      dropped += 1;
      continue;
    }
    memory.patterns[id] = {
      seen,
      up: count(entry.up),
      down: count(entry.down),
      scoreSum: amount(entry.scoreSum),
      durationMs: amount(entry.durationMs),
      last: text(entry.last),
    };
  }

  const classes = isRecord(raw.classes) ? raw.classes : {};
  for (const [name, value] of Object.entries(classes)) {
    if (name === '') continue;
    const n = count(value);
    if (n > 0) memory.classes[name] = n;
  }

  const features = isRecord(raw.features) ? raw.features : {};
  for (const [name, value] of Object.entries(features)) {
    if (name === '') continue;
    const n = count(value);
    if (n > 0) memory.features[name] = n;
  }

  // Das Lexikon: Begriff → Zählung je Klasse. Ein Eintrag ohne Zahl fällt weg.
  const terms = isRecord(raw.terms) ? raw.terms : {};
  for (const [term, entry] of Object.entries(terms)) {
    if (term === '' || !isRecord(entry)) {
      dropped += 1;
      continue;
    }
    const counts = {};
    for (const [name, value] of Object.entries(entry)) {
      const n = count(value);
      if (name !== '' && n > 0) counts[name] = n;
    }
    if (Object.keys(counts).length === 0) {
      dropped += 1;
      continue;
    }
    memory.terms[term] = counts;
  }

  // Unbeanspruchte Begriffe: jeder Input ohne Treffer bleibt sichtbar.
  const unclaimed = isRecord(raw.unclaimed) ? raw.unclaimed : {};
  for (const [term, value] of Object.entries(unclaimed)) {
    if (term === '') continue;
    const n = count(value);
    if (n > 0) memory.unclaimed[term] = n;
  }

  if (isRecord(raw.feedback)) {
    memory.feedback = { up: count(raw.feedback.up), down: count(raw.feedback.down) };
  }
  return { memory, dropped, foreign: false };
}

/** Eine Merkmals-Landkarte um EINEN Eintrag erweitern — gedeckelt, nie wachsend. */
function bump(map, name, by = 1) {
  const key = text(name);
  if (key === null) return;
  const known = Object.keys(map).length;
  const safe = known < MAX_FEATURES || Object.hasOwn(map, key) ? key : FEATURE_OVERFLOW;
  map[safe] = count(map[safe]) + count(by);
}

/** Den Deckel des Lexikons anwenden: bekannte Begriffe bleiben, neue laufen in einen Eimer. */
function lexiconKey(map, term) {
  if (term === '' || term === null) return null;
  if (Object.hasOwn(map, term)) return term;
  return Object.keys(map).length < MAX_TERMS ? term : TERM_OVERFLOW;
}

/** Einen Begriff einer Klasse zuschlagen — die einzige Lernstelle des Lexikons. */
function learnTerm(map, term, classification) {
  const key = lexiconKey(map, term);
  if (key === null) return;
  const entry = isRecord(map[key]) ? map[key] : {};
  map[key] = { ...entry, [classification]: count(entry[classification]) + 1 };
}

/**
 * EINEN Turn verbuchen — der einzige Weg, wie Information ins Gedächtnis kommt.
 *
 * Beobachtet wird auch der Turn OHNE Treffer (`unmatched`): ein Text, den keine
 * Regel erkennt, ist der Hinweis, dass der Pool eine Lücke hat. Die Dauer ist die
 * gemessene Laufzeit des Schritts, nicht eine Schätzung.
 */
export function observe(memory, observation, now = null) {
  const base = isRecord(memory) ? memory : emptyMemory(now);
  const next = {
    ...base,
    runs: count(base.runs) + 1,
    lastSeen: text(now) ?? base.lastSeen ?? null,
    firstSeen: text(base.firstSeen) ?? text(now) ?? null,
    patterns: { ...(isRecord(base.patterns) ? base.patterns : {}) },
    classes: { ...(isRecord(base.classes) ? base.classes : {}) },
    features: { ...(isRecord(base.features) ? base.features : {}) },
    terms: { ...(isRecord(base.terms) ? base.terms : {}) },
    unclaimed: { ...(isRecord(base.unclaimed) ? base.unclaimed : {}) },
    unmatched: count(base.unmatched),
    feedback: isRecord(base.feedback) ? { ...base.feedback } : { up: 0, down: 0 },
  };

  const classification = text(observation?.classification);
  if (classification !== null) bump(next.classes, classification);

  for (const feature of Array.isArray(observation?.features) ? observation.features : []) {
    bump(next.features, feature);
  }

  const id = text(observation?.patternId);
  const tokens = tokensOf(observation?.text);
  if (id === null) {
    // Jeder Input ist Information: was keine Regel beansprucht, bleibt als
    // Begriff sichtbar — der Hinweis auf eine Lücke im Pool, nicht Müll.
    next.unmatched += 1;
    for (const token of tokens) {
      const key = lexiconKey(next.unclaimed, token);
      if (key !== null) next.unclaimed[key] = count(next.unclaimed[key]) + 1;
    }
    return next;
  }

  // Ein Treffer MIT Expansion lehrt das Lexikon, ein reiner Chat-Treffer nicht:
  // „hallo" hat für die Semantik des Auftrags keine Bedeutung.
  if (classification !== null && classification !== 'CHAT' && classification !== 'UNDEFINED') {
    for (const token of tokens) learnTerm(next.terms, token, classification);
  }

  const entry = isRecord(next.patterns[id]) ? next.patterns[id] : { seen: 0, up: 0, down: 0, scoreSum: 0, durationMs: 0, last: null };
  next.patterns[id] = {
    seen: count(entry.seen) + 1,
    up: count(entry.up),
    down: count(entry.down),
    scoreSum: amount(entry.scoreSum) + amount(observation?.score),
    durationMs: amount(entry.durationMs),
    last: text(now) ?? entry.last ?? null,
  };
  return next;
}

/**
 * Die Laufzeit eines Turns nachtragen — die zweite Hälfte von „Gesamtlaufzeit".
 *
 * Die Beobachtung fällt VOR dem Modell an (die Klasse steht, bevor gearbeitet
 * wird), die Dauer erst danach. Beide gehören zum selben Turn, deshalb zwei
 * Schreibstellen mit derselben Id.
 */
export function addTurnDuration(memory, patternId, durationMs) {
  const id = text(patternId);
  if (!isRecord(memory) || id === null || !Number.isFinite(durationMs) || durationMs < 0) return memory;
  const entry = isRecord(memory.patterns?.[id]) ? memory.patterns[id] : null;
  if (entry === null) return memory;
  const patterns = { ...memory.patterns, [id]: { ...entry, durationMs: amount(entry.durationMs) + durationMs } };
  return { ...memory, patterns };
}

/** Eine Rückmeldung auf ein Pattern legen — auf/ab, nie unter null. */
export function feedback(memory, patternId, polarity, now = null) {
  const id = text(patternId);
  if (!isRecord(memory) || id === null || (polarity !== 'up' && polarity !== 'down')) return memory;
  const entry = isRecord(memory.patterns?.[id]) ? memory.patterns[id] : null;
  if (entry === null) return memory;
  const next = polarity === 'up' ? { ...entry, up: count(entry.up) + 1 } : { ...entry, down: count(entry.down) + 1 };
  const feedbackTotals = isRecord(memory.feedback) ? { ...memory.feedback } : { up: 0, down: 0 };
  feedbackTotals[polarity] = count(feedbackTotals[polarity]) + 1;
  return {
    ...memory,
    patterns: { ...memory.patterns, [id]: { ...next, last: text(now) ?? entry.last ?? null } },
    feedback: feedbackTotals,
  };
}

/**
 * Die Zählungen altern lassen. Nie auf null: ein Pattern, das einmal wirklich da
 * war, verschwindet nicht aus der Gesamtlaufzeit — es wiegt nur weniger. `runs`
 * und die Klassen bleiben unangetastet (sie sind die Summe, nicht der Trend).
 */
export function decay(memory, factor = DECAY_DEFAULT) {
  if (!isRecord(memory)) return memory;
  const f = Number.isFinite(factor) && factor > 0 && factor < 1 ? factor : DECAY_DEFAULT;
  const patterns = {};
  for (const [id, entry] of Object.entries(isRecord(memory.patterns) ? memory.patterns : {})) {
    if (!isRecord(entry)) continue;
    const seen = count(entry.seen);
    if (seen === 0) continue;
    patterns[id] = {
      ...entry,
      seen: Math.max(1, Math.round(seen * f)),
      up: Math.round(count(entry.up) * f),
      down: Math.round(count(entry.down) * f),
    };
  }
  // Das Lexikon altert mit: ein Begriff, der einmal da war, bleibt sichtbar,
  // wiegt aber weniger — sonst wuerde alte Semantik die neue ueberstimmen.
  const terms = {};
  for (const [term, entry] of Object.entries(isRecord(memory.terms) ? memory.terms : {})) {
    if (!isRecord(entry)) continue;
    const counts = {};
    for (const [name, value] of Object.entries(entry)) {
      const n = count(value);
      if (n > 0) counts[name] = Math.max(1, Math.round(n * f));
    }
    if (Object.keys(counts).length > 0) terms[term] = counts;
  }
  // Unbeanspruchte Begriffe sind ein Hinweis, kein Bestand: sie dürfen fallen.
  const unclaimed = {};
  for (const [term, value] of Object.entries(isRecord(memory.unclaimed) ? memory.unclaimed : {})) {
    const n = Math.round(count(value) * f);
    if (n > 0) unclaimed[term] = n;
  }
  return { ...memory, patterns, terms, unclaimed };
}

/** Ein Faktor aus einem 0..1-Wert — begrenzt, gerundet, nie 0. */
function clampBias(value) {
  const bounded = Math.min(BIAS_MAX, Math.max(BIAS_MIN, value));
  return Math.round(bounded * 1000) / 1000;
}

/**
 * Der Gewichtsfaktor je Pattern — Erfahrung als Priorität.
 *
 * Rate = (up+1)/(up+down+2) (Laplace, ohne Rückmeldung neutral 1/2);
 * Konfidenz = seen/(seen+4); Faktor = 1 + strength·(2·Rate−1)·Konfidenz,
 * begrenzt auf [MIN, MAX]. Ohne Beobachtungen bleibt es bei 1 — kein Lernen
 * aus dem Nichts.
 */
export function weightsFrom(memory, options = {}) {
  const minObservations = Number.isFinite(options.minObservations) ? options.minObservations : MIN_OBSERVATIONS;
  const strength = Number.isFinite(options.strength) ? options.strength : BIAS_STRENGTH;
  const weights = {};
  if (!isRecord(memory) || !isRecord(memory.patterns)) return weights;
  for (const [id, entry] of Object.entries(memory.patterns)) {
    if (!isRecord(entry)) continue;
    const seen = count(entry.seen);
    if (seen < minObservations) continue;
    const up = count(entry.up);
    const down = count(entry.down);
    const rate = (up + 1) / (up + down + 2);
    const confidence = seen / (seen + 4);
    const bias = clampBias(1 + strength * (2 * rate - 1) * confidence);
    if (bias !== 1) weights[id] = bias;
  }
  return weights;
}

/**
 * Das SEMANTISCHE FELD aus dem Lexikon: welcher Begriff deutet auf welche
 * Klasse, und wie eindeutig. Reine Rechnung über die Gesamtlaufzeit.
 *
 * `confidence` = Anteil der stärksten Klasse an allen Beobachtungen des
 * Begriffs. Unter MIN_TERM_OBSERVATIONS behauptet ein Begriff nichts (null).
 * @returns { term: { classification, confidence } }
 */
export function semanticProfile(memory) {
  const profile = {};
  if (!isRecord(memory) || !isRecord(memory.terms)) return profile;
  for (const [term, entry] of Object.entries(memory.terms)) {
    if (term === '' || !isRecord(entry)) continue;
    let best = null;
    let total = 0;
    for (const [name, value] of Object.entries(entry)) {
      const n = count(value);
      if (n === 0) continue;
      total += n;
      if (best === null || n > best.n) best = { name, n };
    }
    if (best === null || total < MIN_TERM_OBSERVATIONS) continue;
    profile[term] = {
      classification: best.name,
      confidence: Math.round((best.n / total) * 1000) / 1000,
      total,
    };
  }
  return profile;
}

/**
 * Die semantische Stützung eines Textes für EINE Klasse, in [0, SEMANTIC_MAX_SUPPORT].
 *
 * Gezählt wird je Begriff, der im Text steht und dessen gelernte Klasse passt:
 * sein Anteil, gewichtet mit der Menge der Beobachtungen. Die Menge wächst
 * logarithmisch, damit zehn Treffer nicht zehnmal so schwer wiegen wie einer —
 * die Eindeutigkeit entscheidet, nicht die bloße Häufigkeit.
 */
export function semanticSupport(profile, promptText, classification) {
  if (!isRecord(profile) || typeof classification !== 'string' || classification === '') return 0;
  let support = 0;
  for (const token of tokensOf(promptText)) {
    const entry = profile[token];
    if (!isRecord(entry) || entry.classification !== classification) continue;
    const confidence = Number.isFinite(entry.confidence) ? entry.confidence : 0;
    if (confidence <= 0) continue;
    // Die Menge sättigt: vier Beobachtungen wiegen voll, eine zählt ein Viertel.
    // So bleibt die GESAMTLAUFZEIT im Gewicht, ohne dass ein häufiger Begriff
    // die Seltenen erschlägt.
    const mass = Math.min(1, amount(entry.total) / SEMANTIC_SATURATION);
    support += confidence * mass * SEMANTIC_STRENGTH;
  }
  return Math.min(SEMANTIC_MAX_SUPPORT, Math.round(support * 1000) / 1000);
}

/**
 * Die Folge-Rückmeldung aus dem NÄCHSTEN Nutzer-Text lesen.
 *
 * Das ist die ehrliche Quelle für „hat das Pattern getragen?": der Mensch sagt
 * es im nächsten Satz. Nur eindeutige Marker zählen; alles andere ist keine
 * Rückmeldung (fail-closed, kein Raten aus Höflichkeit).
 */
const FEEDBACK_DOWN = [
  'falsch', 'stimmt nicht', 'passt nicht', 'so nicht', 'nein,', 'nein ',
  'nochmal', 'von vorn', 'vergiss das', 'quatsch', 'schlecht', 'unbrauchbar',
  'daneben', 'nicht so', 'anders machen', 'abbrechen',
];
const FEEDBACK_UP = [
  'passt', 'perfekt', 'genau so', 'gut so', 'weiter so', 'richtig so',
  'super', 'nice', 'danke', 'klasse', 'top,', 'genau das',
];

/** 'up' | 'down' | null — die Rückmeldung eines Textes, sonst nichts. */
export function feedbackOf(promptText) {
  if (typeof promptText !== 'string' || promptText.trim() === '') return null;
  const lower = promptText.toLocaleLowerCase();
  if (FEEDBACK_DOWN.some((mark) => lower.includes(mark))) return 'down';
  if (FEEDBACK_UP.some((mark) => lower.includes(mark))) return 'up';
  return null;
}

/**
 * Die Kurzfassung für Log und Trace — Zahlen, keine Inhalte.
 *
 * Ein Datensatz, der den Prompt-Text trüge, wäre eine zweite Sitzung; hier stehen
 * nur Summen. `avgTurnMs` ist die gemessene Durchschnittslaufzeit je Treffer.
 */
export function memorySummary(memory) {
  if (!isRecord(memory)) return null;
  const patterns = isRecord(memory.patterns) ? memory.patterns : {};
  const seen = Object.values(patterns).reduce((sum, entry) => sum + count(entry?.seen), 0);
  const duration = Object.values(patterns).reduce((sum, entry) => sum + amount(entry?.durationMs), 0);
  const terms = isRecord(memory.terms) ? memory.terms : {};
  const profile = semanticProfile(memory);
  return {
    runs: count(memory.runs),
    matched: seen,
    unmatched: count(memory.unmatched),
    patterns: Object.keys(patterns).length,
    terms: Object.keys(terms).length,
    classifiedTerms: Object.keys(profile).length,
    unclaimed: Object.keys(isRecord(memory.unclaimed) ? memory.unclaimed : {}).length,
    avgTurnMs: seen === 0 ? null : Math.round(duration / seen),
    feedback: isRecord(memory.feedback) ? { up: count(memory.feedback.up), down: count(memory.feedback.down) } : { up: 0, down: 0 },
  };
}
