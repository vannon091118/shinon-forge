/**
 * @shinon/version — Client-Hälfte: der Versionsspiegel in der Ecke.
 *
 * WAS HIER RENDERT: eine schmale Zeile unten rechts, die immer da ist und
 * unaufgeregt bleibt: der neueste Commit, der installierte Commit, der
 * Abstand. Sie ist nicht zu uebersehen und nicht zu uebersehen-wollen — sie
 * ist eine Zeile, die man liest, wenn man sie braucht.
 *
 * DER WEG DER DATEN: der Host schiebt seinen gemessenen Zustand ueber
 * `webserver/index-inject` als `window.__DSH_VERSION_INFO__` in die Seite. Der
 * Client erfindet nichts — fehlt der Global (fremder Host, Tests), bleibt die
 * Ecke leer. Ein Spiegel, der selbst rechnet, zeigt irgendwann etwas, das
 * niemand gemessen hat.
 *
 * DER KLICK: `POST <endpoint>/update` mit dem Boot-Token aus dem Global. Der
 * Host startet daraufhin die Nachfuehrung (Kandidat bauen, abnehmen, beim
 * naechsten Start uebernehmen) und schreibt seinen Fortschritt in die
 * Zustandsroute. Der Client fragt die Route ab, bis der Auftrag fertig ist —
 * und sagt danach, was GEKLAPPT hat, nicht was er hoffte.
 *
 * Der Name des Globals ist ein LITERAL: ein Client-Bundle kann den Host nicht
 * importieren. Der Zwillings-Test in scripts/gate/tests vergleicht ihn mit der
 * Host-Konstante — die beiden Seiten dürfen nicht auseinanderlaufen.
 */
window.__ModuleLoader__.load({
  id: '@shinon/version',
  factory(require) {
    const PLUGIN = '@shinon/version';
    /** Der Global, den der Host setzt (Host-Konstante VERSION_GLOBAL). */
    const VERSION_GLOBAL = '__DSH_VERSION_INFO__';
    /** Die Route des Hosts; sie kommt aus dem Global, nicht aus einer Vermutung. */
    const DEFAULT_ENDPOINT = '/shinon/version';
    /** Wie oft der Client den Auftrag abfragt (ms). */
    const POLL_MS = 2000;

    const info = window[VERSION_GLOBAL];
    if (info === undefined || info === null || info.contract !== 'shinon.version/state-v1') {
      // Kein Host, kein Spiegel: die Ecke bleibt leer. Kein Platzhalter, kein
      // "unbekannt" — eine leere Ecke ist ehrlicher als eine erfundene Zahl.
      return { inject: [], apply() {} };
    }

    const endpoint = typeof info.endpoint === 'string' && info.endpoint !== '' ? info.endpoint : DEFAULT_ENDPOINT;
    const token = typeof info.token === 'string' ? info.token : '';

    const style = document.createElement('style');
    style.dataset.plugin = PLUGIN;
    style.dataset.pluginCss = `${PLUGIN}/version.css`;
    style.textContent = `
      .shinon-version {
        position: fixed;
        right: 12px;
        bottom: 10px;
        z-index: 40;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 8px;
        border-radius: 6px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12));
        background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.35));
        color: var(--dsw-alias-label-secondary, rgba(255,255,255,.55));
        font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: .02em;
        opacity: .38;
        cursor: pointer;
        user-select: none;
        transition: opacity .18s ease;
      }
      .shinon-version:hover, .shinon-version:focus-visible { opacity: 1; }
      .shinon-version[data-state="bereit"] { opacity: .8; }
      .shinon-version[data-state="Fehler"] { opacity: .9; color: #fca5a5; }
      .shinon-version__dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: currentColor; opacity: .8;
      }
      .shinon-version__msg {
        max-width: 46ch;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.className = 'shinon-version';
    root.dataset.state = 'ruhe';
    root.setAttribute('role', 'status');
    root.setAttribute('tabindex', '0');
    const dot = document.createElement('span');
    dot.className = 'shinon-version__dot';
    const line = document.createElement('span');
    line.className = 'shinon-version__msg';
    const msg = document.createElement('span');
    msg.className = 'shinon-version__msg';
    root.appendChild(dot);
    root.appendChild(line);
    root.appendChild(msg);
    document.body.appendChild(root);

    const show = (text, state) => {
      line.textContent = text;
      root.dataset.state = state;
      root.title = text;
    };

    const badge = typeof info.badge?.line === 'string' ? info.badge.line : 'Version unbekannt';
    show(badge, 'ruhe');

    /** Den Auftrag starten und seinen Fortschritt abfragen, bis er endet. */
    const startUpdate = async () => {
      show('Update wird vorbereitet …', 'laeuft');
      try {
        const response = await fetch(`${endpoint}/update`, {
          method: 'POST',
          headers: token === '' ? {} : { 'x-shinon-version-token': token },
        });
        if (response.status === 403) { show('Update abgelehnt — fremder Aufrufer', 'Fehler'); return; }
        if (!response.ok) { show(`Update nicht möglich (${response.status})`, 'Fehler'); return; }
      } catch (error) {
        show(`Update nicht erreichbar: ${String(error?.message ?? error)}`, 'Fehler');
        return;
      }
      const timer = setInterval(async () => {
        let payload = null;
        try { payload = await (await fetch(endpoint, { cache: 'no-store' })).json(); } catch { return; }
        const job = payload?.job ?? null;
        if (job === null) { clearInterval(timer); show(badge, 'ruhe'); return; }
        if (job.running === true) {
          const last = Array.isArray(job.lines) && job.lines.length > 0 ? job.lines[job.lines.length - 1] : 'arbeitet …';
          show(`Update: ${last}`, 'laeuft');
          return;
        }
        clearInterval(timer);
        const lines = Array.isArray(job.lines) ? job.lines : [];
        const last = lines.length > 0 ? lines[lines.length - 1] : (job.state ?? 'fertig');
        show(job.state === 'bereit' ? `Update bereit: ${last}` : `Update ${job.state}: ${last}`, job.state === 'bereit' ? 'bereit' : 'Fehler');
        const neu = typeof payload?.badge?.line === 'string' ? payload.badge.line : badge;
        line.title = neu;
      }, POLL_MS);
    };

    root.addEventListener('click', () => { void startUpdate(); });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void startUpdate(); }
    });

    // Der Katalog meldet die Hallfte an — sie ist eine sichtbare Schicht und
    // keine stille Nebensache.
    const table = window.__shinonPluginCatalog ?? (window.__shinonPluginCatalog = {});
    table[PLUGIN] = {
      id: PLUGIN,
      label: 'Shinon Version',
      role: 'Versionsspiegel (neuester und installierter Commit)',
      status: 'beobachtet',
      detail: badge,
      mounted: new Date().toISOString(),
    };
    window.dispatchEvent(new CustomEvent('shinon:plugin-registered', { detail: { id: PLUGIN } }));

    return {
      inject: [],
      apply() {
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set(PLUGIN, { label: 'Shinon Version', kind: 'client', panel: null });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));
      },
    };
  },
});
