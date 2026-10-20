/**
 * Claim-Lebenszyklus und Urteilsschicht (Wissens-Runtime, Zug 5). Rein und
 * importfrei — die Persona-Hälften lesen daraus, sie rechnen nicht selbst.
 *
 * DIE REGEL, DIE DEN GANZEN ZUG TRÄGT: ein Vorschlag wird nie dadurch zur
 * Überzeugung, dass er oft vorkommt. `scoring` darf Signale liefern und
 * Vorschläge machen; `accepted` entsteht nur durch `human` oder `review`.
 *
 * Das Urteil ist dreiwertig gedacht, aber zweiwertig gesprochen: `ALLOW` oder
 * `DENY` mit Gründen. Ein ungelöster sicherheitsrelevanter Konflikt blockiert
 * die betroffene Aktion — nicht das ganze Projekt.
 */

export const CLAIM_CONTRACT = 'shinon.claims/v1';
export const CLAIM_STATES = Object.freeze(['proposed', 'accepted', 'rejected', 'superseded']);
export const CLAIM_ACTORS = Object.freeze(['human', 'review', 'scoring', 'system']);
export const MAX_CLAIM_EVIDENCE = 9;
export const MAX_CLAIM_DETAIL = 160;

// Wer darf welchen Übergang? Die Tabelle ist die einzige Wahrheit.
const MOVES = Object.freeze({
  proposed: Object.freeze({ accepted: ['human', 'review'], rejected: ['human', 'review', 'system'], superseded: ['system'] }),
  accepted: Object.freeze({ rejected: ['human', 'review'], superseded: ['human', 'review', 'system'] }),
  rejected: Object.freeze({ superseded: ['system'] }),
  superseded: Object.freeze({}),
});

function text(value, max = MAX_CLAIM_DETAIL) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const flat = value.trim().replace(/\s+/g, ' ');
  return flat.length > max ? flat.slice(0, max) : flat;
}

/** Darf `actor` den Claim von `from` nach `to` bewegen? */
export function canMoveClaim(from, to, actor) {
  if (!CLAIM_STATES.includes(from) || !CLAIM_STATES.includes(to)) return { ok: false, reason: 'ZUSTAND_UNBEKANNT' };
  if (!CLAIM_ACTORS.includes(actor)) return { ok: false, reason: 'AKTEUR_VERBOTEN' };
  const allowed = MOVES[from][to];
  if (!allowed) return { ok: false, reason: 'UEBERGANG_VERBOTEN' };
  if (!allowed.includes(actor)) return { ok: false, reason: 'AKTEUR_NICHT_ZUSTAENDIG' };
  return { ok: true, reason: '' };
}

/** Ein Vorschlag. Er startet IMMER als `proposed`, egal wer ihn einbringt. */
export function proposeClaim({ id, subject, detail, evidencePointer, rev, source = 'runtime' } = {}) {
  const key = text(id, 64) ?? text(subject, 64);
  const subjectText = text(subject, 64);
  if (key === null || subjectText === null) return { ok: false, reason: 'OHNE_SUBJEKT', claim: null };
  if (text(evidencePointer) === null || text(rev, 64) === null) return { ok: false, reason: 'OHNE_BELEG', claim: null };
  return {
    ok: true,
    reason: '',
    claim: {
      contract: CLAIM_CONTRACT,
      id: key,
      subject: subjectText,
      detail: text(detail),
      state: 'proposed',
      evidence: [{ pointer: text(evidencePointer), rev: text(rev, 64) }],
      decidedBy: null,
      decidedAt: null,
      source: text(source, 32) ?? 'runtime',
    },
  };
}

/** Der nächste Beleg für einen Claim. Gedeckelt; kein zweiter gleicher Zeiger. */
export function addEvidence(claim, { pointer, rev } = {}) {
  if (!claim || claim.state === 'superseded') return { ok: false, reason: 'KEIN_CLAIM' };
  const entry = { pointer: text(pointer), rev: text(rev, 64) };
  if (entry.pointer === null || entry.rev === null) return { ok: false, reason: 'OHNE_BELEG' };
  const exists = (claim.evidence ?? []).some((item) => item.pointer === entry.pointer && item.rev === entry.rev);
  if (exists) return { ok: true, reason: 'SCHON_BELEGT', claim };
  const evidence = [...(claim.evidence ?? []), entry].slice(-MAX_CLAIM_EVIDENCE);
  return { ok: true, reason: '', claim: { ...claim, evidence } };
}

/** Eine Entscheidung über den Claim. Nur die Tabelle entscheidet, wer darf. */
export function decideClaim(claim, decision, actor, at) {
  if (!claim) return { ok: false, reason: 'KEIN_CLAIM' };
  const move = canMoveClaim(claim.state, decision, actor);
  if (!move.ok) return { ok: false, reason: move.reason };
  return {
    ok: true,
    reason: '',
    claim: {
      ...claim,
      state: decision,
      decidedBy: actor,
      decidedAt: text(String(at), 32),
    },
  };
}

/**
 * Das Urteil über eine Aktion.
 *
 * Eingang:
 *   action      { id, scope? } — was getan werden soll
 *   conflicts   [{ id, scope?, severity: 'security'|'other', resolved }]
 *   claims      [{ id, state }]
 *   required    [claimId] — Claims, auf denen die Aktion aufbaut
 *
 * Rückgabe: { verdict, reasons, evidence } — `evidence` nennt nur Kennungen und
 * Zustände, nie Text.
 */
export function judgeAction({ action, conflicts = [], claims = [], required = [] } = {}) {
  const reasons = [];
  const actionId = text(action?.id, 64);
  if (actionId === null) return { verdict: 'DENY', reasons: ['AKTION_UNBEKANNT'], evidence: [] };

  const scope = text(action?.scope, 120);
  for (const conflict of conflicts) {
    if (conflict?.resolved === true) continue;
    if (conflict?.severity !== 'security') continue;
    const conflictScope = text(conflict?.scope, 120);
    const applies = conflictScope === null || scope === null || conflictScope === scope;
    if (applies) reasons.push(`KONFLIKT_UNGELOEST:${text(conflict?.id, 64) ?? 'unbekannt'}`);
  }

  const byId = new Map((claims ?? []).map((claim) => [claim?.id, claim]));
  for (const id of required) {
    const claim = byId.get(id);
    if (!claim || claim.state !== 'accepted') reasons.push(`CLAIM_NICHT_AKZEPTIERT:${id}`);
  }

  return {
    verdict: reasons.length === 0 ? 'ALLOW' : 'DENY',
    reasons: reasons.sort(),
    evidence: (claims ?? []).map((claim) => ({ id: claim?.id, state: claim?.state })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
}

/** Der Kurzbericht für Anzeige und Datensatz: Zahlen und Gründe, kein Claim-Text. */
export function judgementRecord(judgement, actionId) {
  return {
    contract: CLAIM_CONTRACT,
    action: actionId ?? null,
    verdict: judgement?.verdict ?? 'DENY',
    reasons: [...(judgement?.reasons ?? [])],
    claims: (judgement?.evidence ?? []).length,
  };
}
