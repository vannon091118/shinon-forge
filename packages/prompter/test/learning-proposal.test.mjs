/**
 * Der Vorschlags-Kern: Form, Pruefung, Entscheidung, Register.
 *
 * Die Regeln werden aus den ECHTEN Dateien gelesen. Ein Test, der sich seine
 * Grenzen selbst erfindet, prueft die Grenze nicht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REGISTRY_CONTRACT,
  buildProposal,
  canAuto,
  checkProposal,
  emptyRegistry,
  normalizeDecision,
  parseRegistry,
  pendingProposals,
  pruneRegistry,
  putProposal,
  setProposal,
  sourceOf,
} from '../assets/learning-proposal.js';

const RULES = JSON.parse(readFileSync(new URL('../assets/learning-review-rules.json', import.meta.url), 'utf8'));
const SKILL_RULES = JSON.parse(readFileSync(new URL('../assets/skill-lifecycle-rules.json', import.meta.url), 'utf8'));
const NOTE_RULES = JSON.parse(readFileSync(new URL('../assets/note-rules.json', import.meta.url), 'utf8'));

const REFS = ['message:m1', 'message:m2', 'tool:bash', 'turn:3'];

const MEMORY = {
  decision: 'memory',
  subject: 'test-tempo',
  claim: 'Bei einem Test ueber der Zeitgrenze den Test verkleinern, nicht die Grenze heben.',
  reason: 'Die Grenze schuetzt den Lauf, der Test ist das Problem.',
  sources: ['message:m1'],
};

const SKILL = {
  decision: 'skill',
  reason: 'Die Korrektur zeigt einen wiederverwendbaren Ablauf.',
  sources: ['message:m1', 'turn:3'],
  candidate: {
    name: 'tempo-beim-test',
    description: 'Nutzen wenn ein Test die Zeitgrenze reisst, damit der Lauf gruen bleibt und die Grenze steht.',
    thema: 'tempo',
    bei: 'Ein Test ueberschreitet die Zeitgrenze',
    immer: 'den Test verkleinern statt die Grenze zu heben',
    weil: 'die Grenze schuetzt den Lauf, der Test ist das Problem',
  },
};

const normalize = (raw, refs = REFS) => normalizeDecision(raw, { rules: RULES, skillRules: SKILL_RULES, refs });
const check = (normalized) => checkProposal(normalized, { rules: RULES, skillRules: SKILL_RULES, noteRules: NOTE_RULES });

test('Modellentscheidung: none, unbekannt, ohne Begruendung, erfundene Quelle', () => {
  assert.deepEqual(normalize({ skip: true }), { ok: true, decision: 'none' });
  assert.deepEqual(normalize({ decision: 'none' }), { ok: true, decision: 'none' });
  assert.equal(normalize({ decision: 'beides' }).reason, 'ENTSCHEIDUNG_UNBEKANNT');
  assert.equal(normalize({ ...MEMORY, reason: '' }).reason, 'OHNE_BEGRUENDUNG');
  assert.equal(normalize({ ...MEMORY, sources: [] }).reason, 'OHNE_QUELLE');
  assert.equal(normalize({ ...MEMORY, sources: ['message:erfunden'] }).reason, 'QUELLE_UNBEKANNT:message:erfunden');
  assert.equal(normalize({ ...MEMORY, sources: ['message:m1', 'message:m1'] }).sources.length, 1);
});

test('Memory: gueltiger Vorschlag, niedriges Risiko, stabiler Fingerabdruck', () => {
  const normalized = normalize(MEMORY);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.decision, 'memory');
  assert.equal(normalized.risk, 'niedrig');
  assert.equal(normalized.payload.claim.startsWith('Bei einem Test'), true);
  assert.equal(normalized.sources[0].kind, 'message');
  const again = normalize(MEMORY);
  assert.equal(again.fingerprint, normalized.fingerprint, 'derselbe Inhalt ergibt denselben Fingerabdruck');
});

test('Memory: zentrale Regel ist Risiko, nicht Verbot; Geheimnis ist ein Befund', () => {
  const central = normalize({ ...MEMORY, claim: 'Bei einer Aenderung an AGENTS.md immer den Vertragstest laufen lassen.' });
  assert.equal(central.risk, 'zentral');
  assert.equal(check(central).findings.find((entry) => entry.id === 'VERBOTEN').ok, true, 'blosse Erwaehnung ist kein Verbot');
  const secret = normalize({ ...MEMORY, claim: 'Merke token=CANARY-SECRET-1234567890 dauerhaft.' });
  const findings = check(secret).findings;
  assert.equal(findings.find((entry) => entry.id === 'SENSIBEL').ok, false, 'Geheimnis nicht erkannt');
});

test('Skill: gueltiger Kandidat besteht die Reviewer-Pruefung', () => {
  const normalized = normalize(SKILL);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.decision, 'skill');
  assert.equal(normalized.risk, 'niedrig');
  const checked = check(normalized);
  assert.equal(checked.ok, true, JSON.stringify(checked.findings));
  for (const finding of checked.findings) assert.equal(finding.ok, true, `${finding.id}: ${finding.detail}`);
});

test('Skill: Aenderungsanweisung an ein Gate ist verboten, Erwaehnung nur zentral', () => {
  const forbidden = normalize({ ...SKILL, candidate: { ...SKILL.candidate, immer: 'aendere scripts/gate/engine.mjs direkt' } });
  assert.equal(check(forbidden).findings.find((entry) => entry.id === 'VERBOTEN').ok, false);
  const mention = normalize({
    ...SKILL,
    candidate: { ...SKILL.candidate, immer: 'bei Aenderungen an docs/contracts immer den Vertragstest laufen lassen' },
  });
  assert.equal(mention.risk, 'zentral');
  assert.equal(check(mention).findings.find((entry) => entry.id === 'VERBOTEN').ok, true);
});

test('Skill: zu kurze Beschreibung und fehlender Trigger werden abgelehnt', () => {
  assert.equal(normalize({ ...SKILL, candidate: { ...SKILL.candidate, description: 'zu kurz' } }).reason.startsWith('KANDIDAT:'), true);
  assert.equal(normalize({ ...SKILL, candidate: { ...SKILL.candidate, description: 'Ohne das Triggerwort, aber lang genug fuer die Grenze.' } }).reason.startsWith('KANDIDAT:'), true);
});

test('Auto nur bei Schalter aus, niedrigem Risiko und stehender Belegschwelle', () => {
  const base = buildProposal({
    ...normalize(MEMORY),
    checks: [],
    evidence: { kind: 'completed', completed: 3 },
    now: '2026-10-24T00:00:00.000Z',
  }, RULES);
  assert.equal(canAuto(base, { memoryWriteApproval: true, skillWriteApproval: true, minEvidenceForAuto: 3 }).reason, 'FREIGABE');
  assert.equal(canAuto(base, { memoryWriteApproval: false, skillWriteApproval: true, minEvidenceForAuto: 3 }).auto, true);
  assert.equal(canAuto({ ...base, risk: 'zentral' }, { memoryWriteApproval: false, skillWriteApproval: true, minEvidenceForAuto: 3 }).auto, false);
  const thin = { ...base, evidence: { kind: 'completed', completed: 1 } };
  assert.equal(canAuto(thin, { memoryWriteApproval: false, skillWriteApproval: true, minEvidenceForAuto: 3 }).reason, 'BELEG_ZU_DUENN');
  const correction = { ...base, evidence: { kind: 'correction' } };
  assert.equal(canAuto(correction, { memoryWriteApproval: false, skillWriteApproval: true, minEvidenceForAuto: 3 }).auto, true);
});

test('Register: fremder Vertrag, Pruning und benannte Kapazitaet', () => {
  assert.equal(parseRegistry('kein json').reason, 'KEIN_JSON');
  assert.equal(parseRegistry(JSON.stringify({ contract: 'fremd', version: 1, entries: {} })).reason, 'VERTRAG_FREMD');
  assert.equal(parseRegistry(JSON.stringify({ contract: REGISTRY_CONTRACT, version: 1 })).reason, 'EINTRAEGE_FEHLEN');

  let registry = emptyRegistry();
  for (let index = 0; index < 3; index += 1) {
    const proposal = buildProposal({
      ...normalize(MEMORY),
      checks: [],
      evidence: { kind: 'completed', completed: 3 },
      now: `2026-10-2${index}T00:00:00.000Z`,
    }, RULES);
    const id = `lp_${index}`;
    registry = putProposal(registry, { ...proposal, id, status: index === 2 ? 'pending' : 'rejected' }, 2).registry;
  }
  const pruned = pruneRegistry(registry, 1);
  assert.equal(Object.keys(pruned.entries).length, 1);
  assert.equal(Object.keys(pruned.entries)[0], 'lp_2', 'der offene Eintrag bleibt');
  assert.equal(putProposal(pruned, { ...Object.values(pruned.entries)[0], id: 'lp_neu' }, 1).reason, 'KAPAZITAET');

  const set = setProposal(pruned, 'lp_2', { status: 'applied' });
  assert.equal(set.ok, true);
  assert.equal(pendingProposals(set.registry).length, 0);
  assert.equal(setProposal(pruned, 'fehlt', { status: 'applied' }).reason, 'UNBEKANNT');
  assert.equal(setProposal(pruned, 'lp_2', { status: 'erfunden' }).reason, 'STATUS_UNBEKANNT');
});

test('Quelle: Art und Kennung kommen aus dem Digest, nie aus dem Modell', () => {
  assert.deepEqual(sourceOf('tool:bash'), { kind: 'tool', ref: 'tool:bash', rev: 'tool:bash' });
  assert.equal(sourceOf('ohne-trenner').kind, 'unknown');
});
