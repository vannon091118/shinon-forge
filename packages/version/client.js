/**
 * @shinon/version — Client-Hälfte: der Versionsspiegel in der Ecke.
 *
 * WAS HIER RENDERT: eine schmale Zeile unten rechts (neuester Commit,
 * installierter Commit, Abstand) und — wenn ein Update ansteht — die FRAGE
 * dazu: „Jetzt installieren" oder „Beim nächsten Start". Beides sind zwei
 * verschiedene Handlungen, nicht zwei Knöpfe für dieselbe: der eine beendet
 * den laufenden Host und schaltet sofort um, der andere baut nur den Kandidaten.
 *
 * DER WEG DER DATEN: der Host schiebt seinen gemessenen Zustand ueber
 * `webserver/index-inject` als `window.__DSH_VERSION_INFO__` in die Seite — mit
 * Zeile, Tooltip und der Frage (`badge.choice`, formuliert in
 * assets/version-state.js). Der Client erfindet keinen Text: fehlt der Global
 * (fremder Host, Tests), bleibt die Ecke leer. Ein Spiegel, der selbst rechnet,
 * zeigt irgendwann etwas, das niemand gemessen hat.
 *
 * DER KLICK: `POST <endpoint>/update` mit `{ mode }` und dem Boot-Token aus dem
 * Global. Der Host startet daraufhin `install-user.mjs auto` (mit `--now` für
 * „Jetzt installieren") und schreibt seinen Fortschritt in die Zustandsroute.
 * Der Client fragt ab, bis der Auftrag endet — und sagt danach, was GEKLAPPT
 * hat. Bei `now` beendet der Auftrag den Host: die Abfrage darf dann nicht
 * „Fehler" sagen, sondern „Host startet neu" (der Lauf geht weiter).
 *
 * Der Name des Globals ist ein LITERAL (ein Client-Bundle kann den Host nicht
 * importieren); der Zwillings-Test vergleicht ihn mit der Host-Konstante.
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
    /** Wie oft ein nicht erreichbarer Host toleriert wird (45 × 2s ≈ 90s). */
    const POLL_MISSES = 45;

    const info = window[VERSION_GLOBAL];
    if (info === undefined || info === null || info.contract !== 'shinon.version/state-v1') {
      // Kein Host, kein Spiegel: die Ecke bleibt leer. Kein Platzhalter, kein
      // "unbekannt" — eine leere Ecke ist ehrlicher als eine erfundene Zahl.
      return { inject: [], apply() {} };
    }

    const endpoint = typeof info.endpoint === 'string' && info.endpoint !== '' ? info.endpoint : DEFAULT_ENDPOINT;
    const token = typeof info.token === 'string' ? info.token : '';
    const choice = info.badge?.choice ?? null;

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
      .shinon-version__dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .8; }
      .shinon-version__msg { max-width: 46ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .shinon-version__ask {
        position: fixed; right: 12px; bottom: 34px; z-index: 41; width: 330px;
        display: grid; gap: 7px; padding: 10px;
        border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12));
        background: var(--dsw-alias-bg-layer-2, #1b1b1b); color: var(--dsw-alias-label-primary, #eee);
        font: 12px/1.45 system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.35);
      }
      .shinon-version__ask[hidden] { display: none; }
      .shinon-version__asktext { font-weight: 600; }
      .shinon-version__row { display: grid; gap: 2px; }
      .shinon-version__btn {
        justify-self: start; padding: 3px 9px; border-radius: 5px; cursor: pointer;
        border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.18));
        background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.06)); color: inherit; font: inherit;
      }
      .shinon-version__btn:hover { border-color: var(--dsw-alias-label-secondary, #aaa); }
      .shinon-version__note { opacity: .6; font-size: 11px; }
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
    root.appendChild(dot);
    root.appendChild(line);
    document.body.appendChild(root);

    const badge = typeof info.badge?.line === 'string' ? info.badge.line : 'Version unbekannt';
    const show = (text, state) => {
      line.textContent = text;
      root.dataset.state = state;
      root.title = text;
    };
    show(badge, 'ruhe');

    // ── Die Frage: zwei Wege, ihre Folgen stehen daneben ────────────────────
    const ask = document.createElement('div');
    ask.className = 'shinon-version__ask';
    ask.hidden = true;
    const askText = document.createElement('span');
    askText.className = 'shinon-version__asktext';
    askText.textContent = choice?.question ?? '';
    ask.appendChild(askText);

    const row = (label, note, mode) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'shinon-version__row';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shinon-version__btn';
      button.textContent = label;
      button.addEventListener('click', () => { void startUpdate(mode); });
      const hint = document.createElement('span');
      hint.className = 'shinon-version__note';
      hint.textContent = note;
      wrapper.append(button, hint);
      return wrapper;
    };
    const askRows = [row(choice?.now?.label ?? 'Jetzt installieren', choice?.now?.note ?? '', 'now'), row(choice?.next?.label ?? 'Beim nächsten Start', choice?.next?.note ?? '', 'next')];
    for (const entry of askRows) ask.appendChild(entry);
    document.body.appendChild(ask);

    /** Das Panel spricht — die Spiegelzeile bleibt, was sie ist (Grund statt zwei Wegen, wenn kein Rueckstand). */
    const openAsk = () => {
      const available = choice?.available === true;
      askText.textContent = available ? (choice?.question ?? '') : (choice?.unavailable || badge);
      for (const entry of askRows) entry.hidden = !available;
      ask.hidden = !ask.hidden;
    };

    /** Die letzte Zeile des Auftrags — die einzige, die in die Ecke passt. */
    const lastLine = (job) => (Array.isArray(job?.lines) && job.lines.length > 0
      ? job.lines[job.lines.length - 1]
      : 'arbeitet …');

    /** Den gemessenen Stand nachziehen, sobald der Host wieder antwortet. */
    const refreshBadge = (payload) => {
      if (typeof payload?.badge?.line !== 'string') return;
      line.textContent = payload.badge.line;
      line.title = root.title = payload.badge.title ?? payload.badge.line;
    };

    /**
     * Den Auftrag abfragen, bis er endet. Ein nicht erreichbarer Host ist bei
     * `now` ERWARTET (er wird beendet und neu gestartet) — daraus darf kein
     * Fehler werden, solange der Neustart laufen kann.
     */
    const poll = (mode) => {
      let misses = 0;
      const timer = setInterval(async () => {
        let payload = null;
        try { payload = await (await fetch(endpoint, { cache: 'no-store' })).json(); } catch {
          misses += 1;
          if (misses > POLL_MISSES) {
            clearInterval(timer);
            show('Host nicht zurück — install-user history zeigt den Lauf', 'Fehler');
            return;
          }
          show(mode === 'now' ? 'Host startet neu …' : 'Host nicht erreichbar', 'laeuft');
          return;
        }
        misses = 0;
        const job = payload?.job ?? null;
        if (job === null) {
          clearInterval(timer);
          show(badge, 'ruhe');
          refreshBadge(payload);
          return;
        }
        if (job.running === true) { show(`Update: ${lastLine(job)}`, 'laeuft'); return; }
        clearInterval(timer);
        show(job.exitCode === 0 ? `Update fertig: ${lastLine(job)}` : `Update ${job.state ?? 'beendet'}: ${lastLine(job)}`,
          job.exitCode === 0 ? 'bereit' : 'Fehler');
        refreshBadge(payload);
      }, POLL_MS);
    };

    /** Den Auftrag starten — mit der Antwort des Nutzers, nicht statt ihrer. */
    const startUpdate = async (mode) => {
      ask.hidden = true;
      show(mode === 'now' ? 'Umschalten: Host wird beendet und neu gestartet …' : 'Kandidat wird geladen und geprüft …', 'laeuft');
      try {
        const response = await fetch(`${endpoint}/update`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(token === '' ? {} : { 'x-shinon-version-token': token }) },
          body: JSON.stringify({ mode }),
        });
        if (response.status === 403) { show('Update abgelehnt — fremder Aufrufer', 'Fehler'); return; }
        if (!response.ok) { show(`Update nicht möglich (${response.status})`, 'Fehler'); return; }
      } catch (error) {
        show(`Update nicht erreichbar: ${String(error?.message ?? error)}`, 'Fehler');
        return;
      }
      poll(mode);
    };

    root.addEventListener('click', openAsk);
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAsk(); }
    });

    // Der Katalog meldet die Haelfte an — sie ist eine sichtbare Schicht und
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
