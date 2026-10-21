/**
 * @shinon/widget-dock — Client-Hälfte: ein Streifen statt acht Knöpfe.
 *
 * WAS HIER STEHT: drei kompakte Zeilen (Persona-Prüfstand, Prompter-Trace,
 * gemeldete Plugins) mit einer Zahl und einem Tooltip. Kein eigener Zustand,
 * kein Schreibweg — gelesen werden die registrierten Globals der anderen
 * Hälften, die im Kanon stehen (`__shinonPersonaReview`, `__shinonPrompterTrace`,
 * `__shinonPlugins`). Fehlt ein Global, sagt die Zeile das statt zu schweigen.
 *
 * WARUM ES DIESES PAKET GIBT: acht Panel-Knöpfe drückten die Workspace-Liste aus
 * der Leiste (gemessen 2026-10-22). Die Panels bleiben erreichbar; die leisen
 * Anzeigen sind jetzt Widgets.
 */
window.__ModuleLoader__.load({
  id: '@shinon/widget-dock',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/widget-dock';
    const PANEL_ID = 'shinon-widget-dock';
    /** Die Globals, die dieses Dock liest — alle im Kanon registriert. */
    const REVIEW_GLOBAL = '__shinonPersonaReview';
    const TRACE_GLOBAL = '__shinonPrompterTrace';
    const REGISTRY_GLOBAL = '__shinonPlugins';

    const style = document.createElement('style');
    style.dataset.plugin = PLUGIN;
    style.dataset.pluginCss = `${PLUGIN}/widget-dock.css`;
    style.textContent = `
      .shinon-widgets { display: grid; gap: 4px; padding: 6px 8px; font: 11px/1.45 ui-sans-serif, system-ui, sans-serif; }
      .shinon-widgets__head { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--dsw-alias-label-secondary, rgba(255,255,255,.55)); }
      .shinon-widgets__row { display: flex; align-items: baseline; gap: 8px; justify-content: space-between; }
      .shinon-widgets__k { color: var(--dsw-alias-label-secondary, rgba(255,255,255,.6)); }
      .shinon-widgets__v { font: 11px/1.45 ui-monospace, monospace; }
      .shinon-widgets__v[data-state="leer"] { color: #f59e0b; }
    `;
    document.head.appendChild(style);

    /** Eine Zeile: Name, Wert, Tooltip — und bei fehlender Quelle ein Grund. */
    function row(key, label, value, title, state = 'ok') {
      return h('div', { className: 'shinon-widgets__row', key, title },
        h('span', { className: 'shinon-widgets__k' }, label),
        h('span', { className: 'shinon-widgets__v', 'data-state': state }, value));
    }

    /** Persona-Prüfstand: offene gegen entschiedene Vorschläge. */
    function personaRow() {
      const doc = window[REVIEW_GLOBAL];
      if (doc === undefined || doc === null || doc.contract !== 'shinon.persona-review/v1') {
        return row('persona', 'Auflagen', '—', 'Kein Prüf-Stand gemeldet (Host nicht erreichbar?)', 'leer');
      }
      const proposals = Array.isArray(doc.proposals) ? doc.proposals : [];
      const open = proposals.filter((proposal) => proposal.status === 'proposed').length;
      const decided = proposals.length - open;
      const commitments = Array.isArray(doc.commitments) ? doc.commitments.length : 0;
      return row('persona', 'Auflagen', `${open} offen`, `${commitments} Auflage(n), ${decided} entschieden`);
    }

    /** Prompter-Trace: wie viele Läufe, mit welchem letzten Ausgang. */
    function prompterRow() {
      const trace = window[TRACE_GLOBAL];
      if (!Array.isArray(trace) || trace.length === 0) {
        return row('prompter', 'Prompter', '—', 'Noch kein Turn beobachtet', 'leer');
      }
      const last = trace[0]?.outcome ?? 'unbekannt';
      return row('prompter', 'Prompter', `${trace.length} · ${last}`, `${trace.length} beobachtete Läufe, zuletzt ${last}`);
    }

    /** Sichtbarkeit: wie viele Client-Hälften sich gemeldet haben. */
    function pluginsRow() {
      const map = window[REGISTRY_GLOBAL];
      if (!(map instanceof Map) || map.size === 0) {
        return row('plugins', 'Plugins', '—', 'Keine Anmeldung im Plugin-Register', 'leer');
      }
      const names = [...map.keys()].map((id) => id.replace('@shinon/', ''));
      return row('plugins', 'Plugins', String(map.size), names.join(', '));
    }

    function WidgetDock() {
      const [, bump] = React.useState(0);
      React.useEffect(() => {
        const onChange = () => bump((value) => value + 1);
        window.addEventListener('shinon:plugin', onChange);
        return () => window.removeEventListener('shinon:plugin', onChange);
      }, []);
      return h('div', { className: 'shinon-widgets' },
        h('span', { className: 'shinon-widgets__head' }, 'Shinon'),
        personaRow(), prompterRow(), pluginsRow());
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set(PLUGIN, { label: 'Shinon', kind: 'client', panel: PANEL_ID });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 10,
          label: () => 'Shinon',
        }, WidgetDock));
      },
    };
  },
});
