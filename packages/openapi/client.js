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
      apply() {}
    };
  }
});
