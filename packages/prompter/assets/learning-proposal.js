/**
 * @shinon/prompter — Lernen: Vorschlag, Pruefung und Register (reiner Kern).
 *
 * KEIN Bare-Import. Gelesen wird nur `skill-lifecycle-core.js` (Form, Verbot,
 * Dublette, Widerspruch, Fingerabdruck) und `learning-redact.js` (Flatten,
 * Geheimnis-Befunde). Der Kern schreibt nichts, liest nichts und ruft kein
 * Modell: der Host liefert Belege, das Modell liefert eine Absicht, dieser
 * Kern macht daraus einen pruefbaren Antrag.
 *
 * DIE REIHENFOLGE IST TEIL DES VERTRAGS:
 *   Form -> Groesse -> Sensibel -> Herkunft -> Berechtigung/Risiko.
 * Die EIGENTUEMER-Pruefungen (Duplikat, Widerspruch, Basis-Hash, Kapazitaet)
 * folgen beim Anwenden: wer die Ablage besitzt, prueft sie. So kann der
 * Reviewer keinen fremden Zustand als "geprueft" markieren.
 *
 * FAIL-RICHTUNG: alles, was nicht eindeutig ist, wird `blocked` — der Befund
 * nennt den Grund. Eine stille Ablehnung gibt es nicht.
 */
import {
  forbiddenHits,
  normalizeCandidate,
  reviewCandidate,
  stableHash,
  fingerprintOf,
} from './skill-lifecycle-core.js';
import { flatten, secretFindings } from './learning-redact.js';

export const PROPOSAL_CONTRACT = 'shinon.learning-proposal/v1';
export const REGISTRY_CONTRACT = 'shinon.learning-proposals/v1';
export const REGISTRY_VERSION = 1;
export const TARGETS = Object.freeze(['memory', 'skill']);
export const STATUSES = Object.freeze(['pending', 'approved', 'rejected', 'applied', 'auto-applied', 'blocked', 'undone']);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Der Bereich einer Quelle: `message:…` -> `message`, `tool:…` -> `tool`. */
export function sourceKind(ref) {
  const text = String(ref ?? '');
  const at = text.indexOf(':');
  return at > 0 ? text.slice(0, at) : 'unknown';
}

/** Eine Quelle als Objekt. `rev` ist die Kennung, unter der sie im Digest stand. */
export function sourceOf(ref) {
  return { kind: sourceKind(ref), ref: String(ref), rev: String(ref) };
}

/** Ist der Text zentral (Identitaet, Gates, Vertraege, Profile)? */
export function riskOf(value, rules) {
  const text = String(value ?? '');
  for (const pattern of rules?.risk?.central ?? []) {
    let expression;
    try {
      expression = new RegExp(pattern, 'iu');
    } catch {
      continue;
    }
    if (expression.test(text)) return 'zentral';
  }
  return 'niedrig';
}

/** Der Text, gegen den Risiko und Geheimnisse geprueft werden. */
function reviewText(target, payload, reason) {
  if (target === 'memory') return `${payload?.subject ?? ''} ${payload?.claim ?? ''} ${reason ?? ''}`;
  return [
    payload?.description,
    payload?.thema,
    payload?.bei,
    payload?.immer,
    payload?.weil,
    reason,
  ].filter((part) => typeof part === 'string').join(' ');
}

/**
 * Die Modellantwort in einen Vorschlag uebersetzen. `refs` sind die Quellen,
 * die das Modell im Digest WIRKLICH gesehen hat; eine erfundene Quelle ist ein
 * Fehler, keine Fussnote.
 * @returns { ok: true, decision, proposal? } | { ok: false, reason }
 */
export function normalizeDecision(raw, { rules, skillRules, refs = [] }) {
  if (!isRecord(raw)) return { ok: false, reason: 'KEIN_OBJEKT' };
  if (raw.skip === true || raw.decision === 'none') return { ok: true, decision: 'none' };
  const target = typeof raw.decision === 'string' ? raw.decision : '';
  if (!TARGETS.includes(target)) return { ok: false, reason: 'ENTSCHEIDUNG_UNBEKANNT' };

  const reason = flatten(raw.reason);
  if (reason === '') return { ok: false, reason: 'OHNE_BEGRUENDUNG' };
  if (reason.length > rules.format.reasonMax) return { ok: false, reason: 'BEGRUENDUNG_ZU_LANG' };

  const given = Array.isArray(raw.sources) ? raw.sources : [];
  if (given.length === 0) return { ok: false, reason: 'OHNE_QUELLE' };
  if (given.length > rules.format.maxSources) return { ok: false, reason: 'QUELLEN_UEBER_LIMIT' };
  const known = new Set(refs);
  const sources = [];
  for (const ref of given) {
    if (typeof ref !== 'string' || ref === '') return { ok: false, reason: 'QUELLE_UNGUELTIG' };
    if (!known.has(ref)) return { ok: false, reason: `QUELLE_UNBEKANNT:${ref}` };
    if (!sources.some((entry) => entry.ref === ref)) sources.push(sourceOf(ref));
  }

  if (target === 'memory') {
    const subject = flatten(raw.subject);
    const claim = flatten(raw.claim);
    if (subject === '') return { ok: false, reason: 'OHNE_SUBJEKT' };
    if (subject.length > rules.format.subjectMax) return { ok: false, reason: 'SUBTJEKT_ZU_LANG' };
    if (claim === '') return { ok: false, reason: 'OHNE_CLAIM' };
    if (claim.length > rules.format.claimMax) return { ok: false, reason: 'CLAIM_ZU_LANG' };
    const payload = { kind: 'commitment', subject, claim };
    return {
      ok: true,
      decision: target,
      reason,
      sources,
      risk: riskOf(reviewText(target, payload, reason), rules),
      fingerprint: stableHash(`memory|${subject.toLowerCase()}|${claim.toLowerCase()}`),
      payload,
    };
  }

  const normalized = normalizeCandidate(raw.candidate ?? raw, skillRules);
  if (!normalized.ok) return { ok: false, reason: `KANDIDAT:${normalized.reason}` };
  return {
    ok: true,
    decision: target,
    reason,
    sources,
    risk: riskOf(reviewText(target, normalized.candidate, reason), rules),
    fingerprint: fingerprintOf(normalized.candidate, skillRules),
    payload: normalized.candidate,
  };
}

/**
 * Die deterministischen Pruefungen des Reviewers. Jede Zeile traegt `id`,
 * `ok` und einen Befund; `ok` ist die Konjunktion. Was hier nicht steht,
 * gehoert einem Eigentuemer (Persona, Skill-Writer).
 */
export function checkProposal(input, { rules, skillRules, noteRules }) {
  const target = input?.target ?? input?.decision;
  const { payload, reason, risk } = input ?? {};
  const findings = [];
  const push = (id, ok, detail = '') => findings.push({ id, ok, detail });

  const subjectOk = target === 'memory'
    ? typeof payload?.subject === 'string' && payload.subject !== '' && payload.subject.length <= rules.format.subjectMax
    : typeof payload?.name === 'string' && payload.name !== '';
  const claimOk = target === 'memory'
    ? typeof payload?.claim === 'string' && payload.claim !== '' && payload.claim.length <= rules.format.claimMax
    : typeof payload?.immer === 'string' && payload.immer !== '';
  push('FORM', subjectOk && claimOk, subjectOk ? '' : 'SUBTJEKT_ODER_REGEL');

  if (target === 'skill') {
    const tooNarrow = reviewCandidate(payload, noteRules);
    push('ZUSCHNITT', tooNarrow.length === 0, tooNarrow.map((entry) => entry.finding).join(','));
    push('GROESSE', (payload.description ?? '').length <= skillRules.format.descriptionMax, 'BESCHREIBUNG');
  } else {
    push('GROESSE', (payload.claim ?? '').length <= rules.format.claimMax, 'CLAIM');
  }

  const text = reviewText(target, payload, reason);
  const secrets = secretFindings(text);
  push('SENSIBEL', secrets.length === 0, secrets.map((hit) => hit.id).join(','));
  const forbidden = target === 'skill'
    ? forbiddenHits(payload, skillRules)
    : forbiddenHits({
      description: payload.claim,
      thema: payload.subject,
      bei: payload.claim,
      immer: payload.claim,
      weil: reason,
    }, skillRules);
  push('VERBOTEN', forbidden.length === 0, forbidden.map((hit) => hit.id).join(','));

  push('RISIKO', TARGETS.includes(target), risk ?? '');
  return { ok: findings.every((finding) => finding.ok), findings };
}

/**
 * Der vollstaendige Vorschlag. `now` kommt von aussen (der Kern liest keine
 * Uhr); `evidence` ist die Art des Belegs, nicht sein Text.
 */
export function buildProposal(input, rules) {
  const target = input?.target ?? input?.decision;
  const { reason, sources, risk, fingerprint, payload, checks, evidence, base = null, owner = null, now = null } = input ?? {};
  const id = `${rules.format.idPrefix}${stableHash([target, fingerprint, sources.map((source) => source.ref).sort().join(','), evidence?.kind ?? ''].join('|'))}`;
  return {
    contract: PROPOSAL_CONTRACT,
    id,
    target,
    status: 'pending',
    reason,
    sources,
    fingerprint,
    risk,
    evidence: evidence === null || evidence === undefined ? null : { ...evidence },
    base: base === null ? null : { ...base },
    owner,
    payload,
    checks,
    decision: null,
    undo: null,
    createdAt: now,
  };
}

/**
 * Darf der Vorschlag ohne Freigabe angewendet werden? NUR wenn der Schalter
 * es erlaubt, das Risiko niedrig ist und die Belegschwelle steht.
 */
export function canAuto(proposal, { memoryWriteApproval, skillWriteApproval, minEvidenceForAuto }) {
  const approval = proposal?.target === 'memory' ? memoryWriteApproval : skillWriteApproval;
  if (approval !== false) return { auto: false, reason: 'FREIGABE' };
  if (proposal?.risk !== 'niedrig') return { auto: false, reason: 'RISIKO' };
  const evidence = proposal?.evidence ?? null;
  if (evidence?.kind === 'correction') return { auto: true, reason: 'KORREKTUR' };
  const completed = Number.isInteger(evidence?.completed) ? evidence.completed : evidence?.kind === 'completed' ? 1 : 0;
  if (completed >= minEvidenceForAuto) return { auto: true, reason: 'WIEDERHOLUNG' };
  return { auto: false, reason: 'BELEG_ZU_DUENN' };
}

// ── Register ────────────────────────────────────────────────────────────────

export function emptyRegistry() {
  return { contract: REGISTRY_CONTRACT, version: REGISTRY_VERSION, seq: 0, entries: {} };
}

/** Fail-closed: fremder Vertrag oder kaputte Form ergibt `ok: false`. */
export function parseRegistry(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? ''));
  } catch {
    return { ok: false, reason: 'KEIN_JSON' };
  }
  if (!isRecord(parsed) || parsed.contract !== REGISTRY_CONTRACT || parsed.version !== REGISTRY_VERSION) {
    return { ok: false, reason: 'VERTRAG_FREMD' };
  }
  if (!isRecord(parsed.entries)) return { ok: false, reason: 'EINTRAEGE_FEHLEN' };
  return { ok: true, registry: parsed };
}

/** Nur entschiedene Eintraege weichen; offene bleiben, auch ueber dem Limit. */
export function pruneRegistry(registry, maxEntries) {
  const entries = { ...(registry?.entries ?? {}) };
  const names = Object.keys(entries);
  if (names.length <= maxEntries) return registry;
  const removable = names
    .filter((name) => entries[name]?.status !== 'pending')
    .sort((left, right) => String(entries[left]?.createdAt ?? '').localeCompare(String(entries[right]?.createdAt ?? '')));
  const drop = new Set(removable.slice(0, names.length - maxEntries));
  return {
    ...registry,
    entries: Object.fromEntries(Object.entries(entries).filter(([name]) => !drop.has(name))),
  };
}

/** Einen Vorschlag eintragen. Am Limit mit lauter offenen: benannter Befund. */
export function putProposal(registry, proposal, maxEntries) {
  if (!isRecord(proposal) || typeof proposal.id !== 'string' || !TARGETS.includes(proposal.target)) {
    return { ok: false, reason: 'VORSCHLAG_UNGUELTIG' };
  }
  // Platz fuer den neuen Eintrag schaffen: entschiedene duerfen weichen, offene nie.
  const current = pruneRegistry(registry ?? emptyRegistry(), Math.max(0, maxEntries - 1));
  if (Object.keys(current.entries).length >= maxEntries) {
    return { ok: false, reason: 'KAPAZITAET', registry: current };
  }
  return {
    ok: true,
    registry: {
      ...current,
      seq: (current.seq ?? 0) + 1,
      entries: { ...current.entries, [proposal.id]: { ...proposal, createdAt: proposal.createdAt ?? null } },
    },
  };
}

/** Status und Zusatzfelder eines Eintrags setzen; unbekannt ist ein Befund. */
export function setProposal(registry, id, patch) {
  const current = registry?.entries?.[id];
  if (current === undefined) return { ok: false, reason: 'UNBEKANNT' };
  if (patch?.status !== undefined && !STATUSES.includes(patch.status)) return { ok: false, reason: 'STATUS_UNBEKANNT' };
  return { ok: true, registry: { ...registry, entries: { ...registry.entries, [id]: { ...current, ...patch } } } };
}

export function pendingProposals(registry) {
  return Object.values(registry?.entries ?? {})
    .filter((proposal) => proposal?.status === 'pending')
    .sort((left, right) => String(left.createdAt ?? '').localeCompare(String(right.createdAt ?? '')) || left.id.localeCompare(right.id));
}

/** Zaehler fuer den Curator: wie viele Skills hat dieser Lebenszyklus erzeugt? */
export function countByTarget(registry, target) {
  return Object.values(registry?.entries ?? {}).filter((proposal) => proposal?.target === target).length;
}
