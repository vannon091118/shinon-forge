/**
 * shinon-token-usage - Token-Anzeige (Client-Hälfte)
 *
 * 'sidebar.footer.action' ist eine list und verlangt daher options.id.
 */
window.__ModuleLoader__.load({
  id: '@shinon/token-usage',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/token-usage';

    function insertStyles(tag, css) {
      if (document.querySelector(`style[data-plugin-css="${tag}"]`) !== null) return;
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = tag;
      style.textContent = css;
      document.head.appendChild(style);
    }

    insertStyles(`${PLUGIN}/token.css`, `
      .dsh-token-display {
        transition: all 0.2s ease;
      }
    `);

    /** Die Sidebar übergibt "wide"; in der schmalen Leiste bricht der Text sonst um. */
    function TokenDisplay({ wide }) {
      const style = {
        fontSize: '12px',
        color: 'var(--dsw-alias-label-secondary)',
        borderBottom: '1px solid var(--dsw-alias-border-l1)'
      };
      if (wide !== true) {
        return h('div', {
          className: 'dsh-token-display',
          title: 'Token: --',
          'aria-label': 'Token: --',
          style: { ...style, padding: '8px', textAlign: 'center' }
        }, '📊');
      }
      return h('div', { className: 'dsh-token-display', style: { ...style, padding: '8px 12px' } }, '📊 Token: --');
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/token-usage', { label: 'Token Usage', kind: 'client', panel: 'shinon-token-usage' });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/token-usage' } }));

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'shinon-token-usage',
          order: 100
        }, TokenDisplay));
      }
    };
  }
});
