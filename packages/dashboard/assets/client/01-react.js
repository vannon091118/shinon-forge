    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/dashboard';
    const PANEL_ID = 'shinon-dashboard';
    /** Ereignis, mit dem sich eine Client-Haelfte anmeldet. */
    const REGISTRY_EVENT = 'shinon:plugin';
    /** Ereignis, mit dem das Codemon seinen Zustand (XP/HP) meldet. */
    const XP_EVENT = 'shinon:exp';

    /**
     * Die zwei Client-Dienste der Workspace- und Sitzungsliste. Sie werden
     * GELESEN, nicht importiert — Pakete bleiben referenzfrei (Konvention).
     */
    const WORKSPACE_SERVICE = 'workspaces';
    const SESSION_SERVICE = 'sessions';

    /**
     * Die zwei Kanaele. `apply` setzt sie auf die echten Client-Dienste; vorher
     * - und in einer Sitzung ohne diese Dienste - lesen sie nichts, und der
     * Abschnitt sagt genau das statt zu verschwinden.
     */
    let channels = () => ({ workspaces: undefined, sessions: undefined });

    /**
     * Die erwarteten Bundles in Profilreihenfolge. `active: false` heisst
     * bewusst abwesend (openapi ist im Profil nicht eingetragen, nicht kaputt).
     */
    const EXPECTED = [
      { id: '@shinon/persona', label: 'Persona', active: true },
      { id: '@shinon/events', label: 'Event-Spine', active: true },
      { id: '@shinon/markers', label: 'Marker-Spiegel', active: true },
      { id: '@shinon/core', label: 'Core (Marke)', active: true },
      { id: '@shinon/locale-de', label: 'Locale DE', active: true },
      { id: '@shinon/tooltip', label: 'Tooltip', active: true },
      { id: '@shinon/dashboard', label: 'Dashboard', active: true },
      { id: '@shinon/token-usage', label: 'Token-Nutzung', active: true },
      { id: '@shinon/hook', label: 'Hook', active: true },
      { id: '@shinon/prompter', label: 'Prompter', active: true },
      { id: '@shinon/project-index', label: 'Project Index', active: true },
      { id: '@shinon/task-router', label: 'Task Router', active: true },
      { id: '@shinon/codingmon', label: 'Codingmon', active: true },
      { id: '@shinon/diff-overview', label: 'Änderungen', active: true },
      { id: '@shinon/widget-dock', label: 'Shinon', active: true }, { id: '@shinon/popup', label: 'Shinon Popup', active: true }, { id: '@shinon/traceability', label: 'Traceability-Toasts', active: true },
    ];

    function insertStyles(tag, css) {
      if (document.querySelector(`style[data-plugin-css="${tag}"]`) !== null) return;
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = tag;
      style.textContent = css;
      document.head.appendChild(style);
    }

    insertStyles(`${PLUGIN}/dashboard.css`, `
      .shinon-dashboard {
        background: var(--dsw-alias-bg-base);
        color: var(--dsw-alias-label-primary);
        padding: 16px; height: 100%; overflow: auto;
        font-family: var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif);
      }
      .shinon-dashboard h2 { margin: 0 0 4px; font-family: var(--shinon-font-head, ui-sans-serif); letter-spacing: .06em; }
      .shinon-dashboard__sub { margin: 0 0 14px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .shinon-dashboard__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 18px; }
      .shinon-card { background: var(--dsw-alias-bg-layer-1); padding: 12px; border-radius: 6px;
        border: 1px solid color-mix(in srgb, var(--shinon-violet, #7C3AED) 22%, transparent); }
      .shinon-card__k { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
      .shinon-card__v { font-size: 15px; font-weight: 700; margin-top: 2px; }
      .shinon-section { margin-bottom: 18px; }
      .shinon-section h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase;
        color: var(--dsw-alias-label-secondary); }
      .shinon-plugins { width: 100%; border-collapse: collapse; font-size: 12px; }
      .shinon-plugins th { text-align: left; font-weight: 600; padding: 4px 8px;
        color: var(--dsw-alias-label-secondary); border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12)); }
      .shinon-plugins td { padding: 5px 8px; border-bottom: 1px solid rgba(255,255,255,.06); vertical-align: middle; }
      .shinon-plugins code { font-family: ui-monospace, monospace; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .shinon-state { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
      .shinon-state__dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
      .shinon-state--live { color: #22c55e; }
      .shinon-state--silent { color: #ef4444; }
      .shinon-state--inactive { color: var(--dsw-alias-label-secondary); }
      .shinon-exp { display: flex; align-items: center; gap: 10px; }
      .shinon-exp__track { flex: 1; height: 12px; border-radius: 6px; overflow: hidden; background: rgba(255,255,255,.12); }
      .shinon-exp__fill { display: block; height: 100%; background: var(--shinon-gradient, linear-gradient(115deg,#7C3AED,#6366F1)); transition: width .3s ease; }
      .shinon-exp__lvl { font-weight: 700; letter-spacing: .08em; color: var(--shinon-violet-light, #A855F7); }
      .shinon-exp__meta { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .shinon-ws__block { margin-bottom: 12px; padding: 10px; border-radius: 6px;
        background: var(--dsw-alias-bg-layer-1); border: 1px solid rgba(255,255,255,.07); }
      .shinon-ws__head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
      .shinon-ws__name { font-weight: 700; }
      .shinon-ws__count { font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .shinon-ws__path { display: block; font-size: 11px; color: var(--dsw-alias-label-secondary);
        margin: 2px 0 8px; word-break: break-all; }
      .shinon-ws__empty { font-size: 11px; margin: 0; color: var(--dsw-alias-label-secondary); }
      .shinon-ws__dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%;
        margin-right: 6px; vertical-align: middle; background: var(--dsw-alias-label-secondary); }
      .shinon-ws__dot--live { background: #22c55e; }
      .shinon-ws__origin { font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .shinon-badge { display: inline-block; font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
        padding: 1px 5px; border-radius: 3px; margin-left: 6px; }
      .shinon-badge--pin { background: color-mix(in srgb, #6366F1 28%, transparent);
        color: var(--shinon-violet-light, #A855F7); }
      .shinon-badge--arch { background: rgba(255,255,255,.12); color: var(--dsw-alias-label-secondary); }
      @media (prefers-reduced-motion: reduce) { .shinon-exp__fill { transition: none; } }
    `);

    /**
     * Die Anmeldungen lesen UND auf Aenderungen hoeren. Ohne das Ohr waere die
     * Liste eine Momentaufnahme: ein Plugin, das nach dem ersten Rendern laedt,
     * fehlte fuer immer.
     */
    function useRegistry() {
      const [tick, bump] = React.useState(0);
      React.useEffect(() => {
        const onChange = () => bump((value) => value + 1);
        window.addEventListener(REGISTRY_EVENT, onChange);
        window.addEventListener(XP_EVENT, onChange);
        return () => {
          window.removeEventListener(REGISTRY_EVENT, onChange);
          window.removeEventListener(XP_EVENT, onChange);
        };
      }, []);
      // tick ist die Ursache des Neu-Renderns, nicht der Wert.
      return { map: window.__shinonPlugins ?? new Map(), tick };
    }

    /** Der Zustand des Codemons, von aussen gelesen (null = nicht geladen). */
    function usePet() {
      const { tick } = useRegistry();
      const api = window.__codingmon;
      if (api === undefined) return { tick, pet: null };
      try {
        return { tick, pet: api.state() };
      } catch {
        return { tick, pet: null };
      }
    }

    function Card({ label, value }) {
      return h('div', { className: 'shinon-card' },
        h('div', { className: 'shinon-card__k' }, label),
        h('div', { className: 'shinon-card__v' }, value));
    }

    /**
     * Einen ObservableSnapshot eines Client-Dienstes lesen: getSnapshot()
     * liefert den Wert, subscribe() meldet jede Aenderung. Beide Aufrufe sind
     * gegen ein fehlendes oder fremdes Objekt abgesichert — ein
     * Beobachtungspanel darf an einer fehlenden Quelle nicht sterben, es muss
     * sie benennen.
     */
    function useSnapshot(source) {
      const [, bump] = React.useState(0);
      React.useEffect(() => {
        if (source === undefined || typeof source.subscribe !== 'function') return undefined;
        const off = source.subscribe(() => bump((value) => value + 1));
        return typeof off === 'function' ? off : undefined;
      }, [source]);
      if (source === undefined || typeof source.getSnapshot !== 'function') return undefined;
      try {
        return source.getSnapshot();
      } catch {
        return undefined;
      }
    }

    /**
     * Alles, was die Abschnitte brauchen. Der Zustand des Workspace-Dienstes
     * (`state` = loading/idle/error) wird MITGELESEN statt verschwiegen:
     * „kein Workspace\" und „noch nicht geladen\" sind zwei Aussagen.
     */
    function useSurfaces() {
      const { workspaces, sessions } = channels();
      const ws = useSnapshot(workspaces === undefined ? undefined : workspaces.list);
      const catalogue = useSnapshot(sessions === undefined ? undefined : sessions.list);
      return {
        hasWorkspaces: workspaces !== undefined,
        hasSessions: sessions !== undefined,
        items: ws?.items ?? [],
        archived: ws?.archivedSessionIds ?? [],
        pinned: ws?.pinnedSessionIds ?? [],
        wsState: ws?.state,
        wsError: ws?.error,
        byId: catalogue?.byId ?? {},
      };
    }

    /** Kennung kurz: eine Sitzungs-ID ist lang und sprengt sonst die Zeile. */
    function shortId(id) {
      return id.length > 14 ? `${id.slice(0, 8)}..${id.slice(-4)}` : id;
    }

    /** Eine Marke am Sitzungsnamen: angeheftet/archiviert ist Host-Zustand. */
    function badge(kind, text) {
      return h('span', { className: `shinon-badge shinon-badge--${kind}` }, text);
    }

