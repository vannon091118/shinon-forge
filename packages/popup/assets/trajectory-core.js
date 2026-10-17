/**
 * @shinon/popup — reiner Kern (assets/trajectory-core.js).
 *
 * KEINE Imports (weder Bare noch node:): nur dann läuft der Test in CI ohne
 * node_modules — dieselbe Regel wie bei `@shinon/scoring` (scoring-core.js),
 * `@shinon/narrative` (narrative-core.js) und `@shinon/prompter` (note-core.js).
 *
 * WARUM DIE FALTUNG IN EINER MARKIERTEN REGION STEHT: die Client-Hälfte kann
 * → Kanon: docs/COMMENT-KANON.md#k-3573fb010fc1
 */

/** Vertragsname der Anzeige (Daten, nicht Code). */
export const TRAJECTORY_CONTRACT = 'shinon.popup/trajectory-v1';

// #region zwilling:popup-trajectory — Besitzer: packages/popup/assets/trajectory-core.js
/** Die Eintragsart im Sitzungsfenster, die ein Ereignis trägt. */
const ENTRY_KIND = 'event';

/** Wie viele Werkzeugnamen die Anzeige behält (das Fenster wächst unbegrenzt). */
const TOOL_HISTORY_LIMIT = 8;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Aus dem Sitzungsfenster die Ereignisse ziehen — Chunks und Fremdes fallen weg. */
function eventsOf(entries) {
  const events = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (isRecord(entry) && entry.type === ENTRY_KIND && entry.event !== undefined) events.push(entry.event);
  }
  return events;
}

/**
 * Den Fortschritt aus dem Ereignisfenster falten — deterministisch, ohne Uhr.
 *
 * Die Lesart ist eine Momentaufnahme des FENSTERS: das Fenster ist
 * „zusammenhängend" (laut `SessionEventSource`), also beschreibt die Faltung den
 * letzten Abschnitt der Sitzung. Ein neues `turn/start` setzt sie zurück, ein
 * `turn/end` schließt sie ab — die Anzeige ist damit „läuft" oder „bereit", und
 * beides ist aus den Ereignissen ablesbar statt behauptet.
 * → Kanon: docs/COMMENT-KANON.md#k-84b84a002cbc
 */
function foldTrajectory(entries, limit = TOOL_HISTORY_LIMIT) {
  const open = new Map();
  const tools = [];
  let turn = null;
  let step = 0;
  let calls = 0;

  for (const event of eventsOf(entries)) {
    const data = isRecord(event) && isRecord(event.data) ? event.data : {};
    switch (event?.type) {
      case 'turn/start':
        turn = typeof data.turn === 'number' ? data.turn : null;
        step = 0;
        calls = 0;
        open.clear();
        tools.length = 0;
        break;
      case 'turn/end':
        turn = null;
        open.clear();
        break;
      case 'step/start':
        step = typeof data.step === 'number' ? data.step : step + 1;
        break;
      case 'tool/call': {
        calls += 1;
        const name = typeof data.name === 'string' && data.name !== '' ? data.name : null;
        if (name !== null) {
          tools.push(name);
          if (tools.length > limit) tools.shift();
        }
        if (data.callId !== undefined && data.callId !== null) open.set(String(data.callId), name);
        else open.set(`ohne-call-id:${calls}`, name);
        break;
      }
      case 'tool/result': {
        const callId = isRecord(data.message) && isRecord(data.message.source) ? data.message.source.callId : undefined;
        if (callId !== undefined && callId !== null) open.delete(String(callId));
        break;
      }
      default:
        break;
    }
  }

  // Der jüngste offene Aufruf MIT Namen läuft. Ein namenloser Aufruf bleibt in
  // `open` gezählt, verdeckt aber keinen benannten (die Reihenfolge der Map ist
  // die Einfügereihenfolge, also ist der letzte benannte der jüngste).
  const named = [...open.values()].filter((name) => name !== null);
  return {
    turn,
    step,
    calls,
    open: open.size,
    running: named.length > 0 ? named[named.length - 1] : null,
    tools: [...tools],
    active: turn !== null,
  };
}

/**
 * Die LESART für die Anzeige: der SPRACH-SCHLÜSSEL (oder null) plus die WERTE.
 * Der Kern liefert Zahlen und den Werkzeugnamen; das Wort kommt aus
 * `@shinon/locale-de`. So bleibt dieser Kern ohne Sprache — und die Texte liegen
 * dort, wo sie einen Eigentümer haben.
 *
 * `null` heißt: nichts zu zeigen. Ein leerer Zustand ist KEIN Text (sonst stünde
 * ein "bereit" dort, wo gar kein Vorgang ist), und ein Schlüssel ohne Leser wäre
 * ein Eintrag im Wörterbuch, den niemand braucht.
 */
function progressReading(reading) {
  const record = reading !== null && typeof reading === 'object' ? reading : {};
  return {
    key: record.active === true ? 'popup.running' : null,
    values: {
      step: typeof record.step === 'number' ? record.step : 0,
      open: typeof record.open === 'number' ? record.open : 0,
      calls: typeof record.calls === 'number' ? record.calls : 0,
      tool: typeof record.running === 'string' ? record.running : null,
    },
  };
}
// #endregion zwilling:popup-trajectory

export { ENTRY_KIND, TOOL_HISTORY_LIMIT, eventsOf, foldTrajectory, progressReading };
