/**
 * @shinon/prompter — Client-Hälfte: Trace-Panel.
 *
 * Zeigt die letzten Prompter-Entscheidungen (Outcome, Modus, Gründe, Kontextquelle).
 * Host→Client läuft über den Kanal, nicht über das Fenster: der Host emittiert
 * jeden Datensatz auf `DECISION_CHANNEL`, und diese Hälfte spiegelt ihn nach
 * `window.__shinonPrompterTrace` (Fenster-Konvention, wie `window.__codingmon`
 * bei @shinon/codingmon). Der Host schreibt NUR im In-Prozess-Fall selbst ins
 * → Kanon: docs/COMMENT-KANON.md#k-f618ee270fae
 */
window.__ModuleLoader__.load({
  id: '@shinon/prompter',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/prompter';
    /**
     * Der Kanal, auf dem der Host seine Entscheidungen meldet. Als Literal
     * dupliziert wie im Host (`packages/prompter/assets/mode-core.js`) —
     * bewusst: der Client lädt das Host-Modul nicht, und ein gemeinsamer
     * Import wäre eine Kopplung, die es sonst nirgends gibt (dieselbe Regel
     * wie bei @shinon/task-router). Gepinnt vom Gate gegen den Host-Export.
     */
    const DECISION_CHANNEL = 'shinon/prompter/decision';
    /** Die Form, die `TracePanel` unten liest — ein Schreiber mehr, keine zweite Form. */
    const mirrorRecord = (record) => {
      try {
        const list = Array.isArray(window.__shinonPrompterTrace) ? window.__shinonPrompterTrace : [];
        list.unshift({
          outcome: record?.outcome ?? 'unbekannt',
          mode: record?.mode ?? null,
          reasons: Array.isArray(record?.reasons) ? record.reasons.slice(0, 5) : [],
          context_source: record?.context_source ?? null,
          at: typeof record?.session_id === 'string' && record.session_id !== '' ? Date.now() : null,
        });
        window.__shinonPrompterTrace = list.slice(0, 20);
      } catch { /* die Anzeige ist Nebensache; sie darf das Panel nicht brechen */ }
    };

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
        // Die Spur vom Kanal auf die Seite holen: ohne dieses Abo sieht das
        // Panel nur, was der Host im In-Prozess-Fall selbst spiegelt — in
        // Produktion also nichts. `ctx.on` ist Cordis-Fläche (events), kein
        // Dienst, kein `inject` nötig (Präzedenz: @shinon/task-router).
        if (typeof ctx?.on === 'function') {
          ctx.on(DECISION_CHANNEL, (record) => {
            mirrorRecord(record);
          });
        }

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
