    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/traceability';

    /** Kennung des Slot-Eintrags (Inhaber dieser Datei; der Slot selbst ist `shell.overlay`). */
    const SLOT_ID = 'shinon-traceability-toasts';
    const LABEL = 'Traceability-Toasts';

    /** Sichtbarkeit in der Plugin-Liste (Konvention, kein Import). */
    function announce(detail) {
      const registry = (window.__shinonPlugins ??= new Map());
      registry.set(PLUGIN, { label: LABEL, kind: 'client', panel: SLOT_ID, detail });
      window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));
    }

    // >>> shinon:dsh-idiom locale-fallback/static — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test) params={"table":"TOAST_DE","key":"toast.error","label":"Fehler: {message}"}
    const TOAST_DE = { 'toast.error': 'Fehler: {message}' };
    let t = (key) => TOAST_DE[key] ?? key;
    // <<< shinon:dsh-idiom locale-fallback/static

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

    /**
     * Name des Globals, das der Host in die Seite legt. Als LITERAL, weil dieses
     * Bundle `index.js` nicht importieren kann — die Zwillings-Regel hält beide
     * Seiten zeichengleich.
     */
    const TRACE_GLOBAL = '__SHINON_TRACEABILITY_CONFIG__';

    /** Die WIRKSAMEN Grenzen des Hosts. Ein Datensatz fremden Vertrags gilt nicht. */
    let settings = { ...TOAST_DEFAULTS };

    function readHostSettings() {
      const raw = typeof window === 'object' ? window[TRACE_GLOBAL] : null;
      const record = raw !== null && typeof raw === 'object' ? raw : null;
      const named = record !== null && record.contract === TOAST_CONTRACT;
      const host = named ? record : {};
      const bounded = (value, fallback, min, max) =>
        (Number.isFinite(value) && value >= min && value <= max ? value : fallback);
      const next = {
        enabled: host.enabled !== false,
        maxVisible: bounded(host.maxVisible, TOAST_DEFAULTS.maxVisible, 1, 10),
        duration: bounded(host.duration, TOAST_DEFAULTS.duration, 500, 30000),
      };
      console.log(
        `[shinon-traceability] Grenzen aus ${named ? TRACE_GLOBAL : 'dem Vertrag (Rueckfall)'}` +
          ` — enabled=${next.enabled}/max=${next.maxVisible}/duration=${next.duration}ms` +
          (raw === null || raw === undefined ? ' (die Seite traegt keinen Datensatz)' : ''),
      );
      return next;
    }

    /** Platzhalter füllen: `{name}` → Wert; ein fehlender Wert wird zum Gedankenstrich. */
    function fill(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (_whole, name) => {
        const value = values[name];
        return value === undefined || value === null || value === '' ? '—' : String(value);
      });
    }

    // -----------------------------------------------------------------------
    // Naht zum Sitzungsfenster (dieselbe wie @shinon/popup).
    // -----------------------------------------------------------------------

