/**
 * @shinon/traceability — CLIENT-HÄLFTE: LS-Popup-Toasts im Chat.
 * GENERIERT aus assets/client/*.js — nicht von Hand ändern; Schreiben: node scripts/build-client.mjs traceability.
 *
 * DER DATENWEG (der einzige, den ein Out-of-Tree-Bundle hat): ein Client-Bundle
 * kann KEINEN Host-Endpunkt registrieren — die Remote-Beiträge der
 * Browser-Hälfte kommen aus einer kompilierten Liste in
 * `@deepseek-ai/dsh-api-remotes`, und die Connection-Naht ist reines
 * Anfrage/Antwort ohne Abo. Diese Hälfte foldet deshalb die SITZUNG selbst:
 *
 *   ctx.get('uiSession')?.adapter?.current?.getSnapshot()   → welche Sitzung
 *   ctx.get('sessions')?.binding(id)                        → deren Bindung
 *   …binding.eventSource.getSnapshot().entries              → das Ereignisfenster
 *   …binding.eventSource.subscribe(fn)                      → jede Änderung
 *
 * Denselben Weg gehen `@shinon/popup` und `@shinon/token-usage`; er ist gemessen
 * (der Vertrag der installierten DSH-Fassung: `ctx.get(name)` ist die optionale
 * Abfrage, ein direkter Dienst-Zugriff wirft ohne `inject`).
 *
 * DIE EINE NAHT ZUM HOST: die WIRKSAMEN Grenzen (enabled/maxVisible/duration)
 * legt der Host beim Ausliefern der Seite über `webserver/index-inject` als
 * `window.__SHINON_TRACEABILITY_CONFIG__` in den Index — dieselbe Naht, die
 * `@shinon/markers` für seine Grenzen benutzt. Der Name steht hier als LITERAL,
 * weil dieses Bundle eigenständig ist; `scripts/lib/repo.mjs` (SOURCE_TWINS)
 * und `scripts/gate/tests/traceability.test.mjs` vergleichen beide Seiten.
 *
 * WAS HIER NICHT MEHR STEHT (gemessene Befunde, konsolidiert):
 *   - Kein zweites Ereignis-Abo auf dem Host: die vier Record-Typen
 *     (`tool/call`, `tool/result`, `step/start`, `agent/error`) sind Formen des
 *     SESSION-LOGS, keine Bus-Events — der Host hätte nichts empfangen. Das
 *     Fenster zu falten ist dieser Hälfte eigene Arbeit, wie bei popup.
 *   - Kein `globalThis.window`-Schreibvorgang am Host: der Host läuft in Node,
 *     wo es kein `window` gibt (der Befund, durch den das Trace-Panel leer
 *     blieb). Konfiguration wandert über den Index in die Seite, nicht über ein
 *     Fenster zur Laufzeit.
 *
 * FEHLERISOLIERUNG: die Beobachtung darf das Rendern nie stören — Lesen und
 * Abo laufen in try/catch, Verstöße werden gezählt und EINMAL gemeldet
 * (dieselbe Regel wie `@shinon/markers`). Was trotzdem wirft, fängt der
 * Plattform-Ring ab (`SlotErrorBoundary` in `dsh-client-ui-renderer`).
 */
window.__ModuleLoader__.load({
  id: '@shinon/traceability',
  factory(require) {
// >>> @part assets/client/01-react.js
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
// <<< @part assets/client/01-react.js

// >>> @part assets/client/02-seam-of.js
    /**
     * Die Sitzungs-Bindung der gezeigten Sitzung. Fehhlt ein Dienst, fehlt die
     * Bindung — dann schweigt die Anzeige, sie wirft nicht (fail-open).
     */
    function seamOf(ctx) {
      if (ctx === null || ctx === undefined) return undefined;
      const shown = ctx.get?.('uiSession')?.adapter?.current?.getSnapshot?.();
      const sessionId = shown?.key ?? shown?.props?.sessionId;
      if (sessionId === undefined) return undefined;
      return ctx.get?.('sessions')?.binding?.(sessionId);
    }

    let violations = 0;
    /** Einmaliges Melden statt pro Render — Verstöße stören nie, sie werden gezählt. */
    const complain = (where, error) => {
      violations += 1;
      if (violations <= 3) {
        console.warn(`[shinon-traceability] ${where} nicht lesbar (${error?.message ?? error}) — Toats schweigen (${violations})`);
      }
    };

    function readToastsOf(ctx, maxVisible) {
      try {
        return foldToasts(seamOf(ctx)?.eventSource?.getSnapshot?.()?.entries, maxVisible);
      } catch (error) {
        complain('Ereignisfenster', error);
        return [];
      }
    }

    /**
     * Meldet jede Änderung: neuer Eintrag (das Fenster wächst) und
     * Sitzungswechsel (dann hängt das Abo an anderer Bindung).
     */
    function subscribeToastsOf(ctx, listener) {
      try {
        let stopWindow = () => {};
        const attachWindow = () => {
          stopWindow();
          stopWindow = () => {};
          const source = seamOf(ctx)?.eventSource;
          if (typeof source?.subscribe === 'function') {
            const off = source.subscribe(listener);
            stopWindow = () => off?.();
          }
        };
        attachWindow();
        const shown = ctx?.get?.('uiSession')?.adapter?.current;
        const stopShown =
          typeof shown?.subscribe === 'function' ? shown.subscribe(() => { attachWindow(); listener(); }) : () => {};
        return () => {
          stopShown();
          stopWindow();
        };
      } catch (error) {
        complain('Abo des Ereignisfensters', error);
        return () => {};
      }
    }

    /**
     * In `apply()` an den echten ctx gebunden; vorher liest die Anzeige nichts.
     * Ohne diese Bindung ist `ctx` undefined — gemessen: der Lespfad wirft dann
     * `TypeError: Cannot read properties of undefined (reading 'get')`.
     */
    let readToasts = () => [];
    let subscribeToasts = () => () => {};

    function useToasts() {
      const [, setRevision] = React.useState(0);
      const toasts = readToasts();
      React.useEffect(() => subscribeToasts(() => setRevision((value) => value + 1)), []);
      return toasts;
    }

    /** Farbe je Ton — Präsentation bleibt hier, der Kern kennt nur Wörter als Ton. */
    const TONE_COLOR = {
      warn: 'var(--dsw-alias-state-warn-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
    };

    /** Icon je Toast-Art. */
    function ToastIcon({ kind }) {
      switch (kind) {
        case 'tool-call':
          return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' },
            h('path', { d: 'M8 1l2 5h-4L8 1z', fill: 'currentColor' }),
            h('path', { d: 'M8 15l-2-5h4l-2 5z', fill: 'currentColor' }),
            h('path', { d: 'M1 8l5-2v4L1 8z', fill: 'currentColor' }),
            h('path', { d: 'M15 8l-5 2V6l5 2z', fill: 'currentColor' }),
          );
        case 'tool-result':
          return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' },
            h('path', { d: 'M2 8l4 4 8-8', stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }),
          );
        case 'step':
          return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' },
            h('circle', { cx: '8', cy: '8', r: '6', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }),
            h('path', { d: 'M8 4v4l3 2', stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' }),
          );
        case 'error':
          return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' },
            h('path', { d: 'M8 3l5 9H3L8 3z', fill: 'currentColor', opacity: 0.8 }),
            h('line', { x1: 8, y1: 7, x2: 8, y2: 10, stroke: 'var(--dsw-alias-bg-base)', strokeWidth: 1.5 }),
            h('circle', { cx: 8, cy: 11.5, r: 1, fill: 'var(--dsw-alias-bg-base)' }),
          );
        default:
          return null;
      }
    }

    /** Ein einzelner Toast mit Ein-/Ausblend-Animation. */
    function ToastItem({ toast, index }) {
      const [visible, setVisible] = React.useState(false);
      const [removing, setRemoving] = React.useState(false);
      const duration = settings.duration;

      React.useEffect(() => {
        const stagger = Math.min(30 * index, 150);
        const t1 = setTimeout(() => setVisible(true), stagger);
        const t2 = setTimeout(() => setRemoving(true), duration);
        const t3 = setTimeout(() => setVisible(false), duration + 300);
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
        };
      }, [index, duration]);

      if (!visible) return null;

      const color = TONE_COLOR[toast.tone] ?? TONE_COLOR.muted;
      return h('div', {
        className: `shinon-trace-toast ${removing ? 'shinon-trace-toast--out' : 'shinon-trace-toast--in'}`,
        role: 'status',
        'aria-live': 'polite',
        style: { '--toast-color': color },
      },
        h('div', { className: 'shinon-trace-toast__icon' }, h(ToastIcon, { kind: toast.kind })),
        h('div', { className: 'shinon-trace-toast__body' },
          h('div', { className: 'shinon-trace-toast__title' }, fill(t(toast.key), toast.values)),
          toast.kind === 'tool-call' && toast.values.id
            ? h('div', { className: 'shinon-trace-toast__message' }, String(toast.values.id))
            : null,
        ),
        h('div', { className: 'shinon-trace-toast__time' },
          toast.ts
            ? new Date(toast.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : '',
        ),
      );
    }

    /** Stapel aller sichtbaren Toats — frame-weit unten rechts (Slot `shell.overlay`). */
    function ToastStack() {
      // Hooks IMMER zuerst, bedingungslos: `useToasts` trägt das Abo und den
      // Revisionszähler — ohne den Ruf bliebe die Liste beim ersten Rendern
      // stehen und jedes neue Ereignis unsichtbar (gemessen im Harness).
      const toasts = useToasts();
      if (settings.enabled !== true) return null;
      if (toasts.length === 0) return null;

      return h('div', {
        className: 'shinon-trace-stack',
        'aria-label': 'Traceability-Toasts',
      },
        toasts.map((toast, i) => h(ToastItem, { key: `${toast.ts ?? toast.kind}-${i}`, toast, index: i })),
      );
    }
// <<< @part assets/client/02-seam-of.js

// >>> @part assets/client/03-inject-styles.js
    /** CSS für Toats und Animationen — EINMAL pro Seite, am Tag erkannt. */
    function injectStyles() {
      const tag = `${PLUGIN}/toasts.css`;
      if (document.querySelector(`style[data-plugin-css="${tag}"]`) !== null) return;
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = tag;
      style.textContent = `
        .shinon-trace-stack {
          position: fixed;
          bottom: 80px;
          right: 20px;
          display: flex;
          flex-direction: column-reverse;
          gap: 8px;
          z-index: 10000;
          pointer-events: none;
          max-width: 320px;
        }
        .shinon-trace-toast {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 10px 12px;
          background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2));
          border: 1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1));
          border-left: 3px solid var(--toast-color, var(--dsw-alias-label-secondary));
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.2);
          pointer-events: auto;
          font: 12px/1.4 ui-sans-serif, system-ui, sans-serif;
          color: var(--dsw-alias-label-primary);
          animation: shinon-trace-toast-in 0.3s ease-out forwards;
          opacity: 0;
          transform: translateX(20px);
        }
        .shinon-trace-toast--out {
          animation: shinon-trace-toast-out 0.35s ease-in forwards;
        }
        @keyframes shinon-trace-toast-in {
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes shinon-trace-toast-out {
          to { opacity: 0; transform: translateX(20px); }
        }
        .shinon-trace-toast__icon {
          flex: 0 0 auto;
          color: var(--toast-color, var(--dsw-alias-label-secondary));
          margin-top: 1px;
        }
        .shinon-trace-toast__body { flex: 1; min-width: 0; }
        .shinon-trace-toast__title {
          font-weight: 600;
          font-size: 12px;
          color: var(--dsw-alias-label-primary);
        }
        .shinon-trace-toast__message {
          font-size: 11px;
          color: var(--dsw-alias-label-secondary);
          margin-top: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .shinon-trace-toast__time {
          flex: 0 0 auto;
          font-size: 10px;
          color: var(--dsw-alias-label-secondary);
          opacity: 0.7;
          margin-left: 4px;
        }
        @media (prefers-reduced-motion: reduce) {
          .shinon-trace-toast { animation: none; opacity: 1; transform: none; }
          .shinon-trace-toast--out { animation: none; opacity: 0; }
        }
      `;
      (document.head ?? document.documentElement).appendChild(style);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // >>> shinon:dsh-idiom locale-fallback/bind — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test) params={"table":"TOAST_DE"}
        // Gelesen wird `ctx.get?.('locale')`, NICHT `ctx.locale`: ein direkter
        // Dienst-Zugriff ist am Cordis-Proxy durch `inject` gesperrt und wirft
        // ('cannot get property "locale" without inject') — das kostete dieser
        // Hälfte die Aktivierung. Der Blick passiert bei jedem Rendern, damit die
        // Anzeige auch einem später geladenen Dienst folgt; fehlt er (oder fehlt
        // `get`, wie an den repo-eigenen Attrappen), gilt TOAST_DE.
        t = (key) => {
          const locale = ctx.get?.('locale');
          const hit = typeof locale?.bind === 'function' ? locale.bind('shinon')(key) : undefined;
          return hit === undefined || hit === key ? (TOAST_DE[key] ?? key) : hit;
        };
        // <<< shinon:dsh-idiom locale-fallback/bind

        settings = readHostSettings();

        // Die Naht liegt am echten ctx: ohne diese beiden Zeilen liest die
        // Anzeige `undefined` und wirft beim ersten Render (gemessen).
        readToasts = () => readToastsOf(ctx, settings.maxVisible);
        subscribeToasts = (listener) => subscribeToastsOf(ctx, listener);

        try {
          injectStyles();
        } catch (error) {
          complain('Stylesheet', error);
        }

        announce(
          `LS-Popup-Toasts live: ${settings.maxVisible} gleichzeitig, ${settings.duration}ms, `
          + `Slot shell.overlay — Grenzen aus ${window[TRACE_GLOBAL] ? TRACE_GLOBAL : 'Vertrag'}.`,
        );

        // In den frame-weiten Overlay-Layer einhängen: `shell.overlay` ist der
        // dokumentierte Platz (client-ui-layout: click-through Layer über allen
        // Spalten). Unsere Positionierung legt den Stapel unten rechts — über
        // jedem Panel, nicht nur im Chat; das ist die Zusage dieses Slots.
        try {
          ctx.slots.inject('shell.overlay', () => ctx.slots.register({
            name: 'shell.overlay',
            id: SLOT_ID,
            order: 50,
          }, ToastStack));
        } catch (error) {
          complain('Slot-Registrierung', error);
        }
      },
    };
// <<< @part assets/client/03-inject-styles.js

  },
});
