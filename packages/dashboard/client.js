/**
 * shinon-dashboard - Dashboard UI (Client-Hälfte).
 *
 * DAS FENSTER ZUR SICHTBARKEIT: was laeuft, steht hier. Jede Client-Haelfte
 * meldet sich in `window.__shinonPlugins` an (Konvention, kein Import — Pakete
 * bleiben referenzfrei) und schickt dazu ein `shinon:plugin`-Ereignis. Dieses
 * Panel liest die Liste und stellt sie gegen die ERWARTETEN Bundles: ein
 * erwartetes Plugin, das sich nicht meldet, steht als STILL da und nicht als
 * fehlende Zeile. Genau das ist der Unterschied zwischen „laeuft" und „sieht
 * so aus, als laufe es".
 *
 * `EXPECTED` spiegelt `profiles/shinon/package.json` (`dsh.profile.bundles`) —
 * die eine Quelle steht dort, der Browser kann sie nicht lesen. Deshalb ist
 * jede Abweichung hier sichtbar statt still: ein Bundle, das im Profil steht
 * und sich nicht meldet, faellt auf; ein Bundle, das sich meldet und nicht im
 * Profil steht (openapi), ist als inaktiv gekennzeichnet.
 *
 * WORKSPACES UND SITZUNGEN (gemessen, Docs/probes/workspace-list.json): der
 * Host haelt die Liste in `ctx.workspaceRegistry` (dsh-workspace). In den
 * Browser kommt sie nicht ueber diesen Registry-Dienst, sondern ueber die
 * Client-Haelfte von dsh-api-workspace-controller: die registriert den Dienst
 * `workspaces` (WorkspaceController, `.list` ist der ClientWorkspaceModel) und
 * `sessions` ist der Sitzungskatalog (ClientSessions, `.list` mit `byId`).
 * Beide haben die ObservableSnapshot-Form der Client-Dienste - getSnapshot()
 * liefert den Wert, subscribe() meldet Aenderungen - und genau so werden sie
 * hier gelesen. Dieses Panel zeigt sie NUR: es legt keinen Workspace an,
 * benennt nichts um und heftet/archiviert nichts.
 *
 * 'main' ist ein keyed-Slot (options.key) und die Sidebar-Leiste
 * 'sidebar.panellist' eine list (options.id) - ohne diesen Eintrag wäre das
 * Panel nicht erreichbar.
 */
window.__ModuleLoader__.load({
  id: '@shinon/dashboard',
  factory(require) {
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
      { id: '@shinon/better-errors', label: 'Fehler besser', active: true },
      { id: '@shinon/token-usage', label: 'Token-Nutzung', active: true },
      { id: '@shinon/hook', label: 'Hook', active: true },
      { id: '@shinon/prompter', label: 'Prompter', active: true },
      { id: '@shinon/project-index', label: 'Project Index', active: true },
      { id: '@shinon/task-router', label: 'Task Router', active: true },
      { id: '@shinon/codingmon', label: 'Codingmon', active: true },
      { id: '@shinon/openapi', label: 'OpenAPI', active: false },
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

    /** Ein Projektionsfehler als Text: der Client-Dienst traegt code und message. */
    function errorText(error) {
      if (error === null || error === undefined) return '';
      const code = error.code ?? error.name;
      const message = error.message ?? String(error);
      return code === undefined ? message : `${code}: ${message}`;
    }

    /** Herkunft und Arbeitsverzeichnis einer Sitzung, so weit der Katalog sie kennt. */
    function originOf(row) {
      if (row === undefined) return 'nicht im Katalog';
      const origin = row.origin === 'subagent' ? 'Unteragent' : row.parentId === undefined ? 'Sitzung' : 'Abzweig';
      return row.cwd === undefined ? origin : `${origin} · ${row.cwd}`;
    }

    /** Eine Sitzungszeile: Name mit Zustandspunkt, Kennung, Herkunft, Marken. */
    function SessionRow({ id, row, pinned, archived }) {
      const marks = [];
      if (pinned.includes(id)) marks.push(badge('pin', 'angeheftet'));
      if (archived.includes(id)) marks.push(badge('arch', 'archiviert'));
      return h('tr', { className: 'shinon-ws__session' },
        h('td', null,
          h('span', { className: `shinon-ws__dot${row?.running === true ? ' shinon-ws__dot--live' : ''}` }),
          h('span', { className: 'shinon-ws__name' }, row?.displayTitle ?? row?.title ?? '(nicht im Katalog)'),
          ...marks),
        h('td', null, h('code', null, shortId(id))),
        h('td', null, h('span', { className: 'shinon-ws__origin' }, originOf(row))));
    }

    /** Die Sitzungstabelle eines Blocks: dieselbe Kopfzeile, dieselbe Zeile. */
    function SessionTable({ ids, byId, pinned, archived }) {
      return h('table', { className: 'shinon-plugins' },
        h('thead', null, h('tr', null,
          h('th', null, 'Sitzung'),
          h('th', null, 'Kennung'),
          h('th', null, 'Herkunft'))),
        h('tbody', null, ids.map((id) => h(SessionRow, { key: id, id, row: byId[id], pinned, archived }))));
    }

    /** Ein Workspace mit seinen zugeordneten Sitzungen und deren Marken. */
    function WorkspaceBlock({ item, byId, pinned, archived }) {
      const ids = item.sessionIds ?? [];
      const pinnedHere = ids.filter((id) => pinned.includes(id)).length;
      const archivedHere = ids.filter((id) => archived.includes(id)).length;
      return h('div', { className: 'shinon-ws__block' },
        h('div', { className: 'shinon-ws__head' },
          h('span', { className: 'shinon-ws__name' },
            item.title === '' || item.title === undefined ? '(ohne Namen)' : item.title),
          h('code', null, item.workspaceId),
          h('span', { className: 'shinon-ws__count' },
            `${ids.length} Sitzung${ids.length === 1 ? '' : 'en'}`
            + (pinnedHere === 0 ? '' : `, ${pinnedHere} angeheftet`)
            + (archivedHere === 0 ? '' : `, ${archivedHere} archiviert`))),
        h('code', { className: 'shinon-ws__path' }, item.path),
        ids.length === 0
          ? h('p', { className: 'shinon-ws__empty' }, 'keine Sitzung zugeordnet')
          : h(SessionTable, { ids, byId, pinned, archived }));
    }

    /**
     * Workspaces und Sitzungen: die Liste des Hosts, im Browser sichtbar.
     * Drei ehrliche Sonderfaelle statt einer stillen Luecke: kein Kanal, ein
     * Workspace ohne Sitzung und eine Sitzung ohne Workspace.
     */
    function WorkspaceSection() {
      const surfaces = useSurfaces();
      if (!surfaces.hasWorkspaces && !surfaces.hasSessions) {
        return h('section', { className: 'shinon-section' },
          h('h3', null, 'Workspaces und Sitzungen'),
          h('p', { className: 'shinon-dashboard__sub' },
            'Ohne Kanal: weder `workspaces` noch `sessions` ist in dieser Sitzung verbunden. Der Host haelt '
            + 'die Liste in ctx.workspaceRegistry (dsh-workspace); in den Browser bringt sie die '
            + 'Client-Haelfte von dsh-api-workspace-controller.'));
      }
      const accounted = new Set(surfaces.items.flatMap((item) => item.sessionIds ?? []));
      const catalogue = Object.keys(surfaces.byId);
      const orphans = catalogue.filter((id) => !accounted.has(id));
      const onlyMarked = [...new Set([...surfaces.pinned, ...surfaces.archived])]
        .filter((id) => surfaces.byId[id] === undefined && !accounted.has(id));
      return h('section', { className: 'shinon-section' },
        h('h3', null, `Workspaces und Sitzungen — ${surfaces.items.length} Workspaces, ${catalogue.length} Sitzungen`),
        h('p', { className: 'shinon-dashboard__sub' },
          'Gelesen aus den Client-Diensten `workspaces` (die Projektion von ctx.workspaceRegistry) und `sessions`. '
          + 'Nur Anzeige: dieses Panel legt keinen Workspace an, benennt nichts um und aendert keine Zuordnung.'
          + (surfaces.hasSessions ? '' : ' `sessions` fehlt — Sitzungen zeigen nur ihre Kennung.')
          + (surfaces.wsState === 'loading' ? ' Die Workspace-Projektion laedt noch.' : '')
          + (surfaces.wsError === null || surfaces.wsError === undefined
            ? '' : ` Projektionsfehler: ${errorText(surfaces.wsError)}.`)),
        surfaces.items.length === 0
          ? h('p', { className: 'shinon-ws__empty' }, 'Der Host meldet keinen Workspace.')
          : surfaces.items.map((item) => h(WorkspaceBlock, {
              key: item.workspaceId, item, byId: surfaces.byId, pinned: surfaces.pinned, archived: surfaces.archived,
            })),
        orphans.length === 0 ? null : h('div', { className: 'shinon-ws__block' },
          h('div', { className: 'shinon-ws__head' },
            h('span', { className: 'shinon-ws__name' }, 'Sitzungen ohne Workspace'),
            h('span', { className: 'shinon-ws__count' }, `${orphans.length} ohne Zuordnung`)),
          h(SessionTable, { ids: orphans, byId: surfaces.byId, pinned: surfaces.pinned, archived: surfaces.archived })),
        onlyMarked.length === 0 ? null : h('div', { className: 'shinon-ws__block' },
          h('div', { className: 'shinon-ws__head' },
            h('span', { className: 'shinon-ws__name' }, 'Nur im Anheft-/Archiv-Satz'),
            h('span', { className: 'shinon-ws__count' }, `${onlyMarked.length} nicht im Katalog`)),
          h(SessionTable, { ids: onlyMarked, byId: surfaces.byId, pinned: surfaces.pinned, archived: surfaces.archived })));
    }

    /** Die globale EXP-Leiste: dieselbe Zusage wie im Composer-Dock, gross. */
    function ExpSection() {
      const { pet } = usePet();
      if (pet === null) {
        return h('section', { className: 'shinon-section' },
          h('h3', null, 'Erfahrung'),
          h('p', { className: 'shinon-dashboard__sub' }, 'Kein Codemon geladen — @shinon/codingmon meldet keinen Zustand.'));
      }
      const next = 250 * pet.level * (pet.level + 1) / 2;
      const prev = 250 * (pet.level - 1) * pet.level / 2;
      const pct = Math.max(0, Math.min(100, Math.round(((pet.xp - prev) / Math.max(1, next - prev)) * 100)));
      return h('section', { className: 'shinon-section' },
        h('h3', null, `Erfahrung — Level ${pet.level}`),
        h('div', { className: 'shinon-exp' },
          h('span', { className: 'shinon-exp__lvl' }, `LV ${pet.level}`),
          h('span', { className: 'shinon-exp__track' },
            h('span', { className: 'shinon-exp__fill', style: { width: `${pct}%` } })),
          h('span', { className: 'shinon-exp__meta' }, `${pet.xp} / ${next} XP`)),
        h('p', { className: 'shinon-dashboard__sub' },
          `${pet.wins} Siege · ${pet.losses} K.o. · HP ${Math.max(0, pet.hp)}/${pet.stats.hp} · 1 XP pro Token, XP fuer Siege`));
    }

    /** Sichtbarkeit: jedes erwartete Plugin mit Zustand, plus alles Unerwartete. */
    function PluginSection() {
      const { map } = useRegistry();
      const live = EXPECTED.filter((entry) => entry.active && map.has(entry.id)).length;
      const silent = EXPECTED.filter((entry) => entry.active && !map.has(entry.id)).length;
      const extra = [...map.keys()].filter((id) => !EXPECTED.some((entry) => entry.id === id));
      return h('section', { className: 'shinon-section' },
        h('h3', null, `Plugin-Sichtbarkeit — ${live} laufen, ${silent} still`),
        h('table', { className: 'shinon-plugins' },
          h('thead', null, h('tr', null,
            h('th', null, 'Plugin'),
            h('th', null, 'Zustand'),
            h('th', null, 'Panel'))),
          h('tbody', null,
            EXPECTED.map((entry) => {
              const announced = map.get(entry.id);
              const state = !entry.active ? 'inactive' : (announced ? 'live' : 'silent');
              const text = state === 'inactive' ? 'inaktiv (nicht im Profil)' : state === 'live' ? 'laeuft' : 'STILL — nicht geladen';
              return h('tr', { key: entry.id },
                h('td', null, [
                  h('div', null, announced?.label ?? entry.label),
                  h('code', null, entry.id),
                ]),
                h('td', null, h('span', { className: `shinon-state shinon-state--${state}` },
                  h('span', { className: 'shinon-state__dot' }), text)),
                h('td', null, h('code', null, announced?.panel ?? (announced ? 'ohne Panel' : '—'))));
            }),
            extra.map((id) => h('tr', { key: id },
              h('td', null, [h('div', null, map.get(id)?.label ?? id), h('code', null, id)]),
              h('td', null, h('span', { className: 'shinon-state shinon-state--live' },
                h('span', { className: 'shinon-state__dot' }), 'laeuft (nicht erwartet)')),
              h('td', null, h('code', null, map.get(id)?.panel ?? 'ohne Panel')))))));
    }

    function DashboardPanel() {
      const { map } = useRegistry();
      const { pet } = usePet();
      const surfaces = useSurfaces();
      return h('div', { className: 'shinon-dashboard' },
        h('h2', null, 'Shinon Forge'),
        h('p', { className: 'shinon-dashboard__sub' }, 'Sichtbarkeit, Erfahrung und Zustand — was laeuft, steht hier.'),
        h('div', { className: 'shinon-dashboard__cards' },
          h(Card, { label: 'Angemeldet', value: `${map.size} / ${EXPECTED.filter((entry) => entry.active).length}` }),
          h(Card, { label: 'Codemon', value: pet === null ? '—' : `${pet.species} · L${pet.level}` }),
          h(Card, { label: 'Siege', value: pet === null ? '—' : String(pet.wins) }),
          h(Card, { label: 'Workspaces', value: surfaces.hasWorkspaces ? String(surfaces.items.length) : '—' }),
          h(Card, { label: 'Sitzungen', value: surfaces.hasSessions ? String(Object.keys(surfaces.byId).length) : '—' })),
        h(ExpSection),
        h(WorkspaceSection),
        h(PluginSection));
    }

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
            try {
              return typeof ctx.get === 'function' ? ctx.get(name) : ctx[name];
            } catch {
              return undefined;
            }
          };
          return { workspaces: read(WORKSPACE_SERVICE), sessions: read(SESSION_SERVICE) };
        };

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

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, DashboardPanel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          label: () => t('menu.dashboard')
        }, DashboardIcon));
      }
    };
  }
});
