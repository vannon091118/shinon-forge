/**
 * @shinon/prompter — Client-Hälfte: Trace-Panel.
 *
 * Zeigt die letzten Prompter-Entscheidungen (Outcome, Modus, Gründe, Kontextquelle).
 * Host→Client über `window.__shinonPrompterTrace` (Fenster-Konvention, wie
 * `window.__codingmon` bei @shinon/codingmon). Das Host-Paket schreibt die
 * letzten Entscheidungen in dieses Fenster beim `DECISION_CHANNEL`-Emit.
 */
window.__ModuleLoader__.load({
  id: '@shinon/prompter',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/prompter';

    function insertStyles(tag, css) {
      if (document.querySelector(`style[data-plugin-css="${tag}"]`) !== null) return;
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = tag;
      style.textContent = css;
      document.head.appendChild(style);
    }

    insertStyles(`${PLUGIN}/trace.css`, `
      .__pt_panel {
        font-family: var(--dsw-alias-font-mono, monospace);
        font-size: 12px;
        padding: 8px;
        color: var(--dsw-alias-label-secondary);
      }
      .__pt_title {
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--dsw-alias-label-primary);
      }
      .__pt_empty {
        opacity: 0.5;
        padding: 8px 0;
      }
      .__pt_entry {
        margin-bottom: 8px;
        padding: 6px;
        border-left: 2px solid var(--dsw-alias-brand-primary);
      }
      .__pt_entry.denied { border-left-color: var(--dsw-alias-label-danger, #ef4444); }
      .__pt_entry.unavailable { border-left-color: var(--dsw-alias-label-warning, #f59e0b); }
      .__pt_row { display: flex; gap: 8px; flex-wrap: wrap; }
      .__pt_badge {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
        background: var(--dsw-alias-brand-primary);
        color: var(--dsw-alias-label-inverse, #fff);
      }
      .__pt_badge.denied { background: var(--dsw-alias-label-danger, #ef4444); }
      .__pt_badge.unavailable { background: var(--dsw-alias-label-warning, #f59e0b); }
      .__pt_reason { opacity: 0.7; font-size: 11px; }
    `);

    function traceBadge(outcome) {
      const cls = outcome === 'accepted' ? '' : outcome;
      return h('span', { className: `__pt_badge ${cls}`.trim() }, outcome.toUpperCase());
    }

    function TracePanel() {
      const trace = window.__shinonPrompterTrace ?? null;
      if (trace === null || trace.length === 0) {
        return h('div', { className: `__pt_panel`, 'data-plugin': PLUGIN },
          h('div', { className: '__pt_title' }, 'Prompter-Trace'),
          h('div', { className: '__pt_empty' }, 'Keine Entscheidungen — der Enhancer ist inaktiv oder hat noch keinen Schritt gesehen.'));
      }
      return h('div', { className: `__pt_panel`, 'data-plugin': PLUGIN },
        h('div', { className: '__pt_title' }, `Prompter-Trace (${trace.length})`),
        trace.slice(0, 10).map((entry, i) => h('div', {
          key: i,
          className: `__pt_entry ${entry.outcome === 'accepted' ? '' : entry.outcome}`.trim(),
        },
          h('div', { className: '__pt_row' },
            traceBadge(entry.outcome),
            h('span', null, `mode=${entry.mode}`),
            h('span', null, `ctx=${entry.context_source ?? 'none'}`)),
          entry.reasons?.length > 0
            ? h('div', { className: '__pt_reason' }, entry.reasons.join(', '))
            : null,
        )));
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Sichtbarkeit: in die gemeinsame Liste von @shinon/dashboard melden (Konvention, kein Import).
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/prompter', { label: 'Prompter', kind: 'client', panel: 'shinon-prompter' });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/prompter' } }));

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          id: 'shinon-prompter',
        }, TracePanel));

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'shinon-prompter',
          order: 30,
          label: () => 'Prompter',
        }, TracePanel));

        ctx.effect?.(() => () => { /* Cleanup: das Panel lebt, bis die Composition geräumt wird. */ });
      },
    };
  },
});
