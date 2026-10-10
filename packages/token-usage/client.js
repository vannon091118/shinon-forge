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

    // Fallback-Text aus der Registry (Besitzer: @shinon/locale-de); ohne
    // Locale-Dienst gilt der deutsche statische Wert. 't' wird in apply()
    // gebunden, weil erst dort ein ctx existiert; die Komponente liest pro
    // Rendern und folgt so dem aktiven Locale ohne Re-Registrierung.
    const TOKEN_DE = { 'token.fallback': 'Token: --' };
    let t = (key) => TOKEN_DE[key] ?? key;

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
          title: t('token.fallback'),
          'aria-label': t('token.fallback'),
          style: { ...style, padding: '8px', textAlign: 'center' }
        }, '📊');
      }
      return h('div', { className: 'dsh-token-display', style: { ...style, padding: '8px 12px' } }, '📊 ' + t('token.fallback'));
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/token-usage', { label: 'Token-Nutzung', kind: 'client', panel: 'shinon-token-usage' });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/token-usage' } }));

        // Gelesen wird `ctx.get?.('locale')`, NICHT `ctx.locale`: ein direkter
        // Dienst-Zugriff ist am Cordis-Proxy durch `inject` gesperrt und wirft
        // ('cannot get property "locale" without inject') — das kostete dieser
        // Hälfte die Aktivierung. Der Blick passiert bei jedem Rendern, damit die
        // Anzeige auch einem später geladenen Dienst folgt; fehlt er (oder fehlt
        // `get`, wie an den repo-eigenen Attrappen), gilt TOKEN_DE.
        t = (key) => {
          const locale = ctx.get?.('locale');
          const hit = typeof locale?.bind === 'function' ? locale.bind('shinon')(key) : undefined;
          return hit === undefined || hit === key ? (TOKEN_DE[key] ?? key) : hit;
        };

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'shinon-token-usage',
          order: 100
        }, TokenDisplay));
      }
    };
  }
});
