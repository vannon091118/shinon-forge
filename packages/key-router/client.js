/**
 * @shinon/key-router — Client-Hälfte: SICHTBARKEIT (kein Panel).
 *
 * WAS HIER VORHER STAND war eine Fassade: ein `<style>`-Block mit Regeln für
 * `.key-router-status`, `.key-router-dot.active`, `.cooling`, `.exhausted` — und
 * keine einzige Stelle, die eines dieser Elemente gerendert hätte. Eine
 * Oberfläche, die Klassen definiert, die niemand benutzt, ist von einer kaputten
 * nicht zu unterscheiden. Ersetzt durch das, was wirklich da ist.
 *
 * WARUM ES KEIN PANEL GIBT (gemessen, nicht bequem): der Zustand des Pools lebt
 * in der HOST-Hälfte. Ein Out-of-Tree-Bundle kann keinen Host-Endpunkt
 * registrieren — die Remote-Beiträge der Browser-Hälfte kommen aus einer
 * kompilierten Liste in `@deepseek-ai/dsh-api-remotes`, und die Connection-Naht
 * ist reines Anfrage/Antwort ohne Abo. `@shinon/popup` löst dasselbe Problem,
 * indem es die SITZUNG liest; einen Pool gibt es dort nicht. Der Status ist
 * deshalb ein Werkzeug des Hosts (`key_router_status`) — und ein Panel, das diese
 * Zahl nur behaupten könnte, wird nicht gebaut.
 *
 * Was bleibt: ein Eintrag in `__shinonPluginCatalog` und eine Zeile in der
 * Sidebar-Liste. Beide behaupten nichts über eine Oberfläche, die es nicht gibt.
 */
window.__ModuleLoader__.load({
  id: '@shinon/key-router',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/key-router';


    const LABEL = 'Key-Router';
    const ROLE = 'Schluessel-Pool des Hosts (Werkzeuge: status, rotate, probe)';

    function announce(detail) {
      const table = window.__shinonPluginCatalog ?? (window.__shinonPluginCatalog = {});
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

    return {
      apply(ctx) {
        // KEIN Sidebar-Eintrag mehr: er war ein Knopf ohne Ziel. Diese Hälfte
        // meldete sich in der Sidebar an, ohne einen `main`-Slot zu besetzen —
        // ein Klick öffnete nichts, und der Nutzer sah einen Knopf, der wie ein
        // Panel aussah. Der Pool-Zustand liegt im Host (`key_router_status`,
        // `key_router_rotate`, `key_router_probe`); die Plugin-Übersicht führt
        // das Paket weiterhin über `announce`, ohne eine Oberfläche zu behaupten.
        announce(
          'Sichtbarkeit ohne Panel: der Pool-Zustand liegt im Host (key_router_status, '
          + 'key_router_rotate, key_router_probe) — ein Panel hier könnte ihn nur behaupten.'
        );

        console.log('[shinon-key-router] Client aktiv (Sichtbarkeit, ohne Panel)');
      },
    };
  },
});
