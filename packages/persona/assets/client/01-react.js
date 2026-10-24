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
      panel: { fontFamily: 'var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif)', fontSize: 13, padding: 16, overflow: 'auto', height: '100%', color: 'var(--dsw-alias-label-primary)' },
      title: { fontWeight: 700, letterSpacing: '.06em', marginBottom: 4 },
      sub: { fontSize: 12, margin: '0 0 14px', color: 'var(--dsw-alias-label-secondary)' },
      empty: { opacity: 0.65, padding: '8px 0' },
      entry: { marginBottom: 10, padding: 10, borderRadius: 6, background: 'var(--dsw-alias-bg-layer-1)', borderLeft: '3px solid var(--shinon-violet, #7C3AED)' },
      claim: { marginBottom: 4, fontWeight: 600 },
      evidence: { fontSize: 12, marginBottom: 8, color: 'var(--dsw-alias-label-secondary)' },
      actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
      button: { fontSize: 12, padding: '3px 10px', cursor: 'pointer' },
      // Entschiedenes bleibt sichtbar: „was habe ich entschieden" fragt das Protokoll, nicht das Gedächtnis.
      decidedRow: { display: 'grid', gridTemplateColumns: '86px 1fr', gap: 8, fontSize: 12, padding: '3px 0', borderTop: '1px solid rgba(255,255,255,.06)' },
      accepted: { fontWeight: 700, color: '#22c55e' },
      rejected: { fontWeight: 700, color: '#ef4444' },
      levelCurrent: { fontSize: 12, padding: '3px 10px', fontWeight: 700, cursor: 'default' },
      error: { marginTop: 10, fontSize: 12, color: 'var(--dsw-alias-label-danger, #ef4444)' }, note: { marginTop: 12, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
    };

    /** Ein offener Vorschlag: Behauptung, Grund, Quellen, zwei ausdrückliche Wege. */
    function ProposalEntry({ proposal, busy, decide }) {
      const disabled = busy !== null;
      const sources = Array.isArray(proposal.sources) && proposal.sources.length > 0 ? `Quellen: ${proposal.sources.join(', ')}` : null;
      return h('div', { className: '__pn_entry', style: style.entry },
        h('div', { className: '__pn_claim', style: style.claim }, proposal.claim),
        h('div', { className: '__pn_evidence', style: style.evidence },
          `${proposal.evidence} Beleg${proposal.evidence === 1 ? '' : 'e'} — `,
          proposal.reason ?? 'entstanden aus wiederholten Entscheidungen des Veredlers'),
        sources === null ? null : h('div', { className: '__pn_sources', style: style.evidence }, sources),
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

