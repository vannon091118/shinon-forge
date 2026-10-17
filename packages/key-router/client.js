/**
 * @shinon/key-router — Client-Hälfte: SICHTBARKEIT (kein Panel).
 *
 * WAS HIER VORHER STAND war eine Fassade: ein `<style>`-Block mit Regeln für
 * `.key-router-status`, `.key-router-dot.active`, `.cooling`, `.exhausted` — und
 * keine einzige Stelle, die eines dieser Elemente gerendert hätte. Eine
 * Oberfläche, die Klassen definiert, die niemand benutzt, ist von einer kaputten
 * nicht zu unterscheiden. Ersetzt durch das, was wirklich da ist.
 * → Kanon: docs/COMMENT-KANON.md#k-d1e6b11e02d7
 */
window.__ModuleLoader__.load({
  id: '@shinon/key-router',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/key-router';
    const PANEL_ID = 'shinon-key-router';

    const LABEL = 'Key-Router';
    const ROLE = 'Schluessel-Pool des Hosts (Werkzeuge: status, rotate, probe)';

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

    function KeyIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
        h('circle', { cx: 5.5, cy: 8, r: 3, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { d: 'M8.5 8h6M12.5 8v2.5M14.5 8v2', stroke: 'currentColor', strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round' })
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Das Label dieses Eintrags ist bewusst ein fester deutscher Text und
        // keine Locale-Abfrage: der Eintrag ist eine interne Kennung der
        // Plugin-Übersicht, kein Endnutzer-Titel (dieselbe Entscheidung wie im
        // Wörterbuch von @shinon/locale-de vermerkt). Damit braucht diese Hälfte
        // keinen Locale-Dienst — und sie liest auch keinen.
        announce(
          'Sichtbarkeit ohne Panel: der Pool-Zustand liegt im Host (key_router_status, '
          + 'key_router_rotate, key_router_probe) — ein Panel hier könnte ihn nur behaupten.'
        );

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 75,
          label: () => LABEL
        }, KeyIcon));

        console.log('[shinon-key-router] Client aktiv (Sichtbarkeit, ohne Panel)');
      },
    };
  },
});
