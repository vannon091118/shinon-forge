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
      // DREI Einträge, wörtlich das gemessene Muster der DSH-eigenen
      // Plan-Chip-Oberflaeche (`dsh-client-ui-plan`, `const inject = ["slots",
      // "remote", "remote.commands"]`): `remote` trägt den Zugriff auf das
      // Namespace-Objekt, `remote.commands` ist der getracete Kind-Dienst, den
      // Cordis beim `.commands.execute` prüft. Einer ohne den anderen wirft
      // `cannot get property "remote.commands" without inject` — genau der
      // Fehler im Lauf 2026-10-23.
      inject: ['slots', 'remote', 'remote.commands'],
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
          name: 'main', key: 'shinon-prompter',
          id: 'shinon-prompter',
        }, TracePanel));

        // DER VEREDLEN-KNOPF (2026-10-23): direkt vor der Senden-Aktion. Der
        // Slot `conversation.input.right` ist der gemessene Platz dafuer
        // (Slots-Vertrag von dsh-client-ui-conversation, „compact controls
        // before the composer submit action"). Die Komponente bekommt ihre
        // Sitzung ueber die registrant-eigene `inject(sessionId)`-Form —
        // dasselbe Muster wie die DSH-eigene Plan-Chip-Oberflaeche —, und die
        // Dienste laezt sie zum Aufrufzeitpunkt los (`ctx.get`), damit keine
        // Verbindung beim Mounten entsteht.
        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          key: 'shinon-prompter-enhance',
          id: 'shinon-prompter-enhance',
          inject: (sessionId) => ({
            sessionId,
            remote: ctx.remote ?? (typeof ctx.get === 'function' ? ctx.get('remote') : undefined),
            conversation: typeof ctx.get === 'function' ? ctx.get('conversation') : undefined,
          }),
        }, EnhanceControl));

        // Kein `sidebar.panellist`-Eintrag mehr (2026-10-22): die Leiste war mit
        // acht Panel-Knöpfen überladen, die Workspaces fielen heraus. Die Zahl
        // steht als Widget in `@shinon/widget-dock`.

        ctx.effect?.(() => () => {
          try { source?.close(); } catch { /* schon zu */ }
        });
      },
    };
