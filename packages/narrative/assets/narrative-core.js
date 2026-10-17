/**
 * @shinon/narrative — reiner Kern (assets/narrative-core.js).
 *
 * KEINE Imports (weder Bare noch node:): nur dann laeuft der Test in CI ohne
 * node_modules — dieselbe Regel wie bei `@shinon/scoring` (scoring-core.js) und
 * `@shinon/prompter` (note-core.js). `index.js` re-exportiert diesen Kern, die
 * Host-Anbindung (Events, Zustand, apply) bleibt dort.
 *
 * → Kanon: docs/COMMENT-KANON.md#k-460edae63587
 */

/** DJB2-Hash fuer String → Number (stabil, ohne Imports). */
export function djb2(text) {
  let hash = 5381;
  const value = String(text ?? '');
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return hash >>> 0;
}

/**
 * Den Mood eines Ereignisses lesen — Tabelle zuerst, Anti-Wiederholung danach.
 *
 * Der zugeordnete Mood gilt, AUSSER er waere derselbe wie der vorige: dann nimmt
 * die Regel den naechsten der Liste aus dem Vertrag. Beides ist nachlesbar; der
 * Zufall ist weg, die Eigenschaft „nie zweimal derselbe" bleibt.
 * @returns { mood, reason } — `reason` nennt, WAS entschieden hat.
 */
export function deriveMood(moodRule, previousMood, eventType) {
  const pool = Array.isArray(moodRule?.pool) && moodRule.pool.length > 0 ? moodRule.pool : ['idle'];
  const mapped = moodRule?.by_event?.[eventType];
  if (typeof mapped !== 'string' || mapped === '') {
    // Unbekanntes Ereignis: der vorige Mood bleibt — kein erfundener Takt.
    return { mood: typeof previousMood === 'string' && previousMood !== '' ? previousMood : pool[0], reason: 'UNBEKANNTES_EREIGNIS' };
  }
  if (mapped !== previousMood || pool.length === 1) return { mood: mapped, reason: eventType };
  const at = pool.indexOf(previousMood);
  return { mood: pool[(at + 1) % pool.length], reason: `${eventType}:ANTI_REPEAT` };
}

/** Wer diesen Takt erzaehlt — aus dem Praefix des Ereignisses, nicht aus einem Wuerfel. */
export function deriveNarrator(narratorRule, eventType) {
  const prefix = String(eventType ?? '').split('.')[0];
  const mapped = narratorRule?.by_event_prefix?.[prefix];
  return typeof mapped === 'string' && mapped !== '' ? mapped : (narratorRule?.default ?? 'shinon');
}

/** Ein neuer Arc: Thema aus dem Ereignis-Praefix (stabil), Rest aus dem Zeitpunkt des Ereignisses. */
export function createArc(themePool, eventType, seq) {
  const themes = Array.isArray(themePool) && themePool.length > 0 ? themePool : ['general'];
  return {
    id: `arc-${seq}`,
    name: `${eventType ?? 'event'} phase`,
    theme: themes[djb2(String(eventType ?? '').split('.')[0]) % themes.length],
    status: 'active',
    first_event: null,
    last_event: null,
    span: { start: null, end: null },
  };
}

/**
 * Beziehungszustand aus Paar + Historie.
 *
 * Die Schwellen kommen aus dem Vertrag (`relationship.states` in Reihenfolge von
 * hoch nach niedrig), nicht aus Zahlen im Code.
 */
export function relationshipState(relationshipRule, pair, historyLength) {
  const states = Array.isArray(relationshipRule?.states) && relationshipRule.states.length > 0
    ? relationshipRule.states
    : ['fresh_pair'];
  const score = Math.min(100, (djb2([...pair].sort().join('+')) % 100) + historyLength * 2);
  const step = 100 / states.length;
  const index = Math.min(states.length - 1, Math.floor(score / step));
  return states[index];
}

/**
 * Den Composite fortschreiben: Vorgaenger + Ereignis, sonst nichts.
 *
 * Kein Modell, keine Uhr, kein Zufall. `arc_id` laeuft weiter, solange der Arc
 * nicht eingefroren ist (`freezeThreshold` kommt aus der Konfiguration).
 */
export function deriveComposite(contract, prevComposite, event) {
  const derivation = contract?.derivation ?? {};
  const seq = (prevComposite?.seq ?? 0) + 1;
  const { mood, reason } = deriveMood(derivation.mood, prevComposite?.mood, event?.type);
  let arcId = prevComposite?.arc_id ?? null;
  if (arcId === null || (prevComposite?.arc_events ?? 0) >= (prevComposite?.freezeThreshold ?? Number.POSITIVE_INFINITY)) {
    arcId = `arc-${seq}`;
  }
  const pair = [...new Set([...(event?.actors ?? []), 'shinon'])].sort();
  return {
    seq,
    mood,
    mood_reason: reason,
    narrator: deriveNarrator(derivation.narrator, event?.type),
    arc_id: arcId,
    arc_events: (prevComposite?.arc_events ?? 0) + 1,
    freezeThreshold: prevComposite?.freezeThreshold,
    relationship_state: relationshipState(derivation.relationship, pair, prevComposite?.seq ?? 0),
    pair,
    domain_resonance: {
      primary: String(event?.type ?? 'unknown').split('.')[0],
      secondary: mood,
    },
  };
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
      narrator: 'shinon',
      arc_id: null,
      arc_events: 0,
      freezeThreshold,
      relationship_state: 'fresh_pair',
      pair: [],
      domain_resonance: { primary: 'none', secondary: 'idle' },
    },
  };
}

/** Einen Arc oeffnen und ihn als laufenden setzen (EINE Stelle, zwei Aufrufer). */
function openArc(state, contract, event) {
  const arc = createArc(contract?.derivation?.arc?.themes, event?.type, state.composite.seq);
  arc.first_event = event?.id ?? null;
  arc.span.start = event?.timestamp ?? null;
  state.arcs.push(arc);
  state.composite.arc_id = arc.id;
  state.composite.arc_events = 0;
  return arc;
}

/**
 * Einen Takt weitergehen: ein Ereignis in den Zustand aufnehmen.
 *
 * Die Reihenfolge ist die Aussage — Chronik, Arc, Einfrieren, Composite,
 * Beziehung. Der Arc-Wechsel geschieht VOR dem Composite, damit der neue Takt
 * schon im neuen Arc steht. Reine Zustandsarbeit: keine Ausgabe, kein Ereignis,
 * keine Uhr.
 */
export function advance(state, contract, event, config) {
  state.chronicle = appendChronicle(state.chronicle, event, config.chronicleLimit);

  if (!state.composite.arc_id) openArc(state, contract, event);

  if ((state.composite.arc_events ?? 0) >= state.composite.freezeThreshold) {
    const current = state.arcs.find((arc) => arc.id === state.composite.arc_id);
    if (current !== undefined) {
      current.status = 'archived';
      current.span.end = event?.timestamp ?? null;
    }
    openArc(state, contract, event);
  }

  state.composite = deriveComposite(contract, state.composite, event);

  const pairKey = [...state.composite.pair].sort().join('+');
  if (!state.relationships[pairKey]) {
    state.relationships[pairKey] = {
      pair: state.composite.pair,
      history: [],
      trust: 0.5,
      respect: 0.5,
      patterns: [],
      conflicts: [],
      open_threads: [],
    };
  }
  state.relationships[pairKey].history.push({ event: event?.id ?? null, type: event?.type ?? null, timestamp: event?.timestamp ?? null });
  return state;
}

/**
 * Ein Ereignis an die Chronik haengen, hoechstens `limit` Eintraege.
 *
 * Der Zeitstempel kommt AUS DEM EREIGNIS. Fehlt er, bleibt er `null` — frueher
 * stand hier `new Date().toISOString()`, und damit war die Chronik das einzige
 * Stueck dieses Kerns, das die Uhr las.
 */
export function appendChronicle(chronicle, event, limit) {
  const entry = { ...event, timestamp: event?.timestamp ?? null };
  const updated = [...(Array.isArray(chronicle) ? chronicle : []), entry];
  return updated.length > limit ? updated.slice(updated.length - limit) : updated;
}
