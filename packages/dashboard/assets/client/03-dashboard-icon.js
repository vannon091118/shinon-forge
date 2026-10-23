    function DashboardIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
        h('rect', { x: 1, y: 1, width: 6, height: 6, rx: 1, fill: 'currentColor' }),
        h('rect', { x: 9, y: 1, width: 6, height: 6, rx: 1, fill: 'currentColor', opacity: 0.6 }),
        h('rect', { x: 1, y: 9, width: 6, height: 6, rx: 1, fill: 'currentColor', opacity: 0.6 }),
        h('rect', { x: 9, y: 9, width: 6, height: 6, rx: 1, fill: 'currentColor' })
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Sichtbarkeit: dieses Panel meldet sich wie jedes andere an.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set(PLUGIN, { label: 'Dashboard', kind: 'client', panel: PANEL_ID });
        window.dispatchEvent(new CustomEvent(REGISTRY_EVENT, { detail: { id: PLUGIN } }));

        // Die zwei Kanaele fuer Workspaces und Sitzungen. `ctx.get` liefert den
        // Dienst erst nach seiner Registrierung; fehlt er, bleibt er undefined,
        // und der Abschnitt benennt das, statt still leer zu bleiben. Gelesen
        // wird bei jedem Rendern, damit ein spaeter geladener Dienst noch
        // ankommt.
        channels = () => {
          const read = (name) => {
            // `ctx.get` ist die dokumentierte optionale Abfrage (undefined, wenn der
            // Dienst fehlt). KEIN Klammerzugriff `ctx[name]`: der ist am
            // Cordis-Proxy ein direkter Dienstzugriff und wirft ohne `inject`
            // ('cannot get property "workspaces" without inject') — anderen Hälften
            // kostete genau das die Aktivierung (Plan 2.6 / F-m). Ohne `get` gibt es
            // hier keinen Dienst, und der Abschnitt benennt das statt zu werfen.
            try {
              return typeof ctx.get === 'function' ? ctx.get(name) : undefined;
            } catch {
              return undefined;
            }
          };
          return { workspaces: read(WORKSPACE_SERVICE), sessions: read(SESSION_SERVICE) };
        };

        // >>> shinon:dsh-idiom locale-fallback/menu — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test) params={"table":"MENU_DE","key":"menu.dashboard","label":"Shinon Dashboard"}
        // Menü-Label aus der Registry (Besitzer: @shinon/locale-de); ohne
        // Locale-Dienst gilt die deutsche Tabelle.
        const MENU_DE = { 'menu.dashboard': 'Shinon Dashboard' };
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

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, DashboardPanel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          label: () => t('menu.dashboard')
        }, DashboardIcon));
      }
    };
