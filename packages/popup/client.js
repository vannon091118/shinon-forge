/**
 * @shinon/popup — Client-Hälfte (ohne Overlay).
 *
 * Der Host emittiert die Trajectory-Einträge auf `shinon/trajectory`
 * (siehe index.js). Dieser Client rendert sie NICHT.
 *
 * Was hier vorher stand, war eine Fassade: ein Panel, das den festen Text
 * „Trajectory · process-step" malte, und ein `ctx.get('shinon-popup/config')`
 * auf einen Dienst, den niemand anbietet — der Fallback daneben wiederholte die
 * Paket- und Profilwerte ein zweites Mal. Ein Client, der so tut als
 * rendere er etwas, ist von einem kaputten nicht zu unterscheiden; beides ist
 * entfernt.
 *
 * Was bleibt, ist die SICHTBARKEIT: ein Sidebar-Eintrag und ein Eintrag in
 * `window.__shinon_plugins`, damit ein laufendes Plugin nicht unsichtbar ist.
 * Beides behauptet nichts über eine Oberfläche, die es nicht gibt — der Eintrag
 * sagt ausdrücklich, dass dieser Client nichts rendert.
 *
 * Das Paket ist deshalb im Gate als bewusst inaktiv geführt
 * (`scripts/gate/plugins/dead-package.mjs`, KNOWN_INACTIVE): ein echtes Overlay
 * braucht eine Entscheidung — Slot, Felder, Anzahl der Einträge — und ist keine
 * Refactor-Arbeit.
 */
window.__ModuleLoader__.load({
  id: '@shinon/popup',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/popup';
    const PANEL_ID = 'shinon-popup';

    /** Sichtbarkeit (Schritt 1): meldet dieses Bundle bei der System-Uebersicht an. */
    const LABEL = 'Shinon Popup';
    const ROLE = 'Trajectory-Kanal (montiert, ohne eigene Oberflaeche)';

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

    return {
      inject: ['slots'],
      apply(ctx) {
        announce(
          'kein Overlay: der Host emittiert Trajectory-Eintraege auf shinon/trajectory, '
          + 'dieser Client rendert sie nicht — sichtbar ist nur diese Zeile.'
        );

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 70,
          label: () => LABEL
        }, PopupIcon));
      },
    };
  },
});
