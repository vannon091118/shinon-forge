/**
 * shinon-tooltip - Tooltip-Styles (Client-Hälfte)
 *
 * Braucht keinen Service: einen 'styles'-Service gibt es im DSH-Client nicht,
 * Styles gehören als <style data-plugin-css> ins Dokument.
 */
window.__ModuleLoader__.load({
  id: '@shinon/tooltip',
  factory(require) {
    const PLUGIN = '@shinon/tooltip';

    if (document.querySelector(`style[data-plugin-css="${PLUGIN}/tooltip.css"]`) === null) {
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = `${PLUGIN}/tooltip.css`;
      style.textContent = `
        .dsh-tooltip {
          position: absolute;
          background: var(--dsw-alias-bg-layer-2);
          border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 12px;
          color: var(--dsw-alias-label-primary);
          pointer-events: none;
          z-index: 1000;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
      `;
      document.head.appendChild(style);
    }

    return {
      inject: [],
      apply() {
        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/tooltip', { label: 'Tooltip', kind: 'client', panel: null });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/tooltip' } }));
      }
    };
  }
});
