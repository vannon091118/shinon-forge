    /**
     * Die Bindung der gezeigten Sitzung: `SlotScopeAdapter.current` sagt welche,
     * `ClientSessions.binding` gibt sie — dieselbe Naht wie in @shinon/token-usage.
     */
    function seamOf(ctx) {
      const shown = ctx.get?.('uiSession')?.adapter?.current?.getSnapshot?.();
      const sessionId = shown?.key ?? shown?.props?.sessionId;
      if (sessionId === undefined) return undefined;
      return ctx.get?.('sessions')?.binding?.(sessionId);
    }

    /** Die Prompter-Entscheidungen aus dem Fensterspiegel (leer, wenn es keinen gibt). */
    function abortEntries() {
      const list = globalThis?.window?.[TRACE_GLOBAL];
      return Array.isArray(list) ? list : [];
    }

    /** Die Lesart des Fensters: fehlt der Dienst, ist sie leer (und das Overlay schweigt). */
    function readTrajectoryOf(ctx) {
      return foldTrajectory(seamOf(ctx)?.eventSource?.getSnapshot?.()?.entries, TOOL_HISTORY_LIMIT, abortEntries());
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
     * Platzhalter fuellen: `{name}` → Wert; fehlt er, wird er zum Gedankenstrich
     * („undefined" hat in der Oberfläche nichts zu suchen).
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
        title: text, 'aria-label': text, 'aria-live': 'polite',
        style: { padding: '4px 12px', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', borderTop: '1px solid var(--dsw-alias-border-l1)' }
      }, h('span', { 'aria-hidden': true }, '⏱'), ' ', text);
    }

    /** Das Panel zur Sidebar-Zeile: derselbe Leseweg wie das Overlay, nur ausführlicher. */
    function PopupPanel() {
      const reading = useTrajectory();
      const aborts = reading.aborts ?? { turns: 0, aborts: 0, quote: 0, topLabel: null };
      const dim = { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' };
      const row = (label, value) => h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px' } }, h('span', { style: dim }, label), h('span', null, value));
      const tools = reading.tools.map((tool, index) => h('span', { key: `${tool}-${index}`, style: { ...dim, padding: '1px 6px', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '999px' } }, tool));
      return h('div', { className: '__pp_panel', style: { padding: '10px 12px', display: 'grid', gap: '6px', alignContent: 'start' } },
        h('div', { style: { ...dim, textTransform: 'uppercase' } }, 'Popup'),
        reading.active === true ? h('div', null, row('Schritt', String(reading.step)), row('Offene Aufrufe', String(reading.open)), row('Aufrufe gesamt', String(reading.calls)), row('Zuletzt', reading.running ?? '—')) : h('div', { style: dim }, 'Kein laufender Vorgang.'),
        tools.length === 0 ? null : h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '84px', overflowY: 'auto' } }, tools),
        aborts.turns === 0 ? null : h('div', { style: dim }, `${aborts.aborts} von ${aborts.turns} Entscheidungen abgebrochen${aborts.topLabel === null ? '' : ` · häufigster Grund: ${aborts.topLabel}`}`));
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

        // Die Sidebar-Zeile braucht ein Ziel: derselbe Leseweg, nur als Panel.
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, PopupPanel));

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

          // Kein `sidebar.panellist`-Eintrag mehr (2026-10-22): acht Panel-Knöpfe
          // hatten die Workspace-Liste aus der Leiste gedrängt. Der Zustand
          // steht als Widget in `@shinon/widget-dock`.
        }
      },
    };
