/**
 * @shinon/narrative — reiner Kern (assets/narrative-core.js).
 *
 * KEINE Imports (weder Bare noch node:): nur dann laeuft der Test in CI ohne
 * node_modules — dieselbe Regel wie bei `@shinon/scoring` (scoring-core.js).
 *
 * Seit 2026-10-17 leitet der Kern NICHTS aus einem Hash ab: Mood, Thema und
 * Beziehungsstufe kommen aus benannten Regeln (`rules` im Vertrag), jeder
 * Übergang trägt Event-ID, Grund und Evidenzlevel. Unbekannte Events ändern
 * kein semantisches Feld — sie stehen in der Chronik, sonst nichts.
 */

/** Die Evidenzlevel, die ein Übergang nennen darf. */
export const EVIDENCE_LEVELS = Object.freeze(['EVENT_TYPE', 'EXPLICIT_PAYLOAD', 'NONE']);

/** Der Mood eines Ereignisses — derselbe Typ ergibt IMMER denselben Mood. */
export function deriveMood(moodByEvidence, previousMood, eventType) {
  const entry = moodByEvidence?.[eventType];
  const mood = entry?.mood;
  if (typeof mood !== 'string' || mood === '') {
    return {
      mood: typeof previousMood === 'string' && previousMood !== '' ? previousMood : 'idle',
      reason: 'UNBEKANNTES_EREIGNIS',
      evidence: 'NONE',
    };
  }
  return { mood, reason: entry.reason ?? eventType, evidence: entry.evidence ?? 'EVENT_TYPE' };
}

/** Wer diesen Takt erzaehlt — ausdrückliche Zuordnung, sonst der benannte Rückfall. */
export function deriveNarrator(narratorRule, eventType) {
  const mapped = narratorRule?.byEvent?.[eventType];
  return typeof mapped === 'string' && mapped !== '' ? mapped : (narratorRule?.default ?? 'shinon');
}

/**
 * Ein neuer Arc: das Thema kommt aus `themeByEvent`, nie aus dem Präfix-Hash.
 * Ein unbekanntes Ereignis trägt kein Thema — dann wird auch kein Arc geöffnet.
 */
export function createArc(themeByEvent, eventType, seq) {
  const theme = themeByEvent?.[eventType];
  return {
    id: `arc-${seq}`,
    name: `${eventType ?? 'event'} phase`,
    theme: typeof theme === 'string' && theme !== '' ? theme : null,
    status: 'active',
    first_event: null,
    last_event: null,
    span: { start: null, end: null },
  };
}

/**
 * Beziehungsstufe aus einer EXPLIZITEN Transition, nicht aus `djb2(pair) % 100`.
 *
 * Ohne passende Transition bleibt die Stufe, wie sie war, und die Evidenz ist
 * `NONE`. Aus dem Fehlen von Gegenbelegen entsteht keine Trust-Aussage: es gibt
 * keine Aufstufung durch Historie, keinen Zufall und keinen Hash.
 */
export function relationshipState(relationshipRule, current, eventType, payload) {
  const states = Array.isArray(relationshipRule?.states) && relationshipRule.states.length > 0
    ? relationshipRule.states
    : ['fresh_pair'];
  const from = states.includes(current) ? current : states[0];
  const transitions = Array.isArray(relationshipRule?.transitions) ? relationshipRule.transitions : [];
  for (const transition of transitions) {
    if (transition?.event !== eventType || transition?.from !== from) continue;
    if (transition.field !== undefined) {
      const value = payload?.[transition.field];
      if (typeof value !== 'string' || !Array.isArray(transition.when) || !transition.when.includes(value)) continue;
    }
    return { state: transition.to, reason: transition.reason ?? transition.event, evidence: transition.evidence ?? 'EXPLICIT_PAYLOAD' };
  }
  return { state: from, reason: 'KEINE_EVIDENZ', evidence: 'NONE' };
}

/** Ein Ereignis-Typ ist unterstützt, wenn der Vertrag ihm einen Mood gibt. */
function isSupported(rules, eventType) {
  return typeof eventType === 'string' && Object.hasOwn(rules?.moodByEvidence ?? {}, eventType);
}

/**
 * Den Composite fortschreiben: Vorgaenger + Ereignis, sonst nichts.
 *
 * Kein Modell, keine Uhr, kein Zufall. Jedes semantische Feld trägt seine
 * Herkunft mit (`mood_evidence`, `relationship_evidence`) und das Ereignis, das
 * es gesetzt hat (`mood_event`, `relationship_event`).
 */
export function deriveComposite(contract, prevComposite, event) {
  const rules = contract?.rules ?? {};
  const seq = (prevComposite?.seq ?? 0) + 1;
  const eventType = event?.type ?? null;
  const supported = isSupported(rules, eventType);

  const moodResult = supported
    ? deriveMood(rules.moodByEvidence, prevComposite?.mood, eventType)
    : { mood: prevComposite?.mood ?? 'idle', reason: 'UNBEKANNTES_EREIGNIS', evidence: 'NONE' };

  const pair = [...new Set([...(event?.actors ?? []), 'shinon'])].sort();
  const relationship = relationshipState(
    { states: rules.relationshipStates, transitions: rules.relationshipTransitions },
    prevComposite?.relationship_state,
    eventType,
    event?.context,
  );

  return {
    seq,
    mood: moodResult.mood,
    mood_reason: moodResult.reason,
    mood_evidence: moodResult.evidence,
    mood_event: supported ? (event?.id ?? null) : (prevComposite?.mood_event ?? null),
    narrator: supported ? deriveNarrator(rules.narrator, eventType) : (prevComposite?.narrator ?? 'shinon'),
    arc_id: prevComposite?.arc_id ?? null,
    arc_events: prevComposite?.arc_events ?? 0,
    freezeThreshold: prevComposite?.freezeThreshold,
    relationship_state: relationship.state,
    relationship_reason: relationship.reason,
    relationship_evidence: relationship.evidence,
    relationship_event: relationship.evidence === 'NONE' ? (prevComposite?.relationship_event ?? null) : (event?.id ?? null),
    pair,
    domain_resonance: supported
      ? { primary: String(eventType).split('.')[0], secondary: moodResult.mood }
      : (prevComposite?.domain_resonance ?? { primary: 'none', secondary: 'idle' }),
  };
}

/**
 * Einen gespeicherten Zustand pruefen — Form, nicht Meinung.
 *
 * Fremder Vertrag oder kaputte Huelle: `state: null` und ein benannter Grund.
 * Der Aufrufer faellt dann auf den leeren Anfang zurueck, statt einen
 * halbgueltigen Verlauf fortzuschreiben.
 */
export function validateNarrativeState(raw, contractName = null) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { state: null, reason: 'NOT_AN_OBJECT' };
  if (contractName !== null && raw.contract !== contractName) return { state: null, reason: 'FOREIGN_CONTRACT' };
  const state = raw.state;
  if (
    state === null || typeof state !== 'object' || Array.isArray(state) ||
    state.composite === null || typeof state.composite !== 'object' ||
    !Array.isArray(state.chronicle) || !Array.isArray(state.arcs) ||
    state.relationships === null || typeof state.relationships !== 'object'
  ) {
    return { state: null, reason: 'BAD_SHAPE' };
  }
  return { state, reason: null };
}

/** Der leere Anfangszustand: kein Ereignis, kein Arc, kein Paar. */
export function initialState(freezeThreshold) {
  return {
    chronicle: [],
    arcs: [],
    relationships: {},
    composite: {
      seq: 0,
      mood: 'idle',
      mood_reason: null,
      mood_evidence: 'NONE',
      mood_event: null,
      narrator: 'shinon',
      arc_id: null,
      arc_events: 0,
      freezeThreshold,
      relationship_state: 'fresh_pair',
      relationship_reason: 'KEINE_EVIDENZ',
      relationship_evidence: 'NONE',
      relationship_event: null,
      pair: [],
      domain_resonance: { primary: 'none', secondary: 'idle' },
    },
  };
}

/** Einen Arc oeffnen und ihn als laufenden setzen (EINE Stelle, zwei Aufrufer). */
function openArc(state, contract, event) {
  const arc = createArc(contract?.rules?.themeByEvent, event?.type, state.composite.seq);
  arc.first_event = event?.id ?? null;
  arc.span.start = event?.timestamp ?? null;
  state.arcs.push(arc);
  state.composite.arc_id = arc.id;
  state.composite.arc_events = 0;
  state.composite.domain_resonance = {
    primary: String(arc.theme ?? 'none'),
    secondary: state.composite.mood,
  };
  return arc;
}

/** Den laufenden Arc schliessen (Schwelle erreicht) — Grund steht im Composite. */
function closeArc(state, event) {
  const current = state.arcs.find((arc) => arc.id === state.composite.arc_id);
  if (current === undefined) return;
  current.status = 'archived';
  current.span.end = event?.timestamp ?? null;
  current.last_event = event?.id ?? null;
}

/**
 * Einen Takt weitergehen: ein Ereignis in den Zustand aufnehmen.
 *
 * Reihenfolge: Chronik, Arc (nur bei unterstütztem Ereignis mit Thema),
 * Einfrieren, Composite, Beziehung. Ein unbekanntes Ereignis landet in der
 * Chronik und zählt die Sequenz — es verschiebt kein semantisches Feld.
 */
export function advance(state, contract, event, config) {
  state.chronicle = appendChronicle(state.chronicle, event, config.chronicleLimit);

  const rules = contract?.rules ?? {};
  const supported = isSupported(rules, event?.type);
  const themed = supported && Object.hasOwn(rules?.themeByEvent ?? {}, event.type);

  if (themed) {
    const threshold = state.composite.freezeThreshold;
    const reached = (state.composite.arc_events ?? 0) >= threshold;
    if (state.composite.arc_id && reached) closeArc(state, event);
    if (!state.composite.arc_id || reached) openArc(state, contract, event);
  }

  state.composite = deriveComposite(contract, state.composite, event);
  if (themed) state.composite.arc_events = (state.composite.arc_events ?? 0) + 1;

  const pairKey = [...state.composite.pair].sort().join('+');
  if (!state.relationships[pairKey]) {
    state.relationships[pairKey] = {
      pair: state.composite.pair,
      history: [],
      state: state.composite.relationship_state,
      state_reason: state.composite.relationship_reason,
      state_evidence: state.composite.relationship_evidence,
      trust: null,
      respect: null,
      patterns: [],
      conflicts: [],
      open_threads: [],
    };
  }
  const relationship = state.relationships[pairKey];
  relationship.state = state.composite.relationship_state;
  relationship.state_reason = state.composite.relationship_reason;
  relationship.state_evidence = state.composite.relationship_evidence;
  relationship.history.push({ event: event?.id ?? null, type: event?.type ?? null, timestamp: event?.timestamp ?? null });
  return state;
}

/**
 * Ein Ereignis an die Chronik haengen, hoechstens `limit` Eintraege.
 *
 * Der Zeitstempel kommt AUS DEM EREIGNIS. Fehlt er, bleibt er `null` — die
 * Chronik ist das einzige Stueck dieses Kerns, das je eine Uhr haette lesen
 * koennen, und sie tut es nicht.
 */
export function appendChronicle(chronicle, event, limit) {
  const entry = { ...event, timestamp: event?.timestamp ?? null };
  const updated = [...(Array.isArray(chronicle) ? chronicle : []), entry];
  return updated.length > limit ? updated.slice(updated.length - limit) : updated;
}
