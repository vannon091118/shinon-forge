    /**
     * Die Sitzungs-Bindung der Sitzung, die die Oberfläche zeigt. Welche das ist,
     * sagt die Vorgabe-Bindung des Renderers (`SlotScopeAdapter.current`); die
     * Bindung selbst kommt aus dem Sitzungs-Dienst (`ClientSessions.binding`).
     */
    function seamOf(ctx) {
      const shown = ctx.get?.('uiSession')?.adapter?.current?.getSnapshot?.();
      const sessionId = shown?.key ?? shown?.props?.sessionId;
      if (sessionId === undefined) return undefined;
      return ctx.get?.('sessions')?.binding?.(sessionId);
    }

    /** Der jüngste vollständige Turn (aus seinen eigenen Ereignissen) und die Sitzungssumme. */
    function readPanelOf(ctx) {
      const binding = seamOf(ctx);
      const slice = turnSliceOf(binding?.eventSource?.getSnapshot?.()?.entries);
      const turn = slice === undefined ? null : turnReading(deriveTurnUsage(slice.events), slice.turn);
      const session = sessionReading(binding?.session?.projections?.faceOf?.(TOKEN_USAGE_KEY)?.getSnapshot?.());
      return { turn: turn ?? null, session: session ?? null };
    }

    /**
     * Meldet jede Änderung: neue dauerhafte Ereignisse (das Fenster wächst) und
     * ein Sitzungswechsel (dann hängt das Abo an einer anderen Bindung, wird also
     * neu angehängt).
     */
    function subscribePanelOf(ctx, listener) {
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
    let readPanel = () => ({ turn: null, session: null });
    let subscribePanel = () => () => {};

    // Fallback-Text aus der Registry (Besitzer: @shinon/locale-de); ohne
    // Locale-Dienst gilt der deutsche statische Wert. 't' wird in apply()
    // gebunden, weil erst dort ein ctx existiert; die Komponente liest pro
    // Rendern und folgt so dem aktiven Locale ohne Re-Registrierung.
    // >>> shinon:dsh-idiom locale-fallback/static — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test) params={"table":"TOKEN_DE","key":"token.fallback","label":"Token: --"}
    const TOKEN_DE = { 'token.fallback': 'Token: --' };
    let t = (key) => TOKEN_DE[key] ?? key;
    // <<< shinon:dsh-idiom locale-fallback/static

    /**
     * Bei jedem Rendern neu gelesen (wie das Locale), damit auch ein später
     * geladener Dienst von selbst folgt; das Abo stößt das nächste Rendern an,
     * sobald DSH neue Ereignisse oder einen Sitzungswechsel meldet.
     */
    function usePanel() {
      const [, setRevision] = React.useState(0);
      const reading = readPanel();
      React.useEffect(() => subscribePanel(() => setRevision((value) => value + 1)), []);
      return reading;
    }

    /** Die Sidebar übergibt "wide"; in der schmalen Leiste bricht der Text sonst um. */
    function TokenDisplay({ wide }) {
      const panel = usePanel();
      const primary = panel.turn ?? panel.session;
      // Der Ersatztext steht nur, wenn WEDER ein Turn noch eine Sitzungssumme
      // beweisbar ist; die Turn-Zahl nennt die Sitzungssumme im Titel, damit
      // beide Zahlen sichtbar bleiben und keine für die andere gehalten wird.
      const label = primary === null ? t('token.fallback') : primary.label;
      const title =
        primary === null
          ? t('token.fallback')
          : panel.turn !== null && panel.session !== null
            ? `${panel.turn.detail} · ${panel.session.detail}`
            : primary.detail;
      const style = {
        fontSize: '12px',
        color: 'var(--dsw-alias-label-secondary)',
        borderBottom: '1px solid var(--dsw-alias-border-l1)'
      };
      if (wide !== true) {
        return h('div', {
          className: 'dsh-token-display',
          title,
          'aria-label': title,
          style: { ...style, padding: '8px', textAlign: 'center' }
        }, '📊');
      }
      return h('div', { className: 'dsh-token-display', title, 'aria-label': title, style: { ...style, padding: '8px 12px' } }, '📊 ' + label);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        readPanel = () => readPanelOf(ctx);
        subscribePanel = (listener) => subscribePanelOf(ctx, listener);

        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/token-usage', { label: 'Token-Nutzung', kind: 'client', panel: 'shinon-token-usage' });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/token-usage' } }));

        // >>> shinon:dsh-idiom locale-fallback/bind — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test) params={"table":"TOKEN_DE"}
        // Gelesen wird `ctx.get?.('locale')`, NICHT `ctx.locale`: ein direkter
        // Dienst-Zugriff ist am Cordis-Proxy durch `inject` gesperrt und wirft
        // ('cannot get property "locale" without inject') — das kostete dieser
        // Hälfte die Aktivierung. Der Blick passiert bei jedem Rendern, damit die
        // Anzeige auch einem später geladenen Dienst folgt; fehlt er (oder fehlt
        // `get`, wie an den repo-eigenen Attrappen), gilt TOKEN_DE.
        t = (key) => {
          const locale = ctx.get?.('locale');
          const hit = typeof locale?.bind === 'function' ? locale.bind('shinon')(key) : undefined;
          return hit === undefined || hit === key ? (TOKEN_DE[key] ?? key) : hit;
        };
        // <<< shinon:dsh-idiom locale-fallback/bind

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'shinon-token-usage',
          order: 100
        }, TokenDisplay));
      }
    };
