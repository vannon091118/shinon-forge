/**
 * @shinon/persona — memory-core.js
 *
 * Das LANGZEITGEDÄCHTNIS: Ereignisse werden zu belegten Erinnerungen, Erinnerungen
 * zu Vorschlägen, Vorschläge erst nach ausdrücklicher Annahme zu Selbstauflagen.
 * Reine Daten und Rechnung — keine Bare-Importe, kein I/O, keine Uhr, kein
 * Modell. Der einzige Import ist der Text-Renderer (`prompt-text.js`, nur
 * `node:fs`), weil die Abschnittstexte Daten sind (`prompts.json`).
 */
import { promptText } from './prompt-text.js';

export const MEMORY_CONTRACT = 'shinon.persona-memory/v1';
export const MEMORY_VERSION = 1;
export const MEMORY_MAX_ENTRIES = 64;
export const MEMORY_MAX_PROPOSALS = 24;

/** Ab so vielen Belegen entsteht ein Vorschlag (Grenze) bzw. (Korrektur). */
export const LIMIT_EVIDENCE = 3;
export const PREFERENCE_EVIDENCE = 2;

/** Alterung: je Lauf verliert ein Beleg an Gewicht; darunter fällt er weg. */
export const MEMORY_DECAY = 0.98;
export const MEMORY_RETIRE_BELOW = 0.15;

/** Deckel je Erinnerung — verhindert Dauerwachstum ohne Aussage. */
export const MEMORY_EVIDENCE_CAP = 9;
export const MEMORY_STRENGTH_CAP = 5;
export const MEMORY_DETAIL_CHARS = 96;
export const MEMORY_SUBJECT_CHARS = 64;

/** Wie viele Zeilen höchstens in den Prompt wandern. */
export const MAX_MEMORY_LINES = 6;
export const MAX_COMMITMENT_LINES = 4;

const KINDS = Object.freeze(['preference', 'limit', 'lesson', 'evidence']);
const SCOPES = Object.freeze(['global']);

/** Ein Objekt, kein Array, kein null. */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Ganze Zahl, nie negativ, nie NaN. */
function count(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

/** Nicht-leerer Text oder null. */
function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Ein Schlüssel: klein, einzeilig, gedeckelt — nie ein ganzer Prompt. */
export function slug(value, max = MEMORY_SUBJECT_CHARS) {
  const raw = text(value);
  if (raw === null) return null;
  const flat = raw.toLowerCase().replace(/[^a-z0-9äöüß._:-]+/g, '-').replace(/^-+|-+$/g, '');
  return flat.length > max ? flat.slice(0, max) : flat || null;
}

/** Die Id einer Erinnerung: aus ihren drei Identitätsfeldern, nicht aus Zufall. */
export function entryId(kind, scope, subject) {
  return `${kind}|${scope}|${subject}`;
}

/** Das leere Gedächtnis. `now` kommt von außen — dieser Kern liest keine Uhr. */
export function emptyMemory(now = null) {
  return {
    contract: MEMORY_CONTRACT,
    version: MEMORY_VERSION,
    entries: [],
    proposals: [],
    seq: 0,
    firstSeen: now,
    lastSeen: now,
  };
}

/** Eine gespeicherte Ablage prüfen — Form, nicht Meinung. Fail-closed bei fremdem Vertrag. */
export function validateMemory(raw) {
  if (!isRecord(raw)) return { memory: emptyMemory(), dropped: 0, foreign: false };
  if (raw.contract !== MEMORY_CONTRACT) return { memory: emptyMemory(), dropped: 0, foreign: true };
  const memory = emptyMemory();
  memory.seq = count(raw.seq);
  memory.firstSeen = text(raw.firstSeen);
  memory.lastSeen = text(raw.lastSeen);

  let dropped = 0;
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  for (const entry of entries) {
    if (!isRecord(entry)) { dropped += 1; continue; }
    const kind = KINDS.includes(entry.kind) ? entry.kind : null;
    const scope = text(entry.scope);
    const subject = text(entry.subject);
    if (kind === null || scope === null || subject === null) { dropped += 1; continue; }
    memory.entries.push({
      id: entryId(kind, scope, subject),
      kind,
      scope,
      subject,
      detail: text(entry.detail),
      evidence: Math.min(MEMORY_EVIDENCE_CAP, Math.max(1, count(entry.evidence))),
      strength: Math.min(MEMORY_STRENGTH_CAP, Math.max(0, Number.isFinite(entry.strength) ? entry.strength : 1)),
      firstSeen: text(entry.firstSeen),
      lastSeen: text(entry.lastSeen),
      seq: count(entry.seq),
    });
  }
  const proposals = Array.isArray(raw.proposals) ? raw.proposals : [];
  for (const proposal of proposals) {
    if (!isRecord(proposal)) { dropped += 1; continue; }
    const status = ['proposed', 'accepted', 'rejected'].includes(proposal.status) ? proposal.status : null;
    if (status === null || text(proposal.id) === null || text(proposal.claim) === null) { dropped += 1; continue; }
    memory.proposals.push({
      id: text(proposal.id),
      kind: 'commitment',
      claim: text(proposal.claim),
      evidence: Math.max(1, count(proposal.evidence)),
      status,
      createdAt: text(proposal.createdAt),
      decidedAt: text(proposal.decidedAt),
      source: text(proposal.source),
    });
  }
  memory.entries = memory.entries.slice(-MEMORY_MAX_ENTRIES);
  memory.proposals = memory.proposals.slice(-MEMORY_MAX_PROPOSALS);
  return { memory, dropped, foreign: false };
}

/** Das Gedächtnis auf die Obergrenze bringen: schwache, alte Belege fallen zuerst. */
function trimmed(memory) {
  if (memory.entries.length <= MEMORY_MAX_ENTRIES) return memory;
  const keep = [...memory.entries]
    .sort((a, b) => (b.strength - a.strength) || (b.seq - a.seq))
    .slice(0, MEMORY_MAX_ENTRIES)
    .sort((a, b) => a.seq - b.seq);
  return { ...memory, entries: keep };
}

/**
 * EINE Erinnerung verbuchen — die einzige Stelle, an der Belege hineinkommen.
 * Wiederkehr hebt Belege und Gewicht; der Text wird nur gedeckelt übernommen.
 */
export function remember(memory, input, now = null) {
  const base = isRecord(memory) ? memory : emptyMemory(now);
  if (!isRecord(input)) return { memory: base, changed: false, reason: 'NO_INPUT' };
  const kind = KINDS.includes(input.kind) ? input.kind : null;
  const scope = text(input.scope) ?? 'global';
  const subject = slug(input.subject ?? input.id);
  if (kind === null || subject === null) return { memory: base, changed: false, reason: 'NO_SUBJECT' };

  const id = entryId(kind, scope, subject);
  const detail = text(input.detail);
  const next = {
    ...base,
    entries: [...base.entries],
    seq: count(base.seq) + 1,
    firstSeen: text(base.firstSeen) ?? text(now),
    lastSeen: text(now) ?? base.lastSeen ?? null,
  };
  const at = next.entries.findIndex((entry) => entry.id === id);
  if (at === -1) {
    next.entries.push({
      id, kind, scope, subject,
      detail: detail === null ? null : detail.slice(0, MEMORY_DETAIL_CHARS),
      evidence: 1,
      strength: 1,
      firstSeen: text(now),
      lastSeen: text(now),
      seq: next.seq,
    });
  } else {
    const entry = next.entries[at];
    next.entries[at] = {
      ...entry,
      detail: detail === null ? entry.detail : detail.slice(0, MEMORY_DETAIL_CHARS),
      evidence: Math.min(MEMORY_EVIDENCE_CAP, entry.evidence + 1),
      strength: Math.min(MEMORY_STRENGTH_CAP, entry.strength + 1),
      lastSeen: text(now) ?? entry.lastSeen,
      seq: next.seq,
    };
  }
  return { memory: trimmed(next), changed: true, id };
}

/** Ereignis → Erinnerung. Nur benannte Typen und nur benannte Felder, nie der Prompt. */
export function rememberEvent(memory, event, options = {}) {
  const type = text(event?.type);
  if (type === null) return { memory, changed: false, reason: 'NO_TYPE' };
  const payload = isRecord(event?.payload) ? event.payload : {};
  const scope = text(options.scope) ?? 'global';
  const now = text(options.now);
  if (type === 'feedback.correction') {
    return { ...remember(memory, {
      kind: 'preference',
      scope,
      subject: `korrektur:${slug(payload.correction) ?? 'ohne-feld'}`,
      detail: text(payload.correction),
    }, now), type };
  }
  if (type === 'gate.failed') {
    return { ...remember(memory, {
      kind: 'limit',
      scope,
      subject: `gate:${slug(payload.gate) ?? 'ohne-feld'}`,
      detail: text(payload.gate),
    }, now), type };
  }
  if (type === 'action.blocked') {
    return { ...remember(memory, {
      kind: 'limit',
      scope,
      subject: `aktion:${slug(payload.action) ?? 'ohne-feld'}`,
      detail: text(payload.reason) ?? text(payload.action),
    }, now), type };
  }
  if (type === 'feedback.approval') {
    return { ...remember(memory, {
      kind: 'evidence',
      scope,
      subject: `freigabe:${slug(payload.approval) ?? 'ohne-feld'}`,
      detail: text(payload.approval),
    }, now), type };
  }
  return { memory, changed: false, reason: 'NOT_REMEMBERED' };
}

/** Die Entscheidung des Veredlers → Erinnerung. Gründe sind Codes, keine Prompts. */
export function rememberDecision(memory, record, options = {}) {
  if (!isRecord(record)) return { memory, changed: false, reason: 'NO_RECORD' };
  const scope = text(options.scope) ?? 'global';
  const now = text(options.now);
  let current = memory;
  let changed = false;
  const outcome = text(record.outcome);
  if (outcome === 'rejected' || outcome === 'unavailable') {
    for (const reason of Array.isArray(record.reasons) ? record.reasons.slice(0, 3) : []) {
      const result = remember(current, {
        kind: 'limit',
        scope,
        subject: `prompter:${slug(reason) ?? 'ohne-grund'}`,
        detail: text(reason),
      }, now);
      current = result.memory;
      changed = changed || result.changed;
    }
  }
  if (outcome === 'accepted') {
    const result = remember(current, { kind: 'evidence', scope, subject: 'prompter:accepted' }, now);
    current = result.memory;
    changed = changed || result.changed;
  }
  return { memory: current, changed };
}

/** Alterung: was nicht wiederkehrt, verliert Gewicht und fällt schließlich weg. */
export function decayMemory(memory, factor = MEMORY_DECAY) {
  if (!isRecord(memory)) return { memory, retired: 0 };
  const f = Number.isFinite(factor) && factor > 0 && factor < 1 ? factor : MEMORY_DECAY;
  const kept = [];
  let retired = 0;
  for (const entry of memory.entries) {
    const strength = entry.strength * f;
    if (strength < MEMORY_RETIRE_BELOW) { retired += 1; continue; }
    kept.push({ ...entry, strength });
  }
  return { memory: { ...memory, entries: kept }, retired };
}

/**
 * Die relevanten Erinnerungen für diesen Prompt. Deterministisch: Überlappung
 * zuerst, dann Gewicht, dann Alter. Grenzen und Korrekturen bleiben sichtbar,
 * auch ohne Stichwort — sonst ginge die Lehre beim Themenwechsel verloren.
 */
export function selectMemories(memory, options = {}) {
  const scope = text(options.scope) ?? 'global';
  const prompt = text(options.prompt) ?? '';
  const limit = Math.min(MAX_MEMORY_LINES, Math.max(1, count(options.limit) || MAX_MEMORY_LINES));
  const words = new Set(prompt.toLowerCase().split(/[^a-z0-9äöüß]+/).filter((word) => word.length > 2));
  const scored = [];
  for (const entry of isRecord(memory) && Array.isArray(memory.entries) ? memory.entries : []) {
    if (entry.scope !== scope && entry.scope !== 'global') continue;
    const haystack = `${entry.subject} ${entry.detail ?? ''}`.toLowerCase();
    const overlap = [...words].filter((word) => haystack.includes(word)).length;
    const always = entry.kind === 'limit' || entry.kind === 'preference';
    if (overlap === 0 && !always) continue;
    scored.push({ entry, score: overlap * 3 + entry.strength + entry.evidence * 0.2 });
  }
  scored.sort((a, b) => (b.score - a.score) || String(b.entry.lastSeen ?? '').localeCompare(String(a.entry.lastSeen ?? '')) || a.entry.id.localeCompare(b.entry.id));
  return scored.slice(0, limit).map((item) => item.entry);
}

const KIND_LABELS = Object.freeze({ preference: 'Korrektur', limit: 'Grenze', lesson: 'Lehre', evidence: 'Beleg' });

/** Die Erinnerungen als Prompt-Abschnitt — belegt, begrenzt, ohne Selbstlob. */
export function renderMemory(memory, options = {}) {
  const selected = Array.isArray(options.entries) ? options.entries : selectMemories(memory, options);
  if (selected.length === 0) return null;
  const lines = [promptText('persona-memory-heading'), ''];
  for (const entry of selected) {
    const label = KIND_LABELS[entry.kind] ?? entry.kind;
    const detail = entry.detail === null || entry.detail === undefined
      ? ''
      : promptText('persona-memory-detail', { detail: entry.detail });
    lines.push(promptText('persona-memory-line', { label, subject: entry.subject, evidence: entry.evidence, detail }));
  }
  lines.push('', promptText('persona-memory-footer'));
  return lines.join('\n');
}

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
 * Der Bereich eines Vorschlags — aus `source` (`art|bereich|thema`, gesetzt von
 * `proposeFromMemory` aus der Eintrags-Id) oder `id` (`p:…`). Fremde Formate
 * (z. B. Claim-Quellen) ergeben null: ohne Bereich keine Bereichsanzeige.
 */
export function scopeOfProposal(proposal) {
  const kandidaten = [proposal?.source, String(proposal?.id ?? '').replace(/^p:/, '')];
  for (const kandidat of kandidaten) {
    if (typeof kandidat !== 'string') continue;
    const teile = kandidat.split('|');
    if (teile.length >= 3 && teile[1] !== '') return teile[1];
  }
  return null;
}

/** Die angenommenen Selbstauflagen — die einzige Form, in der ein Vorschlag wirkt. */
export function acceptedCommitments(memory, limit = MAX_COMMITMENT_LINES, scope = null) {
  const proposals = isRecord(memory) && Array.isArray(memory.proposals) ? memory.proposals : [];
  return proposals
    .filter((proposal) => proposal.status === 'accepted')
    .filter((proposal) => scope === null || scopeOfProposal(proposal) === scope || scopeOfProposal(proposal) === 'global')
    .sort((a, b) => (b.evidence - a.evidence) || String(b.decidedAt ?? '').localeCompare(String(a.decidedAt ?? '')) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Die Selbstauflagen als Prompt-Abschnitt — nur angenommene, nie Vorschläge. */
export function renderCommitments(memory, scope = null) {
  const accepted = acceptedCommitments(memory, MAX_COMMITMENT_LINES, scope);
  if (accepted.length === 0) return null;
  const lines = [promptText('persona-commitments-heading'), ''];
  for (const proposal of accepted) {
    lines.push(promptText('persona-commitments-line', { claim: proposal.claim, evidence: proposal.evidence }));
  }
  lines.push('', promptText('persona-commitments-footer'));
  return lines.join('\n');
}

/** Die Sicht für UI und Prüfer: Zahlen und Namen, kein Prompt-Text. */
export function memoryView(memory) {
  if (!isRecord(memory)) return null;
  const proposals = Array.isArray(memory.proposals) ? memory.proposals : [];
  return {
    entries: memory.entries.length,
    evidence: memory.entries.reduce((sum, entry) => sum + entry.evidence, 0),
    limits: memory.entries.filter((entry) => entry.kind === 'limit').length,
    preferences: memory.entries.filter((entry) => entry.kind === 'preference').length,
    proposals: proposals.filter((proposal) => proposal.status === 'proposed').length,
    accepted: proposals.filter((proposal) => proposal.status === 'accepted').length,
    rejected: proposals.filter((proposal) => proposal.status === 'rejected').length,
    firstSeen: memory.firstSeen ?? null,
    lastSeen: memory.lastSeen ?? null,
  };
}
