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
      { id: '@shinon/better-errors', label: 'Better Errors', active: true },
      { id: '@shinon/token-usage', label: 'Token Usage', active: true },
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
      return h('div', { className: 'shinon-dashboard' },
        h('h2', null, 'Shinon Forge'),
        h('p', { className: 'shinon-dashboard__sub' }, 'Sichtbarkeit, Erfahrung und Zustand — was laeuft, steht hier.'),
        h('div', { className: 'shinon-dashboard__cards' },
          h(Card, { label: 'Angemeldet', value: `${map.size} / ${EXPECTED.filter((entry) => entry.active).length}` }),
          h(Card, { label: 'Codemon', value: pet === null ? '—' : `${pet.species} · L${pet.level}` }),
          h(Card, { label: 'Siege', value: pet === null ? '—' : String(pet.wins) })),
        h(ExpSection),
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

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, DashboardPanel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          label: () => 'Shinon Dashboard'
        }, DashboardIcon));
      }
    };
  }
});
