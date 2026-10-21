/**
 * @shinon/codingmon — der Encounter-Vertrag und der reine Reducer (S4 / B03).
 *
 * WAS HIER STEHT UND WARUM ES HIER STEHT: die Buehne, die einen Turn als Kampf
 * zeigt, braucht einen Zustand, der aus EREIGNISSEN folgt — nicht aus einer
 * Animation. Der Begleiter ist das CodingMon, der Gegner ist die diagnostische
 * Rolle der Aufgabe; die Zuordnung Tier/Aufgabe und die Praesentationszustaende
 * liegen schon in diesem Paket (`arenaFor`, `presentationState`). Darum liegt
 * auch der Encounter-Zustand hier: er ist die Pet-Seite derselben Sache.
 *
 * DREI REGELN, die man dem Code ansehen muss:
 *
 *   1. EINE DEFINITION. `ENCOUNTER_EVENTS` ist die einzige Stelle, an der ein
 *      Encounter-Ereignis existiert: Name, Quelle, erlaubte Herkunftsstaende,
 *      Zielzustand, Payload-Allowlist und Wirkung. Die Source Map ist daraus
 *      ABGELEITET (`ENCOUNTER_SOURCE_MAP`), nicht danebengeschrieben — eine
 *      zweite Liste waere eine zweite Wahrheit.
 *   2. KEINE UMWELT. `reduceEncounter` liest keine Uhr, kein DOM, kein Netz und
 *      keinen Zufall. Derselbe (Zustand, Ereignis)-Paar ergibt immer denselben
 *      naechsten Zustand; der Test friert die Eingabe ein und vergleicht zweimal.
 *   3. KEINE ERFUNDENEN NATIVEN TYPEN. Jede Quelle ist entweder ein Eintrag des
 *      geprueften Event-Spines (`packages/events/assets/event-spine.json`) oder
 *      ein internes Paket, das es im Baum gibt. Der Test prueft beides gegen die
 *      echten Dateien; `kind: 'unavailable'` ist die erlaubte, sichtbare Antwort
 *      fuer eine Beobachtung, die es (noch) nicht gibt — niemals ein geratener
 *      Fortschritt.
 *
 * WAS DER REDUCER NICHT TUT: er schreibt keinen Spielstand, vergibt kein XP, ruft
 * kein Modell und keine Animation. Er faltet nur bestaetigte Ereignisse zu einem
 * UI-Zustand. Die Abrechnung (Belohnung, Capture, Loot) ist eine eigene,
 * idempotente Entscheidung (B10) und haengt an einem finalen Ergebnisvertrag —
 * nicht an `turn.end` und nicht an einer Animationslaenge.
 *
 * KEINE IMPORTS: wie `assets/mechanik.js` laedt diese Datei ohne node_modules,
 * damit die Einzeltests in CI ohne Installation laufen.
 */

/** Vertragsname der Ereignis-Huelle (Kanon: `shinon.<bereich>/<sache>-v<N>`). */
export const ENCOUNTER_CONTRACT = 'shinon.encounter/event-v1';

/** Die geschlossene Zustandsmenge. Mehr gibt es nicht, und nichts davon ist "Erfolg" per se. */
export const ENCOUNTER_STATES = Object.freeze([
  'closed',
  'preflight',
  'running',
  'validating',
  'completed',
  'rejected',
  'aborted',
  'recoverable-error',
  'compact',
]);

/** Zustaende, aus denen heraus ein Turn nicht mehr weiterlaeuft. */
export const ENCOUNTER_TERMINAL_STATES = Object.freeze([
  'completed',
  'rejected',
  'aborted',
  'recoverable-error',
]);

/** Wie viele Ereignis-IDs gegen Doppelzaehlung behalten werden (harte Grenze). */
export const ENCOUNTER_EVENT_MEMORY = 64;

/** Erlaubte Herkunftsarten einer Beobachtung. */
export const ENCOUNTER_SOURCE_KINDS = Object.freeze(['spine', 'internal', 'unavailable']);

/** Was ein Payload-Wert sein darf: Skalar oder Liste von Zeichenketten. Nie ein Blob. */
const isAllowedValue = (value) => value === null
  || typeof value === 'string'
  || typeof value === 'number'
  || typeof value === 'boolean'
  || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'));

const registry = {};
const define = (type, definition) => {
  registry[type] = Object.freeze(definition);
};

// ── Die Ereignisse (eine Tabelle, keine zweite Liste) ───────────────────────
//
// `from` ist die Zusage: aus welchem Zustand darf das Ereignis kommen. Ein
// Ereignis aus einem anderen Zustand ist KEIN Fehler des Aufrufers, sondern ein
// verspaetetes oder fremdes Ereignis — es wird abgewiesen und der Zustand steht
// still. `to: null` heisst: der Top-Level-Zustand bleibt, nur Beobachtung wird
// abgelegt (Fakten, Bloecke, Werkzeuge, Bergung, Skill-Vorschlag).

define('encounter.turn.started', {
  from: ['closed'],
  to: 'preflight',
  source: { kind: 'spine', ref: 'turn.start', owner: '@shinon/events' },
  payload: [],
  apply: (state) => state,
});

define('encounter.task.classified', {
  from: ['preflight'],
  to: null,
  source: { kind: 'internal', ref: 'goal-policy', owner: '@shinon/task-router' },
  payload: ['taskClass', 'taskLabel'],
  apply: (state, payload) => ({
    ...state,
    task: { taskClass: payload.taskClass ?? null, taskLabel: payload.taskLabel ?? null },
  }),
});

define('encounter.index.progress', {
  from: ['preflight', 'running'],
  to: null,
  source: { kind: 'internal', ref: 'index-query', owner: '@shinon/project-index' },
  payload: ['phase', 'count'],
  apply: (state, payload) => ({
    ...state,
    index: {
      phase: typeof payload.phase === 'string' ? payload.phase : state.index.phase,
      count: Number.isSafeInteger(payload.count) ? payload.count : state.index.count,
    },
  }),
});

define('encounter.fact.validated', {
  from: ['preflight', 'running'],
  to: null,
  source: { kind: 'internal', ref: 'facts-snapshot', owner: '@shinon/project-index' },
  payload: ['snapshotId', 'valid', 'untrusted', 'unknown'],
  apply: (state, payload) => ({
    ...state,
    facts: {
      snapshotId: typeof payload.snapshotId === 'string' ? payload.snapshotId : state.facts.snapshotId,
      // Zaehler kommen aus dem Snapshot. Fehlt einer, bleibt der alte stehen —
      // eine fehlende Zahl ist nicht null.
      valid: Number.isSafeInteger(payload.valid) ? payload.valid : state.facts.valid,
      untrusted: Number.isSafeInteger(payload.untrusted) ? payload.untrusted : state.facts.untrusted,
      unknown: Number.isSafeInteger(payload.unknown) ? payload.unknown : state.facts.unknown,
    },
  }),
});

define('encounter.block.selected', {
  from: ['preflight'],
  to: null,
  source: { kind: 'internal', ref: 'block-select', owner: '@shinon/prompter' },
  payload: ['blocks'],
  apply: (state, payload) => ({
    ...state,
    preflight: { ...state.preflight, blocks: Array.isArray(payload.blocks) ? payload.blocks.slice() : state.preflight.blocks },
  }),
});

define('encounter.preflight.ready', {
  from: ['preflight'],
  to: null,
  source: { kind: 'internal', ref: 'pre-step', owner: '@shinon/prompter' },
  payload: [],
  apply: (state) => ({ ...state, preflight: { ...state.preflight, ready: true } }),
});

define('encounter.route.selected', {
  from: ['preflight', 'running'],
  to: null,
  source: { kind: 'spine', ref: 'request.header', owner: '@shinon/events' },
  payload: ['provider', 'model'],
  apply: (state, payload) => ({
    ...state,
    preflight: {
      ...state.preflight,
      route: {
        provider: typeof payload.provider === 'string' ? payload.provider : null,
        model: typeof payload.model === 'string' ? payload.model : null,
      },
    },
  }),
});

define('encounter.run.started', {
  from: ['preflight'],
  to: 'running',
  source: { kind: 'spine', ref: 'step.start', owner: '@shinon/events' },
  payload: ['step'],
  apply: (state, payload) => ({
    ...state,
    step: Number.isSafeInteger(payload.step) ? payload.step : state.step,
  }),
});

define('encounter.tool.started', {
  from: ['running'],
  to: null,
  source: { kind: 'spine', ref: 'tool.requested', owner: '@shinon/events' },
  payload: ['callId', 'name'],
  apply: (state, payload) => ({
    ...state,
    tools: {
      // `open` zaehlt Aufrufe ohne Ergebnis. Ohne callId ist der Aufruf nicht
      // zuordenbar und bleibt offen — fail-closed, wie in der Trajektorie.
      open: state.tools.open + 1,
      calls: state.tools.calls + 1,
      last: typeof payload.name === 'string' ? payload.name : state.tools.last,
    },
  }),
});

define('encounter.tool.completed', {
  from: ['running'],
  to: null,
  source: { kind: 'spine', ref: 'tool.completed', owner: '@shinon/events' },
  payload: ['callId', 'ok'],
  apply: (state) => ({
    ...state,
    tools: { ...state.tools, open: Math.max(0, state.tools.open - 1) },
  }),
});

define('encounter.key.rotated', {
  from: ['running', 'recoverable-error'],
  to: null,
  source: { kind: 'internal', ref: 'rotation', owner: '@shinon/key-router' },
  payload: ['reason'],
  apply: (state, payload) => ({
    ...state,
    keyRotation: {
      count: state.keyRotation.count + 1,
      reason: typeof payload.reason === 'string' ? payload.reason : state.keyRotation.reason,
    },
  }),
});

define('encounter.answer.received', {
  from: ['running'],
  to: 'validating',
  source: { kind: 'spine', ref: 'message.completed', owner: '@shinon/events' },
  payload: [],
  apply: (state) => state,
});

define('encounter.result-contract.passed', {
  from: ['running', 'validating'],
  to: 'validating',
  source: { kind: 'internal', ref: 'result-contract', owner: '@shinon/prompter' },
  payload: ['contract'],
  apply: (state, payload) => ({
    ...state,
    outcome: { kind: 'contract-passed', contract: typeof payload.contract === 'string' ? payload.contract : null, reason: null },
  }),
});

define('encounter.result-contract.failed', {
  from: ['running', 'validating'],
  to: 'rejected',
  source: { kind: 'internal', ref: 'result-contract', owner: '@shinon/prompter' },
  payload: ['reason'],
  apply: (state, payload) => ({
    ...state,
    outcome: { kind: 'contract-failed', contract: null, reason: typeof payload.reason === 'string' ? payload.reason : null },
  }),
});

define('encounter.abort', {
  from: ['preflight', 'running', 'validating'],
  to: 'aborted',
  source: { kind: 'internal', ref: 'abort-core', owner: '@shinon/prompter' },
  payload: ['reason'],
  apply: (state, payload) => ({
    ...state,
    outcome: { kind: 'aborted', contract: null, reason: typeof payload.reason === 'string' ? payload.reason : null },
  }),
});

define('encounter.turn.completed', {
  from: ['running', 'validating'],
  to: 'completed',
  source: { kind: 'spine', ref: 'turn.end', owner: '@shinon/events' },
  payload: ['reason'],
  apply: (state) => ({
    ...state,
    // Der Vertrag entscheidet den Ton der Bilanz: bestanden ist bestanden,
    // ohne Vertrag ist der Turn NEUTRAL abgeschlossen — nicht gewonnen.
    outcome: state.outcome ?? { kind: 'neutral', contract: null, reason: null },
  }),
});

define('encounter.turn.failed', {
  from: ['running', 'validating'],
  to: 'recoverable-error',
  source: { kind: 'spine', ref: 'turn.end', owner: '@shinon/events' },
  payload: ['reason'],
  apply: (state, payload) => ({
    ...state,
    outcome: { kind: 'error', contract: null, reason: typeof payload.reason === 'string' ? payload.reason : null },
  }),
});

define('encounter.salvage.available', {
  from: ['running', 'validating', 'recoverable-error'],
  to: null,
  source: { kind: 'internal', ref: 'salvage-store', owner: '@shinon/prompter' },
  payload: ['recordId'],
  apply: (state, payload) => ({
    ...state,
    // Bergung ist ein UNTERZUSTAND, kein Erfolg: der Status bleibt, wo er war.
    salvage: { recordId: typeof payload.recordId === 'string' ? payload.recordId : null },
  }),
});

define('encounter.skill.proposed', {
  from: ['running', 'validating', 'completed'],
  to: null,
  source: { kind: 'internal', ref: 'skill-lifecycle', owner: '@shinon/prompter' },
  payload: ['skillId', 'status'],
  apply: (state, payload) => ({
    ...state,
    // Ein Vorschlag ist NIE eine Aktivierung: `status` ist hier konstant
    // `proposed`, egal was das Ereignis behauptet. Ein `active` kaeme nur aus
    // einer bestaetigten Nutzerentscheidung (B08) und nicht aus einem Ereignis.
    skill: {
      skillId: typeof payload.skillId === 'string' ? payload.skillId : null,
      status: 'proposed',
    },
  }),
});

define('encounter.receipt.compacted', {
  from: ENCOUNTER_TERMINAL_STATES,
  to: 'compact',
  source: { kind: 'internal', ref: 'receipt', owner: '@shinon/popup' },
  payload: [],
  apply: (state) => state,
});

/** Die einzige Ereignisdefinition. Eingefroren, damit niemand sie zur Laufzeit erweitert. */
export const ENCOUNTER_EVENTS = Object.freeze(registry);

/** Die Source Map — ABGELEITET aus `ENCOUNTER_EVENTS`, nicht gepflegt. */
export const ENCOUNTER_SOURCE_MAP = Object.freeze(Object.fromEntries(
  Object.entries(ENCOUNTER_EVENTS).map(([type, definition]) => [type, Object.freeze({ ...definition.source })]),
));

/** Ereignistypen in Tabellenreihenfolge (stabil, weil die Tabelle stabil ist). */
export const ENCOUNTER_EVENT_TYPES = Object.freeze(Object.keys(ENCOUNTER_EVENTS));

/**
 * Was ein gueltiger Zustand ist, in einer Pruefung — damit ein Aufrufer mit
 * einem fremden Objekt keinen halben Encounter weiterfaltet.
 */
const stateIssues = (state) => {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return 'STATE_NOT_OBJECT';
  if (state.contract !== ENCOUNTER_CONTRACT) return 'STATE_CONTRACT';
  if (!ENCOUNTER_STATES.includes(state.status)) return 'STATE_STATUS';
  if (!Array.isArray(state.seen)) return 'STATE_SEEN';
  // Die verschachtelten Beobachtungen werden gebraucht, bevor sie gelesen
  // werden: ein halber Zustand wuerde sonst im `apply` werfen statt hier mit
  // einem Code abgewiesen zu werden.
  for (const key of ['preflight', 'facts', 'index', 'tools', 'keyRotation']) {
    if (state[key] === null || typeof state[key] !== 'object' || Array.isArray(state[key])) return `STATE_SHAPE:${key}`;
  }
  if (!Array.isArray(state.preflight.blocks)) return 'STATE_SHAPE:preflight.blocks';
  if (!Number.isSafeInteger(state.applied) || !Number.isSafeInteger(state.step)) return 'STATE_SHAPE:counter';
  return null;
};

/**
 * Die Ereignis-Huelle pruefen. Rueckgabe ist ein Code oder null.
 *
 * Die Reihenfolge ist Absicht: erst die FORM (Vertrag, IDs, Typ), dann die
 * ABWEISUNGSGRUENDE, die den Zustand nicht beruehren (fremder Turn, doppelte
 * ID, unbekannter Typ), zuletzt die Uebergangsregel. So bekommt jeder Fall
 * seinen eigenen Namen statt eines Sammel-Fehlers.
 */
const eventIssues = (event) => {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) return 'EVENT_NOT_OBJECT';
  if (event.contract !== ENCOUNTER_CONTRACT) return 'EVENT_CONTRACT';
  for (const field of ['eventId', 'type', 'sessionId', 'turnId', 'source']) {
    if (typeof event[field] !== 'string' || event[field].trim() === '') return `EVENT_FIELD:${field}`;
  }
  const definition = ENCOUNTER_EVENTS[event.type];
  if (definition === undefined) return 'UNKNOWN_EVENT_TYPE';
  if (definition.source.owner !== event.source) return `SOURCE_MISMATCH:${event.type}`;
  const payload = event.payload;
  if (payload !== undefined && (payload === null || typeof payload !== 'object' || Array.isArray(payload))) return 'PAYLOAD_NOT_OBJECT';
  for (const key of Object.keys(payload ?? {})) {
    if (!definition.payload.includes(key)) return `PAYLOAD_UNKNOWN_FIELD:${key}`;
    if (!isAllowedValue(payload[key])) return `PAYLOAD_UNSUPPORTED_VALUE:${key}`;
  }
  return null;
};

const result = (state, outcome, reason = null) => ({ state, outcome, reason });

/**
 * Der Reducer: (Zustand, Ereignis) -> naechster Zustand. Rein und total.
 *
 * Rueckgabe ist bewusst NICHT nur der Zustand: `outcome` sagt, ob das Ereignis
 * gewirkt hat, und `reason` nennt den Grund einer Ablehnung. Ein Aufrufer, der
 * nur den Zustand braucht, nimmt `.state`; ein Test, der wissen will, WARUM
 * nichts passiert ist, liest `.reason`. Bei `IGNORED`/`REJECTED` ist der
 * zurueckgegebene Zustand DASSELBE Objekt (Identitaet), nicht eine Kopie —
 * damit ein unbekanntes Ereignis nachweisbar nichts anfasst.
 *
 * Die Faelle in Reihenfolge:
 *   STATE_*              Zustand ist kein Encounter-Zustand     -> REJECTED
 *   EVENT_*              Huelle/Allowlist verletzt              -> REJECTED
 *   UNKNOWN_EVENT_TYPE   Typ steht nicht in der Tabelle          -> IGNORED
 *   DUPLICATE_EVENT      eventId schon gesehen                   -> IGNORED
 *   FOREIGN_TURN         Ereignis gehoert zu einem anderen Turn  -> REJECTED
 *   INVALID_TRANSITION   Zustand ist in `from` nicht enthalten   -> REJECTED
 */
export function reduceEncounter(state, event) {
  const brokenState = stateIssues(state);
  if (brokenState !== null) return result(state, 'REJECTED', brokenState);

  const brokenEvent = eventIssues(event);
  if (brokenEvent === 'UNKNOWN_EVENT_TYPE') return result(state, 'IGNORED', brokenEvent);
  if (brokenEvent !== null) return result(state, 'REJECTED', brokenEvent);

  if (state.seen.includes(event.eventId)) return result(state, 'IGNORED', 'DUPLICATE_EVENT');
  if (state.turnId !== null && state.turnId !== event.turnId) return result(state, 'REJECTED', 'FOREIGN_TURN');

  const definition = ENCOUNTER_EVENTS[event.type];
  if (!definition.from.includes(state.status)) return result(state, 'REJECTED', 'INVALID_TRANSITION');

  const base = {
    ...state,
    status: definition.to ?? state.status,
    turnId: event.turnId,
    sessionId: event.sessionId,
    applied: state.applied + 1,
  };
  const applied = definition.apply(base, event.payload ?? {});
  const seen = [...state.seen, event.eventId];
  return result(
    { ...applied, seen: seen.length > ENCOUNTER_EVENT_MEMORY ? seen.slice(seen.length - ENCOUNTER_EVENT_MEMORY) : seen },
    'APPLIED',
  );
}

/** Ein frischer Zustand. Keine Uhr, kein Zufall: zwei Aufrufe sind gleich. */
export function createEncounterState() {
  return {
    contract: ENCOUNTER_CONTRACT,
    status: 'closed',
    turnId: null,
    sessionId: null,
    applied: 0,
    step: 0,
    seen: [],
    task: null,
    preflight: { ready: false, blocks: [], route: null },
    facts: { snapshotId: null, valid: 0, untrusted: 0, unknown: 0 },
    index: { phase: null, count: 0 },
    tools: { calls: 0, open: 0, last: null },
    keyRotation: { count: 0, reason: null },
    salvage: null,
    skill: null,
    outcome: null,
  };
}

/**
 * Alle Ereignisse in Reihenfolge falten — Bequemlichkeit fuer Tests und die
 * Buehne. Dieselbe Funktion, kein zweiter Reducer: das Ergebnis ist genau
 * das, was ein einzelner Aufruf je Ereignis ergibt.
 */
export function foldEncounter(state, events) {
  const journal = [];
  let current = state;
  for (const event of Array.isArray(events) ? events : []) {
    const step = reduceEncounter(current, event);
    journal.push({ type: typeof event?.type === 'string' ? event.type : null, outcome: step.outcome, reason: step.reason });
    current = step.state;
  }
  return { state: current, journal };
}

/**
 * Eine gueltige Ereignis-Huelle bauen — fuer Tests und fuer den Adapter, der
 * native Signale uebersetzt. Die Huelle ist die Form aus dem Encounter-Vertrag;
 * `payload` wird NICHT geprueft (das tut der Reducer), damit ein Adapter einen
 * Verstoss sichtbar machen kann statt ihn hier zu verstecken.
 */
export function encounterEvent(type, { eventId, turnId, sessionId, payload, source } = {}) {
  const definition = ENCOUNTER_EVENTS[type];
  if (definition === undefined) throw new Error(`Unbekannter Encounter-Typ: ${type}`);
  return {
    contract: ENCOUNTER_CONTRACT,
    eventId: eventId ?? `${type}#1`,
    type,
    sessionId: sessionId ?? 'session-test',
    turnId: turnId ?? 'turn-test',
    source: source ?? definition.source.owner,
    payload: payload ?? {},
  };
}
