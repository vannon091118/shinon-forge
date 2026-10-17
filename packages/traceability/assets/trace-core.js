/**
 * @shinon/traceability — KERN DER TOAST-FALTUNG.
 *
 * Reine Rechnung, ohne Bare-Imports, ohne DOM, ohne Netz, ohne Sprache: der Kern
 * kennt KEINE Worte, nur Schluessel und Werte (dieselbe Teilung wie
 * `packages/popup/assets/trajectory-core.js` — die Texte liegen in
 * `@shinon/locale-de`, dem Eigentuer, und der Client fuellt sie beim Rendern).
 *
 * → Kanon: docs/COMMENT-KANON.md#k-b1b7b4947e76
 */
// #region zwilling:trace-toasts — Besitzer: packages/traceability/assets/trace-core.js
/** Eintragsform des Fensters: `{ type: 'event', event }`. Chunks und Fremdes fallen weg. */
const ENTRY_KIND = 'event';

/**
 * Vertrag des Host-Datensatzes (`window.__SHINON_TRACEABILITY_CONFIG__`).
 * Der Besitzer ist `packages/traceability/index.js`; hier steht derselbe Wert
 * als Literal, weil der Client die Host-Datei nicht importieren kann.
 */
const TOAST_CONTRACT = 'shinon.traceability/toast-v1';

/** Wirksame Grenzen, wenn die Seite keinen Datensatz des Hosts traegt. */
const TOAST_DEFAULTS = { enabled: true, maxVisible: 3, duration: 4000 };

/** So viele Fenstereintraege werden ueberhaupt gelesen — das Fenster wachst unbegrenzt. */
const WINDOW_LIMIT = 500;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Die Ereignisse aus dem Fenster; alles andere (Chips, Fremdes) faellt weg. */
function eventsOf(entries) {
  const events = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (isRecord(entry) && entry.type === ENTRY_KIND && isRecord(entry.event)) events.push(entry.event);
  }
  return events.slice(-WINDOW_LIMIT);
}

/**
 * Aus dem Fenster die sichtbaren Toats ableiten.
 *
 * @param {unknown} entries - Fenster der Sitzung (beliebig, auch undefined).
 * @param {number} maxVisible - Hoechstzahl gleichzeitiger Toats (1..10).
 * @returns {Array<{kind: string, key: string, values: Record<string, unknown>, tone: string, ts: string, callId: string|null}>}
 *   Ein Datensatz ohne Wort: `key` + `Values` fuellt der Client, `tone` waehlt die Farbe.
 */
function foldToasts(entries, maxVisible) {
  const open = new Map();
  const toasts = [];

  for (const event of eventsOf(entries)) {
    const data = isRecord(event.data) ? event.data : {};
    const ts = typeof event.time === 'string' ? event.time : '';

    switch (event.type) {
      case 'tool/call': {
        const callId = typeof data.callId === 'string' && data.callId !== '' ? data.callId : null;
        const name = typeof data.name === 'string' && data.name !== '' ? data.name : '?';
        const toast = {
          kind: 'tool-call',
          key: 'toast.tool_call',
          values: { name },
          tone: 'warn',
          ts,
          callId,
        };
        if (callId !== null) open.set(callId, toast);
        toasts.push(toast);
        break;
      }
      case 'tool/result': {
        const source = isRecord(data.message) && isRecord(data.message.source) ? data.message.source : null;
        const callId = typeof source?.callId === 'string' && source.callId !== '' ? source.callId : null;
        const success = data.success !== false;
        const key = success ? 'toast.tool_ok' : 'toast.tool_failed';
        const tone = success ? 'success' : 'error';
        const settled = callId !== null ? open.get(callId) : undefined;
        if (settled !== undefined) {
          // Derselbe Datensatz wird fertig statt ein zweiter zu entstehen.
          settled.kind = 'tool-result';
          settled.key = key;
          settled.values = {};
          settled.tone = tone;
          settled.ts = ts;
        } else {
          toasts.push({
            kind: 'tool-result',
            key,
            values: callId === null ? {} : { id: callId.slice(0, 8) },
            tone,
            ts,
            callId,
          });
        }
        break;
      }
      case 'step/start':
        toasts.push({
          kind: 'step',
          key: 'toast.step',
          values: { step: data.step ?? '?', turn: data.turn ?? '?' },
          tone: 'muted',
          ts,
          callId: null,
        });
        break;
      case 'agent/error': {
        const raw = typeof data.error?.message === 'string'
          ? data.error.message
          : typeof data.error === 'string'
            ? data.error
            : '';
        toasts.push({
          kind: 'error',
          key: 'toast.error',
          values: { message: raw.length > 60 ? `${raw.slice(0, 60)}…` : raw },
          tone: 'error',
          ts,
          callId: null,
        });
        break;
      }
      default:
        break;
    }
  }

  // Deduplizieren (gleiche callId), dann deckeln: die juengsten bleiben sichtbar.
  const seen = new Set();
  const deduped = [];
  for (const toast of toasts) {
    const id = toast.callId ?? `${toast.kind}:${toast.ts}`;
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(toast);
  }
  const limit = Number.isFinite(maxVisible) && maxVisible > 0 ? maxVisible : TOAST_DEFAULTS.maxVisible;
  return deduped.slice(-limit).reverse();
}
// #endregion zwilling:trace-toasts

export {
  ENTRY_KIND,
  TOAST_CONTRACT,
  TOAST_DEFAULTS,
  WINDOW_LIMIT,
  isRecord,
  eventsOf,
  foldToasts,
};
