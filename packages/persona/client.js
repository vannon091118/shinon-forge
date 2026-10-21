/**
 * @shinon/persona — Client-Hälfte: Prüf-Panel für Selbstauflagen.
 *
 * Zeigt die OFFENEN Vorschläge mit ihren Belegen und entscheidet genau einen
 * davon über die bestehende Naht: GET `/shinon/persona/review` liefert
 * `review()`, POST dieselbe Route nimmt `{ id, decision }` und ruft `decide()`.
 * Der Host bleibt die einzige Instanz, die eine Auflage erzeugt — das Panel
 * kann nichts annehmen, was der Host nicht als Vorschlag führt, und es schreibt
 * selbst nie in eine Ablage.
 *
 * Dazu die BEZIEHUNGSSTUFE: sichtbar aus dem Zustands-Global, setzbar per POST
 * `/shinon/persona/relation` — ein ausdruecklicher Akt; die Sitzung setzt der
 * Host aus dem Ereignis, das er zuletzt gesehen hat.
 *
 * Der Startstand steht als Global in der Seite (`index-inject`), damit das
 * Panel beim ersten Blick nicht leer aussieht; danach trägt der Abruf den
 * aktuellen Stand. Beide Namen sind Literale (ein Client-Bundle kann die
 * Host-Konstanten nicht importieren) und werden gegen die Host-Seite gepinnt.
 */
window.__ModuleLoader__.load({
  id: '@shinon/persona',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/persona';
    const PANEL_ID = 'shinon-persona';
    /** Die Prüf-Naht: GET zeigt, POST entscheidet. */
    const REVIEW_ROUTE = '/shinon/persona/review';
    /** Die bestehende SSE-Route der Persona — sie schiebt den Prüf-Stand als `review`. */
    const STATE_ROUTE = '/shinon/persona/state';
    /** Der Startstand des Panels aus `webserver/index-inject`. */
    const REVIEW_GLOBAL = '__shinonPersonaReview';
    /** Nur der eigene Vertrag wird angezeigt — ein fremdes Dokument nicht. */
    const REVIEW_CONTRACT = 'shinon.persona-review/v1';
    const RELATION_ROUTE = '/shinon/persona/relation'; // POST setzt genau eine Stufe
    /** Der Zustands-Global der Persona — Literal, wie der Banner es liest. */
    const STATE_GLOBAL = '__shinonPersonaState';

    /** Der Startstand, sofern der Host einen mitgegeben hat. */
    const initialReview = () => {
      const value = window[REVIEW_GLOBAL];
      return value !== null && typeof value === 'object' && value.contract === REVIEW_CONTRACT ? value : null;
    };

    const fetchReview = async () => {
      const response = await fetch(REVIEW_ROUTE, { headers: { accept: 'application/json' } });
      if (response.ok !== true) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      return body !== null && typeof body === 'object' && body.contract === REVIEW_CONTRACT ? body : null;
    };

    /** Ein POST mit JSON-Antwort — beide Naehte schreiben auf diese Weise. */
    const postJson = async (route, payload) => {
      const response = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      let body = null;
      try { body = await response.json(); } catch { /* Antwort ohne JSON */ }
      return { ok: response.ok === true, body };
    };

    const sendDecision = (id, decision) => postJson(REVIEW_ROUTE, { id, decision });

    /** Der Beziehungsstand aus dem Global: Stufen und aktueller Wert. */
    const initialRelation = () => {
      const relation = window[STATE_GLOBAL]?.relation ?? null;
      return relation !== null && Array.isArray(relation.levels) ? relation : null;
    };

    const style = {
      panel: {
        fontFamily: 'var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif)',
        fontSize: 13,
        padding: 16,
        overflow: 'auto',
        height: '100%',
        color: 'var(--dsw-alias-label-primary)',
      },
      title: { fontWeight: 700, letterSpacing: '.06em', marginBottom: 4 },
      sub: { fontSize: 12, margin: '0 0 14px', color: 'var(--dsw-alias-label-secondary)' },
      empty: { opacity: 0.65, padding: '8px 0' },
      entry: {
        marginBottom: 10,
        padding: 10,
        borderRadius: 6,
        background: 'var(--dsw-alias-bg-layer-1)',
        borderLeft: '3px solid var(--shinon-violet, #7C3AED)',
      },
      claim: { marginBottom: 4, fontWeight: 600 },
      evidence: { fontSize: 12, marginBottom: 8, color: 'var(--dsw-alias-label-secondary)' },
      actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
      button: { fontSize: 12, padding: '3px 10px', cursor: 'pointer' },
      levelCurrent: { fontSize: 12, padding: '3px 10px', fontWeight: 700, cursor: 'default' },
      error: { marginTop: 10, fontSize: 12, color: 'var(--dsw-alias-label-danger, #ef4444)' },
      note: { marginTop: 12, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
    };

    /** Ein offener Vorschlag: Behauptung, Belegzahl, zwei ausdrückliche Wege. */
    function ProposalEntry({ proposal, busy, decide }) {
      const disabled = busy !== null;
      return h('div', { className: '__pn_entry', style: style.entry },
        h('div', { className: '__pn_claim', style: style.claim }, proposal.claim),
        h('div', { className: '__pn_evidence', style: style.evidence },
          `${proposal.evidence} Beleg${proposal.evidence === 1 ? '' : 'e'} — `,
          'entstanden aus wiederholten Entscheidungen des Veredlers'),
        h('div', { className: '__pn_actions', style: style.actions },
          h('button', {
            type: 'button',
            style: style.button,
            disabled,
            onClick: () => decide(proposal.id, 'accepted'),
          }, busy === 'accepted' ? 'Wird angenommen …' : 'Annehmen'),
          h('button', {
            type: 'button',
            style: style.button,
            disabled,
            onClick: () => decide(proposal.id, 'rejected'),
          }, busy === 'rejected' ? 'Wird abgelehnt …' : 'Ablehnen')));
    }

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
          h('div', { className: '__pn_title', style: style.title }, 'Selbstauflagen prüfen'),
          h('div', { className: '__pn_empty', style: style.empty }, 'Keine Vorschläge geladen.'),
          error === null ? null : h('div', { className: '__pn_error', style: style.error }, error));
      }

      const proposals = Array.isArray(review.proposals) ? review.proposals : [];
      const open = proposals.filter((proposal) => proposal.status === 'proposed');
      const commitments = Array.isArray(review.commitments) ? review.commitments : [];
      return h('div', { className: '__pn_panel', style: style.panel },
        h('div', { className: '__pn_title', style: style.title }, `Selbstauflagen prüfen — ${open.length} offen`),
        h('div', { className: '__pn_sub', style: style.sub },
          'Ein Vorschlag wird erst durch Annehmen zur Auflage. Ablehnen ist genauso endgültig — '
          + 'beides läuft über dieselbe Naht, die der Host führt.'),
        relation === null ? null : h('div', { className: '__pn_relation', style: style.entry },
          h('div', { className: '__pn_claim', style: style.claim }, `Beziehung — ${relation.current}`),
          h('div', { className: '__pn_actions', style: style.actions },
            relation.levels.map((level) => h('button', {
              key: level, type: 'button',
              style: level === relation.current ? style.levelCurrent : style.button,
              disabled: relationBusy !== null || level === relation.current,
              onClick: () => chooseRelation(level),
            }, relationBusy === level ? '…' : level)))),
        open.length === 0
          ? h('div', { className: '__pn_empty', style: style.empty },
              'Nichts zu entscheiden — Vorschläge entstehen aus belegten Wiederholungen.')
          : open.map((proposal) => h(ProposalEntry, {
              key: proposal.id,
              proposal,
              busy: busy === null || busy.id !== proposal.id ? null : busy.decision,
              decide,
            })),
        error === null ? null : h('div', { className: '__pn_error', style: style.error }, error),
        h('div', { className: '__pn_note', style: style.note },
          `${commitments.length} angenommene Auflage${commitments.length === 1 ? '' : 'n'} · `
          + `${proposals.length - open.length} entschieden`));
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set(PLUGIN, { label: 'Persona', kind: 'client', panel: PANEL_ID });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));

        // 'main' ist ein keyed-Slot (options.key); die Sidebar-Leiste ist eine
        // list (options.id) — ohne beide Einträge wäre das Panel nicht erreichbar.
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, ReviewPanel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 31,
          label: () => 'Persona',
        }, ReviewPanel));
      },
    };
  },
});
