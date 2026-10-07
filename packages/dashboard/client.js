/**
 * shinon-dashboard - Dashboard UI (Client-Hälfte)
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

    function insertStyles(tag, css) {
      if (document.querySelector(`style[data-plugin-css="${tag}"]`) !== null) return;
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = tag;
      style.textContent = css;
      document.head.appendChild(style);
    }

    insertStyles(`${PLUGIN}/dashboard.css`, `
      .dsh-dashboard {
        background: var(--dsw-alias-bg-base);
      }
    `);

    function Card({ label, value }) {
      return h('div', { style: { background: 'var(--dsw-alias-bg-layer-1)', padding: '12px', borderRadius: '6px' } },
        h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, label),
        h('div', { style: { fontSize: '14px', fontWeight: '600', color: 'var(--dsw-alias-label-primary)' } }, value)
      );
    }

    function DashboardPanel() {
      return h('div', { style: { padding: '16px', height: '100%', overflow: 'auto' } },
        h('h2', { style: { margin: '0 0 16px 0', color: 'var(--dsw-alias-label-primary)' } }, '📊 Shinon Forge Dashboard'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' } },
          h(Card, { label: 'Status', value: '✅ Aktiv' }),
          h(Card, { label: 'Sprache', value: '🇩🇪 Deutsch' }),
          h(Card, { label: 'Plugins', value: '5 aktiv' })
        )
      );
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
