    function ReviewPanel() {
      // Bewusst der WERT, nicht die Funktion: React wuerde eine Funktion als
      // Lazy-Initialisierer nur EINMAL aufrufen — der Startstand ist aber schon
      // da und wird beim ersten Abruf ohnehin ersetzt.
      const [review, setReview] = React.useState(initialReview());
      // `busy` ist `{ id, decision }` oder null: nur der gedrückte Knopf wartet,
      // und ein zweiter Klick kann keine zweite Entscheidung auslösen.
      const [busy, setBusy] = React.useState(null);
      const [error, setError] = React.useState(null);
      // Der WERT, nicht die Funktion — React riefe sie als Lazy-Initialisierer nur EINMAL.
      const [relation, setRelation] = React.useState(initialRelation());
      const [relationBusy, setRelationBusy] = React.useState(null);
      // Ob die SSE-Verbindung steht. Ohne sie (alter Browser, Test) gilt der
      // Einzelabruf — aber nie ein Timer.
      const live = React.useRef(false);

      const refresh = async () => {
        try {
          const next = await fetchReview();
          if (next === null) {
            setError('Prüf-Naht liefert keinen Vertrag');
            return;
          }
          setReview(next);
          setError(null);
        } catch {
          setError('Prüf-Naht nicht erreichbar');
        }
      };

      React.useEffect(() => {
        // Die bestehende Zustands-Route schiebt den Prüf-Stand als eigenes
        // `review`-Ereignis, sobald sich etwas ändert. Damit erscheint ein neuer
        // Vorschlag sofort — ohne Abruf-Timer und ohne zweite Verbindung.
        if (typeof EventSource !== 'function') { refresh(); return undefined; }
        const source = new EventSource(STATE_ROUTE);
        source.addEventListener('review', (event) => {
          try {
            const next = JSON.parse(event.data);
            if (next !== null && typeof next === 'object' && next.contract === REVIEW_CONTRACT) {
              live.current = true;
              setReview(next);
              setError(null);
            }
          } catch { /* ein kaputtes Ereignis ersetzt keinen Stand */ }
        });
        return () => source.close();
      }, []);

      const chooseRelation = async (level) => {
        if (relation === null || relationBusy !== null || level === relation.current) return;
        setRelationBusy(level);
        const result = await postJson(RELATION_ROUTE, { level });
        setRelationBusy(null);
        setError(result.ok ? null : result.body?.error ?? 'Stufe nicht gesetzt');
        if (result.ok) setRelation({ ...relation, current: result.body?.level ?? level });
      };

      const decide = async (id, decision) => {
        if (busy !== null) return;
        setBusy({ id, decision });
        const result = await sendDecision(id, decision);
        setBusy(null);
        if (!result.ok) {
          setError(result.body?.error ?? 'Entscheidung nicht übernommen');
          return;
        }
        // Mit stehender SSE-Verbindung kommt der neue Stand geschoben; ohne sie
        // wird genau EINMAL nachgelesen.
        if (!live.current) await refresh();
      };

      if (review === null) {
        return h('div', { className: '__pn_panel', style: style.panel },
          h('div', { className: '__pn_title', style: style.title }, 'Auflagen'),
          h('div', { className: '__pn_empty', style: style.empty }, 'Auflagen werden geladen.'),
          error === null ? null : h('div', { className: '__pn_error', style: style.error }, error));
      }

      const proposals = Array.isArray(review.proposals) ? review.proposals : [];
      const open = proposals.filter((proposal) => proposal.status === 'proposed');
      const decided = proposals.filter((proposal) => proposal.status !== 'proposed');
      const commitments = Array.isArray(review.commitments) ? review.commitments : [];
      return h('div', { className: '__pn_panel', style: style.panel },
        h('div', { className: '__pn_title', style: style.title }, `Auflagen · ${open.length} offen`),
        open.length === 0 ? null : h('div', { className: '__pn_sub', style: style.sub },
          'Bestätigte Vorschläge werden zu Regeln. Ablehnen gilt genauso endgültig.'),
        relation === null ? null : h('div', { className: '__pn_relation', style: style.entry },
          h('div', { className: '__pn_claim', style: style.claim }, `Vertrauensstufe · ${relation.current}`),
          h('div', { className: '__pn_note', style: style.note }, 'Wie nah die Persona an dir dran ist.'),
          h('div', { className: '__pn_actions', style: style.actions },
            relation.levels.map((level) => h('button', {
              key: level, type: 'button',
              style: level === relation.current ? style.levelCurrent : style.button,
              disabled: relationBusy !== null || level === relation.current,
              onClick: () => chooseRelation(level),
            }, relationBusy === level ? '…' : level)))),
        open.length === 0
          ? h('div', { className: '__pn_empty', style: style.empty }, 'Keine offenen Vorschläge.')
          : open.map((proposal) => h(ProposalEntry, {
              key: proposal.id,
              proposal,
              busy: busy === null || busy.id !== proposal.id ? null : busy.decision,
              decide,
            })),
        decided.length === 0 ? null : h('div', { className: '__pn_decided', style: style.entry },
          h('div', { className: '__pn_claim', style: style.claim }, 'Entschieden'),
          decided.map((proposal) => h('div', { key: proposal.id, style: style.decidedRow },
            h('span', { style: proposal.status === 'accepted' ? style.accepted : style.rejected },
              proposal.status === 'accepted' ? 'angenommen' : 'abgelehnt'),
            h('span', null, proposal.claim,
              // Nur eine angenommene Auflage lässt sich zurücknehmen (der Host prüft es erneut).
              proposal.status === 'accepted' ? h('button', {
                type: 'button', style: { ...style.button, marginLeft: 8 }, disabled: busy !== null,
                onClick: () => decide(proposal.id, 'revoked'),
              }, busy === 'revoked' ? 'Wird zurückgenommen …' : 'Zurücknehmen') : null)))),
        error === null ? null : h('div', { className: '__pn_error', style: style.error }, error),
        h('div', { className: '__pn_note', style: style.note },
          `${commitments.length} Auflage${commitments.length === 1 ? '' : 'n'} · `
          + `${decided.length} entschieden`));
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set(PLUGIN, { label: 'Persona', kind: 'client', panel: PANEL_ID });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));

        // 'main' ist ein keyed-Slot (options.key). KEIN Eintrag in
        // `sidebar.panellist` mehr (2026-10-22): acht Panel-Knöpfe hatten die
        // Workspace-Liste aus der Leiste gedrängt. Die Fläche bleibt als Panel
        // erreichbar, die Zahl steht als Widget in `@shinon/widget-dock`.
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, ReviewPanel));
      },
    };
