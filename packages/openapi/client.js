/**
 * shinon-openapi - API-Status (Client-Hälfte, nicht im Profil aktiv)
 *
 * Gleiche Konventionen wie die aktiven Plugins: kein 'styles'-Service, keine
 * leeren Slot-Einträge.
 */
window.__ModuleLoader__.load({
  id: '@shinon/openapi',
  factory(require) {
    const PLUGIN = '@shinon/openapi';

    if (document.querySelector(`style[data-plugin-css="${PLUGIN}/openapi.css"]`) === null) {
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = `${PLUGIN}/openapi.css`;
      style.textContent = `
        .shinon-openapi-status {
          font-size: 12px;
        }
      `;
      document.head.appendChild(style);
    }

    return {
      inject: [],
      apply() {
        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/openapi', { label: 'OpenAPI', kind: 'client', panel: null });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/openapi' } }));
      }
    };
  }
});
