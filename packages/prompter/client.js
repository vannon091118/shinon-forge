/**
 * @shinon/prompter — Client-Hälfte: Trace-Panel.
 *
 * Zeigt die letzten Prompter-Entscheidungen (Outcome, Modus, Gründe, Kontextquelle).
 * Host→Client läuft über den Kanal, nicht über das Fenster: der Host emittiert
 * jeden Datensatz auf `DECISION_CHANNEL`, und diese Hälfte spiegelt ihn nach
 * `window.__shinonPrompterTrace` (Fenster-Konvention, wie `window.__codingmon`
 * bei @shinon/codingmon). Der Host schreibt NUR im In-Prozess-Fall selbst ins
 * Fenster — in Produktion (Host in Node, Panel im Browser) käme sein `window`
 * nie auf der Seite an, und das Panel bliebe ewig leer (gemessen 2026-10-17:
 * `verworfen (NO_JSON)` im Terminal, „Keine Entscheidungen" im Panel).
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
    /** Die Live-Route des Hosts — gleiche Herkunft, also mit Cookie/Session. */
    const TRACE_ENDPOINT = '/shinon/prompter/trace';
    /** Das Fenster-Ereignis, auf das das Panel hört (Host-Global oder SSE). */
    const TRACE_EVENT = 'shinon:prompter-trace';

    /** Ein Datensatz in der Form, die `TracePanel` liest — ein Schreiber mehr, keine zweite Form. */
    const traceEntry = (record) => ({
      outcome: record?.outcome ?? 'unbekannt',
      mode: record?.mode ?? null,
      intent: record?.intent ?? 'UNDEFINED',
      reasons: Array.isArray(record?.reasons) ? record.reasons.slice(0, 5) : [],
      context_source: record?.context_source ?? null,
      // Die Provenienz-Leiter als Zensus: wie viele Belege welcher Klasse und
      // wie viele Luecken. Der VOLLE Datensatz reist auf dem Entscheidungs-Kanal;
      // hier steht nur, was das Panel in einer Zeile zeigen kann. Der Zensus
      // akzeptiert beide Formen (Array aus dem Kanal, Zahl aus dem Fenster).
      provenance: record?.provenance && typeof record.provenance === 'object'
        ? {
            contract: typeof record.provenance.contract === 'string' ? record.provenance.contract : '',
            entries: Array.isArray(record.provenance.entries)
              ? record.provenance.entries.length
              : Number.isInteger(record.provenance.entries) ? record.provenance.entries : 0,
            violations: Array.isArray(record.provenance.violations)
              ? record.provenance.violations.length
              : Number.isInteger(record.provenance.violations) ? record.provenance.violations : 0,
            complete: record.provenance.complete === true,
          }
        : null,
      // Der Aufgabenbrief als Adresse: welches Paket die Frage besitzt und wie
      // lang der Block war. Der Text selbst reist nicht ins Fenster — er steht
      // im Prompt, und ein Blocktext im Panel waere eine zweite Kopie.
      brief: record?.brief && typeof record.brief === 'object'
        ? {
            id: typeof record.brief.id === 'string' ? record.brief.id : '',
            owner: typeof record.brief.owner === 'string' ? record.brief.owner : '',
            chars: Number.isInteger(record.brief.chars) ? record.brief.chars : 0,
          }
        : null,
      brief_reason: typeof record?.brief_reason === 'string' ? record.brief_reason : null,
      // Die Abbruchquote: der Host rechnet sie `abort-core.js`, der Client zeigt
      // nur die vier Zahlen und das Label. Kein Grund wird hier genannt — ein
      // neuer Grund ist ein Dateneintrag im Prompter, keine Client-Änderung.
      abort_quote: record?.abort_quote && typeof record.abort_quote === 'object'
        ? {
            turns: Number.isInteger(record.abort_quote.turns) ? record.abort_quote.turns : 0,
            aborts: Number.isInteger(record.abort_quote.aborts) ? record.abort_quote.aborts : 0,
            quote: Number.isFinite(record.abort_quote.quote) ? record.abort_quote.quote : 0,
            top: typeof record.abort_quote.top === 'string' ? record.abort_quote.top : null,
            topLabel: typeof record.abort_quote.topLabel === 'string' ? record.abort_quote.topLabel : null,
          }
        : null,
      // Prosa-Rettung sichtbar machen: Grund, Zeichenzahl und der wievielte
      // Fall dieser Sitzung — sonst sieht ein geretteter Prosafall wie eine
      // normale Veredelung aus, und „zu oft" bleibt eine Vermutung.
      salvage: record?.salvage && typeof record.salvage === 'object'
        ? {
            reason: typeof record.salvage.reason === 'string' ? record.salvage.reason : '?',
            chars: Number.isInteger(record.salvage.chars) ? record.salvage.chars : 0,
            count: Number.isInteger(record.salvage.count) ? record.salvage.count : 0,
          }
        : null,
      raw_prompt: typeof record?.raw_prompt === 'string' ? record.raw_prompt : null,
      at: typeof record?.at === 'number' ? record.at : null,
    });

    /** Puffer schreiben und die Anzeige wecken; ohne Fenster ist das ein No-op. */
    const publish = (list) => {
      try {
        window.__shinonPrompterTrace = list.slice(0, 20);
        window.dispatchEvent(new CustomEvent(TRACE_EVENT));
      } catch { /* die Anzeige ist Nebensache; sie darf das Panel nicht brechen */ }
    };

    const mirrorRecord = (record) => {
      const list = Array.isArray(window.__shinonPrompterTrace) ? window.__shinonPrompterTrace : [];
      publish([traceEntry(record), ...list]);
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
      .__pt_entry.rejected { border-left-color: var(--dsw-alias-label-danger, #ef4444); }
      .__pt_entry.unavailable { border-left-color: var(--dsw-alias-label-warning, #f59e0b); }
      .__pt_row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .__pt_badge {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
        background: transparent;
        border: 1px solid currentColor;
        color: var(--dsw-alias-brand-primary, currentColor);
      }
      .__pt_badge.rejected {
        background: var(--dsw-alias-label-danger, #ef4444);
        border-color: transparent;
        color: var(--dsw-alias-label-inverse, #fff);
      }
      .__pt_badge.unavailable {
        background: var(--dsw-alias-label-warning, #f59e0b);
        border-color: transparent;
        color: #1a1a1a;
      }
      .__pt_badge.intent { background: transparent; border: 1px solid currentColor; color: inherit; }
      .__pt_list { max-height: 300px; overflow-y: auto; display: grid; gap: 4px; margin-top: 6px; padding-right: 2px; }
      .__pt_entry { border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12)); border-radius: 6px; padding: 4px 6px; }
      .__pt_entry > summary { cursor: pointer; list-style: none; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
      .__pt_entry > summary::-webkit-details-marker { display: none; }
      .__pt_body { margin-top: 5px; display: grid; gap: 3px; font-size: 11px; }
      .__pt_facts { display: inline-flex; flex-wrap: wrap; gap: 6px; opacity: .75; font-size: 11px; }
      .__pt_more { font-size: 11px; opacity: .6; margin-top: 4px; }
      .__pt_reason { opacity: 0.7; font-size: 11px; }
      .__pt_raw {
        margin-top: 4px;
        padding-left: 6px;
        border-left: 1px dashed currentColor;
        opacity: 0.8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `);

    function traceBadge(outcome) {
      const cls = outcome === 'accepted' ? '' : outcome;
      return h('span', { className: `__pt_badge ${cls}`.trim() }, String(outcome).toUpperCase());
    }

    /**
     * Das Trace-Panel: die letzten Entscheidungen als aufklappbare Zeilen — die
     * Zusammenfassung nennt Ergebnis, Intent und Belege, alles Weitere steht im
     * aufgeklappten Teil. Die Liste scrollt, statt das Panel zu fuellen.
     */
    function TracePanel() {
      // Der Puffer ist die Quelle; `useState` macht aus dem Schreiben ein Rendern.
      const [trace, setTrace] = React.useState(() => (Array.isArray(window.__shinonPrompterTrace) ? window.__shinonPrompterTrace : []));
      React.useEffect(() => {
        const refresh = () => setTrace(Array.isArray(window.__shinonPrompterTrace) ? [...window.__shinonPrompterTrace] : []);
        // Das Abo traegt den Live-Fall; das Intervall ist der Fallback, falls die
        // Seite den Puffer auf einem anderen Weg bekommt (Host-Global ohne SSE).
        const timer = setInterval(refresh, 2000);
        window.addEventListener(TRACE_EVENT, refresh);
        refresh();
        return () => { clearInterval(timer); window.removeEventListener(TRACE_EVENT, refresh); };
      }, []);
      if (trace.length === 0) {
        return h('div', { className: `__pt_panel`, 'data-plugin': PLUGIN },
          h('div', { className: '__pt_title' }, 'Prompter-Trace'),
          h('div', { className: '__pt_empty' }, 'Noch kein Turn beobachtet.'));
      }
      const shown = trace.slice(0, 10);
      const facts = (entry) => [
        h('span', { key: 'mode' }, `Modus ${entry.mode ?? '—'}`),
        h('span', { key: 'ctx' }, `Kontext: ${entry.context_source ?? 'keiner'}`),
        entry.provenance ? h('span', { key: 'prov', title: `${entry.provenance.contract ? `${entry.provenance.contract} · ` : ''}${entry.provenance.violations} Verletzung(en)${entry.provenance.complete ? '' : ' · unvollständig'}` }, `${entry.provenance.entries} Belege`) : null,
      ].filter((part) => part !== null);
      return h('div', { className: `__pt_panel`, 'data-plugin': PLUGIN },
        h('div', { className: '__pt_title' }, `Prompter-Trace · ${trace.length}`),
        trace.length > shown.length ? h('div', { className: '__pt_more' }, `letzte ${shown.length} Entscheidungen — ältere bleiben im Puffer`) : null,
        h('div', { className: '__pt_list' }, shown.map((entry, i) => h('details', {
          key: i,
          className: `__pt_entry ${entry.outcome === 'accepted' ? '' : entry.outcome}`.trim(),
        },
          h('summary', { className: '__pt_row' },
            traceBadge(entry.outcome),
            h('span', { className: '__pt_badge intent' }, entry.intent ?? 'UNDEFINED'),
            h('span', { className: '__pt_facts' }, facts(entry))),
          h('div', { className: '__pt_body' },
            entry.reasons?.length > 0 ? h('div', { className: '__pt_reason' }, `Begründung: ${entry.reasons.join(', ')}`) : null,
            i === 0 && entry.abort_quote && entry.abort_quote.turns > 0 ? h('div', { className: '__pt_reason' }, `Abbrüche: ${entry.abort_quote.aborts} von ${entry.abort_quote.turns} · häufigster Grund: ${entry.abort_quote.topLabel ?? '—'}`) : null,
            entry.brief
              ? h('div', { className: '__pt_reason' }, `Brief: @shinon/${entry.brief.owner} · ${entry.brief.chars} Zeichen`)
              : null,
            entry.salvage
              ? h('div', { className: '__pt_reason' }, `Prosa: ${entry.salvage.reason} · ${entry.salvage.chars} Zeichen · ${entry.salvage.count}. Fall dieser Sitzung`)
              : null,
            entry.raw_prompt
              ? h('div', { className: '__pt_raw', title: entry.raw_prompt }, entry.raw_prompt)
              : null)))));
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Sichtbarkeit: in die gemeinsame Liste von @shinon/dashboard melden (Konvention, kein Import).
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/prompter', { label: 'Prompter', kind: 'client', panel: 'shinon-prompter' });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/prompter' } }));

        // Der Live-Kanal: der Host hält die Verbindung offen und schickt bei jeder
        // Entscheidung den ganzen Puffer. Ein Fehler ist kein Ausfall — das Global
        // aus `index-inject` trägt den Stand beim Laden der Seite.
        let source = null;
        try {
          if (typeof EventSource === 'function') {
            source = new EventSource(TRACE_ENDPOINT);
            source.onmessage = (event) => {
              try {
                const list = JSON.parse(event.data);
                if (Array.isArray(list)) publish(list.map(traceEntry));
              } catch { /* eine kaputte Zeile überspringt das Panel, nicht der Kanal */ }
            };
          }
        } catch { /* ohne EventSource bleibt der geladene Stand */ }

        // In-Prozess-Fall: der Host emittiert auf dem Entscheidungs-Kanal.
        if (typeof ctx?.on === 'function') {
          ctx.on(DECISION_CHANNEL, (record) => {
            mirrorRecord(record);
          });
        }

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          id: 'shinon-prompter',
        }, TracePanel));

        // Kein `sidebar.panellist`-Eintrag mehr (2026-10-22): die Leiste war mit
        // acht Panel-Knöpfen überladen, die Workspaces fielen heraus. Die Zahl
        // steht als Widget in `@shinon/widget-dock`.

        ctx.effect?.(() => () => {
          try { source?.close(); } catch { /* schon zu */ }
        });
      },
    };
  },
});
