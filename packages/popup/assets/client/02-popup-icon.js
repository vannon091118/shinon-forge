    function PopupIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
        h('rect', { x: 1, y: 2, width: 14, height: 10, rx: 2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { d: 'M4 13.5l3-1.5', stroke: 'currentColor', strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round' }),
        h('circle', { cx: 8, cy: 7, r: 1.6, fill: 'currentColor', opacity: 0.6 })
      );
    }

    // >>> shinon:dsh-idiom locale-fallback/static — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test) params={"table":"OVERLAY_DE","key":"popup.running","label":"Vorgang läuft — Schritt {step}, {open} offen, {calls} Aufrufe, zuletzt {tool}"}
    const OVERLAY_DE = { 'popup.running': 'Vorgang läuft — Schritt {step}, {open} offen, {calls} Aufrufe, zuletzt {tool}' };
    let t = (key) => OVERLAY_DE[key] ?? key;
    // <<< shinon:dsh-idiom locale-fallback/static

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
 * Die ABBRUCHQUOTE aus den Prompter-Entscheidungen falten.
 *
 * Dieselben Einträge, die das Prompter-Panel liest (Fensterspiegel), werden hier
 * gezählt: `abort` trägt den klassifizierten Grund, `abort_counts` den Zähler
 * je Grund. KEIN Grund wird hier beim Namen genannt — ein neuer Grund ist ein
 * Dateneintrag in `packages/prompter/assets/abort-reasons.json`, und diese
 * Faltung liest nur `abort.id`/`abort.label`. Genau deshalb braucht ein neuer
 * Grund keine Client-Änderung.
 *
 * `top` ist der häufigste Grund; bei Gleichstand gewinnt der zuerst gesehene —
 * deterministisch, weil die Einträge in Puffer-Reihenfolge (neuester zuerst)
 * ankommen und die Schleife stabil ist.
 */
function foldAborts(entries) {
  const counts = {};
  const ranks = {};
  const labels = {};
  let turns = 0;
  let aborts = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!isRecord(entry) || typeof entry.outcome !== 'string') continue;
    turns += 1;
    const abort = isRecord(entry.abort) && typeof entry.abort.id === 'string' ? entry.abort : null;
    if (abort === null) continue;
    aborts += 1;
    counts[abort.id] = (counts[abort.id] ?? 0) + 1;
    // `rank` reist im Datensatz (Position in `abort-reasons.json`); ohne ihn
    // gäbe es hier eine zweite Rangfolge unter demselben Namen.
    if (Number.isInteger(abort.rank)) ranks[abort.id] = abort.rank;
    if (typeof abort.label === 'string' && abort.label !== '') labels[abort.id] = abort.label;
  }
  // Häufigster Grund; bei Gleichstand der kleinere `rank`, danach die ID. Die
  // Eingabereihenfolge entscheidet nie.
  let top = null;
  for (const id of Object.keys(counts)) {
    if (top === null) { top = id; continue; }
    if (counts[id] !== counts[top]) { if (counts[id] > counts[top]) top = id; continue; }
    const rankA = Number.isInteger(ranks[id]) ? ranks[id] : Number.MAX_SAFE_INTEGER;
    const rankB = Number.isInteger(ranks[top]) ? ranks[top] : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) { if (rankA < rankB) top = id; continue; }
    if (id < top) top = id;
  }
  return {
    turns,
    aborts,
    quote: turns === 0 ? 0 : aborts / turns,
    top,
    topLabel: top === null ? null : (labels[top] ?? top),
    counts,
  };
}

/**
 * Den Fortschritt aus dem Ereignisfenster falten — deterministisch, ohne Uhr.
 *
 * Die Lesart ist eine Momentaufnahme des FENSTERS: das Fenster ist
 * „zusammenhängend" (laut `SessionEventSource`), also beschreibt die Faltung den
 * letzten Abschnitt der Sitzung. Ein neues `turn/start` setzt sie zurück, ein
 * `turn/end` schließt sie ab — die Anzeige ist damit „läuft" oder „bereit", und
 * beides ist aus den Ereignissen ablesbar statt behauptet.
 *
 * Ohne `callId` ist ein Aufruf nicht zuordenbar. Er zählt trotzdem als OFFEN —
 * fail-closed: es gibt keine Evidenz, dass er fertig ist, und „geschlossen" wäre
 * eine Behauptung. Sein synthetischer Schlüssel kann von keinem `tool/result`
 * getroffen werden (die tragen echte callIds), also bleibt er es auch.
 *
 * @param entries - Einträge des Sitzungsfensters (`binding.eventSource…entries`).
 * @param limit - wie viele Werkzeugnamen behalten werden.
 * @param aborts - Prompter-Entscheidungen (Fensterspiegel); leer = keine Quote.
 */
function foldTrajectory(entries, limit = TOOL_HISTORY_LIMIT, aborts = []) {
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
    aborts: foldAborts(aborts),
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

    // ---------------------------------------------------------------------
    // Die Naht: welche Sitzung gezeigt wird und ihr Ereignisfenster.
    // ---------------------------------------------------------------------

