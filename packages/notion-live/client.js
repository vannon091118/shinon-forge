/**
 * @shinon/notion-live — DSH client-side status panel.
 *
 * This is a truthful status display, not a fake OAuth screen. The actual Notion
 * connection and bench coordinator will be implemented behind a stable gateway.
 */
window.__ModuleLoader__.load({
  id: '@shinon/notion-live',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/notion-live';
    const PANEL_ID = 'shinon-notion-live';
    const STATUS_CHANNEL = 'shinon/notion-live/status';
    const REQUEST_STATUS_CHANNEL = 'shinon/notion-live/request-status';

    function insertStyles() {
      if (document.querySelector('style[data-plugin-css="shinon-notion-live"]')) return;
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = 'shinon-notion-live';
      style.textContent = [
        '.snl-panel{display:flex;flex-direction:column;gap:12px;height:100%;padding:14px;overflow:auto;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
        '.snl-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:12px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
        '.snl-title{font-size:13px;font-weight:750;letter-spacing:.04em}',
        '.snl-muted{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
        '.snl-card{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:12px;display:flex;flex-direction:column;gap:8px}',
        '.snl-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px}',
        '.snl-value{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}',
        '.snl-pill{display:inline-flex;border-radius:99px;border:1px solid var(--dsw-alias-border-l1);padding:2px 7px;font-size:10px;color:var(--dsw-alias-label-secondary)}',
        '.snl-note{font-size:12px;line-height:1.55;padding:10px;border-left:3px solid #e4a64b;background:var(--dsw-alias-bg-layer-1);border-radius:4px}',
        '.snl-btn{cursor:pointer;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:7px;padding:8px 10px;font-size:12px}',
        '.snl-list{margin:0;padding-left:18px;font-size:11px;line-height:1.7;color:var(--dsw-alias-label-secondary)}'
      ].join('\n');
      document.head.appendChild(style);
    }

    function statusLabel(status) {
      if (!status) return 'Warte auf Host-Status';
      if (status.state === 'disabled') return 'Deaktiviert';
      if (status.state === 'relay_missing') return 'Relay fehlt';
      if (status.state === 'scaffold_only') return 'Gerüst / nicht verbunden';
      if (status.state === 'stopped') return 'Entladen';
      return status.state || 'Unbekannt';
    }

    function NotionLiveIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
        h('rect', { x: 1.5, y: 1.5, width: 13, height: 13, rx: 3, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', { d: 'M4.2 4.3h1.7l4 5.1V4.3h1.7v7.4h-1.7l-4-5.1v5.1H4.2z', fill: 'currentColor' })
      );
    }

    function apply(ctx) {
      insertStyles();
      const registry = (window.__shinonPlugins ??= new Map());
      registry.set(PLUGIN, { label: 'Notion Live', kind: 'client', panel: PANEL_ID });
      window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));

      function NotionLivePanel() {
        const [status, setStatus] = React.useState(null);
        React.useEffect(() => {
          const dispose = typeof ctx?.on === 'function'
            ? ctx.on(STATUS_CHANNEL, (value) => setStatus(value ?? null))
            : null;
          if (typeof ctx?.emit === 'function') ctx.emit(REQUEST_STATUS_CHANNEL, {});
          return () => { if (typeof dispose === 'function') dispose(); };
        }, []);

        const requestStatus = () => {
          if (typeof ctx?.emit === 'function') ctx.emit(REQUEST_STATUS_CHANNEL, {});
        };

        return h('div', { className: 'snl-panel' },
          h('div', { className: 'snl-head' },
            h('div', null,
              h('div', { className: 'snl-title' }, 'NOTION LIVE'),
              h('div', { className: 'snl-muted' }, 'Shinon Forge · Kontrollzentrum')
            ),
            h('span', { className: 'snl-pill' }, statusLabel(status))
          ),
          h('div', { className: 'snl-card' },
            h('div', { className: 'snl-row' }, h('span', null, 'Notion OAuth'), h('span', { className: 'snl-value' }, status?.notionOAuthConnected ? 'verbunden' : 'nicht verbunden')),
            h('div', { className: 'snl-row' }, h('span', null, 'Dashboard-Sync'), h('span', { className: 'snl-value' }, status?.syncRunning ? 'aktiv' : 'inaktiv')),
            h('div', { className: 'snl-row' }, h('span', null, 'Bench-Koordinator'), h('span', { className: 'snl-value' }, status?.benchCoordinatorConnected ? 'verbunden' : 'nicht verbunden')),
            h('div', { className: 'snl-row' }, h('span', null, 'Agenten-Ausführung'), h('span', { className: 'snl-value' }, status?.agentExecutionEnabled ? 'aktiv' : 'nicht freigegeben'))
          ),
          h('div', { className: 'snl-note' }, status?.note || 'Noch kein Host-Status empfangen. Status erneut abfragen.'),
          h('div', { className: 'snl-card' },
            h('div', { className: 'snl-title' }, 'Geplante Architektur'),
            h('ul', { className: 'snl-list' },
              h('li', null, 'Notion Free: Verbindung über öffentliche OAuth-Integration'),
              h('li', null, 'Notion zeigt Status; lokaler Bench-Koordinator hält die Locks'),
              h('li', null, 'Gemeinsamer Worktree: Schreibzugriffe werden serialisiert'),
              h('li', null, 'Secrets bleiben außerhalb von Notion und Git')
            )
          ),
          h('div', { className: 'snl-muted' }, status?.checkedAt ? 'Konfigurationsstatus geprüft: ' + status.checkedAt : 'Kein Live-Heartbeat.'),
          h('button', { type: 'button', className: 'snl-btn', onClick: requestStatus }, 'Status neu abfragen'),
          h('div', { className: 'snl-muted' }, 'Experimentelles Gerüst: OAuth, API-Sync, Relay und Locks sind noch nicht implementiert.')
        );
      }

      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, NotionLivePanel));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 35,
        label: () => 'Notion Live',
      }, NotionLiveIcon));

      return () => {
        registry.delete(PLUGIN);
      };
    }

    return { inject: [], apply };
  }
});
