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
