/**
 * @shinon/popup — Client-Hälfte: DAS OVERLAY (Zug 6).
 *
 * WARUM DIESE DATEI NEU GESCHRIEBEN WURDE — der gemessene Befund: der Kopf dieser
 * Datei sagte selbst, dass sie NICHTS rendert. Ein „Trajectory-Overlay", das nur
 * einen Sidebar-Eintrag malt, ist von einem kaputten nicht zu unterscheiden; das
 * Paket erklärte sich deshalb im eigenen Manifest als inaktiv.
 *
 * DER DATENWEG (der einzige, der einem Out-of-Tree-Bundle offensteht): ein
 * Client-Bundle kann KEINEN Host-Endpunkt registrieren — die Remote-Beiträge der
 * Browser-Hälfte kommen aus einer kompilierten Liste in
 * `@deepseek-ai/dsh-api-remotes`, und die Connection-Naht ist reines
 * Anfrage/Antwort (`rpc.call`) ohne Abo. Der Host emittiert seine
 * Trajectory-Einträge weiterhin auf `shinon/trajectory` (index.js) — dieser
 * Client liest sie aber nicht, sondern die SITZUNG selbst:
 *
 *   ctx.get('uiSession')?.adapter?.current?.getSnapshot()   → welche Sitzung
 *   ctx.get('sessions')?.binding(id)                        → deren Bindung
 *   …binding.eventSource.getSnapshot().entries              → das Ereignisfenster
 *   …binding.eventSource.subscribe(fn)                      → jede Änderung
 *
 * Denselben Weg geht `@shinon/token-usage`; er ist gemessen, nicht behauptet
 * (der Vertrag der installierten DSH-Fassung: `ctx.get(name)` ist die optionale
 * Abfrage, ein direkter Dienst-Zugriff wirft ohne `inject`).
 *
 * DIE REGEL SELBST steht als bytegleiche Region aus dem Kern
 * (packages/popup/assets/trajectory-core.js): ein Client-Bundle ist eigenständig
 * und zieht kein `import` über die Paketgrenze. Die Region ist die Zusage, dass
 * der Browser dieselbe Rechnung fährt wie die Unit-Tests — geprüft von
 * `scripts/lib/repo.mjs` (Zwilling) bei jedem Gate-Lauf.
 *
 * WAS SIE RENDERT: den Fortschritt des laufenden Vorgangs (Schritt, offene
 * Aufrufe, zuletzt benutztes Werkzeug) im Dock über dem Eingabefeld — derselbe
 * Slot, den `@shinon/core` (Info-Leiste) und `@shinon/codingmon` (EXP-Leiste)
 * schon besetzen. Ohne laufenden Turn rendert sie NICHTS (ein leeres Overlay wäre
 * eine Oberfläche, die nichts aussagt) — sichtbar bleibt die Sidebar-Zeile.
 */
window.__ModuleLoader__.load({
  id: '@shinon/popup',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/popup';
    const PANEL_ID = 'shinon-popup';
    /** Derselbe Slot wie die Vorgabe des Host-Schemas (packages/popup/index.js). */
    const DOCK_SLOT = 'conversation.composer.dock';
    const OVERLAY_ID = 'shinon-popup-progress';

    /** Sichtbarkeit (Schritt 1): meldet dieses Bundle bei der System-Uebersicht an. */
    const LABEL = 'Shinon Popup';
    const ROLE = 'Trajectory-Overlay (Fortschritt aus dem Sitzungsfenster)';

    function announce(detail) {
      const table = window.__shinon_plugins ?? (window.__shinon_plugins = {});
      table[PLUGIN] = {
        id: PLUGIN,
        label: LABEL,
        role: ROLE,
        status: 'beobachtet',
        detail,
        mounted: new Date().toISOString()
      };
      window.dispatchEvent(new CustomEvent('shinon:plugin-registered', { detail: { id: PLUGIN } }));
    }

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

    // ---------------------------------------------------------------------
    // Die Naht: welche Sitzung gezeigt wird und ihr Ereignisfenster.
    // ---------------------------------------------------------------------

    /**
     * Die Sitzungs-Bindung der Sitzung, die die Oberfläche zeigt. Welche das ist,
     * sagt die Vorgabe-Bindung des Renderers (`SlotScopeAdapter.current`); die
     * Bindung selbst kommt aus dem Sitzungs-Dienst (`ClientSessions.binding`) —
     * dieselbe Naht wie in @shinon/token-usage, weil es nur EINE gibt.
     */
    function seamOf(ctx) {
      const shown = ctx.get?.('uiSession')?.adapter?.current?.getSnapshot?.();
      const sessionId = shown?.key ?? shown?.props?.sessionId;
      if (sessionId === undefined) return undefined;
      return ctx.get?.('sessions')?.binding?.(sessionId);
    }

    /** Die Lesart des Fensters: fehlt der Dienst, ist sie leer (und das Overlay schweigt). */
    function readTrajectoryOf(ctx) {
      return foldTrajectory(seamOf(ctx)?.eventSource?.getSnapshot?.()?.entries);
    }

    /**
     * Meldet jede Änderung: neue dauerhafte Ereignisse (das Fenster wächst) und
     * ein Sitzungswechsel (dann hängt das Abo an einer anderen Bindung).
     */
    function subscribeTrajectoryOf(ctx, listener) {
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
      const shown = ctx.get?.('uiSession')?.adapter?.current;
      const stopShown =
        typeof shown?.subscribe === 'function' ? shown.subscribe(() => { attachWindow(); listener(); }) : () => {};
      return () => {
        stopShown?.();
        stopWindow();
      };
    }

    /** In `apply()` an den echten ctx gebunden; vorher liest die Anzeige nichts. */
    let readTrajectory = () => foldTrajectory([]);
    let subscribeTrajectory = () => () => {};

    function useTrajectory() {
      const [, setRevision] = React.useState(0);
      const reading = readTrajectory();
      React.useEffect(() => subscribeTrajectory(() => setRevision((value) => value + 1)), []);
      return reading;
    }

    /**
     * Platzhalter fuellen: `{name}` → Wert. Ein fehlender Wert wird zum
     * Gedankenstrich — „undefined" hat in der Oberfläche nichts zu suchen, und ein
     * leerer Platzhalter saehe aus wie ein Werkzeug ohne Namen.
     */
    function fill(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (_whole, name) => {
        const value = values[name];
        return value === undefined || value === null ? '—' : String(value);
      });
    }

    function TrajectoryOverlay() {
      const progress = progressReading(useTrajectory());
      // Kein Vorgang, kein Text: `key === null` heisst „es gibt nichts zu sagen".
      if (progress.key === null) return null;
      const text = fill(t(progress.key), progress.values);
      return h('div', {
        className: 'shinon-popup-progress',
        title: text,
        'aria-label': text,
        'aria-live': 'polite',
        style: {
          padding: '4px 12px',
          fontSize: '12px',
          color: 'var(--dsw-alias-label-secondary)',
          borderTop: '1px solid var(--dsw-alias-border-l1)'
        }
      }, h('span', { 'aria-hidden': true }, '⏱'), ' ', text);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        readTrajectory = () => readTrajectoryOf(ctx);
        subscribeTrajectory = (listener) => subscribeTrajectoryOf(ctx, listener);

        // Der Overlay-Text kommt aus der Registry (Besitzer: @shinon/locale-de);
        // ohne Locale-Dienst gilt die deutsche Tabelle des Bausteins oben.
        // >>> shinon:dsh-idiom locale-fallback/bind — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test) params={"table":"OVERLAY_DE"}
        // Gelesen wird `ctx.get?.('locale')`, NICHT `ctx.locale`: ein direkter
        // Dienst-Zugriff ist am Cordis-Proxy durch `inject` gesperrt und wirft
        // ('cannot get property "locale" without inject') — das kostete dieser
        // Hälfte die Aktivierung. Der Blick passiert bei jedem Rendern, damit die
        // Anzeige auch einem später geladenen Dienst folgt; fehlt er (oder fehlt
        // `get`, wie an den repo-eigenen Attrappen), gilt OVERLAY_DE.
        t = (key) => {
          const locale = ctx.get?.('locale');
          const hit = typeof locale?.bind === 'function' ? locale.bind('shinon')(key) : undefined;
          return hit === undefined || hit === key ? (OVERLAY_DE[key] ?? key) : hit;
        };
        // <<< shinon:dsh-idiom locale-fallback/bind

        announce(
          'Overlay live: Fortschritt des laufenden Vorgangs aus dem Sitzungsfenster '
          + `(Slot ${DOCK_SLOT}, ohne laufenden Turn unsichtbar).`
        );

        ctx.slots.inject(DOCK_SLOT, () => ctx.slots.register({
          name: DOCK_SLOT,
          id: OVERLAY_ID,
          order: 30
        }, TrajectoryOverlay));

        // Die Sidebar-Zeile: der Eintrag, der das Bundle sichtbar macht. Eigener
        // Block, damit sich die BEIDEN generierten Locale-Bausteine nicht um
        // denselben Namen streiten: die Bausteine sind zeichengenau generiert
        // (scripts/lib/plugin-idioms.mjs), und jeder traegt seine eigenen Werte
        // in seiner Startmarke. Das innere `t` gilt nur hier; das aeussere (des
        // Overlays) wird nicht angefasst.
        {
          // >>> shinon:dsh-idiom locale-fallback/menu — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test) params={"table":"MENU_DE","key":"menu.popup","label":"Shinon Popup","noteSuffix":" LABEL bleibt die interne","noteLines":["Kennung für announce()."]}
          // Menü-Label aus der Registry (Besitzer: @shinon/locale-de); ohne
          // Locale-Dienst gilt die deutsche Tabelle. LABEL bleibt die interne
          // Kennung für announce().
          const MENU_DE = { 'menu.popup': 'Shinon Popup' };
          // Gelesen wird `ctx.get?.('locale')`, NICHT `ctx.locale`: ein direkter
          // Dienst-Zugriff ist am Cordis-Proxy durch `inject` gesperrt und wirft
          // ('cannot get property "locale" without inject') — das kostete dieser
          // Hälfte die Aktivierung. `ctx.get` ist die dokumentierte optionale
          // Abfrage (undefined, wenn der Dienst fehlt), und die `?.` tragen einen
          // Context ganz ohne `get` (die Attrappen in durchstich/uebergabe); dann
          // gilt MENU_DE.
          const t = (key) => {
            const locale = ctx.get?.('locale');
            const hit = typeof locale?.bind === 'function' ? locale.bind('shinon')(key) : undefined;
            return hit === undefined || hit === key ? (MENU_DE[key] ?? key) : hit;
          };
          // <<< shinon:dsh-idiom locale-fallback/menu

          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 70,
            label: () => t('menu.popup')
          }, PopupIcon));
        }
      },
    };
  },
});
