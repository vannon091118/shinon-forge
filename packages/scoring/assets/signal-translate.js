/**
 * @shinon/scoring — die Uebersetzung des Ereignisstroms (assets/signal-translate.js).
 *
 * Der zweite reine Kern neben `scoring-core.js`: hier steht, WIE ein Ereignis des
 * Spines zu einem Signal wird (Signaltabelle -> Ereignis fuer den Replay), dort,
 * was der Replay mit dem Ereignis rechnet (Scorecard, Decay, Kuehlung, Trigger).
 * Geteilt wird nur, was beide brauchen — ein relativer Import, nie ein bare
 * Import: der Kern laeuft in CI ohne node_modules. Keine Zeit, kein Zufall, kein
 * Netz: dieselbe Folge von Ereignissen ergibt dasselbe Signal.
 *
 * SH-LEARN-01 (2026-10-23): die Herkunft jeder Zeile ist Teil der Uebersetzung.
 * Nur ein ausdrueckliches Menschenurteil (`stage: 'user'`) zu EINER Antwort, die
 * diese Sitzung gesehen hat, traegt eine Wertung; ein Turn-Ende und ein Abbruch
 * werden beobachtet und nie gewertet. Ein interner Prompt kann damit nie als
 * Nutzerfeedback gelesen werden — er traegt nicht die Marke `source.kind: 'user'`.
 */

/** Einen Punktpfad lesen: readPath({a:{b:1}}, 'a.b') → 1. Unbekanntes ergibt undefined. */
export function readPath(source, path) {
  if (typeof path !== 'string' || path === '') return undefined;
  let value = source;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = value[key];
  }
  return value;
}

/** Den ersten definierten Wert nehmen — zwei Pfade, kein Raten. */
export function firstDefined(...values) {
  for (const value of values) if (value !== undefined && value !== null) return value;
  return undefined;
}

/**
 * Die Woerter eines Textes: klein geschrieben, ohne Satzzeichen, kurze Woerter
 * fallen weg. Deterministisch — dieselbe Eingabe ergibt dieselbe Liste.
 */
export function normalizeTokens(text, minLength = 3) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^0-9a-zà-ÿ]+/)
    .filter((token) => token.length >= minLength);
}

/**
 * Ueberlappung zweier Texte: gemeinsame Woerter und Jaccard-Anteil.
 * Beide Werte werden gebraucht, damit drei kurze gemeinsame Woerter nicht als
 * "dieselbe Frage" durchgehen (minShared) und ein langer Text nicht allein
 * durch seine Laenge (minRatio).
 */
export function overlapOf(left, right, minLength = 3) {
  const a = new Set(normalizeTokens(left, minLength));
  const b = new Set(normalizeTokens(right, minLength));
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  const union = a.size + b.size - shared;
  return { shared, ratio: union === 0 ? 0 : shared / union };
}

/**
 * Den Text der MENSCHLICHEN Nachricht lesen — oder null.
 *
 * Die Marke ist Pflicht (siehe Kopf dieser Sektion). Der Text steht als
 * Blockliste in `data.content` (echte Form, gemessen); ein flacher `text` ist
 * der Rueckfall fuer ein direkt emittiertes Signal.
 */
export function humanText(payload, rules) {
  const reading = rules?.reading ?? {};
  const marker = reading.humanMarker ?? {};
  const kind = firstDefined(readPath(payload, marker.path), readPath(payload, marker.fallbackPath));
  if (kind !== marker.equals) return null;

  const blocks = readPath(payload, reading.textBlocks?.path);
  if (Array.isArray(blocks)) {
    const wanted = reading.textBlocks?.type ?? 'text';
    const text = blocks
      .filter((block) => block?.type === wanted && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
    if (text.trim() !== '') return text;
  }
  const flat = readPath(payload, reading.textBlocks?.fallbackPath);
  return typeof flat === 'string' && flat.trim() !== '' ? flat : null;
}

/**
 * Den Betreff eines Signals lesen: Pfad mit Rueckfall, Zahl erlaubt, Praefix
 * davor. Leer heisst leer — dann gibt es keinen Betreff (und der Widerruf kann
 * nichts treffen).
 */
function subjectOf(payload, source) {
  const raw = firstDefined(readPath(payload, source?.subjectPath), readPath(payload, source?.subjectFallbackPath));
  const text = typeof raw === 'string'
    ? raw
    : typeof raw === 'number' && Number.isFinite(raw)
      ? String(raw)
      : '';
  if (text.trim() === '') return '';
  return `${typeof source?.subjectPrefix === 'string' ? source.subjectPrefix : ''}${text}`;
}

/**
 * Der Faktor einer Stufe — die EINE Uebersetzung von Staerke in Gewicht.
 *
 * Die Zahlen stehen in der Signaltabelle (`limits.strengths`), nicht im Code:
 * hoch = doppeltes Basis-Delta, mittel = einfaches, niedrig = halbes. Ist die
 * Stufe unbekannt, gilt 1 — der Vertragswert, nicht ein geratener Faktor.
 * Zugleich die einzige Stelle, an der `applyEvent` sein `weight` herbekommt:
 * eine zweite Delta-Tabelle gibt es nicht.
 */
export function strengthFactor(rules, strengthId) {
  const factor = rules?.limits?.strengths?.[strengthId];
  return typeof factor === 'number' && Number.isFinite(factor) && factor > 0 ? factor : 1;
}

/**
 * Eine BEOBACHTUNG lesen: welche der nicht gewerteten Zeilen war das?
 *
 * `turn/end` traegt seinen Grund als `reason.kind`; die Tabelle nennt je Grund
 * eine Zeile (accept/dismiss), die ausdruecklich `observable: false` ist. Die
 * Zuordnung dient der Spur, nicht dem Wert — sie darf deshalb nichts werten.
 */
function observationOf(payload, source) {
  if (source.byReason !== undefined && source.byReason !== null && typeof source.reasonPath === 'string') {
    const reasonKind = readPath(payload, source.reasonPath);
    return typeof reasonKind === 'string' && typeof source.byReason[reasonKind] === 'string' ? source.byReason[reasonKind] : null;
  }
  return null;
}

/**
 * Ein Ereignis des Spines in ein Signal uebersetzen. Rein: der Sitzungszustand
 * kommt als Argument herein, nicht als Modulzustand.
 *
 * Rueckgabe:
 *   kind      'score' (es gibt ein Ereignis fuer den Replay), 'retract' (eine
 *             Zeile wird zurueckgenommen), 'note' (beobachtet, nie gewertet)
 *   event     das Ereignis fuer den Replay — oder null
 *   reason    benannter Grund, wenn NICHTS passiert (jeder Grund ist ein Test wert)
 *   question  der gerade gesehene Menschen-Text (der Host merkt ihn sich)
 */
export function translateSignal(envelope, payload, rules, session = {}) {
  const empty = {
    signal: null,
    kind: null,
    subject: null,
    factor: 1,
    event: null,
    replaces: false,
    question: undefined,
    reason: null,
    detail: {},
    basis: null,
  };
  const type = typeof envelope?.event_type === 'string' ? envelope.event_type : '';
  const sessionId = typeof envelope?.session_id === 'string' ? envelope.session_id : '';
  if (type === '' || sessionId.trim() === '') return { ...empty, reason: 'NO_SESSION' };

  const source = rules?.sources?.[type];
  if (source === undefined || source === null || typeof source !== 'object') {
    return { ...empty, reason: `UNKNOWN_SOURCE:${type}` };
  }
  const signals = rules?.signals ?? {};
  const label = (id) => (typeof signals?.[id]?.label === 'string' ? signals[id].label : id);

  // Beobachtet, ohne Pol: gezaehlt, nie gewertet. `observe` wird zusaetzlich
  // nicht geschrieben (ein Turn-Ende ist Evidenz, kein Zustand); `note` ist eine
  // Bemerkung und geht in den Stand.
  if (source.kind === 'note' || source.kind === 'observe') {
    const observation = observationOf(payload, source);
    // Die Beobachtung traegt ihren NAMEN (accept/dismiss), wenn die Tabelle ihn
    // kennt — ein Turn-Ende soll im Zaehler als `COMPLETION_IS_NOT_CORRECTNESS`
    // stehen, nicht als namenloses Rauschen.
    const named = typeof observation === 'string' ? signals?.[observation] : null;
    return {
      ...empty,
      kind: source.kind,
      reason: typeof named?.reasonId === 'string' ? named.reasonId : 'OBSERVED_ONLY',
      detail: { note: source.note ?? source.reason ?? '', observation },
      basis: { stage: 'none', source: type, subject: observation },
    };
  }

  // Widerruf: die Zeile mit diesem Betreff verschwindet. Der Betreff wird mit
  // DERSELBEN Funktion gelesen wie beim Werten — sonst träfe der Widerruf eine
  // Zeile nicht, sobald eine Regel ein Präfix führt.
  if (source.kind === 'retract') {
    const subject = subjectOf(payload, source);
    if (subject === '') {
      return { ...empty, reason: `MISSING_SUBJECT:${String(source.subjectPath)}` };
    }
    return { ...empty, signal: typeof source.signal === 'string' ? source.signal : null, kind: 'retract', subject };
  }

  // Bewertet: welches Signal ist es?
  let signalId = null;
  let detail = {};
  if (source.byRating !== undefined && source.byRating !== null) {
    const rating = readPath(payload, source.ratingPath);
    signalId = typeof rating === 'string' ? source.byRating[rating] ?? null : null;
    if (signalId === null) return { ...empty, reason: `UNKNOWN_RATING:${String(rating)}` };
    detail = { rating };
  } else if (source.byReason !== undefined && source.byReason !== null) {
    const reasonKind = readPath(payload, source.reasonPath);
    signalId = typeof reasonKind === 'string' ? source.byReason[reasonKind] ?? null : null;
    if (signalId === null) return { ...empty, reason: `UNHANDLED_REASON:${String(reasonKind)}` };
    detail = { reason: reasonKind };
  } else if (typeof source.signal === 'string') {
    signalId = source.signal;
  }
  if (signalId === null) return { ...empty, reason: 'NO_SIGNAL_RULE' };

  const definition = signals[signalId];
  if (definition === null || typeof definition !== 'object' || definition.observable !== true) {
    // Die Tabelle fuehrt das Signal ausdruecklich als nicht beobachtbar und
    // nennt den Grund. Ein Turn-Ende ist keine Wertung (SH-LEARN-01).
    return { ...empty, reason: typeof definition?.reasonId === 'string' ? definition.reasonId : `NOT_OBSERVABLE:${signalId}` };
  }

  // Menschen-Text: nur mit Marke. Und die Wiederholung wird am Inhalt gemessen.
  let question;
  if (source.humanOnly === true) {
    const text = humanText(payload, rules);
    if (text === null) return { ...empty, reason: 'NOT_HUMAN' };
    question = text;
    detail = { ...detail, text };
    if (signalId === 'rephrase') {
      const similarity = rules?.reading?.similarity ?? {};
      const minLength = typeof similarity.minTokenLength === 'number' ? similarity.minTokenLength : 3;
      const previous = typeof session.previousQuestion === 'string' ? session.previousQuestion : '';
      const { shared, ratio } = overlapOf(previous, text, minLength);
      const minShared = typeof similarity.minShared === 'number' ? similarity.minShared : 3;
      const minRatio = typeof similarity.minRatio === 'number' ? similarity.minRatio : 0.6;
      detail = { ...detail, shared, ratio };
      if (previous.trim() === '') return { ...empty, question, detail, reason: 'FIRST_QUESTION' };
      if (shared < minShared || ratio < minRatio) {
        return { ...empty, question, detail, reason: 'DIFFERENT_TOPIC' };
      }
    }
  }

  const subject = subjectOf(payload, source) || null;

  // SH-LEARN-01: ein Urteil gilt einer ANTWORT, die diese Sitzung gesehen hat.
  // Ohne diese Zuordnung ist "irgendeine messageId" keine Evidenz, sondern eine
  // Behauptung — der Grund wird gezaehlt, gewertet wird nichts.
  if (source.requiresAnswer === true) {
    if (subject === null) {
      return { ...empty, reason: `MISSING_SUBJECT:${String(source.subjectPath)}` };
    }
    if (!(session?.answers instanceof Set) || !session.answers.has(subject)) {
      return { ...empty, reason: 'UNATTRIBUTED_FEEDBACK', detail: { ...detail, subject } };
    }
  }

  const factor = strengthFactor(rules, definition.strength);
  const field = definition.type === 'feedback.correction' ? 'correction' : 'approval';

  return {
    ...empty,
    signal: signalId,
    kind: 'score',
    subject,
    factor,
    replaces: source.replaces === true,
    question,
    detail,
    // Herkunft der Wertung: `user` (ausdrueckliches Urteil) oder `derived`
    // (abgeleitet). Sie reist in den Datensatz und entscheidet, ob das
    // Baustein-Lernen sie lesen darf (packages/scoring/index.js).
    basis: { stage: typeof definition.stage === 'string' ? definition.stage : 'derived', source: type, subject: definition.subject ?? null },
    event: {
      type: definition.type,
      weight: factor,
      payload: { session_id: sessionId, [field]: label(signalId) },
    },
  };
}
