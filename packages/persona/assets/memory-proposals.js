/**
 * @shinon/persona — memory-proposals.js
 *
 * Der VORSCHLAGS-Lebenszyklus des Langzeitgedaechtnisses: aus belegten
 * Wiederholungen entsteht ein Vorschlag, aus einem angenommenen Vorschlag eine
 * Selbstauflage, aus einer angenommenen Auflage ein Widerruf. Dazu die eine
 * Fremd-Naht des Lernpruefers (`proposeMemory`): sie prueft selbst, statt dem
 * Absender zu glauben.
 *
 * Eigentuemer-Grenze (Schnitt 2026-10-24): das Fuehren und Pruefen des
 * Gedaechtnisses steht in `memory-core.js`, der Lebenszyklus der Vorschlaege
 * hier. Die Richtung ist EINE: dieser Kern importiert den Kern, nie umgekehrt —
 * deshalb gibt es keinen Zyklus und keinen zweiten Speicher.
 */
import { promptText } from './prompt-text.js';
import {
  LIMIT_EVIDENCE,
  MEMORY_CLAIM_CHARS,
  MEMORY_PROPOSAL_CONTRACT,
  MEMORY_REASON_CHARS,
  MEMORY_SOURCE_CHARS,
  MEMORY_SOURCE_REFS,
  MEMORY_DETAIL_CHARS,
  MEMORY_EVIDENCE_CAP,
  MEMORY_MAX_PROPOSALS,
  PREFERENCE_EVIDENCE,
  emptyMemory,
  isRecord,
  slug,
  text,
} from './memory-core.js';

/**
 * Einen Claim des Claim-Kerns in die vorhandenen Vorschläge übernehmen (Zug 5
 * der Wissens-Runtime). Die Brücke ändert KEINE Regel: `accepted` wird nur
 * übernommen, wenn der Claim von `human` oder `review` entschieden wurde. Ein
 * Claim, den `scoring` angenommen haben will, bleibt ein Vorschlag — die
 * Scoring liefert Signale, sie besitzt keine Persona-Wahrheit.
 */
export function adoptClaim(memory, claim, now = null) {
  const base = isRecord(memory) ? memory : emptyMemory(now);
  const id = text(claim?.id);
  const subject = text(claim?.subject);
  if (id === null || subject === null) return { memory: base, changed: false, reason: 'KEIN_CLAIM' };
  const decided = claim?.state === 'accepted' && (claim?.decidedBy === 'human' || claim?.decidedBy === 'review');
  // proposed bleibt proposed; ein "angenommener" Claim ohne zuständigen Akteur
  // bleibt ebenfalls Vorschlag; alles andere ist abgelehnt.
  const status = decided
    ? 'accepted'
    : claim?.state === 'proposed' || claim?.state === 'accepted'
      ? 'proposed'
      : 'rejected';
  const entry = {
    id: `c:${id}`,
    kind: 'commitment',
    claim: (text(claim.detail) ?? text(claim.predicate) ?? subject).slice(0, MEMORY_DETAIL_CHARS),
    evidence: Math.max(1, Math.min(MEMORY_EVIDENCE_CAP, Array.isArray(claim.evidence) ? claim.evidence.length : 1)),
    status,
    createdAt: text(now),
    decidedAt: decided ? text(now) : null,
    source: text(claim.source) ?? 'claim-core',
  };
  const proposals = [...base.proposals];
  const at = proposals.findIndex((proposal) => proposal.id === entry.id);
  if (at === -1) proposals.push(entry);
  else proposals[at] = { ...proposals[at], ...entry, createdAt: proposals[at].createdAt ?? entry.createdAt };
  return {
    memory: { ...base, proposals: proposals.slice(-MEMORY_MAX_PROPOSALS) },
    changed: true,
    reason: claim?.state === 'accepted' && !decided ? 'NICHT_ENTSCHIEDEN' : '',
  };
}

/**
 * Vorschläge aus belegten Wiederholungen. Der Vorschlag ist deterministisch
 * formuliert und wird NIE automatisch angenommen — Annahme ist ein eigener Akt.
 */
export function proposeFromMemory(memory, options = {}) {
  const now = text(options.now);
  const base = isRecord(memory) ? memory : emptyMemory(now);
  const known = new Set(base.proposals.map((proposal) => proposal.id));
  const proposals = [...base.proposals];
  let added = 0;
  for (const entry of base.entries) {
    const threshold = entry.kind === 'limit' ? LIMIT_EVIDENCE : entry.kind === 'preference' ? PREFERENCE_EVIDENCE : Infinity;
    if (entry.evidence < threshold) continue;
    const id = `p:${entry.id}`;
    if (known.has(id)) continue;
    const claim = entry.kind === 'limit'
      ? promptText('persona-proposal-limit', { subject: entry.subject })
      : promptText('persona-proposal-preference', { subject: entry.subject });
    proposals.push({ id, kind: 'commitment', claim, evidence: entry.evidence, status: 'proposed', createdAt: now, decidedAt: null, source: entry.id });
    known.add(id);
    added += 1;
  }
  return {
    memory: { ...base, proposals: proposals.slice(-MEMORY_MAX_PROPOSALS) },
    added,
  };
}

/** Ausdrückliche Entscheidung über einen Vorschlag. Unbekannt = abgelehnt (fail-closed). */
export function decideProposal(memory, id, decision, now = null) {
  const wanted = text(id);
  if (wanted === null) return { memory, ok: false, error: 'UNKNOWN_PROPOSAL' };
  if (decision !== 'accepted' && decision !== 'rejected') return { memory, ok: false, error: 'UNKNOWN_DECISION' };
  const proposals = Array.isArray(memory?.proposals) ? memory.proposals : [];
  const at = proposals.findIndex((proposal) => proposal.id === wanted);
  if (at === -1) return { memory, ok: false, error: 'UNKNOWN_PROPOSAL' };
  if (proposals[at].status !== 'proposed') return { memory, ok: false, error: 'ALREADY_DECIDED' };
  const next = proposals.map((proposal, index) => (index === at ? { ...proposal, status: decision, decidedAt: text(now) } : proposal));
  return { memory: { ...memory, proposals: next }, ok: true, proposal: next[at] };
}

/**
 * Was ein Vorschlag NICHT tragen darf: Schluessel, Passwoerter, private Schluessel.
 *
 * Dieselbe Grenze wie im Reviewer (`learning-redact.js`), hier als zweite,
 * unabhaengige Pruefung: die Persona glaubt dem Absender nicht, sie prueft
 * selbst. Ein Geheimnis im Claim waere dauerhaft im Gedaechtnis und im Prompt.
 */
export function looksSecret(value) {
  const raw = typeof value === 'string' ? value : '';
  if (raw === '') return false;
  return /\b(sk|rk|pk)-[A-Za-z0-9_-]{8,}/.test(raw)
    || /\bgh[pousr]_[A-Za-z0-9]{8,}/.test(raw)
    || /\bAKIA[0-9A-Z]{12,}/.test(raw)
    || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(raw)
    || /(?:api[_-]?key|secret|passwor[dt]|token)\s*[:=]\s*\S/i.test(raw);
}

/** Zwei Claims sind derselbe, wenn sie sich nur in Leerraum und Grossschreibung unterscheiden. */
function sameClaim(a, b) {
  const flat = (value) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return flat(a) !== '' && flat(a) === flat(b);
}

/**
 * EINEN Vorschlag eines fremden Pruefers annehmen — die deterministische Pruefung.
 *
 * Was hier geprueft wird, prueft die Persona und nicht der Absender: Vertrag,
 * Pflichtfelder, Groessen, Duplikat, Geheimnis, Kapazitaet. Der Vorschlag traegt
 * `createdAt`, `decidedAt` und `source` — Herkunft und Version sind damit
 * nachpruefbar, und ein bereits angenommener Claim ist ein Duplikat, keine
 * zweite Auflage.
 *
 * `decision === 'accepted'` ist die Freigabe, die der Reviewer vom Schalter hat;
 * alles andere landet als `proposed` und wartet auf den Menschen. Ein unbekannter
 * Zustand ist kein stilles Annehmen.
 *
 * @returns {{ ok: boolean, memory: object, id?: string, status?: string, reason?: string }}
 */
export function proposeMemory(memory, input, now = null) {
  const base = isRecord(memory) ? memory : emptyMemory(now);
  if (!isRecord(input)) return { ok: false, memory: base, reason: 'KEIN_VORSCHLAG' };
  if (input.contract !== MEMORY_PROPOSAL_CONTRACT) {
    return { ok: false, memory: base, reason: `FREMDER_VERTRAG:${String(input.contract)}` };
  }
  const claim = text(input.claim);
  if (claim === null) return { ok: false, memory: base, reason: 'OHNE_CLAIM' };
  if (claim.length > MEMORY_CLAIM_CHARS) return { ok: false, memory: base, reason: `CLAIM_ZU_LANG:${claim.length}` };
  if (looksSecret(claim)) return { ok: false, memory: base, reason: 'GEHEIMNIS' };

  const subject = slug(input.subject) ?? slug(claim, 40);
  if (subject === null) return { ok: false, memory: base, reason: 'OHNE_SUBJEKT' };

  const known = Array.isArray(base.proposals) ? base.proposals : [];
  const duplicate = known.find((proposal) => proposal.status !== 'rejected' && sameClaim(proposal.claim, claim));
  if (duplicate !== undefined) {
    return { ok: false, memory: base, id: duplicate.id, reason: `DUPLIKAT:${duplicate.id}` };
  }

  const id = `c:${(text(input.id) ?? subject).replace(/[^A-Za-z0-9_.:-]+/g, '-').slice(0, 64)}`;
  const existing = known.find((proposal) => proposal.id === id);
  if (existing !== undefined && existing.status !== 'rejected') {
    return { ok: false, memory: base, id: existing.id, reason: `DUPLIKAT:${existing.id}` };
  }

  // Kapazitaet: zuerst weichen entschiedene (abgelehnte) Zeilen, nie eine lebende.
  // Dieselbe Regel gilt fuer die Id: ein abgelehnter Vorschlag ist keine Zeile,
  // die eine neue Fassung derselben Aussage blockiert.
  let proposals = [...known.filter((proposal) => proposal.id !== id)];
  if (proposals.length >= MEMORY_MAX_PROPOSALS) {
    const before = proposals.length;
    proposals = proposals.filter((proposal) => proposal.status !== 'rejected');
    if (proposals.length >= MEMORY_MAX_PROPOSALS) {
      return { ok: false, memory: base, reason: `KAPAZITAET:${proposals.length}/${MEMORY_MAX_PROPOSALS}` };
    }
    if (before - proposals.length === 0) return { ok: false, memory: base, reason: `KAPAZITAET:${before}/${MEMORY_MAX_PROPOSALS}` };
  }

  const accepted = input.decision === 'accepted';
  const sources = Array.isArray(input.sources)
    ? [...new Set(input.sources
      .filter((ref) => typeof ref === 'string' && ref.trim() !== '')
      .map((ref) => ref.trim().slice(0, MEMORY_SOURCE_CHARS)))]
      .slice(0, MEMORY_SOURCE_REFS)
    : [];
  const reason = text(input.reason);
  const proposal = {
    id,
    kind: 'commitment',
    claim,
    evidence: Math.max(1, Math.min(MEMORY_EVIDENCE_CAP, Array.isArray(input.sources) ? input.sources.length : 1)),
    status: accepted ? 'accepted' : 'proposed',
    createdAt: text(now),
    decidedAt: accepted ? text(now) : null,
    source: text(input.source) ?? 'learning-review',
    reason: reason === null ? null : reason.slice(0, MEMORY_REASON_CHARS),
    sources,
    // Der Bereich entscheidet, WER die Auflage sieht: ein Lernen aus einem
    // Projekt darf nicht in einem fremden Workspace als Regel auftauchen.
    scope: text(input.scope) ?? 'global',
  };
  return {
    ok: true,
    memory: { ...base, proposals: [...proposals, proposal].slice(-MEMORY_MAX_PROPOSALS) },
    id,
    status: proposal.status,
  };
}

/**
 * Eine ANGENOMMENE Auflage zuruecknehmen (SH-LEARN-04: jede Aenderung ist
 * rueckgaengig zu machen).
 *
 * Nur `accepted` ist widerruflich: ein offener Vorschlag wird abgelehnt, nicht
 * widerrufen, und ein bereits abgelehnter bleibt abgelehnt. Der Widerruf ist
 * symmetrisch zur Annahme — dieselbe Zeile, derselbe Zeitstempel, kein Grabstein,
 * der im Prompt stehen bleibt.
 */
export function retractProposal(memory, id, now = null) {
  const wanted = text(id);
  if (wanted === null || !isRecord(memory)) return { ok: false, memory, error: 'UNKNOWN_PROPOSAL' };
  const proposals = Array.isArray(memory.proposals) ? memory.proposals : [];
  const at = proposals.findIndex((proposal) => proposal.id === wanted);
  if (at === -1) return { ok: false, memory, error: 'UNKNOWN_PROPOSAL' };
  if (proposals[at].status !== 'accepted') return { ok: false, memory, error: 'NICHT_ANGENOMMEN' };
  const next = proposals.map((proposal, index) => (index === at
    ? { ...proposal, status: 'rejected', decidedAt: text(now) ?? proposal.decidedAt, retractedAt: text(now) }
    : proposal));
  return { ok: true, memory: { ...memory, proposals: next }, proposal: next[at] };
}
