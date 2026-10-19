#!/usr/bin/env node
/**
 * scripts/gate/tests/doctor-cli.test.mjs — `shinon doctor` (Release-Slice S4).
 *
 * Warum diese Datei existiert: `bin/shinon.mjs` reichte jedes Argument an DSH
 * durch — `shinon doctor` startete DSH, statt eine eigene Diagnose zu liefern.
 * Das statische Gate (`scripts/gate/plugins/doctor.mjs`) prüft nur
 * Repo-Konsistenz, keine Laufzeit-Gesundheit. PLAN.md §9.1 S4 verlangt den
 * Laufzeit-Unterbefehl mit drei Eigenschaften, und genau die drei prüft diese
 * Datei — wie ein Messgerät, das zwischen gebautem Code und belegter Zusage
 * unterscheidet, statt eine Absicht grün zu färben:
 *
 *   1. EIGENER Unterbefehl: `node bin/shinon.mjs doctor --json` liefert den
 *      Doctor-Bericht (kein DSH-Start, kein fremder Exit-Code).
 *   2. READ-ONLY: ein Lauf ändert den Arbeitsbaum nicht
 *      (`git status --porcelain` vorher/nachher gleich) und die Quelle
 *      enthält keinen Schreibaufruf.
 *   3. STABILE Codes + PRESENCE-ONLY: Exit ∈ {0,1,2}, JSON-`exitCode` gleich
 *      Prozess-Exit, `status`↔`exitCode` deckungsgleich — und ein gesetzter
 *      Fake-Schlüssel erscheint weder in stdout noch stderr (nur `true`).
 *
 * Kein Netz, kein Modell, kein DSH-Boot: der Doctor fragt nur `--version` ab.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DOCTOR = join(ROOT, 'scripts', 'doctor.mjs');
const ENTRY = join(ROOT, 'bin', 'shinon.mjs');

const runDoctor = (args = [], env = process.env) =>
  spawnSync(process.execPath, [DOCTOR, ...args], { cwd: ROOT, env, encoding: 'utf8' });

test('doctor: eigener Unterbefehl — bin/shinon.mjs doctor liefert den Bericht, kein DSH', () => {
  const direct = runDoctor(['--json']);
  assert.ok([0, 1, 2].includes(direct.status), `unerwarteter Exit ${direct.status}: ${direct.stderr}`);
  const expected = JSON.parse(direct.stdout);

  const viaBin = spawnSync(process.execPath, [ENTRY, 'doctor', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(viaBin.status, direct.status, `bin-Exit ${viaBin.status} ≠ doctor-Exit ${direct.status}: ${viaBin.stderr}`);
  const report = JSON.parse(viaBin.stdout);
  assert.deepEqual(Object.keys(report).sort(), Object.keys(expected).sort());
  assert.equal(report.status, expected.status);
  assert.ok(['ok', 'findings', 'error'].includes(report.status), `unbekannter status ${report.status}`);
});

test('doctor: stabile Codes — exitCode gleich Prozess-Exit, status deckungsgleich', () => {
  for (const args of [[], ['--json']]) {
    const run = runDoctor(args);
    assert.ok([0, 1, 2].includes(run.status), `Exit ${run.status} ausserhalb 0/1/2`);
    if (args.includes('--json')) {
      const report = JSON.parse(run.stdout);
      assert.equal(report.exitCode, run.status, 'JSON-exitCode ≠ Prozess-Exit');
      assert.equal(report.exitCode, report.status === 'ok' ? 0 : report.status === 'findings' ? 1 : 2);
    }
  }
});

test('doctor: read-only — kein Schreibaufruf in der Quelle, kein Diff im Baum', () => {
  const source = readFileSync(DOCTOR, 'utf8');
  for (const call of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'copyFileSync', 'writeFile(']) {
    assert.equal(source.includes(call), false, `doctor.mjs enthält ${call} — kein Schreibaufruf erlaubt`);
  }
  const before = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  const run = runDoctor([]);
  assert.ok([0, 1].includes(run.status), `doctor scheitert in gesundem Baum: ${run.stderr}`);
  const after = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(after, before, 'doctor hat den Arbeitsbaum verändert');
});

test('doctor: presence-only — ein Fake-Schlüssel wird nie ausgegeben, nur gemeldet', () => {
  const secret = 'DOCTOR-GEHEIM-9f8e7d6c5b4a';
  const env = { ...process.env, AGNES_API_KEY: secret };
  const run = runDoctor(['--json'], env);
  assert.ok([0, 1, 2].includes(run.status));
  const combined = `${run.stdout}\n${run.stderr}`;
  assert.equal(combined.includes(secret), false, 'der Schlüsselwert steht in der Ausgabe — presence-only verletzt');
  const report = JSON.parse(run.stdout);
  assert.equal(report.keys.AGNES_API_KEY, true, 'gesetzter Schlüssel wird nicht als gesetzt gemeldet');
  assert.equal(typeof report.keys.PROMPTER_API_KEY, 'boolean');
});

test('doctor: --help nennt Usage und endet mit Exit 0, ohne Diagnose', () => {
  const before = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  const run = runDoctor(['--help']);
  assert.equal(run.status, 0, `help-Exit ${run.status}: ${run.stderr}`);
  assert.match(run.stdout, /Usage: node scripts\/doctor\.mjs/);
  assert.match(run.stdout, /Exit: 0 gesund/);
  assert.equal(run.stdout.includes('shinon doctor —'), false, '--help stellt keine Diagnose');
  const after = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(after, before, '--help hat den Arbeitsbaum verändert');
});

test('doctor: defekte Wurzel meldet Exit 2 fail-closed (lesbar, ohne Stack)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-doctor-'));
  writeFileSync(join(dir, 'package.json'), '{"name":"kaputt","version":"0.0.0"}');
  const before = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  const broken = runDoctor(['--root', dir, '--json']);
  assert.equal(broken.status, 2, `defekte Wurzel meldet ${broken.status} statt 2`);
  const report = JSON.parse(broken.stdout);
  assert.equal(report.status, 'error');
  assert.equal(report.exitCode, 2);
  assert.match(report.environmentError ?? '', /--profile/);
  const missing = runDoctor(['--root', join(dir, 'gibt-es-nicht')]);
  assert.equal(missing.status, 2, `fehlende Wurzel meldet ${missing.status} statt 2`);
  assert.match(missing.stderr, /nicht lesbar/);
  assert.equal(missing.stderr.includes('at '), false, 'kein Stack-Trace auf stderr');
  const after = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(after, before, 'Fehlerpfad hat den Arbeitsbaum verändert');
});
