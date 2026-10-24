// Die Freigabe-, Undo- und Curator-Flaeche als BEFEHL (SH-LEARN-04/06).
//
// Geprueft wird, was ein Mensch tatsaechlich tut: freigeben, zuruecknehmen,
// kuratieren, zurueckholen. Der Befehl laeuft als echter Prozess (Exit-Code
// zaehlt), das Projekt ist ein temporaerer Baum mit echtem Skill-Root.
//
// Der Memory-Fall ist die Grenze: der Befehl schreibt NIE in das Gedaechtnis
// der Persona — er nennt die zustaendige Route und endet rot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSkillWriter, loadLifecycleRules } from '../assets/skill-lifecycle.js';
import { REGISTRY_CONTRACT, REGISTRY_VERSION } from '../assets/learning-proposal.js';
import { hashFile } from '../assets/learning-store.js';

const CLI = fileURLToPath(new URL('../../../scripts/learn.mjs', import.meta.url));
const RULES = loadLifecycleRules();
const quiet = { log: () => {}, warn: () => {} };

const SKILL_FILE = RULES.root.file;
const CANDIDATE = {
  name: 'cli-freigabe',
  thema: 'freigabe',
  description: 'Nutzen wenn ein Lernergebnis auf Freigabe wartet, damit der Befehl es anwendet.',
  bei: 'Ein Lernvorschlag wartet auf einen Menschen',
  immer: 'erst pruefen, dann anwenden, dann die Sicherung behalten',
  weil: 'eine unbelegte Aenderung ist keine Verbesserung',
};

function project() {
  const root = mkdtempSync(join(tmpdir(), 'shinon-learn-cli-'));
  mkdirSync(join(root, '.git'), { recursive: true });
  mkdirSync(join(root, '.agents', 'skills'), { recursive: true });
  mkdirSync(join(root, '.shinon'), { recursive: true });
  return root;
}

/** Ein Register mit genau einem Eintrag — die Form, die der Reviewer schreibt. */
function register(root, entry) {
  writeFileSync(join(root, '.shinon', 'learning-proposals.json'), `${JSON.stringify({
    contract: REGISTRY_CONTRACT,
    version: REGISTRY_VERSION,
    seq: 1,
    entries: { [entry.id]: entry },
  }, null, 2)}\n`, 'utf8');
}

const entryOf = (root) => JSON.parse(readFileSync(join(root, '.shinon', 'learning-proposals.json'), 'utf8')).entries;

/** Der Skill-Vorschlag mit echtem Basis-Hash — sonst verweigert `apply` den Konflikt-Test. */
function skillProposal(root, id = 'lp_cli') {
  const writer = createSkillWriter({ rules: RULES, noteRules: {}, root, log: quiet });
  const checked = writer.inspect(CANDIDATE, { kind: 'correction', session: 'sess-abc', ref: 'message:m2', completed: 0 });
  assert.ok(['publish', 'consolidate'].includes(checked.verdict), checked.reason);
  return {
    contract: 'shinon.learning-proposal/v1',
    id,
    verdict: checked.verdict,
    target: 'skill',
    status: 'pending',
    reason: 'Die Korrektur zeigt einen wiederverwendbaren Ablauf.',
    sources: [{ kind: 'correction', ref: 'message:m2' }],
    fingerprint: 'fp-test',
    risk: 'niedrig',
    evidence: { kind: 'correction', session: 'sess-abc', ref: 'message:m2', completed: 0 },
    base: checked.base,
    owner: CANDIDATE.name,
    payload: CANDIDATE,
    checks: [],
    decision: null,
    undo: null,
    createdAt: '2026-10-24T10:00:00.000Z',
  };
}

function run(root, ...args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args, '--root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return { code: error.status ?? 1, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? '') };
  }
}

test('befehl: freigeben schreibt die Datei, zuruecknehmen holt den alten Stand', () => {
  const root = project();
  try {
    register(root, skillProposal(root));
    const listed = run(root, 'list');
    assert.equal(listed.code, 0, listed.stderr);
    assert.match(listed.stdout, /lp_cli\s+skill\s+pending/);

    const approved = run(root, 'approve', 'lp_cli');
    const file = join(root, '.agents', 'skills', CANDIDATE.name, SKILL_FILE);
    assert.equal(approved.code, 0, approved.stderr);
    assert.equal(existsSync(file), true, 'die Freigabe hat nicht geschrieben');
    assert.match(approved.stdout, new RegExp(`${CANDIDATE.name}`));
    const applied = entryOf(root).lp_cli;
    assert.equal(applied.status, 'applied');
    assert.equal(applied.decision.by, 'human');
    assert.equal(applied.undo.kind, 'skill');
    assert.equal(existsSync(join(root, applied.undo.backup)), true, 'die Sicherung fehlt');

    const undone = run(root, 'undo', 'lp_cli');
    assert.equal(undone.code, 0, undone.stderr);
    assert.equal(existsSync(file), false, 'die neue Datei liegt nach dem Widerruf nicht mehr im Root');
    assert.equal(entryOf(root).lp_cli.status, 'undone');

    const twice = run(root, 'undo', 'lp_cli');
    assert.equal(twice.code, 1, 'ein zweiter Widerruf ist kein Erfolg');
    assert.match(twice.stderr, /undone/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('befehl: ein geaenderter Basis-Hash ist ein Konflikt, keine stille Ueberschreibung', () => {
  const root = project();
  try {
    // Der Skill existiert bereits und stammt aus diesem Lebenszyklus — nur dann
    // ist eine Aenderung eine KONSOLIDIERUNG mit Basis-Hash statt einer neuen Datei.
    const writer = createSkillWriter({ rules: RULES, noteRules: {}, root, log: quiet });
    const first = skillProposal(root);
    const written = writer.apply(first, { evidence: first.evidence });
    assert.equal(written.ok, true, written.reason);

    const second = skillProposal(root, 'lp_zweit');
    assert.equal(second.verdict, 'consolidate', 'der zweite Vorschlag aktualisiert die bestehende Anleitung');
    const file = join(root, '.agents', 'skills', CANDIDATE.name, SKILL_FILE);
    assert.equal(second.base.hash, hashFile(file), 'die Basis ist der Stand, gegen den der Mensch spaeter freigibt');

    // Zwischen Vorschlag und Freigabe hat jemand die Datei angefasst.
    appendFileSync(file, '\nEin Satz von jemand anderem.\n');
    register(root, second);
    const approved = run(root, 'approve', 'lp_zweit');
    assert.equal(approved.code, 1, 'die Freigabe hat den Konflikt uebergangen');
    assert.match(approved.stderr, /KONFLIKT/);
    assert.equal(entryOf(root).lp_zweit.status, 'blocked');
    assert.match(readFileSync(file, 'utf8'), /jemand anderem/, 'die fremde Aenderung steht noch');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('befehl: Memory wird nie am Eigentuemer vorbei geschrieben', () => {
  const root = project();
  try {
    register(root, {
      contract: 'shinon.learning-proposal/v1',
      id: 'lp_mem',
      target: 'memory',
      status: 'pending',
      reason: 'Dauerhafte Erwartung.',
      sources: [{ kind: 'correction', ref: 'message:m3' }],
      fingerprint: 'fp-mem',
      risk: 'niedrig',
      evidence: { kind: 'correction', session: 'sess-abc', ref: 'message:m3', completed: 0 },
      base: null,
      owner: null,
      payload: { subject: 'tempo', claim: 'Den Test verkleinern, nicht die Grenze heben.' },
      checks: [],
      decision: null,
      undo: null,
      createdAt: '2026-10-24T10:00:00.000Z',
    });
    const approved = run(root, 'approve', 'lp_mem');
    assert.equal(approved.code, 1);
    assert.match(approved.stderr, /\/shinon\/persona\/review/);
    assert.equal(entryOf(root).lp_mem.status, 'pending', 'der Vorschlag bleibt beim Eigentuemer');

    const undo = run(root, 'undo', 'lp_mem');
    assert.equal(undo.code, 1);
    assert.match(undo.stderr, /\/shinon\/persona\/review/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('curator: ungenutzt und alt wird archiviert, nicht geloescht — und ist zurueckholbar', () => {
  const root = project();
  try {
    const name = 'alter-skill';
    const dir = join(root, '.agents', 'skills', name);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, SKILL_FILE);
    writeFileSync(file, '---\nname: alter-skill\ndescription: "Nutzen wenn ein alter Ablauf geprueft wird, damit nichts verrottet."\n---\n\n# Alt\n', 'utf8');
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    utimesSync(file, old, old);
    utimesSync(dir, old, old);

    const dry = run(root, 'curate');
    assert.equal(dry.code, 1, 'ein Archivkandidat ist ein Befund');
    assert.match(dry.stdout, /ungenutzt\s+alter-skill\s+archivieren/);
    assert.equal(existsSync(file), true, 'ohne --apply wird nichts bewegt');
    assert.equal(existsSync(join(root, '.shinon', 'learning-archive')), false);

    const applied = run(root, 'curate', '--apply');
    assert.equal(applied.code, 1, 'auch der anwendende Lauf meldet den Befund');
    assert.equal(existsSync(file), false, 'der Skill liegt nach dem Lauf nicht mehr im Root');
    assert.match(applied.stdout, /Archiviert: alter-skill/);

    const listed = run(root, 'archive');
    assert.equal(listed.code, 0);
    assert.match(listed.stdout, /alter-skill/);

    const restored = run(root, 'restore', name);
    assert.equal(restored.code, 0, restored.stderr);
    assert.equal(existsSync(file), true, 'die Ruecknahme hat den Skill nicht zurueckgeholt');
    assert.match(readFileSync(file, 'utf8'), /nichts verrottet/);

    const again = run(root, 'restore', name);
    assert.equal(again.code, 1, 'zweimal zurueckholen ist ein Konflikt, kein Erfolg');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('befehl: Bedienfehler enden mit Exit 2, nicht mit einer stillen Null', () => {
  const root = project();
  try {
    assert.equal(run(root, 'gibtsnicht').code, 2);
    assert.equal(run(root, 'approve').code, 2);
    assert.equal(run(root, 'show', 'lp_unbekannt').code, 1);
    const status = run(root, 'status', '--json');
    assert.equal(status.code, 0);
    assert.equal(JSON.parse(status.stdout).entries, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
