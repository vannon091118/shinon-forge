/**
 * @shinon/scoring — reiner Kern (assets/scoring-core.js).
 *
 * KEINE Imports (weder Bare noch node:): nur dann läuft der Replay-Test in
 * CI ohne node_modules — dieselbe Regel wie bei `@shinon/events` (Vertrag als
 * Daten) und `@shinon/codingmon` (assets/mechanik.js). `index.js` re-exportiert
 * diesen Kern, die Host-Anbindung (Dateien laden) bleibt dort.
 *
 * replay(Anfangszustand, Event-Strom) → { scorecard, injection, digest }.
 * Rein und deterministisch: kein Math.random, kein Date.now, kein Modell.
 * Unbekanntes ändert nichts (fail-closed); gezählt wird es trotzdem.
 */

/** Vier Nachkommastellen nach jedem Event: kein Float-Rauschen im Golden-Wert. */
export function round4(value) {
  return Number(Number(value).toFixed(4));
}

/** Kanonisches JSON: Schlüssel rekursiv sortiert — gleiche Eingabe, gleicher Digest. */
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * cyrb53 als Hex-String (16 Stellen): deterministischer Digest ohne Imports.
 * Zwei 32-Bit-Läufe über denselben Text — keine Zufallsquelle beteiligt.
 */
export function stableHash(text) {
  const input = String(text);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < input.length; index += 1) {
    const ch = input.charCodeAt(index);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const half = (value) => (value >>> 0).toString(16).padStart(8, '0');
  return `${half(h1)}${half(h2)}`;
}

/**
 * Eine Dimension der Scorecard lesen. Reine Funktion: Unbekanntes ergibt null
 * (fail-closed: kein Raten, kein Default).
 */
export function readScore(scorecard, dimension) {
  if (scorecard === null || typeof scorecard !== 'object') return null;
  if (typeof dimension !== 'string' || dimension.trim() === '') return null;
  const value = scorecard.dimensions?.[dimension] ?? scorecard.scores?.[dimension];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Anfangszustand aus dem Vertrag: Roh- und veröffentlichte Werte sind gleich. */
export function initialState(scoring) {
  const scores = {};
  for (const [name, dimension] of Object.entries(scoring?.dimensions ?? {})) {
    scores[name] = dimension?.initial ?? 0;
  }
  return {
    scores: { ...scores },
    published: { ...scores },
    relation: scoring?.relation?.initial ?? null,
    signals: 0,
    ignored: 0,
    signalsSincePublish: 0,
  };
}

function clamp(value, dimension) {
  const min = typeof dimension?.min === 'number' ? dimension.min : 0;
  const max = typeof dimension?.max === 'number' ? dimension.max : 1;
  return Math.min(max, Math.max(min, value));
}

function snapshotScores(state) {
  return { ...state.scores };
}

/**
 * Ein Event, ein Übergang. Reihenfolge pro Event: prüfen (Typ, Payload,
 * Relation) — dann erst mutieren (Decay, Delta, Kühlen). Eine fehlgeschlagene
 * Prüfung lässt den Zustand byte-identisch.
 */
export function applyEvent(contracts, state, event) {
  const scoring = contracts?.scoring ?? {};
  const type = typeof event?.type === 'string' ? event.type : null;
  const payload = event?.payload !== null && typeof event?.payload === 'object' ? event.payload : {};
  const definition = type !== null ? scoring.events?.[type] : undefined;

  const untouched = (reason) => ({
    state: {
      scores: { ...state.scores },
      published: { ...state.published },
      relation: state.relation,
      signals: state.signals,
      ignored: state.ignored + 1,
      signalsSincePublish: state.signalsSincePublish,
    },
    changed: false,
    reason,
  });

  if (typeof definition !== 'object' || definition === null) return untouched('UNKNOWN_EVENT');
  for (const key of definition.payload ?? []) {
    const value = payload[key];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      return untouched(`MISSING_PAYLOAD:${key}`);
    }
  }
  if (definition.relation === true && !(scoring.relation?.levels ?? []).includes(payload.relation)) {
    return untouched(`UNKNOWN_RELATION:${String(payload.relation)}`);
  }

  // Mutieren: erst vergessen (langsam, Richtung initial), dann das Delta.
  const rate = typeof scoring.decay?.rate === 'number' ? scoring.decay.rate : 0;
  const scores = {};
  for (const [name, dimension] of Object.entries(scoring.dimensions ?? {})) {
    const initial = dimension?.initial ?? 0;
    const current = typeof state.scores[name] === 'number' ? state.scores[name] : initial;
    const delta = typeof definition.delta?.[name] === 'number' ? definition.delta[name] : 0;
    scores[name] = clamp(round4(current + (initial - current) * rate + delta), dimension);
  }

  const next = {
    scores,
    published: { ...state.published },
    relation: definition.relation === true ? payload.relation : state.relation,
    signals: state.signals + 1,
    ignored: state.ignored,
    signalsSincePublish: state.signalsSincePublish + 1,
  };

  // Kühlen: veröffentlichen nur alle cooling.interval Signale.
  const interval = scoring.cooling?.interval ?? 1;
  if (Number.isInteger(interval) && interval >= 1 && next.signalsSincePublish >= interval) {
    next.published = snapshotScores(next);
    next.signalsSincePublish = 0;
  }
  return { state: next, changed: true, reason: type };
}

/**
 * Trigger in Reihenfolge: der erste passende feuert. Bedingungen lesen die
 * VERÖFFENTLICHTEN Werte; der Skill muss im Technik-Profil stehen, sonst wird
 * der Trigger übersprungen.
 */
export function evaluateTriggers(contracts, scorecard) {
  const triggers = contracts?.triggers?.triggers ?? [];
  const skills = contracts?.profile?.skills ?? [];
  const published = scorecard?.published ?? {};
  for (const trigger of triggers) {
    if (typeof trigger?.id !== 'string' || typeof trigger?.skill !== 'string') continue;
    if (!skills.includes(trigger.skill)) continue;
    if (typeof trigger.dimension === 'string') {
      const value = published[trigger.dimension];
      if (typeof value !== 'number') continue;
      if (trigger.op === 'below' && !(value < trigger.threshold)) continue;
      if (trigger.op === 'above' && !(value > trigger.threshold)) continue;
      if (trigger.op !== 'below' && trigger.op !== 'above') continue;
    }
    if (typeof trigger.relation === 'string' && scorecard?.relation !== trigger.relation) continue;
    if (trigger.dimension === undefined && trigger.relation === undefined) continue;
    return { trigger: trigger.id, skill: trigger.skill, text: trigger.text ?? '', reason: `TRIGGER:${trigger.id}` };
  }
  return { trigger: null, skill: null, text: '', reason: 'NO_TRIGGER' };
}

/**
 * Der Replay: Anfangszustand + Event-Strom → Scorecard + Injektion + Digest.
 * Der Digest läuft über Vertrag, Anfang und Strom — gleicher Strom bei gleichem
 * Start ergibt dieselbe Scorecard, dieselbe Injektion, denselben Digest.
 */
export function replay(contracts, initial, stream) {
  const scoring = contracts?.scoring ?? {};
  let state = {
    scores: { ...(initial?.scores ?? {}) },
    published: { ...(initial?.published ?? {}) },
    relation: initial?.relation ?? null,
    signals: initial?.signals ?? 0,
    ignored: initial?.ignored ?? 0,
    signalsSincePublish: initial?.signalsSincePublish ?? 0,
  };
  for (const event of stream ?? []) {
    state = applyEvent(contracts, state, event).state;
  }
  const scorecard = {
    scores: { ...state.scores },
    published: { ...state.published },
    relation: state.relation,
    signals: state.signals,
    ignored: state.ignored,
  };
  const injection = evaluateTriggers(contracts, scorecard);
  const digest = `sc_${stableHash(canonicalize({ contract: scoring.contract ?? null, initial, stream }))}`;
  return { scorecard, injection, digest };
}
