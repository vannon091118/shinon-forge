/**
 * state-machine.js — der Zustand der Persona: Vertrag, Übergang, Verlauf.
 *
 * Eigentuemer-Grenze (2026-10-23): dieser Kern rechnet NUR. Er liest den
 * Zustandsvertrag, leitet aus einem Event den naechsten Zustand ab und haelt den
 * Verlauf. Er kennt keinen `ctx`, keinen Bus, keinen Prompt und keine Datei
 * ausser dem Vertrag selbst.
 *
 * Warum das ein eigener Ort ist: dieselbe Rechnung braucht der Host (Prompt,
 * Panel), der Test ohne DSH und die Probe. Solange sie im Eintrag stand, war sie
 * nur ueber `apply` erreichbar und der Eintrag trug zwei Zustaende (Prompt und
 * Maschine) gleichzeitig. Die oeffentlichen Namen bleiben unveraendert — der
 * Eintrag reicht sie Name fuer Name weiter (`scripts/gate/tests/persona-state.part*.test.mjs`).
 */
import { readFileSync } from 'node:fs';

/** Leerer Vertrag: die Persona läuft dann mit Baseline, aber ohne Voice-Texte. */
export const EMPTY_CONTRACT = {
  contract: 'shinon.persona-state/unloaded',
  identity: 'Shinon',
  baseline: { stance: 'critical', uncertainty: 'explicit', mood: 'idle', capabilities: [], limitations: [] },
  transitions: {},
  voice: {},
  limits: { maxEvents: 25, maxLimitations: 8 },
};

/**
 * Zustandsvertrag aus dem Paket laden.
 *
 * Der Pfad ist relativ zum PAKET-ROOT (Config-Vorgabe `./assets/persona-state.json`),
 * nicht zu dieser Datei: sie liegt selbst in `assets/`, und `new URL('./assets/…')`
 * zeigte von hier aus auf `assets/assets/…`. Genau dieser Fehler waere still — der
 * Aufrufer faengt ihn und laeuft mit dem LEEREN Vertrag weiter (kein Uebergang,
 * keine Stimme). Deshalb steht der Bezugspunkt hier ausdruecklich.
 */
export function loadStateContract(relPath) {
  return JSON.parse(readFileSync(new URL(relPath, new URL('../', import.meta.url)), 'utf8'));
}

/** Initialer Zustand: die Baseline aus dem Vertrag. Reine Funktion. */
export function initialState(contract) {
  const baseline = contract.baseline ?? {};
  return {
    identity: contract.identity ?? 'Shinon',
    stance: baseline.stance ?? 'critical',
    uncertainty: baseline.uncertainty ?? 'explicit',
    mood: baseline.mood ?? 'idle',
    capabilities: [...(baseline.capabilities ?? [])],
    limitations: [...(baseline.limitations ?? [])],
    relation: baseline.relation ?? contract.relation?.initial ?? 'known',
  };
}

/** Die Felder, die einen Persona-Zustand ausmachen — die Grundlage des Vergleichs. */
const STATE_FIELDS = ['identity', 'stance', 'uncertainty', 'mood', 'capabilities', 'limitations', 'relation'];

/**
 * Grenze fuer das Zaehl-Woerterbuch unbekannter Event-Typen. Ein Typ mit Pfad oder Parameter
 * im Namen darf den Speicher nicht ueber die Sitzungsdauer wachsen lassen; alles darueber
 * laeuft in EINEN benannten Ueberlauf-Eimer, damit die Zahl sichtbar bleibt statt zu verschwinden.
 */
const IGNORED_TYPE_LIMIT = 64;
const IGNORED_OVERFLOW_KEY = '<overflow>';

/**
 * Zwei Zustände feldweise vergleichen. Gleich heißt: jedes der sechs Felder ist
 * gleich, Listen elementweise und in der Reihenfolge.
 */
function sameState(left, right) {
  for (const field of STATE_FIELDS) {
    if (Array.isArray(left[field]) || Array.isArray(right[field])) {
      const a = Array.isArray(left[field]) ? left[field] : [];
      const b = Array.isArray(right[field]) ? right[field] : [];
      if (a.length !== b.length || a.some((value, index) => value !== b[index])) return false;
    } else if (left[field] !== right[field]) {
      return false;
    }
  }
  return true;
}

/**
 * Ein Event, ein Übergang. Deterministisch und rein — kein Modell, keine Zeit, kein Zufall.
 * Unbekannte Events ändern nichts (fail-closed: kein Raten).
 *
 * `changed` ist ein Messergebnis, keine Behauptung: der berechnete Zustand wird
 * feldweise gegen den vorigen geprüft. Ein Übergang, der nichts verschiebt (etwa
 * eine Limitation, die schon gesetzt war), meldet damit `false` — kein
 * History-Eintrag, kein neuer Prompt-Abschnitt für eine Nicht-Änderung.
 */
export function deriveState(contract, state, eventType, event) {
  const transition = contract.transitions?.[eventType];
  if (!transition) return { state, changed: false, reason: 'UNKNOWN_EVENT' };

  // relation.updated trägt die Stufe im Event (Nutzlastfeld relation) — kein
  // statischer Übergang. Unbenannt heißt: nichts ändern (fail-closed, kein Raten).
  // Nur lesend: die Persona setzt die Stufe aus dem Event, schreibt aber nie eine.
  let relation = state.relation ?? contract.baseline?.relation ?? contract.relation?.initial ?? 'known';
  if (eventType === 'relation.updated') {
    const level = event !== null && typeof event === 'object' ? event.relation : undefined;
    const levels = contract.relation?.levels ?? [];
    if (typeof level !== 'string' || !levels.includes(level)) {
      return { state, changed: false, reason: 'UNKNOWN_RELATION' };
    }
    relation = level;
  }

  const base = transition.reset ? initialState(contract) : state;
  if (transition.reset) relation = base.relation;
  const limitations = new Set(base.limitations ?? []);
  for (const item of transition.removeLimitations ?? []) limitations.delete(item);
  for (const item of transition.addLimitations ?? []) limitations.add(item);
  const maxLimitations = contract.limits?.maxLimitations ?? 8;

  const next = {
    identity: contract.identity ?? state.identity,
    stance: transition.stance ?? base.stance,
    uncertainty: transition.uncertainty ?? base.uncertainty,
    mood: transition.mood ?? base.mood,
    capabilities: [...(contract.baseline?.capabilities ?? state.capabilities)],
    limitations: [...limitations].slice(-maxLimitations),
    relation,
  };

  return { state: next, changed: !sameState(state, next), reason: eventType };
}

/**
 * Zustandsmaschine. Beobachtet Event-Typen, hält den Zustand, meldet Änderungen.
 * Kein Speicher auf Platte: der DSH-Session-Log ist der Audit, nicht die Persona.
 */
export function createPersonaState(contract, options = {}) {
  const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
  const maxEvents = contract.limits?.maxEvents ?? 25;
  let state = initialState(contract);
  const history = [];
  const stats = { events: 0, changes: 0, ignored: 0, ignoredTypes: {} };

  function snapshot() {
    return {
      identity: state.identity,
      stance: state.stance,
      uncertainty: state.uncertainty,
      mood: state.mood,
      capabilities: [...state.capabilities],
      limitations: [...state.limitations],
      relation: state.relation,
    };
  }

  function observe(eventType, event) {
    if (typeof eventType !== 'string' || eventType.trim() === '') {
      stats.ignored += 1;
      return null;
    }
    stats.events += 1;
    const result = deriveState(contract, state, eventType, event);
    if (!result.changed) {
      stats.ignored += 1;
      if (stats.ignoredTypes[eventType] !== undefined || Object.keys(stats.ignoredTypes).length < IGNORED_TYPE_LIMIT) {
        stats.ignoredTypes[eventType] = (stats.ignoredTypes[eventType] ?? 0) + 1;
      } else {
        stats.ignoredTypes[IGNORED_OVERFLOW_KEY] = (stats.ignoredTypes[IGNORED_OVERFLOW_KEY] ?? 0) + 1;
      }
      return null;
    }
    state = result.state;
    stats.changes += 1;
    history.push({ type: eventType, mood: state.mood, limitations: [...state.limitations] });
    if (history.length > maxEvents) history.shift();
    onChange(snapshot());
    return { state: snapshot() };
  }

  return { observe, snapshot, history: () => [...history], stats };
}

/** Event-Envelope → Event-Typ. Nur Lesen, nichts wird weitergereicht. */
export function eventTypeOf(payload) {
  if (typeof payload === 'string') return payload;
  if (payload !== null && typeof payload === 'object' && typeof payload.event_type === 'string') return payload.event_type;
  return null;
}
