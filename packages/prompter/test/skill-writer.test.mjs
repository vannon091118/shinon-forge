/**
 * Der Skill-Schreiber: pruefen, schreiben, Konflikt erkennen, zuruecknehmen.
 *
 * Der Test faehrt auf einem temporaeren Projektbaum; die Regeln sind die
 * echten. Ein Schreiber, der nur im Repo funktioniert, waere kein Schreiber.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSkillWriter, loadLifecycleRules } from '../assets/skill-lifecycle.js';
import { checkCandidate, fingerprintOf } from '../assets/skill-lifecycle-core.js';
import { hashFile } from '../assets/learning-store.js';

const SKILL_RULES = loadLifecycleRules();
const NOTE_RULES = JSON.parse(readFileSync(new URL('../assets/note-rules.json', import.meta.url), 'utf8'));

const CANDIDATE = {
  name: 'tempo-beim-test',
  description: 'Nutzen wenn ein Test die Zeitgrenze reisst, damit der Lauf gruen bleibt und die Grenze steht.',
  thema: 'tempo',
  bei: 'Ein Test ueberschreitet die Zeitgrenze',
  immer: 'den Test verkleinern statt die Grenze zu heben',
  weil: 'die Grenze schuetzt den Lauf, der Test ist das Problem',
};

const quiet = { log: () => {}, warn: () => {} };

function project() {
  const root = mkdtempSync(join(tmpdir(), 'shinon-writer-'));
  mkdirSync(join(root, '.agents', 'skills'), { recursive: true });
  const writer = createSkillWriter({ rules: SKILL_RULES, noteRules: NOTE_RULES, root, log: quiet });
  return { root, writer };
}

function shell(writer, candidate = CANDIDATE, evidence = { kind: 'correction', session: 'sess-1', ref: 'feedback:m1' }) {
  const fingerprint = fingerprintOf(candidate, SKILL_RULES);
  const checked = writer.inspect(candidate, evidence);
  return {
    id: 'lp_test',
    fingerprint,
    payload: candidate,
    base: checked.base,
    checked,
  };
}

test('neu: inspect sagt publish, apply schreibt Datei und Ledger, undo verschiebt', () => {
  const { root, writer } = project();
  const proposal = shell(writer);
  assert.equal(proposal.checked.verdict, 'publish');
  assert.equal(proposal.base.path, '.agents/skills/tempo-beim-test/SKILL.md');
  assert.equal(proposal.base.hash, null);

  const applied = writer.apply(proposal, { evidence: { kind: 'correction', session: 'sess-1', ref: 'feedback:m1' } });
  assert.equal(applied.ok, true, applied.reason);
  const file = join(root, applied.path);
  const text = readFileSync(file, 'utf8');
  assert.ok(text.includes('name: tempo-beim-test'));
  assert.ok(text.includes('shinon-skill-fp:'));
  assert.ok(text.includes('feedback:m1'));
  const ledger = JSON.parse(readFileSync(join(root, '.shinon', 'skill-ledger.json'), 'utf8'));
  assert.equal(ledger.entries['tempo-beim-test'].status, 'published');

  const undone = writer.undo({ ...applied, owner: 'tempo-beim-test' });
  assert.equal(undone.ok, true, undone.reason);
  assert.equal(undone.mode, 'verschoben');
  assert.equal(existsSync(file), false, 'die neu angelegte Datei lebt noch im Skill-Root');
  const after = JSON.parse(readFileSync(join(root, '.shinon', 'skill-ledger.json'), 'utf8'));
  assert.equal(after.entries['tempo-beim-test'].status, 'undone');
  rmSync(root, { recursive: true, force: true });
});

test('Konflikt: eine geaenderte Datei wird nicht ueberschrieben', () => {
  const { root, writer } = project();
  const proposal = shell(writer);
  assert.equal(writer.apply(proposal, { evidence: { kind: 'correction', session: 'sess-1', ref: 'feedback:m1' } }).ok, true);
  const file = join(root, '.agents', 'skills', 'tempo-beim-test', 'SKILL.md');
  writeFileSync(file, `${readFileSync(file, 'utf8')}\nNachtrag\n`);
  const again = writer.apply(proposal, { evidence: { kind: 'correction', session: 'sess-1', ref: 'feedback:m1' } });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'KONFLIKT:INHALT');
  rmSync(root, { recursive: true, force: true });
});

test('Konsolidierung: Dublette haengt an das bestehende Ziel, undo stellt exakt wieder her', () => {
  const { root, writer } = project();
  const existingDir = join(root, '.agents', 'skills', 'vorhanden');
  mkdirSync(existingDir, { recursive: true });
  const before = '---\nname: vorhanden\ndescription: "Nutzen fuer den Test, lang genug fuer die Grenze."\n---\n\n# Vorhanden\n\n## Wann\n\nEin Test ueberschreitet die Zeitgrenze\n\n## Regel\n\nden Test verkleinern statt die Grenze zu heben\n\n## Warum\n\nweil es stimmt\n';
  writeFileSync(join(existingDir, 'SKILL.md'), before);

  const proposal = shell(writer);
  assert.equal(proposal.checked.verdict, 'consolidate');
  assert.equal(proposal.checked.target, 'vorhanden');
  assert.equal(proposal.base.hash, hashFile(join(existingDir, 'SKILL.md')));

  const applied = writer.apply(proposal, { evidence: { kind: 'correction', session: 'sess-2', ref: 'feedback:m2' } });
  assert.equal(applied.ok, true, applied.reason);
  const after = readFileSync(join(existingDir, 'SKILL.md'), 'utf8');
  assert.ok(after.startsWith(before), 'der bestehende Text wurde umgeschrieben statt ergaenzt');
  assert.ok(after.includes('shinon-konsolidiert'));

  const undone = writer.undo({ ...applied, owner: 'vorhanden' });
  assert.equal(undone.ok, true, undone.reason);
  assert.equal(readFileSync(join(existingDir, 'SKILL.md'), 'utf8'), before, 'der Stand ist nicht bytegleich');
  rmSync(root, { recursive: true, force: true });
});

test('Belegschwelle: der Kern allein veroeffentlicht nichts; der Schreiber traegt die Entscheidung', () => {
  const { root, writer } = project();
  const evidence = { kind: 'completed', session: 'sess-3', ref: 'turn:1', completed: 1 };
  const core = checkCandidate({
    candidate: CANDIDATE,
    existing: [],
    kinds: { correction: 0, completed: 1 },
    rules: SKILL_RULES,
    noteRules: NOTE_RULES,
  });
  assert.equal(core.verdict, 'candidate');
  assert.equal(core.reason, 'BELEG_ZU_DUENN');
  const checked = writer.inspect(CANDIDATE, evidence);
  assert.equal(checked.verdict, 'publish', 'der Vorschlag braucht einen Zielort, auch bei duennem Beleg');
  rmSync(root, { recursive: true, force: true });
});

test('Verboten und ausserhalb: keine Datei, benannter Befund', () => {
  const { root, writer } = project();
  const forbidden = { ...CANDIDATE, name: 'gate-umbau', immer: 'aendere scripts/gate/engine.mjs direkt' };
  const blocked = shell(writer, forbidden);
  assert.equal(blocked.checked.verdict, 'reject');
  assert.equal(blocked.checked.reason.startsWith('VERBOTEN'), true);

  const proposal = shell(writer);
  const escaped = writer.apply({ ...proposal, base: { path: '../../aussen.md', hash: null } }, { evidence: { kind: 'correction', session: 's', ref: 'f' } });
  assert.equal(escaped.ok, false);
  assert.equal(escaped.reason, 'KONFLIKT:ZIEL');
  rmSync(root, { recursive: true, force: true });
});
